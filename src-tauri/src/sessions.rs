use crate::{
    history,
    platform::{ProcessJob, hidden},
    storage,
};
use omp_rpc::{Client, ClientOptions, Event, RpcInbound};
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

pub struct Session {
    pub client: Arc<Client>,
    pub cwd: PathBuf,
    pub path: Arc<Mutex<Option<PathBuf>>>,
    settled: Arc<AtomicBool>,
    _job: ProcessJob,
}

struct Terminal {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    _job: ProcessJob,
}

#[derive(Default)]
pub struct Sessions {
    sessions: Mutex<HashMap<String, Session>>,
    terminals: Mutex<HashMap<String, Terminal>>,
    opening: Mutex<()>,
}

fn emit(app: &AppHandle, id: &str, event: Value) {
    let _ = app.emit("desktop-event", json!({"sessionId":id,"event":event}));
}

fn event_value(event: Event) -> Value {
    match event {
        Event::Notification(n) => serde_json::to_value(n).unwrap_or(Value::Null),
        Event::UnmatchedResponse(r) => serde_json::to_value(r).unwrap_or(Value::Null),
        Event::Undecodable { raw, .. } => raw,
    }
}

pub fn command(root: &Path) -> Result<Command, String> {
    let executable = storage::current_runtime(root)?
        .ok_or("Install a matching OMP runtime in Settings first.")?;
    let mut command = Command::new(executable);
    command
        .env("OMP_USER_ROOT", root.join("omp"))
        .env("TEMP", root.join("cache/tmp"))
        .env("TMP", root.join("cache/tmp"));
    hidden(&mut command);
    Ok(command)
}

impl Sessions {
    pub fn is_empty(&self) -> bool {
        self.sessions.lock().unwrap().is_empty() && self.terminals.lock().unwrap().is_empty()
    }

    pub fn open(
        &self,
        app: AppHandle,
        root: &Path,
        cwd: &Path,
        path: Option<&Path>,
    ) -> Result<Value, String> {
        let _opening = self.opening.lock().map_err(|e| e.to_string())?;
        let cwd = std::fs::canonicalize(cwd).map_err(|e| e.to_string())?;
        if !cwd.is_dir() {
            return Err("Project folder does not exist.".into());
        }
        let path = path.map(|p| history::session_path(root, p)).transpose()?;
        if let Some(path) = &path {
            for (id, session) in self.sessions.lock().unwrap().iter() {
                if session.path.lock().unwrap().as_ref() == Some(path) {
                    return Ok(
                        json!({"id":id,"cwd":session.cwd,"path":path,"state":session.client.call_raw(json!({"type":"get_state"})).map_err(|e|e.to_string())?}),
                    );
                }
            }
        }
        let id = uuid::Uuid::new_v4().to_string();
        let mut process = command(root)?;
        process.current_dir(&cwd).args(["--mode", "rpc-ui"]);
        if let Some(path) = &path {
            process.arg("--session").arg(path);
        }
        let (client, receiver) =
            Client::spawn(process, ClientOptions::default()).map_err(|e| e.to_string())?;
        let job = ProcessJob::attach(client.pid().ok_or("Runtime did not start.")?)?;
        let client = Arc::new(client);
        let state = client
            .call_raw(json!({"type":"get_state"}))
            .map_err(|e| e.to_string())?;
        let actual_path = state["sessionFile"].as_str().map(PathBuf::from).or(path);
        client
            .call_raw(json!({"type":"set_event_filter","events":null,"messageUpdates":"delta"}))
            .map_err(|e| e.to_string())?;
        let settled = Arc::new(AtomicBool::new(state["isSettled"].as_bool().unwrap_or(false)));
        let path_cell = Arc::new(Mutex::new(actual_path.clone()));
        let result = json!({"id":id,"cwd":cwd,"path":actual_path,"state":state});
        self.sessions.lock().unwrap().insert(
            id.clone(),
            Session {
                client: client.clone(),
                cwd,
                path: path_cell.clone(),
                settled: settled.clone(),
                _job: job,
            },
        );
        thread::spawn(move || {
            // 单独消费事件，控制请求不会排在 UI 渲染之后。
            while let Ok(event) = receiver.recv() {
                let event = event_value(event);
                match event["type"].as_str().unwrap_or("") {
                    "agent_start" => {
                        settled.store(false, Ordering::Release);
                    }
                    "session_settled" => {
                        settled.store(true, Ordering::Release);
                    }
                    "prompt_result" if event["sessionSettled"] == true => {
                        settled.store(true, Ordering::Release);
                    }
                    "session_info_update" => {
                        if let Some(path) = event["sessionFile"].as_str() {
                            *path_cell.lock().unwrap() = Some(path.into());
                        }
                    }
                    _ => {}
                }
                emit(&app, &id, event);
            }
            emit(
                &app,
                &id,
                json!({"type":"desktop_status","status":"disconnected"}),
            );
        });
        Ok(result)
    }

    pub fn rpc(&self, id: &str, frame: Value) -> Result<Value, String> {
        let (client, settled, path_cell) = {
            let sessions = self.sessions.lock().unwrap();
            let session = sessions
                .get(id)
                .ok_or("Session is closed. Reopen it to continue.")?;
            (
                session.client.clone(),
                session.settled.clone(),
                session.path.clone(),
            )
        };
        let is_prompt = matches!(
            frame["type"].as_str(),
            Some("prompt" | "abort_and_prompt" | "steer" | "follow_up")
        );
        if is_prompt {
            settled.store(false, Ordering::Release);
        }
        let command_type = frame["type"].as_str().unwrap_or("").to_owned();
        let result = client.call_raw(frame).map_err(|e| e.to_string());
        if let Ok(value) = &result {
            if value["agentInvoked"] == false {
                settled.store(true, Ordering::Release);
            }
            if let Some(path) = value["sessionFile"].as_str() {
                *path_cell.lock().unwrap() = Some(path.into());
            }
        }
        if is_prompt && result.is_err() || command_type == "get_state" {
            let state = if command_type == "get_state" { result.as_ref().ok().cloned() } else { client.call_raw(json!({"type":"get_state"})).ok() };
            if let Some(state) = state { settled.store(state["isSettled"].as_bool().unwrap_or(false), Ordering::Release); }
        }
        result
    }

    pub fn ui(&self, id: &str, mut response: Value) -> Result<Value, String> {
        response["type"] = json!("extension_ui_response");
        let client = self
            .sessions
            .lock()
            .unwrap()
            .get(id)
            .ok_or("Session is closed.")?
            .client
            .clone();
        client
            .send(&RpcInbound::from_value(response).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }

    pub fn close(&self, id: &str) -> Result<Value, String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(id) {
            if !session.settled.load(Ordering::Acquire) {
                return Err("This session still has active work. Stop it before closing.".into());
            }
        }
        sessions.remove(id);
        Ok(Value::Null)
    }

    pub fn shutdown(&self) {
        let clients: Vec<_> = self
            .sessions
            .lock()
            .unwrap()
            .values()
            .map(|s| s.client.clone())
            .collect();
        let handles: Vec<_> = clients
            .into_iter()
            .map(|client| {
                thread::spawn(move || {
                    let _ = client.call_raw(json!({"type":"abort"}));
                })
            })
            .collect();
        for handle in handles {
            let _ = handle.join();
        }
        let until = Instant::now() + Duration::from_secs(5);
        while Instant::now() < until
            && self
                .sessions
                .lock()
                .unwrap()
                .values()
                .any(|s| !s.settled.load(Ordering::Acquire))
        {
            thread::sleep(Duration::from_millis(50));
        }
        self.sessions.lock().unwrap().clear();
        for (_, mut terminal) in self.terminals.lock().unwrap().drain() {
            let _ = terminal.child.kill();
            let _ = terminal.child.wait();
        }
    }

    pub fn terminal_open(
        &self,
        app: AppHandle,
        root: &Path,
        id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Value, String> {
        let (cwd, path) = {
            let sessions = self.sessions.lock().unwrap();
            let session = sessions.get(id).ok_or("Open a session first.")?;
            if !session.settled.load(Ordering::Acquire) {
                return Err("Stop the active work before opening its TUI.".into());
            }
            let state = session
                .client
                .call_raw(json!({"type":"get_state"}))
                .map_err(|e| e.to_string())?;
            let path = state["sessionFile"].as_str().map(PathBuf::from).or(session
                .path
                .lock()
                .unwrap()
                .clone());
            (session.cwd.clone(), path)
        };
        let executable = storage::current_runtime(root)?.ok_or("Install OMP first.")?;
        // 先释放 RPC 写者，再接手同一日志。
        self.close(id)?;
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        let mut cmd = CommandBuilder::new(executable);
        cmd.cwd(cwd);
        cmd.env("OMP_USER_ROOT", root.join("omp"));
        if let Some(path) = path {
            cmd.arg("--session");
            cmd.arg(path);
        }
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);
        let job = ProcessJob::attach(child.process_id().ok_or("Terminal did not start.")?)?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        self.terminals.lock().unwrap().insert(
            id.to_owned(),
            Terminal {
                master: pair.master,
                writer,
                child,
                _job: job,
            },
        );
        let session_id = id.to_owned();
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut pending = Vec::new();
            loop {
                let Ok(size) = reader.read(&mut buf) else {
                    break;
                };
                if size == 0 {
                    break;
                }
                pending.extend_from_slice(&buf[..size]);
                let length = match std::str::from_utf8(&pending) {
                    Ok(_) => pending.len(),
                    Err(e) => e.valid_up_to(),
                };
                if length > 0 {
                    let data = String::from_utf8_lossy(&pending[..length]).into_owned();
                    pending.drain(..length);
                    emit(
                        &app,
                        &session_id,
                        json!({"type":"terminal_data","data":data}),
                    );
                }
                if pending.len() > 4 {
                    let data = String::from_utf8_lossy(&pending).into_owned();
                    pending.clear();
                    emit(
                        &app,
                        &session_id,
                        json!({"type":"terminal_data","data":data}),
                    );
                }
            }
            emit(&app, &session_id, json!({"type":"terminal_exit"}));
        });
        Ok(json!({"id":id}))
    }

    pub fn terminal_write(&self, id: &str, data: &str) -> Result<Value, String> {
        let mut terminals = self.terminals.lock().unwrap();
        let terminal = terminals.get_mut(id).ok_or("Terminal is closed.")?;
        terminal
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| terminal.writer.flush())
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }
    pub fn terminal_resize(&self, id: &str, cols: u16, rows: u16) -> Result<Value, String> {
        self.terminals
            .lock()
            .unwrap()
            .get(id)
            .ok_or("Terminal is closed.")?
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }
    pub fn terminal_close(&self, id: &str) -> Result<Value, String> {
        if let Some(mut terminal) = self.terminals.lock().unwrap().remove(id) {
            terminal.child.kill().map_err(|e| e.to_string())?;
            let _ = terminal.child.wait();
        }
        Ok(Value::Null)
    }
}
