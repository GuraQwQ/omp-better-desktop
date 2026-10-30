use crate::storage;
use serde_json::{Value, json};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_RECORDS: usize = 100;
const MAX_AGE_MS: u64 = 7 * 24 * 60 * 60 * 1000;
static CONFIGURATION: Mutex<()> = Mutex::new(());

fn directory(root: &Path) -> PathBuf {
    root.join("cache/request-captures")
}

fn configuration(root: &Path) -> PathBuf {
    root.join("request-capture.json")
}

fn enabled(root: &Path) -> Result<bool, String> {
    match fs::read(configuration(root)) {
        Ok(bytes) => serde_json::from_slice::<Value>(&bytes)
            .map(|value| value["enabled"] == true)
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

fn supported(root: &Path) -> Result<bool, String> {
    let Some(executable) = storage::current_runtime(root)? else {
        return Ok(false);
    };
    let manifest = executable.parent().unwrap().join("runtime-manifest.json");
    let value: Value =
        serde_json::from_slice(&fs::read(manifest).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    Ok(value["requestCaptureVersion"].as_u64().unwrap_or(0) >= 1)
}

fn uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}

struct Record {
    id: String,
    path: PathBuf,
    bytes: u64,
    modified: u64,
}

fn records(root: &Path) -> Result<Vec<Record>, String> {
    let mut records = Vec::new();
    let folders = match fs::read_dir(directory(root)) {
        Ok(folders) => folders,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(records),
        Err(error) => return Err(error.to_string()),
    };
    for folder in folders {
        let folder = folder.map_err(|error| error.to_string())?;
        let name = folder.file_name().to_string_lossy().to_string();
        if !uuid(&name) || !folder.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let files = match fs::read_dir(folder.path()) {
            Ok(files) => files,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        for file in files {
            let file = file.map_err(|error| error.to_string())?;
            let file_name = file.file_name().to_string_lossy().to_string();
            let Some(id) = file_name.strip_suffix(".json").filter(|id| uuid(id)) else {
                continue;
            };
            let info = match fs::symlink_metadata(file.path()) {
                Ok(info) if info.is_file() && !info.file_type().is_symlink() => info,
                Ok(_) => continue,
                Err(error) if error.kind() == ErrorKind::NotFound => continue,
                Err(error) => return Err(error.to_string()),
            };
            let modified = info
                .modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            records.push(Record {
                id: format!("{name}/{id}"),
                path: file.path(),
                bytes: info.len(),
                modified,
            });
        }
    }
    records.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then(right.id.cmp(&left.id))
    });
    Ok(records)
}

fn remove(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn process_running(id: u32) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::CloseHandle,
            System::Threading::{
                GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
            },
        };
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, id) };
        if handle.is_null() {
            return std::io::Error::last_os_error().raw_os_error() == Some(5);
        }
        let mut exit = 0;
        let queried = unsafe { GetExitCodeProcess(handle, &mut exit) };
        unsafe { CloseHandle(handle) };
        queried == 0 || exit == 259
    }
    #[cfg(not(windows))]
    {
        Path::new("/proc").join(id.to_string()).exists()
    }
}

fn cleanup_folders(root: &Path) -> Result<(), String> {
    let Ok(folders) = fs::read_dir(directory(root)) else {
        return Ok(());
    };
    let now = SystemTime::now();
    for folder in folders {
        let folder = folder.map_err(|error| error.to_string())?;
        if !uuid(&folder.file_name().to_string_lossy())
            || !folder.file_type().is_ok_and(|kind| kind.is_dir())
        {
            continue;
        }
        let context = folder.path().join("context.json");
        if let Ok(bytes) = fs::read(&context)
            && let Ok(value) = serde_json::from_slice::<Value>(&bytes)
            && let Some(owner) = value["ownerPid"].as_u64()
            && !process_running(owner as u32)
        {
            remove(&context)?;
        }
        if let Ok(files) = fs::read_dir(folder.path()) {
            for file in files {
                let file = file.map_err(|error| error.to_string())?;
                let name = file.file_name().to_string_lossy().to_string();
                let pending = name
                    .strip_prefix('.')
                    .and_then(|name| name.strip_suffix(".pending"));
                if (pending.is_some_and(uuid) || name == ".context.json.pending")
                    && file
                        .metadata()
                        .and_then(|info| info.modified())
                        .ok()
                        .and_then(|modified| now.duration_since(modified).ok())
                        .is_some_and(|age| age.as_secs() > 30 * 60)
                {
                    remove(&file.path())?;
                }
            }
        }
        // 只尝试删除空目录，活跃会话信息和新到的请求会阻止删除。
        let _ = fs::remove_dir(folder.path());
    }
    Ok(())
}

fn prune(root: &Path) -> Result<Vec<Record>, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let mut retained = Vec::new();
    let mut bytes = 0;
    for record in records(root)? {
        if retained.len() < MAX_RECORDS
            && bytes + record.bytes <= MAX_BYTES
            && now.saturating_sub(record.modified) <= MAX_AGE_MS
        {
            bytes += record.bytes;
            retained.push(record);
        } else {
            remove(&record.path)?;
        }
    }
    cleanup_folders(root)?;
    Ok(retained)
}

pub fn status(root: &Path) -> Result<Value, String> {
    let records = prune(root)?;
    Ok(json!({
        "enabled": enabled(root)?, "supported": supported(root).unwrap_or(false), "directory": directory(root),
        "count": records.len(), "bytes": records.iter().map(|record| record.bytes).sum::<u64>(),
        "maxBytes": MAX_BYTES, "maxRecords": MAX_RECORDS,
    }))
}

pub fn configure(root: &Path, value: bool) -> Result<Value, String> {
    let _lock = CONFIGURATION.lock().unwrap();
    if value && !supported(root).unwrap_or(false) {
        return Err("当前运行时不支持实际请求捕获，请安装包含此功能的新运行时。 / This runtime does not support request capture. Install an updated runtime.".into());
    }
    storage::atomic_write(
        &configuration(root),
        &serde_json::to_vec(&json!({"enabled":value})).unwrap(),
    )?;
    status(root)
}

pub fn list(
    root: &Path,
    session_id: Option<&str>,
    session_path: Option<&str>,
) -> Result<Value, String> {
    let mut result = Vec::new();
    for record in prune(root)? {
        let bytes = match fs::read(&record.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
            continue;
        };
        if (session_id.is_some() || session_path.is_some())
            && !session_id.is_some_and(|id| value["sessionId"].as_str() == Some(id))
            && !session_path.is_some_and(|path| {
                value["sessionPath"]
                    .as_str()
                    .is_some_and(|saved| same_path(saved, path))
            })
        {
            continue;
        }
        result.push(json!({
            "id": record.id, "createdAt": value["createdAt"], "method": value["method"],
            "url": value["url"], "bytes": record.bytes, "sessionId": value["sessionId"], "sessionPath": value["sessionPath"],
        }));
    }
    result.sort_by(|left, right| right["createdAt"].as_u64().cmp(&left["createdAt"].as_u64()));
    Ok(json!(result))
}

fn same_path(left: &str, right: &str) -> bool {
    let normalize = |path: &str| {
        let path = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
        let value = path.to_string_lossy().replace('\\', "/");
        #[cfg(windows)]
        {
            value.trim_start_matches("//?/").to_lowercase()
        }
        #[cfg(not(windows))]
        {
            value
        }
    };
    normalize(left) == normalize(right)
}

pub fn read(root: &Path, id: &str) -> Result<Value, String> {
    let parts: Vec<_> = id.split('/').collect();
    if parts.len() != 2 || !parts.iter().all(|part| uuid(part)) {
        return Err("Invalid request capture identifier.".into());
    }
    let path = directory(root)
        .join(parts[0])
        .join(format!("{}.json", parts[1]));
    let parent = fs::canonicalize(directory(root)).map_err(|error| error.to_string())?;
    let target = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !target.starts_with(parent) {
        return Err("Request capture is outside its managed directory.".into());
    }
    serde_json::from_slice(&fs::read(target).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

pub fn clear(root: &Path) -> Result<Value, String> {
    for record in records(root)? {
        remove(&record.path)?;
    }
    status(root)
}

pub fn environment(root: &Path) -> [(String, PathBuf); 2] {
    [
        ("OMP_DESKTOP_REQUEST_CAPTURE_ROOT".into(), directory(root)),
        (
            "OMP_DESKTOP_REQUEST_CAPTURE_CONFIG".into(),
            configuration(root),
        ),
    ]
}

pub fn context(root: &Path, id: &str) -> PathBuf {
    directory(root).join(id).join("context.json")
}

pub fn update_context(path: &Path, session_path: Option<&Path>) -> Result<(), String> {
    let _lock = CONFIGURATION.lock().unwrap();
    let bytes =
        serde_json::to_vec(&json!({"sessionPath":session_path,"ownerPid":std::process::id()}))
            .unwrap();
    if fs::read(path).is_ok_and(|previous| previous == bytes) {
        return Ok(());
    }
    storage::atomic_write(path, &bytes)
}
