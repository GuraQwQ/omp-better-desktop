use crate::{launch, platform::ProcessJob, sessions};
use serde_json::{Value, json};
use std::{path::Path, process::Stdio};

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
    let _job = match ProcessJob::attach(child.id()) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    // 模型目录沿用上游的配置、凭据和目录缓存，不创建聊天会话或工具宿主。
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let warning = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if !output.status.success() {
        return Err(if warning.is_empty() {
            "Cannot load the model catalog. Retry after checking the provider settings.".into()
        } else {
            warning
        });
    }
    let result: Value = serde_json::from_slice(&output.stdout)
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
