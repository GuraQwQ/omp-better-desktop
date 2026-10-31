use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

#[derive(Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchProfile {
    pub system_prompt: String,
    pub append_system_prompt: String,
    pub add_dirs: Vec<String>,
    pub tools: Vec<String>,
    pub profile: String,
    pub config: Vec<String>,
    pub session_dir: String,
    pub no_rules: bool,
    pub no_lsp: bool,
    pub no_tools: bool,
    pub plan_yolo: bool,
}

impl LaunchProfile {
    pub fn arguments(&self) -> Vec<String> {
        let mut args = Vec::new();
        for (flag, value) in [
            ("--system-prompt", self.system_prompt.as_str()),
            ("--append-system-prompt", self.append_system_prompt.as_str()),
            ("--profile", self.profile.trim()),
            ("--session-dir", self.session_dir.trim()),
        ] {
            if !value.trim().is_empty() {
                args.push(format!("{flag}={value}"));
            }
        }
        for (flag, values) in [("--add-dir", &self.add_dirs), ("--config", &self.config)] {
            for value in values.iter().map(|v| v.trim()).filter(|v| !v.is_empty()) {
                args.push(format!("{flag}={value}"));
            }
        }
        if !self.no_tools && !self.tools.is_empty() {
            args.push(format!("--tools={}", self.tools.join(",")));
        }
        for (flag, enabled) in [
            ("--no-rules", self.no_rules),
            ("--no-lsp", self.no_lsp),
            ("--no-tools", self.no_tools),
            ("--plan-yolo", self.plan_yolo),
        ] {
            if enabled {
                args.push(flag.into());
            }
        }
        args
    }
}

fn project_key(cwd: &Path) -> Result<String, String> {
    let cwd = std::fs::canonicalize(cwd).map_err(|e| e.to_string())?;
    if !cwd.is_dir() {
        return Err("Choose an existing project folder.".into());
    }
    Ok(cwd.to_string_lossy().into_owned())
}

pub fn read(root: &Path, cwd: &Path) -> Result<LaunchProfile, String> {
    let key = project_key(cwd)?;
    let config = crate::config(root)?;
    serde_json::from_value(
        config["launchProfiles"][key]
            .as_object()
            .map(|v| json!(v))
            .unwrap_or(json!({})),
    )
    .map_err(|e| format!("Read launch settings: {e}"))
}

pub fn write(root: &Path, cwd: &Path, value: Value) -> Result<Value, String> {
    let key = project_key(cwd)?;
    let profile: LaunchProfile = serde_json::from_value(value).map_err(|e| e.to_string())?;
    if !profile.session_dir.trim().is_empty()
        && !Path::new(profile.session_dir.trim()).is_absolute()
    {
        return Err("Choose an absolute session directory.".into());
    }
    let value = serde_json::to_value(profile).map_err(|e| e.to_string())?;
    let mut config = crate::config(root)?;
    if !config["launchProfiles"].is_object() {
        config["launchProfiles"] = json!({});
    }
    // 更换保存目录后仍保留旧会话的发现入口。
    if let Some(directory) = value["sessionDir"]
        .as_str()
        .filter(|v| !v.trim().is_empty())
    {
        if !config["sessionDirectories"].is_array() {
            config["sessionDirectories"] = json!([]);
        }
        let directories = config["sessionDirectories"].as_array_mut().unwrap();
        let directory = json!(directory.trim());
        if !directories.contains(&directory) {
            directories.push(directory);
        }
    }
    config["launchProfiles"][key] = value.clone();
    crate::save(&root.join("desktop.json"), &config)?;
    Ok(value)
}

pub fn session_roots(root: &Path) -> Result<Vec<PathBuf>, String> {
    let config = crate::config(root)?;
    let mut roots = Vec::new();
    if let Some(directories) = config["sessionDirectories"].as_array() {
        roots.extend(
            directories
                .iter()
                .filter_map(Value::as_str)
                .map(PathBuf::from)
                .filter(|p| p.is_absolute()),
        );
    }
    if let Some(profiles) = config["launchProfiles"].as_object() {
        for value in profiles.values() {
            if let Some(path) = value["sessionDir"]
                .as_str()
                .filter(|s| !s.trim().is_empty())
            {
                let path = PathBuf::from(path.trim());
                if path.is_absolute() && !roots.contains(&path) {
                    roots.push(path);
                }
            }
        }
    }
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_arguments_preserve_values_and_defaults() {
        assert!(LaunchProfile::default().arguments().is_empty());
        let profile = LaunchProfile {
            system_prompt: "--profile work\n保留原文".into(),
            add_dirs: vec!["D:/项目 甲".into(), "".into()],
            config: vec!["D:/配置.yml".into()],
            tools: vec!["read".into(), "edit".into()],
            ..Default::default()
        };
        assert_eq!(
            profile.arguments(),
            [
                "--system-prompt=--profile work\n保留原文",
                "--add-dir=D:/项目 甲",
                "--config=D:/配置.yml",
                "--tools=read,edit"
            ]
        );
        let profile = LaunchProfile {
            no_tools: true,
            ..profile
        };
        assert!(
            !profile
                .arguments()
                .iter()
                .any(|v| v.starts_with("--tools="))
        );
        assert!(profile.arguments().contains(&"--no-tools".into()));
        assert!(serde_json::from_value::<LaunchProfile>(json!({"args":["-p","hello"]})).is_err());
    }

    #[test]
    fn replacing_launch_settings_keeps_history_discoverable() {
        let root = std::env::temp_dir().join(format!("omp-launch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let directory = root.join("历史");
        std::fs::create_dir(&directory).unwrap();
        write(
            &root,
            &root,
            json!({"sessionDir":directory, "appendSystemPrompt":"中文"}),
        )
        .unwrap();
        write(&root, &root, json!({})).unwrap();
        write(&root, &root, json!({})).unwrap();
        assert!(read(&root, &root).unwrap().arguments().is_empty());
        assert_eq!(session_roots(&root).unwrap(), vec![directory]);
        assert!(write(&root, &root, json!({"sessionDir":"relative"})).is_err());
        assert_eq!(
            crate::config(&root).unwrap()["preferences"]["theme"],
            "system"
        );
        // 只清理由本测试创建的唯一目录。
        assert!(
            root.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("omp-launch-")
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
