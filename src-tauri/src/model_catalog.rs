use crate::{launch, platform::ProcessJob, sessions};
use rusqlite::{Connection, OpenFlags};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Stdio,
    thread,
    time::{Duration, Instant},
};

fn snapshot(
    root: &Path,
    cwd: &Path,
    launch: &launch::ResolvedLaunch,
) -> Result<(PathBuf, String), String> {
    let executable =
        crate::storage::current_runtime(root)?.ok_or("Install the OMP runtime first.")?;
    let mut signature = Sha256::new();
    signature.update(executable.to_string_lossy().as_bytes());
    for argument in &launch.arguments {
        signature.update(argument.as_bytes());
        signature.update([0]);
    }
    let mut files = Vec::new();
    for directory in [&launch.agent_dir, &cwd.join(".omp")] {
        for name in [
            "models.yml",
            "models.yaml",
            "models.json",
            "config.yml",
            "config.yaml",
            "config.json",
        ] {
            files.push(directory.join(name));
        }
    }
    let auth_revision = Connection::open_with_flags(
        launch.agent_dir.join("agent.db"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .ok()
    .and_then(|connection| {
        connection
            .query_row(
                "SELECT revision FROM auth_change_revision WHERE id=1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .ok()
    })
    .unwrap_or(0);
    signature.update(auth_revision.to_le_bytes());
    for argument in &launch.arguments {
        if let Some(path) = argument.strip_prefix("--config=") {
            files.push(cwd.join(path));
        }
    }
    for file in files {
        signature.update(file.to_string_lossy().as_bytes());
        match fs::metadata(&file) {
            Ok(metadata) => signature
                .update(format!("{}:{:?}", metadata.len(), metadata.modified().ok()).as_bytes()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                signature.update(b"missing")
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    let key =
        Sha256::digest(format!("{}\0{}", cwd.display(), launch.agent_dir.display()).as_bytes());
    Ok((
        root.join("cache/model-catalog")
            .join(format!("{key:x}.json")),
        format!("{:x}", signature.finalize()),
    ))
}

fn read_pipe(mut pipe: impl Read) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    pipe.read_to_end(&mut bytes)?;
    Ok(bytes)
}

pub fn list(root: &Path, cwd: &Path, refresh: bool) -> Result<Value, String> {
    let cwd = cwd.canonicalize().map_err(|error| error.to_string())?;
    if !cwd.is_dir() {
        return Err("Choose an existing project folder.".into());
    }
    let launch = launch::resolve(root, &cwd)?;
    let cached = snapshot(root, &cwd, &launch).ok();
    if !refresh && let Some((cache, signature)) = &cached {
        if let Ok(bytes) = fs::read(&cache) {
            if let Ok(saved) = serde_json::from_slice::<Value>(&bytes) {
                if saved["signature"].as_str() == Some(signature)
                    && saved["result"]["models"].is_array()
                {
                    return Ok(saved["result"].clone());
                }
            }
        }
    }
    let mut command = sessions::command(root)?;
    command
        .current_dir(&cwd)
        .args(
            launch
                .arguments
                .iter()
                .filter(|argument| argument.starts_with("--profile=")),
        )
        .args(if refresh {
            vec!["models", "refresh", "--json"]
        } else {
            vec!["models", "--json", "--offline"]
        })
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
    let result = json!({"models":models,"warning":warning});
    if let Some((cache, signature)) = cached
        && let Ok(_lock) = crate::storage::storage_lock(root)
        && snapshot(root, &cwd, &launch).is_ok_and(|(_, current)| current == signature)
        && let Ok(bytes) = serde_json::to_vec(&json!({"signature":signature,"result":result}))
    {
        let _ = crate::storage::atomic_write(&cache, &bytes);
    }
    Ok(result)
}
