use crate::{platform, storage};
use serde_json::{Value, json};
use std::{
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
};

static HELPER_WRITE: Mutex<()> = Mutex::new(());

fn config_path(agent_dir: &Path) -> std::path::PathBuf {
    let file = agent_dir.join("models.yml");
    let fallback = file.with_extension("yaml");
    if !file.exists() && fallback.exists() {
        fallback
    } else {
        file
    }
}

fn invoke(root: &Path, request: Value) -> Result<Value, String> {
    let executable = storage::current_runtime(root)?.ok_or("Install the OMP runtime first.")?;
    // 内嵌脚本没有独立模块文件，将同源能力目录和字段数据展开到执行文本。
    let script = format!(
        "const modelFields = {};\nconst bundledCapabilities = {};\nconst officialCapabilities = {};\n{}\n{}\nawait run();",
        include_str!("provider-model-fields.json"),
        include_str!("model-capabilities.json"),
        include_str!("model-capabilities-overrides.json"),
        include_str!("model-metadata.mjs")
            .replace("import bundledCapabilities from './model-capabilities.json' with { type: 'json' };", "")
            .replace("import officialCapabilities from './model-capabilities-overrides.json' with { type: 'json' };", ""),
        include_str!("provider-config.mjs").replace(
            "import modelFields from './provider-model-fields.json' with { type: 'json' };",
            ""
        )
        .replace("import { inferredModelCapabilities } from './model-metadata.mjs';", "")
    );
    let helper = root.join("cache/providers-helper.mjs");
    {
        let _write = HELPER_WRITE
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if !std::fs::read(&helper).is_ok_and(|bytes| bytes == script.as_bytes()) {
            storage::atomic_write(&helper, script.as_bytes())?;
        }
    }
    let mut command = Command::new(executable);
    command
        .arg(helper)
        .current_dir(root)
        .env("BUN_BE_BUN", "1")
        .env("BUN_INSTALL_CACHE_DIR", root.join("cache/bun"))
        .env("TEMP", root.join("cache/tmp"))
        .env("TMP", root.join("cache/tmp"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    platform::hidden(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "Cannot start the provider configuration helper.")?;
    let _job = match platform::ProcessJob::attach(child.id()) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    child
        .stdin
        .take()
        .ok_or("Cannot write provider configuration request.")?
        .write_all(
            serde_json::to_string(&request)
                .map_err(|_| "Invalid provider request.")?
                .as_bytes(),
        )
        .map_err(|_| "Cannot write provider configuration request.")?;
    let output = child
        .wait_with_output()
        .map_err(|_| "Provider configuration helper did not complete.")?;
    let result: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "Provider configuration helper returned an invalid response.")?;
    if !output.status.success() || result["ok"] != true {
        return Err(result["error"]
            .as_str()
            .unwrap_or("Provider configuration failed.")
            .to_owned());
    }
    Ok(result["value"].clone())
}

pub fn config(root: &Path, request: &Value, agent_dir: &Path) -> Result<Value, String> {
    let operation = request["operation"].as_str().unwrap_or("list");
    if !matches!(operation, "list" | "save" | "delete") {
        return Err("Unknown provider configuration operation.".into());
    }
    let _lock = if matches!(operation, "save" | "delete") {
        Some(storage::storage_lock(root)?)
    } else {
        None
    };
    let file = config_path(agent_dir);
    let mut result = invoke(
        root,
        json!({"operation":operation,"configPath":file,"provider":request["provider"]}),
    )?;
    if matches!(operation, "save" | "delete") {
        let content = result["content"]
            .as_str()
            .ok_or("Missing provider configuration content.")?;
        storage::atomic_write(&file, content.as_bytes())?;
        result.as_object_mut().unwrap().remove("content");
    }
    drop(_lock);
    result["configPath"] = json!(file);
    result["takeover"] = storage::takeover_status(root)
        .unwrap_or(json!({"enabled":false,"active":false,"unknown":true}));
    Ok(result)
}

pub fn discover(root: &Path, request: &Value) -> Result<Value, String> {
    let cwd = request["cwd"].as_str().ok_or("Choose a project first.")?;
    let launch = crate::launch::resolve(root, Path::new(cwd))?;
    invoke(
        root,
        json!({"operation":"discover","configPath":config_path(&launch.agent_dir),"provider":request["provider"]}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launch::profile_agent;

    #[test]
    fn provider_paths_follow_omp_profiles() {
        let root = Path::new("D:/desktop-data");
        assert_eq!(
            profile_agent(root, "default").unwrap(),
            root.join("omp/agent")
        );
        assert_eq!(
            profile_agent(root, "work").unwrap(),
            root.join("omp/profiles/work/agent")
        );
        for invalid in ["../escape", "a/b", "Work", "con", "com0.ext", "work.", ".."] {
            assert!(profile_agent(root, invalid).is_err(), "{invalid}");
        }
    }
}
