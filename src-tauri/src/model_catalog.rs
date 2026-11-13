use crate::{launch, platform::ProcessJob, sessions};
use serde_json::{Value, json};
use std::{
    io::Read,
    path::Path,
    process::Stdio,
    thread,
    time::{Duration, Instant},
};

fn read_pipe(mut pipe: impl Read) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    pipe.read_to_end(&mut bytes)?;
    Ok(bytes)
}

pub fn list(root: &Path, cwd: &Path) -> Result<Value, String> {
    let cwd = cwd.canonicalize().map_err(|error| error.to_string())?;
    if !cwd.is_dir() {
        return Err("Choose an existing project folder.".into());
    }
    let launch = launch::resolve(root, &cwd)?;
    let mut command = sessions::command(root)?;
    command
        .current_dir(cwd)
        .args(
            launch
                .arguments
                .iter()
                .filter(|argument| argument.starts_with("--profile=")),
        )
        .args(["models", "--json"])
        .args(
            launch
                .arguments
                .iter()
                .filter(|argument| argument.starts_with("--config=")),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let job = match ProcessJob::attach(child.id()) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let (status, stdout, stderr) = thread::scope(|scope| {
        // 同时排空两条管道，扩展的诊断输出不能堵住目录进程。
        let stdout = scope.spawn(move || read_pipe(stdout));
        let stderr = scope.spawn(move || read_pipe(stderr));
        let started = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) if started.elapsed() < Duration::from_secs(45) => {
                    thread::sleep(Duration::from_millis(25));
                }
                Ok(None) => {
                    break Err(
                        "Model catalog loading timed out after 45 seconds. Please retry."
                            .to_owned(),
                    );
                }
                Err(error) => break Err(error.to_string()),
            }
        };
        if status.is_err() {
            let _ = child.kill();
        }
        // 先关闭 Job 回收持有管道的子进程，再等待读取线程退出。
        drop(job);
        if status.is_err() {
            let _ = child.wait();
        }
        (status, stdout.join(), stderr.join())
    });
    let stderr = stderr
        .map_err(|_| "Cannot read model catalog diagnostics.")?
        .map_err(|error| error.to_string())?;
    let warning = String::from_utf8_lossy(&stderr).trim().to_owned();
    let status = status.map_err(|error| {
        if warning.is_empty() {
            error
        } else {
            format!("{error}\n{warning}")
        }
    })?;
    if !status.success() {
        return Err(if warning.is_empty() {
            "Cannot load the model catalog. Retry after checking the provider settings.".into()
        } else {
            warning
        });
    }
    let stdout = stdout
        .map_err(|_| "Cannot read the model catalog response.")?
        .map_err(|error| error.to_string())?;
    let result: Value = serde_json::from_slice(&stdout)
        .map_err(|_| "The model catalog returned an invalid response.")?;
    let models = result["models"]
        .as_array()
        .filter(|models| {
            models.iter().all(|model| {
                model["id"].as_str().is_some_and(|id| !id.is_empty())
                    && model["provider"]
                        .as_str()
                        .is_some_and(|provider| !provider.is_empty())
            })
        })
        .ok_or("The model catalog returned an invalid response.")?;
    Ok(json!({"models":models,"warning":warning}))
}
