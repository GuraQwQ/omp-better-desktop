use crate::{platform, storage};
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

pub fn install(root: &Path, id: &str, format: &str, profile: &str) -> Result<Value, String> {
    if !matches!(
        (id, format),
        ("ponytail", "plugin") | ("grill-me", "skill" | "plugin") | ("codegraph", "mcp")
    ) {
        return Err("未知的社区能力或安装格式。".into());
    }
    if !root.is_absolute() {
        return Err("社区安装数据目录必须是绝对路径。".into());
    }
    #[cfg(windows)]
    if let Some(std::path::Component::Prefix(prefix)) = root.components().next()
        && matches!(
            prefix.kind(),
            std::path::Prefix::Disk(b'C' | b'c') | std::path::Prefix::VerbatimDisk(b'C' | b'c')
        )
    {
        return Err("请先选择非 C 盘的数据目录，再安装社区能力。".into());
    }
    let executable = storage::current_runtime(root)?.ok_or("请先安装 OMP 运行时。")?;
    let cache = root.join("cache/community");
    fs::create_dir_all(cache.join("temp")).map_err(|error| error.to_string())?;
    fs::create_dir_all(cache.join("npm")).map_err(|error| error.to_string())?;
    let locks = root.join("community/.locks");
    fs::create_dir_all(&locks).map_err(|error| error.to_string())?;
    // 插件共用原生注册表，其余能力按各自目录串行安装。
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(locks.join(format!(
            "{}.lock",
            if format == "plugin" { "plugins" } else { id }
        )))
        .map_err(|error| error.to_string())?;
    lock.lock().map_err(|error| error.to_string())?;
    let helper = cache.join("temp/community-install.mjs");
    let source = include_str!("../../scripts/community-install.mjs");
    {
        let _write = storage::storage_lock(root)?;
        if !fs::read(&helper).is_ok_and(|bytes| bytes == source.as_bytes()) {
            storage::atomic_write(&helper, source.as_bytes())?;
        }
    }
    let root = platform::external_path(root);
    let executable = platform::external_path(&executable);
    let mut command = Command::new(&executable);
    command
        .arg(platform::external_path(&helper))
        .current_dir(&root)
        .envs(platform::runtime_environment(&root))
        .envs(crate::network::environment())
        .env("BUN_BE_BUN", "1")
        .env("OMP_PROFILE", profile)
        .env_remove("PI_PROFILE")
        .env(
            "BUN_INSTALL_CACHE_DIR",
            root.join("cache/community/npm/bun"),
        )
        .env(
            "BUN_RUNTIME_TRANSPILER_CACHE_PATH",
            root.join("cache/community/npm/transpiler"),
        )
        .env("npm_config_cache", root.join("cache/community/npm"))
        .env("TEMP", root.join("cache/community/temp"))
        .env("TMP", root.join("cache/community/temp"))
        .env("TMPDIR", root.join("cache/community/temp"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    platform::hidden(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动社区安装助手：{error}"))?;
    let _job = match platform::ProcessJob::attach(child.id()) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let request =
        serde_json::to_vec(&json!({"root":root,"runtime":executable,"id":id,"format":format}))
            .map_err(|error| error.to_string())?;
    if let Err(error) = child
        .stdin
        .take()
        .ok_or("无法写入社区安装请求。")?
        .write_all(&request)
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("无法写入社区安装请求：{error}"));
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("社区安装未能完成，可重试：{error}"))?;
    let result: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "社区安装助手未返回有效结果，请重试。")?;
    if !output.status.success() || result["ok"] != true {
        return Err(result["error"]
            .as_str()
            .unwrap_or("社区安装未能完成，请重试。")
            .to_owned());
    }
    Ok(result["value"].clone())
}
