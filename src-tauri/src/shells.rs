use crate::platform::{ProcessJob, external_path};
use portable_pty::{CommandBuilder, MasterPty, PtySize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
struct Output {
    data: String,
    seq: u64,
    running: bool,
}

impl Output {
    fn append(&mut self, data: &str) -> u64 {
        self.seq += 1;
        self.data.push_str(data);
        // shortcut: 终端保留最近 1 MiB 输出，需要完整日志时增加按需导出。
        const LIMIT: usize = 1024 * 1024;
        if self.data.len() > LIMIT {
            let mut start = self.data.len() - LIMIT;
            while !self.data.is_char_boundary(start) {
                start += 1;
            }
            self.data.drain(..start);
        }
        self.seq
    }
}

struct Shell {
    name: String,
    cwd: PathBuf,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    output: Arc<Mutex<Output>>,
    host_job: Option<ProcessJob>,
    _job: ProcessJob,
}

impl Drop for Shell {
    fn drop(&mut self) {
        // ConPTY 关闭等待子进程，先终止进程再释放终端句柄。
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
        drop(self.host_job.take());
    }
}

#[derive(Default)]
pub struct Shells {
    items: Mutex<HashMap<String, Shell>>,
}

fn text<'a>(request: &'a Value, name: &str) -> Result<&'a str> {
    request[name].as_str().ok_or_else(|| format!("缺少 {name}"))
}

fn size(request: &Value) -> PtySize {
    PtySize {
        cols: request["cols"].as_u64().unwrap_or(100).clamp(2, 500) as u16,
        rows: request["rows"].as_u64().unwrap_or(28).clamp(2, 200) as u16,
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn publish(app: &AppHandle, id: &str, output: &Mutex<Output>, data: &str) {
    if data.is_empty() {
        return;
    }
    let seq = output.lock().unwrap().append(data);
    let _ = app.emit(
        "desktop-shell",
        json!({"id":id,"type":"data","seq":seq,"data":data}),
    );
}

fn describe(id: &str, shell: &Shell) -> Value {
    json!({"id":id,"name":shell.name,"cwd":external_path(&shell.cwd),"running":shell.output.lock().unwrap().running})
}

impl Shells {
    fn open(&self, app: AppHandle, root: &Path, request: &Value) -> Result<Value> {
        let id = request["id"]
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let mut items = self.items.lock().unwrap();
        if let Some(shell) = items.get(&id) {
            return Ok(describe(&id, shell));
        }
        let cwd = Path::new(text(request, "cwd")?)
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if !cwd.is_dir() {
            return Err("终端工作目录不存在。".into());
        }
        let temporary = root.join("cache/tmp");
        std::fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;
        let mut managed = crate::platform::open_pty(size(request))?;
        let pair = managed.pair.as_ref().unwrap();
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| error.to_string())?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| error.to_string())?;
        let requested = request["shell"]
            .as_str()
            .filter(|value| !value.trim().is_empty());
        #[cfg(windows)]
        let candidates = requested
            .map(|shell| vec![shell])
            .unwrap_or_else(|| vec!["pwsh", "powershell"]);
        #[cfg(not(windows))]
        let candidates = requested
            .map(|shell| vec![shell])
            .unwrap_or_else(|| vec!["/bin/sh"]);
        let mut child = None;
        let mut failure = String::new();
        for executable in candidates {
            let mut command = CommandBuilder::new(executable);
            command.cwd(external_path(&cwd));
            command.env("TEMP", external_path(&temporary));
            command.env("TMP", external_path(&temporary));
            command.env("TERM", "xterm-256color");
            if Path::new(executable)
                .file_stem()
                .is_some_and(|name| name == "pwsh" || name == "powershell")
            {
                command.arg("-NoLogo");
            }
            match pair.slave.spawn_command(command) {
                Ok(process) => {
                    child = Some(process);
                    break;
                }
                Err(error) => failure = error.to_string(),
            }
        }
        let mut child = child.ok_or_else(|| format!("无法启动终端：{failure}"))?;
        let job = child
            .process_id()
            .ok_or("终端未启动。".to_owned())
            .and_then(ProcessJob::attach)
            .map_err(|error| {
                let _ = child.kill();
                let _ = child.wait();
                error
            })?;
        let output = Arc::new(Mutex::new(Output {
            running: true,
            ..Output::default()
        }));
        let pair = managed.pair.take().unwrap();
        let host_job = managed.host_job.take();
        drop(pair.slave);
        let shell = Shell {
            name: request["name"]
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("终端")
                .to_owned(),
            cwd,
            master: pair.master,
            writer,
            child,
            output: output.clone(),
            host_job,
            _job: job,
        };
        let description = describe(&id, &shell);
        items.insert(id.clone(), shell);
        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            let mut pending = Vec::new();
            loop {
                let count = match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => count,
                };
                pending.extend_from_slice(&buffer[..count]);
                loop {
                    match std::str::from_utf8(&pending) {
                        Ok(data) => {
                            publish(&app, &id, &output, data);
                            pending.clear();
                            break;
                        }
                        Err(error) => {
                            let valid = error.valid_up_to();
                            if valid > 0 {
                                publish(
                                    &app,
                                    &id,
                                    &output,
                                    &String::from_utf8_lossy(&pending[..valid]),
                                );
                                pending.drain(..valid);
                            }
                            if let Some(invalid) = error.error_len() {
                                pending.drain(..invalid);
                                publish(&app, &id, &output, "\u{fffd}");
                            } else {
                                break;
                            }
                        }
                    }
                }
            }
            publish(&app, &id, &output, &String::from_utf8_lossy(&pending));
            let seq = {
                let mut output = output.lock().unwrap();
                output.running = false;
                output.seq
            };
            let _ = app.emit("desktop-shell", json!({"id":id,"type":"exit","seq":seq}));
        });
        Ok(description)
    }

    pub fn execute(&self, app: AppHandle, root: &Path, request: &Value) -> Result<Value> {
        let command = text(request, "type")?;
        if command == "shell.open" {
            return self.open(app, root, request);
        }
        if command == "shell.list" {
            let cwd = request["cwd"]
                .as_str()
                .map(|value| Path::new(value).canonicalize())
                .transpose()
                .map_err(|error| error.to_string())?;
            let items = self.items.lock().unwrap();
            let mut result: Vec<_> = items
                .iter()
                .filter(|(_, shell)| cwd.as_ref().is_none_or(|cwd| &shell.cwd == cwd))
                .map(|(id, shell)| describe(id, shell))
                .collect();
            result.sort_by(|left, right| left["name"].as_str().cmp(&right["name"].as_str()));
            return Ok(json!(result));
        }
        let id = text(request, "id")?;
        if command == "shell.close" {
            let shell = self.items.lock().unwrap().remove(id);
            if let Some(mut shell) = shell {
                if shell
                    .child
                    .try_wait()
                    .map_err(|error| error.to_string())?
                    .is_none()
                {
                    shell.child.kill().map_err(|error| error.to_string())?;
                }
                let _ = shell.child.wait();
            }
            return Ok(Value::Null);
        }
        let mut items = self.items.lock().unwrap();
        let shell = items.get_mut(id).ok_or("终端已关闭。")?;
        match command {
            "shell.read" => {
                let output = shell.output.lock().unwrap();
                Ok(json!({"data":output.data,"seq":output.seq,"running":output.running}))
            }
            "shell.rename" => {
                let name = text(request, "name")?.trim();
                if name.is_empty() {
                    return Err("请填写终端名称。".into());
                }
                shell.name = name.to_owned();
                Ok(describe(id, shell))
            }
            "shell.write" => {
                if !shell.output.lock().unwrap().running {
                    return Err("终端已退出，请创建新终端。".into());
                }
                shell
                    .writer
                    .write_all(text(request, "data")?.as_bytes())
                    .map_err(|error| error.to_string())?;
                Ok(Value::Null)
            }
            "shell.resize" => {
                let size = size(request);
                if shell.master.get_size().map_err(|error| error.to_string())? != size {
                    shell
                        .master
                        .resize(size)
                        .map_err(|error| error.to_string())?;
                }
                Ok(Value::Null)
            }
            _ => Err("未知终端操作。".into()),
        }
    }

    pub fn shutdown(&self) {
        let shells: Vec<_> = self
            .items
            .lock()
            .unwrap()
            .drain()
            .map(|(_, shell)| shell)
            .collect();
        for mut shell in shells {
            let _ = shell.child.kill();
            let _ = shell.child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_keeps_utf8_and_monotonic_sequence() {
        let mut output = Output::default();
        assert_eq!(output.append("中文"), 1);
        assert_eq!(output.append(&"字".repeat(400_000)), 2);
        assert!(output.data.len() <= 1024 * 1024);
        assert!(output.data.chars().all(|value| value == '字'));
        assert_eq!(output.append("完成"), 3);
        assert!(output.data.ends_with("完成"));
    }
}
