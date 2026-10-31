use rusqlite::{Connection, OpenFlags, backup::Backup};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    version: String,
    revision: String,
    protocol_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    request_capture_version: Option<u32>,
    executable: String,
    files: Vec<RuntimeFile>,
}

#[derive(Clone, Serialize, Deserialize)]
struct RuntimeFile {
    path: String,
    sha256: String,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSelection {
    current: Option<String>,
    previous: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_bundled: Option<String>,
}

fn context(action: &str, path: &Path, error: impl std::fmt::Display) -> String {
    format!("{action} {}: {error}", path.display())
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub(crate) fn storage_lock(root: &Path) -> Result<File> {
    if !root.is_absolute() {
        return Err("The managed data directory must be absolute.".into());
    }
    fs::create_dir_all(root).map_err(|e| context("Create", root, e))?;
    let path = root.join("storage.lock");
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| context("Open", &path, e))?;
    file.lock().map_err(|e| context("Lock", &path, e))?;
    Ok(file)
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let bytes = fs::read(path).map_err(|e| context("Read", path, e))?;
    serde_json::from_slice(&bytes).map_err(|e| context("Parse", path, e))
}

fn json_or_default<T: Default + serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    if path.exists() {
        read_json(path)
    } else {
        Ok(T::default())
    }
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    atomic_write(path, &bytes)
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("File has no parent directory.")?;
    fs::create_dir_all(parent).map_err(|e| context("Create", parent, e))?;
    let temporary = path.with_file_name(format!(
        ".{}.pending",
        path.file_name().unwrap().to_string_lossy()
    ));
    let mut file = File::create(&temporary).map_err(|e| context("Create", &temporary, e))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| context("Write", &temporary, e))?;
    drop(file);
    replace_file(&temporary, path)
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(existing: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to_utf16: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    // 同盘替换只提交一个文件，崩溃时旧文件或新文件至少保留一个。
    if unsafe { MoveFileExW(from.as_ptr(), to_utf16.as_ptr(), 0x1 | 0x8) } == 0 {
        return Err(context("Replace", to, std::io::Error::last_os_error()));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> Result<()> {
    fs::rename(from, to).map_err(|e| context("Replace", to, e))
}

fn digest(path: &Path) -> Result<String> {
    let mut file = File::open(path).map_err(|e| context("Read", path, e))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|e| context("Read", path, e))?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn relative_path(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if value.is_empty()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!(
            "Package path must be relative and stay inside the package: {value}"
        ));
    }
    Ok(path.to_owned())
}

fn verified_child(parent: &Path, child: &Path) -> Result<PathBuf> {
    let parent = fs::canonicalize(parent).map_err(|e| context("Resolve", parent, e))?;
    let child = fs::canonicalize(child).map_err(|e| context("Resolve", child, e))?;
    if child == parent || !child.starts_with(&parent) {
        return Err(format!(
            "Path is outside its managed directory: {}",
            child.display()
        ));
    }
    Ok(child)
}

fn copy_verified(source: &Path, target: &Path, expected: &str) -> Result<()> {
    if target.is_file() && digest(target)? == expected {
        return Ok(());
    }
    let parent = target.parent().ok_or("Missing destination directory.")?;
    fs::create_dir_all(parent).map_err(|e| context("Create", parent, e))?;
    let temporary = target.with_file_name(format!(
        ".{}.pending",
        target.file_name().unwrap().to_string_lossy()
    ));
    fs::copy(source, &temporary).map_err(|e| context("Copy", source, e))?;
    OpenOptions::new()
        .write(true)
        .open(&temporary)
        .and_then(|f| f.sync_all())
        .map_err(|e| context("Sync", &temporary, e))?;
    if digest(&temporary)? != expected {
        return Err(format!(
            "File changed or checksum did not match: {}. Retry the operation.",
            source.display()
        ));
    }
    replace_file(&temporary, target)
}

fn runtime_manifest(root: &Path, id: &str) -> Result<(PathBuf, RuntimeManifest)> {
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid runtime identifier.".into());
    }
    let directory = root.join("runtimes").join(id);
    let manifest: RuntimeManifest = read_json(&directory.join("runtime-manifest.json"))?;
    Ok((directory, manifest))
}

fn runtime_id(manifest: &RuntimeManifest) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(manifest).map_err(|e| e.to_string())?)
    ))
}

fn runtime_is_intact(root: &Path, id: &str) -> bool {
    let Ok((directory, manifest)) = runtime_manifest(root, id) else {
        return false;
    };
    let expected: Value =
        serde_json::from_str(include_str!("../../upstream.lock.json")).unwrap_or_default();
    Some(manifest.protocol_version as u64) == expected["protocolVersion"].as_u64()
        && !directory.join(".installing.json").exists()
        && runtime_id(&manifest).is_ok_and(|actual| actual == id)
        && manifest
            .files
            .iter()
            .any(|file| file.path == manifest.executable)
        && manifest.files.iter().all(|file| {
            relative_path(&file.path)
                .and_then(|path| digest(&directory.join(path)))
                .is_ok_and(|hash| hash.eq_ignore_ascii_case(&file.sha256))
        })
}

pub fn current_runtime(root: &Path) -> Result<Option<PathBuf>> {
    let selection: RuntimeSelection = json_or_default(&root.join("runtime.json"))?;
    let Some(id) = selection.current else {
        return Ok(None);
    };
    let (directory, manifest) = runtime_manifest(root, &id)?;
    let path = directory.join(relative_path(&manifest.executable)?);
    if !path.is_file() {
        return Err("The managed runtime is incomplete. Import its package again.".into());
    }
    Ok(Some(path))
}

pub fn runtime_info(root: &Path) -> Result<Value> {
    let selection: RuntimeSelection = json_or_default(&root.join("runtime.json"))?;
    let Some(id) = selection.current else {
        return Ok(Value::Null);
    };
    let (directory, manifest) = runtime_manifest(root, &id)?;
    Ok(json!({
        "id": id, "path": directory.join(relative_path(&manifest.executable)?),
        "version": manifest.version, "revision": manifest.revision,
        "protocolVersion": manifest.protocol_version, "canRollback": selection.previous.is_some()
    }))
}

pub fn install_runtime(root: &Path, source: &Path) -> Result<Value> {
    let _lock = storage_lock(root)?;
    install_runtime_locked(root, source, false)
}

fn install_runtime_locked(root: &Path, source: &Path, bundled: bool) -> Result<Value> {
    let manifest_path = if source.is_dir() {
        source.join("runtime-manifest.json")
    } else {
        source.to_owned()
    };
    let manifest: RuntimeManifest = read_json(&manifest_path)?;
    let package = manifest_path
        .parent()
        .ok_or("Runtime manifest has no directory.")?;
    let expected: Value = serde_json::from_str(include_str!("../../upstream.lock.json"))
        .map_err(|e| e.to_string())?;
    if Some(manifest.protocol_version as u64) != expected["protocolVersion"].as_u64() {
        return Err("This runtime package uses an incompatible RPC protocol.".into());
    }
    let mut names = BTreeSet::new();
    for file in &manifest.files {
        relative_path(&file.path)?;
        if !names.insert(file.path.to_lowercase()) {
            return Err(format!("Duplicate package file: {}", file.path));
        }
        if file.sha256.len() != 64 || !file.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(format!("Invalid SHA-256 for package file: {}", file.path));
        }
        let path = verified_child(package, &package.join(&file.path))?;
        if digest(&path)? != file.sha256.to_lowercase() {
            return Err(format!("Runtime checksum mismatch: {}", file.path));
        }
    }
    let executable = manifest
        .files
        .iter()
        .find(|file| file.path == manifest.executable)
        .ok_or("The runtime executable must be present in the package file list.")?;
    // 标识来自全部产物内容，路径或构建机器不会影响运行时身份。
    let id = runtime_id(&manifest)?;
    let directory = root.join("runtimes").join(&id);
    fs::create_dir_all(&directory).map_err(|e| context("Create", &directory, e))?;
    write_json(
        &directory.join(".installing.json"),
        &json!({"startedAt":timestamp(),"id":id}),
    )?;
    for file in &manifest.files {
        copy_verified(
            &package.join(&file.path),
            &directory.join(&file.path),
            &file.sha256.to_lowercase(),
        )?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let target = directory.join(&executable.path);
        fs::set_permissions(&target, fs::Permissions::from_mode(0o755))
            .map_err(|e| context("Set executable permission", &target, e))?;
    }
    #[cfg(not(unix))]
    let _ = executable;
    write_json(&directory.join("runtime-manifest.json"), &manifest)?;
    let mut selection: RuntimeSelection = json_or_default(&root.join("runtime.json"))?;
    if selection.current.as_deref() != Some(&id) {
        if let Some(current) = selection
            .current
            .as_ref()
            .filter(|id| runtime_is_intact(root, id))
        {
            selection.previous = Some(current.clone());
        }
        selection.current = Some(id.clone());
    }
    if selection.previous == selection.current {
        selection.previous = None;
    }
    if bundled {
        selection.last_bundled = Some(id);
    }
    write_json(&root.join("runtime.json"), &selection)?;
    let marker = directory.join(".installing.json");
    if marker.exists() {
        fs::remove_file(&marker)
            .map_err(|e| context("Remove completed installation marker", &marker, e))?;
    }
    runtime_info(root)
}

pub fn install_bundled_runtime(root: &Path, package: &Path) -> Result<Value> {
    let _lock = storage_lock(root)?;
    let manifest: RuntimeManifest = read_json(&package.join("runtime-manifest.json"))?;
    let id = runtime_id(&manifest)?;
    let mut selection: RuntimeSelection = json_or_default(&root.join("runtime.json"))?;
    let new_bundle = selection
        .last_bundled
        .as_ref()
        .is_some_and(|previous| previous != &id);
    if !new_bundle
        && selection
            .current
            .as_ref()
            .is_some_and(|current| runtime_is_intact(root, current))
    {
        if selection.last_bundled.is_none() {
            // 旧选择器无法辨认手动选择；迁移先保留有效当前项，之后按随包身份识别升级。
            selection.last_bundled = Some(id);
            write_json(&root.join("runtime.json"), &selection)?;
        }
        return runtime_info(root);
    }
    install_runtime_locked(root, package, true)
}

pub fn rollback_runtime(root: &Path) -> Result<Value> {
    let _lock = storage_lock(root)?;
    let mut selection: RuntimeSelection = json_or_default(&root.join("runtime.json"))?;
    let previous = selection
        .previous
        .as_ref()
        .ok_or("There is no previous runtime to restore.")?;
    if !runtime_is_intact(root, previous) {
        return Err("The previous runtime is incomplete. Import its package again.".into());
    }
    std::mem::swap(&mut selection.current, &mut selection.previous);
    write_json(&root.join("runtime.json"), &selection)?;
    runtime_info(root)
}

fn list_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut pending = vec![root.to_owned()];
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory).map_err(|e| context("List", &directory, e))? {
            let entry = entry.map_err(|e| e.to_string())?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|e| context("Inspect", &entry.path(), e))?;
            let name = entry.file_name().to_string_lossy().to_string();
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Import found a linked path: {}. Select its resolved OMP data directory instead.",
                    entry.path().display()
                ));
            }
            if metadata.is_dir() {
                if matches!(
                    name.as_str(),
                    ".git" | "cache" | "webcache" | "puppeteer" | "natives"
                ) {
                    continue;
                }
                pending.push(entry.path());
            } else if metadata.is_file()
                && !name.ends_with("-wal")
                && !name.ends_with("-shm")
                && !name.ends_with(".lock")
                && !name.ends_with(".sock")
                && !name.ends_with(".pid")
            {
                files.push(
                    entry
                        .path()
                        .strip_prefix(root)
                        .map_err(|e| e.to_string())?
                        .to_owned(),
                );
            }
        }
    }
    files.sort();
    Ok(files)
}

fn looks_like_root(path: &Path) -> bool {
    path.join("agent").is_dir() || path.join("profiles").is_dir()
}

pub fn discover_omp(root: &Path) -> Result<Value> {
    let mut paths = Vec::new();
    if let Some(path) = env::var_os("OMP_USER_ROOT") {
        paths.push(PathBuf::from(path));
    }
    if let Some(home) = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME")) {
        let home = PathBuf::from(home);
        paths.push(home.join(env::var_os("PI_CONFIG_DIR").unwrap_or_else(|| ".omp".into())));
    }
    if let Some(path) = env::var_os("PI_CODING_AGENT_DIR") {
        paths.push(PathBuf::from(path));
    }
    if let Some(search) = env::var_os("PATH") {
        for directory in env::split_paths(&search) {
            if directory.join("omp.exe").is_file()
                || directory.join("omp.cmd").is_file()
                || directory.join("omp").is_file()
            {
                paths.push(directory.join(".omp"));
                if let Some(parent) = directory.parent() {
                    paths.push(parent.join(".omp"));
                    paths.push(parent.join("omp"));
                }
            }
        }
    }
    #[cfg(windows)]
    paths.push(PathBuf::from("F:\\.omp"));
    let managed = fs::canonicalize(root.join("omp")).ok();
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for path in paths {
        let Ok(path) = fs::canonicalize(&path) else {
            continue;
        };
        if Some(&path) == managed.as_ref() || !seen.insert(path.clone()) || !path.is_dir() {
            continue;
        }
        let profiles: Vec<String> = fs::read_dir(path.join("profiles"))
            .into_iter()
            .flatten()
            .filter_map(|x| x.ok())
            .filter(|x| x.path().join("agent").is_dir())
            .map(|x| x.file_name().to_string_lossy().into_owned())
            .collect();
        let files = list_files(&path);
        let (count, warning) = match files {
            Ok(files) => (
                files
                    .iter()
                    .filter(|p| {
                        p.extension().is_some_and(|e| e == "jsonl")
                            && p.components().any(|c| c.as_os_str() == "sessions")
                    })
                    .count(),
                None,
            ),
            Err(error) => (0, Some(error)),
        };
        result.push(json!({"path":path,"profiles":profiles,"sessionCount":count,"kind":if looks_like_root(&path){"root"}else{"agent"},"warning":warning}));
    }
    Ok(Value::Array(result))
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportJournal {
    source: PathBuf,
    target: PathBuf,
    completed: bool,
    files: BTreeMap<String, ImportedFile>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedFile {
    source_hash: String,
    target_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    prior_target_hash: Option<String>,
}

fn sqlite_file(path: &Path) -> Result<bool> {
    let mut header = [0u8; 16];
    let mut file = File::open(path).map_err(|e| context("Read", path, e))?;
    Ok(file
        .read(&mut header)
        .map_err(|e| context("Read", path, e))?
        == 16
        && &header == b"SQLite format 3\0")
}

fn sqlite_snapshot(source: &Path, target: &Path) -> Result<()> {
    let connection = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| context("Open SQLite snapshot source", source, e))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    let mut output =
        Connection::open(target).map_err(|e| context("Open SQLite snapshot", target, e))?;
    {
        let backup = Backup::new(&connection, &mut output).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(128, Duration::from_millis(20), None)
            .map_err(|e| context("Copy SQLite snapshot", source, e))?;
    }
    let check: String = output
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if check != "ok" {
        return Err(format!(
            "SQLite snapshot check failed: {}",
            source.display()
        ));
    }
    output.close().map_err(|(_, e)| e.to_string())?;
    Ok(())
}

fn source_fingerprint(path: &Path, database: bool) -> Result<String> {
    let mut value = digest(path)?;
    if database {
        let wal = PathBuf::from(format!("{}-wal", path.display()));
        if wal.is_file() {
            value.push_str(&digest(&wal)?);
        }
    }
    Ok(value)
}

pub fn import_omp(root: &Path, source: &Path) -> Result<Value> {
    let _lock = storage_lock(root)?;
    let source =
        fs::canonicalize(source).map_err(|e| context("Resolve import source", source, e))?;
    if !source.is_dir() {
        return Err("Choose an OMP data directory.".into());
    }
    let target = root.join("omp");
    fs::create_dir_all(&target).map_err(|e| context("Create", &target, e))?;
    let target = fs::canonicalize(target).map_err(|e| e.to_string())?;
    if source.starts_with(&target) || target.starts_with(&source) {
        return Err("Import source and managed OMP data must be separate directories.".into());
    }
    let agent_only = !looks_like_root(&source);
    let target = if agent_only {
        target.join("agent")
    } else {
        target
    };
    let source_id = format!("{:x}", Sha256::digest(source.to_string_lossy().as_bytes()));
    let journal_path = root.join("imports").join(format!("{source_id}.json"));
    let mut journal: ImportJournal = json_or_default(&journal_path)?;
    if journal.source.as_os_str().is_empty() {
        journal.source = source.clone();
        journal.target = target.clone();
    }
    journal.completed = false;
    write_json(&journal_path, &journal)?;
    let mut copied = 0usize;
    let mut skipped = 0usize;
    let mut conflicts = Vec::new();
    // 每轮核对文件集合和摘要；源端持续写入时保留进度，等待下次重试。
    for pass in 0..3 {
        let files = list_files(&source)?;
        let mut changed = false;
        for relative in &files {
            let from = source.join(relative);
            let to = target.join(relative);
            let key = relative.to_string_lossy().replace('\\', "/");
            let is_db = sqlite_file(&from)?;
            let source_hash = source_fingerprint(&from, is_db)?;
            let previous = journal.files.get(&key);
            let target_hash = if to.is_file() {
                Some(digest(&to)?)
            } else {
                None
            };
            if previous.is_some_and(|p| {
                p.source_hash == source_hash && Some(&p.target_hash) == target_hash.as_ref()
            }) {
                if pass == 0 {
                    skipped += 1;
                }
                continue;
            }
            if target_hash.is_some()
                && previous.is_none()
                && !is_db
                && target_hash.as_ref() == Some(&source_hash)
            {
                journal.files.insert(
                    key,
                    ImportedFile {
                        source_hash: source_hash.clone(),
                        target_hash: source_hash,
                        prior_target_hash: None,
                    },
                );
                skipped += 1;
                continue;
            }
            if target_hash.is_some()
                && (previous.is_none()
                    || previous.is_some_and(|p| {
                        Some(&p.target_hash) != target_hash.as_ref()
                            && p.prior_target_hash.as_ref() != target_hash.as_ref()
                    }))
            {
                if !conflicts.contains(&key) {
                    conflicts.push(key);
                }
                continue;
            }
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| context("Create", parent, e))?;
            }
            let temporary = to.with_file_name(format!(
                ".{}.import.pending",
                to.file_name().unwrap().to_string_lossy()
            ));
            if is_db {
                sqlite_snapshot(&from, &temporary)?;
                if source_fingerprint(&from, true)? != source_hash {
                    changed = true;
                    continue;
                }
            } else {
                copy_verified(&from, &temporary, &source_hash)?;
            }
            // 先记录待提交摘要，再替换单文件；中断后可识别提交前和提交后的状态。
            journal.files.insert(
                key.clone(),
                ImportedFile {
                    source_hash,
                    target_hash: digest(&temporary)?,
                    prior_target_hash: target_hash,
                },
            );
            write_json(&journal_path, &journal)?;
            replace_file(&temporary, &to)?;
            journal.files.get_mut(&key).unwrap().prior_target_hash = None;
            write_json(&journal_path, &journal)?;
            copied += 1;
        }
        if list_files(&source)? != files {
            changed = true;
        }
        for relative in &files {
            let key = relative.to_string_lossy().replace('\\', "/");
            if conflicts.contains(&key) {
                continue;
            }
            let from = source.join(relative);
            let hash = source_fingerprint(&from, sqlite_file(&from)?)?;
            if journal
                .files
                .get(&key)
                .is_none_or(|p| p.source_hash != hash)
            {
                changed = true;
            }
        }
        if !changed {
            journal.completed = conflicts.is_empty();
            write_json(&journal_path, &journal)?;
            return Ok(
                json!({"source":source,"target":target,"copied":copied,"skipped":skipped,"conflicts":conflicts,"completed":journal.completed,"retryable":!journal.completed}),
            );
        }
    }
    Ok(
        json!({"source":source,"target":target,"copied":copied,"skipped":skipped,"conflicts":conflicts,"completed":false,"retryable":true,"message":"OMP data is still changing. Pause the source sessions and retry; verified files are retained."}),
    )
}

pub fn clean_cache(root: &Path) -> Result<Value> {
    let _lock = storage_lock(root)?;
    let selection: RuntimeSelection = json_or_default(&root.join("runtime.json"))?;
    let mut removed = Vec::new();
    let cache = root.join("cache");
    if cache.is_dir() {
        for entry in fs::read_dir(&cache).map_err(|e| context("List", &cache, e))? {
            let entry = entry.map_err(|e| e.to_string())?;
            remove_managed_child(&cache, &entry.path())?;
            removed.push(entry.path());
        }
    }
    let runtimes = root.join("runtimes");
    if runtimes.is_dir() {
        for entry in fs::read_dir(&runtimes).map_err(|e| context("List", &runtimes, e))? {
            let entry = entry.map_err(|e| e.to_string())?;
            let id = entry.file_name().to_string_lossy().to_string();
            if selection.current.as_ref() == Some(&id) || selection.previous.as_ref() == Some(&id) {
                continue;
            }
            if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
                continue;
            }
            if !entry.path().join("runtime-manifest.json").is_file()
                && !entry.path().join(".installing.json").is_file()
            {
                continue;
            }
            remove_managed_child(&runtimes, &entry.path())?;
            removed.push(entry.path());
        }
    }
    Ok(json!({"removed":removed}))
}

fn remove_managed_child(parent: &Path, child: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(child).map_err(|e| context("Inspect", child, e))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Cache cleanup encountered a linked path: {}",
            child.display()
        ));
    }
    let resolved = verified_child(parent, child)?;
    if metadata.is_dir() {
        fs::remove_dir_all(&resolved)
    } else {
        fs::remove_file(&resolved)
    }
    .map_err(|e| context("Remove managed cache", &resolved, e))
}

#[cfg(windows)]
pub fn takeover_status(root: &Path) -> Result<Value> {
    use winreg::{
        RegKey,
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    };
    let read_path = |key: &RegKey, path: &str| -> Result<String> {
        match key
            .open_subkey(path)
            .and_then(|value| value.get_value::<String, _>("Path"))
        {
            Ok(value) => Ok(value),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(_) => Err("Cannot read the CLI command environment.".into()),
        }
    };
    let user = read_path(&RegKey::predef(HKEY_CURRENT_USER), "Environment")?;
    let machine = read_path(
        &RegKey::predef(HKEY_LOCAL_MACHINE),
        "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
    )?;
    let normalize = |value: &str| {
        value
            .trim()
            .trim_matches('"')
            .replace('/', "\\")
            .trim_start_matches("\\\\?\\")
            .trim_end_matches('\\')
            .to_lowercase()
    };
    let bin = normalize(&root.join("bin").to_string_lossy());
    let path = format!("{machine};{user}");
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn ExpandEnvironmentStringsW(source: *const u16, target: *mut u16, size: u32) -> u32;
    }
    let source: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let mut expanded = vec![0u16; 256];
    let path = loop {
        let size = unsafe {
            ExpandEnvironmentStringsW(
                source.as_ptr(),
                expanded.as_mut_ptr(),
                expanded.len() as u32,
            )
        };
        if size == 0 {
            return Err("Cannot expand the CLI command environment.".into());
        }
        if size as usize <= expanded.len() {
            break String::from_utf16_lossy(&expanded[..size as usize - 1]);
        }
        expanded.resize(size as usize, 0);
    };
    let enabled = path.split(';').any(|entry| normalize(entry) == bin);
    // 按注册表里的 PATH 解析，避免继承旧终端环境或当前目录的同名程序。
    let output = crate::platform::hidden(
        std::process::Command::new("where.exe")
            .arg("$PATH:omp")
            .env("PATH", path),
    )
    .output()
    .map_err(|_| "Cannot resolve the CLI command.")?;
    let first = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(normalize);
    let active = first.is_some_and(|value| value.starts_with(&format!("{bin}\\")));
    Ok(json!({"enabled":enabled || active,"active":active}))
}

#[cfg(not(windows))]
pub fn takeover_status(_root: &Path) -> Result<Value> {
    Ok(json!({"enabled":false,"active":false}))
}

#[cfg(windows)]
fn install_cli_launchers(root: &Path) -> Result<()> {
    let bin = root.join("bin");
    fs::create_dir_all(&bin).map_err(|e| context("Create", &bin, e))?;
    let root_literal = root.to_string_lossy().replace('\'', "''");
    let environment = crate::platform::runtime_environment(root)
        .into_iter()
        .map(|(name, value)| {
            format!(
                "$env:{name} = '{}'\n",
                value.to_string_lossy().replace('\'', "''")
            )
        })
        .collect::<String>();
    // Windows PowerShell 5.1 依赖 UTF-8 BOM 正确读取中文路径。
    let powershell = format!(
        "\u{feff}$ErrorActionPreference = 'Stop'\n$managedRoot = '{root_literal}'\n$selection = Get-Content -LiteralPath (Join-Path $managedRoot 'runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json\n$runtimeDirectory = Join-Path (Join-Path $managedRoot 'runtimes') $selection.current\n$manifest = Get-Content -LiteralPath (Join-Path $runtimeDirectory 'runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json\n{environment}[IO.Directory]::CreateDirectory($env:TEMP) | Out-Null\n& (Join-Path $runtimeDirectory $manifest.executable) @args\nexit $LASTEXITCODE\n"
    );
    let cmd = b"@echo off\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File \"%~dp0omp.ps1\" %*\r\nexit /b %errorlevel%\r\n";
    for (name, bytes) in [
        ("omp.ps1", powershell.as_bytes()),
        ("omp.cmd", cmd.as_slice()),
    ] {
        let path = bin.join(name);
        if !fs::read(&path).is_ok_and(|existing| existing == bytes) {
            atomic_write(&path, bytes)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn refresh_cli_launchers(root: &Path) -> Result<()> {
    let _lock = storage_lock(root)?;
    let state: Value = json_or_default(&root.join("takeover.json"))?;
    if state["enabled"] == true {
        install_cli_launchers(root)?;
    }
    Ok(())
}

#[cfg(windows)]
pub fn takeover(root: &Path, enabled: bool) -> Result<Value> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use winreg::{
        RegKey, RegValue,
        enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE},
    };
    let _lock = storage_lock(root)?;
    let state_path = root.join("takeover.json");
    let bin = root.join("bin");
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (environment, _) = current_user
        .create_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| e.to_string())?;
    let original_path: String = match environment.get_value("Path") {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("Read the user PATH before takeover: {error}")),
    };
    let bin_text = bin.to_string_lossy().to_string();
    let is_our_entry = |value: &str| {
        value
            .trim()
            .trim_end_matches(['\\', '/'])
            .eq_ignore_ascii_case(bin_text.trim_end_matches(['\\', '/']))
    };
    let mut entries: Vec<String> = original_path
        .split(';')
        .filter(|x| !x.trim().is_empty() && !is_our_entry(x))
        .map(str::to_owned)
        .collect();
    if enabled {
        if current_runtime(root)?.is_none() {
            return Err("Install a runtime before taking over the omp command.".into());
        }
        fs::create_dir_all(&bin).map_err(|e| context("Create", &bin, e))?;
        let existing: Value = if state_path.exists() {
            read_json(&state_path)?
        } else {
            Value::Null
        };
        if existing.is_null() {
            let command = Command::new("where.exe")
                .arg("omp")
                .creation_flags(0x08000000)
                .output()
                .ok();
            let old_commands = command
                .map(|o| {
                    String::from_utf8_lossy(&o.stdout)
                        .lines()
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            write_json(
                &state_path,
                &json!({"enabled":false,"previousCommands":old_commands,"managedBin":bin,"createdAt":timestamp()}),
            )?;
        }
        install_cli_launchers(root)?;
        entries.insert(0, bin_text.clone());
    } else if !state_path.is_file() {
        return Ok(json!({"enabled":false,"active":false,"restartTerminal":false}));
    }
    let replacement = entries.join(";");
    let raw = environment.get_raw_value("Path").ok();
    let value_type = raw
        .as_ref()
        .map(|v| v.vtype.clone())
        .unwrap_or(winreg::enums::REG_EXPAND_SZ);
    let bytes = replacement
        .encode_utf16()
        .chain(Some(0))
        .flat_map(|w| w.to_le_bytes())
        .collect();
    environment
        .set_raw_value(
            "Path",
            &RegValue {
                bytes,
                vtype: value_type,
            },
        )
        .map_err(|e| e.to_string())?;
    let mut state: Value = if state_path.exists() {
        read_json(&state_path)?
    } else {
        json!({})
    };
    state["enabled"] = Value::Bool(enabled);
    state["managedBin"] = json!(bin);
    write_json(&state_path, &state)?;
    if !enabled {
        for name in ["omp.cmd", "omp.ps1"] {
            let launcher = bin.join(name);
            if launcher.exists() {
                let launcher = verified_child(&bin, &launcher)?;
                fs::remove_file(&launcher)
                    .map_err(|error| context("Remove managed CLI launcher", &launcher, error))?;
            }
        }
    }
    // 新进程继承即时更新；现有终端保留其原始环境直到重开。
    let machine = RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE)
        .open_subkey("SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment")
        .and_then(|key| key.get_value::<String, _>("Path"))
        .unwrap_or_default();
    let verification_path = format!("{machine};{replacement}");
    let resolved = Command::new("where.exe")
        .arg("omp")
        .env("PATH", &verification_path)
        .creation_flags(0x08000000)
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let active = enabled
        && resolved
            .first()
            .is_some_and(|p| Path::new(p).starts_with(&bin));
    state["resolvedCommands"] = json!(resolved);
    state["active"] = json!(active);
    state["restartTerminal"] = json!(true);
    if enabled && !active {
        state["warning"] = json!(
            "Another omp entry precedes the managed command in the system PATH. The desktop remains available. Remove that entry or use the managed launcher explicitly."
        );
    }
    broadcast_environment();
    Ok(state)
}

#[cfg(windows)]
fn broadcast_environment() {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn SendMessageTimeoutW(
            window: isize,
            message: u32,
            wparam: usize,
            lparam: isize,
            flags: u32,
            timeout: u32,
            result: *mut usize,
        ) -> isize;
    }
    let name: Vec<u16> = "Environment".encode_utf16().chain(Some(0)).collect();
    let mut result = 0;
    unsafe {
        SendMessageTimeoutW(
            0xffff,
            0x1a,
            0,
            name.as_ptr() as isize,
            0x2,
            1000,
            &mut result,
        );
    }
}

#[cfg(not(windows))]
pub fn takeover(_root: &Path, _enabled: bool) -> Result<Value> {
    Err("CLI takeover is available on Windows in this release.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        let path = env::temp_dir().join(format!(
            "omp-desktop-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn install_is_verified_idempotent_and_keeps_previous_runtime() {
        let root = fixture("install");
        let package = fixture("package");
        let executable = package.join("omp.exe");
        fs::write(&executable, b"runtime one").unwrap();
        let mut manifest = RuntimeManifest {
            version: "18.12.6".into(),
            revision: "2d39e5f5d26c12d49b241f58905b5526106d2a1e".into(),
            protocol_version: 2,
            request_capture_version: None,
            executable: "omp.exe".into(),
            files: vec![RuntimeFile {
                path: "omp.exe".into(),
                sha256: digest(&executable).unwrap(),
            }],
        };
        write_json(&package.join("runtime-manifest.json"), &manifest).unwrap();
        let first = install_runtime(&root, &package).unwrap();
        assert_eq!(first, install_runtime(&root, &package).unwrap());
        assert_eq!(
            first["id"],
            install_bundled_runtime(&root, &package).unwrap()["id"]
        );
        fs::write(&executable, b"runtime two").unwrap();
        assert!(install_runtime(&root, &package).is_err());
        assert_eq!(first["path"], runtime_info(&root).unwrap()["path"]);
        manifest.files[0].sha256 = digest(&executable).unwrap();
        write_json(&package.join("runtime-manifest.json"), &manifest).unwrap();
        let second = install_runtime(&root, &package).unwrap();
        assert_ne!(first["id"], second["id"]);
        assert_eq!(first["id"], rollback_runtime(&root).unwrap()["id"]);
        assert!(relative_path("../escape").is_err());
        remove_managed_child(&env::temp_dir(), &root).unwrap();
        remove_managed_child(&env::temp_dir(), &package).unwrap();
    }

    #[test]
    #[cfg(windows)]
    fn launcher_refresh_recovers_partial_updates_without_enabling_takeover() {
        let root = fixture("launcher-'中文");
        refresh_cli_launchers(&root).unwrap();
        assert!(!root.join("bin").exists());
        write_json(&root.join("takeover.json"), &json!({"enabled":false})).unwrap();
        refresh_cli_launchers(&root).unwrap();
        assert!(!root.join("bin").exists());

        write_json(&root.join("takeover.json"), &json!({"enabled":true})).unwrap();
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::write(root.join("bin/omp.ps1"), "旧入口").unwrap();
        fs::write(root.join("bin/other.txt"), "用户文件").unwrap();
        refresh_cli_launchers(&root).unwrap();
        let script = root.join("bin/omp.ps1");
        let modified = fs::metadata(&script).unwrap().modified().unwrap();
        refresh_cli_launchers(&root).unwrap();
        assert_eq!(fs::metadata(&script).unwrap().modified().unwrap(), modified);
        fs::write(&script, "中断前的旧入口").unwrap();
        fs::write(root.join("bin/omp.cmd"), "中断后的入口").unwrap();
        fs::write(root.join("bin/.omp.ps1.pending"), "未提交的入口").unwrap();
        refresh_cli_launchers(&root).unwrap();
        assert!(!root.join("bin/.omp.ps1.pending").exists());
        assert!(
            fs::read_to_string(root.join("bin/omp.cmd"))
                .unwrap()
                .contains("powershell.exe")
        );

        let runtime = root.join("runtimes/fixture");
        fs::create_dir_all(&runtime).unwrap();
        write_json(&root.join("runtime.json"), &json!({"current":"fixture"})).unwrap();
        write_json(
            &runtime.join("runtime-manifest.json"),
            &json!({"executable":"probe.ps1"}),
        )
        .unwrap();
        fs::write(runtime.join("probe.ps1"), "[IO.File]::WriteAllText($env:OMP_TEST_OUTPUT, (@{natives=$env:PI_NATIVES_DIR; userRoot=$env:OMP_USER_ROOT; temporary=$env:TEMP; arguments=@($args)} | ConvertTo-Json -Compress), [Text.Encoding]::UTF8)\n").unwrap();
        let output = root.join("observed.json");
        let result = crate::platform::hidden(
            std::process::Command::new("powershell.exe")
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                ])
                .arg(&script)
                .arg("参数 with spaces")
                .env("OMP_TEST_OUTPUT", &output)
                .env("PI_NATIVES_DIR", root.join("unmanaged"))
                .env("OMP_USER_ROOT", root.join("unmanaged"))
                .env("TEMP", root.join("unmanaged")),
        )
        .output()
        .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let text = fs::read_to_string(output).unwrap();
        let observed: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap();
        assert_eq!(observed["natives"], json!(root.join("cache/natives")));
        assert_eq!(observed["userRoot"], json!(root.join("omp")));
        assert_eq!(observed["temporary"], json!(root.join("cache/tmp")));
        assert_eq!(observed["arguments"], json!(["参数 with spaces"]));
        assert_eq!(
            fs::read_to_string(root.join("bin/other.txt")).unwrap(),
            "用户文件"
        );
        assert_eq!(
            read_json::<Value>(&root.join("takeover.json")).unwrap(),
            json!({"enabled":true})
        );
        remove_managed_child(&env::temp_dir(), &root).unwrap();
    }

    #[test]
    fn import_copies_sqlite_wal_and_preserves_local_changes_on_retry() {
        let root = fixture("import");
        let source = fixture("source");
        fs::create_dir_all(source.join("agent/sessions")).unwrap();
        fs::write(
            source.join("agent/sessions/one.jsonl"),
            "{\"id\":\"one\"}\n",
        )
        .unwrap();
        let database = Connection::open(source.join("agent/agent.db")).unwrap();
        database.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE records(value TEXT); INSERT INTO records VALUES('preserved');").unwrap();
        assert_eq!(import_omp(&root, &source).unwrap()["completed"], true);
        let copied = Connection::open(root.join("omp/agent/agent.db")).unwrap();
        let value: String = copied
            .query_row("SELECT value FROM records", [], |r| r.get(0))
            .unwrap();
        assert_eq!(value, "preserved");
        drop(copied);
        assert_eq!(import_omp(&root, &source).unwrap()["copied"], 0);
        fs::write(root.join("omp/agent/sessions/one.jsonl"), "local update").unwrap();
        let result = import_omp(&root, &source).unwrap();
        assert_eq!(result["completed"], false);
        assert_eq!(
            fs::read_to_string(root.join("omp/agent/sessions/one.jsonl")).unwrap(),
            "local update"
        );
        assert!(source.join("agent/agent.db").exists());
        drop(database);
        remove_managed_child(&env::temp_dir(), &root).unwrap();
        remove_managed_child(&env::temp_dir(), &source).unwrap();
    }
}
