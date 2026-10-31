use crate::{platform, storage};
use serde_json::{Value, json};
use std::{
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

fn profile_agent(root: &Path, name: &str) -> Result<std::path::PathBuf, String> {
    let name = name.trim();
    if name.is_empty() || name == "default" {
        return Ok(root.join("omp/agent"));
    }
    let basename = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reserved = matches!(basename.as_str(), "con" | "prn" | "aux" | "nul")
        || basename.len() == 4
            && (basename.starts_with("com") || basename.starts_with("lpt"))
            && basename.as_bytes()[3].is_ascii_digit();
    if name.len() > 64
        || !name.as_bytes()[0].is_ascii_lowercase() && !name.as_bytes()[0].is_ascii_digit()
        || !name
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(&c))
        || name.ends_with('.')
        || reserved
    {
        return Err("Enter a valid OMP profile name.".into());
    }
    Ok(root.join("omp/profiles").join(name).join("agent"))
}

fn config_path(root: &Path, request: &Value) -> Result<std::path::PathBuf, String> {
    let cwd = request["cwd"].as_str().ok_or("Choose a project first.")?;
    let profile = crate::launch::read(root, Path::new(cwd))?;
    let inherited = std::env::var("OMP_PROFILE")
        .ok()
        .or_else(|| std::env::var("PI_PROFILE").ok())
        .unwrap_or_default();
    let name = if profile.profile.trim().is_empty() {
        &inherited
    } else {
        &profile.profile
    };
    let file = profile_agent(root, name)?.join("models.yml");
    let fallback = file.with_extension("yaml");
    if !file.exists() && fallback.exists() {
        Ok(fallback)
    } else {
        Ok(file)
    }
}

fn invoke(root: &Path, request: Value) -> Result<Value, String> {
    let executable = storage::current_runtime(root)?.ok_or("Install the OMP runtime first.")?;
    let mut command = Command::new(executable);
    command
        .args([
            "--eval",
            concat!(include_str!("provider-config.mjs"), "\nawait run();"),
        ])
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

pub fn config(root: &Path, request: &Value) -> Result<Value, String> {
    let operation = request["operation"].as_str().unwrap_or("list");
    if !matches!(operation, "list" | "save" | "delete") {
        return Err("Unknown provider configuration operation.".into());
    }
    let _lock = storage::storage_lock(root)?;
    let file = config_path(root, request)?;
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
    result["configPath"] = json!(file);
    result["takeover"] = storage::takeover_status(root)
        .unwrap_or(json!({"enabled":false,"active":false,"unknown":true}));
    Ok(result)
}

pub fn discover(root: &Path, request: &Value) -> Result<Value, String> {
    invoke(
        root,
        json!({"operation":"discover","configPath":config_path(root, request)?,"provider":request["provider"]}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
