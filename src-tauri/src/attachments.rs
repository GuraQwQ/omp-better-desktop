use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

fn context(action: &str, path: &Path, error: impl std::fmt::Display) -> String {
    format!("{action} {}：{error}", path.display())
}

fn text<'a>(request: &'a Value, key: &str) -> Result<&'a str, String> {
    request[key]
        .as_str()
        .ok_or_else(|| format!("附件请求缺少 {key}"))
}

fn attachment_root(root: &Path) -> PathBuf {
    root.join("omp/agent/attachments")
}

fn display_path(path: &Path) -> String {
    crate::platform::external_path(path)
        .to_string_lossy()
        .into_owned()
}

fn image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}

fn prepare(path: &Path) -> Result<Value, String> {
    let path = fs::canonicalize(path).map_err(|e| context("无法找到附件", path, e))?;
    let metadata = fs::metadata(&path).map_err(|e| context("无法读取附件信息", &path, e))?;
    let name = path
        .file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy();
    if metadata.is_dir() {
        return Ok(
            json!({"type":"file", "name":name, "path":display_path(&path), "kind":"folder"}),
        );
    }
    if !metadata.is_file() {
        return Err(format!("附件不是普通文件或文件夹：{}", path.display()));
    }
    let file = File::open(&path).map_err(|e| context("无法打开附件", &path, e))?;
    let mut header = Vec::with_capacity(12);
    file.take(12)
        .read_to_end(&mut header)
        .map_err(|e| context("无法读取附件", &path, e))?;
    if let Some(mime_type) = image_type(&header) {
        let data = fs::read(&path).map_err(|e| context("无法读取图片附件", &path, e))?;
        Ok(
            json!({"type":"image", "name":name, "path":display_path(&path), "mimeType":mime_type, "data":STANDARD.encode(data)}),
        )
    } else {
        Ok(json!({"type":"file", "name":name, "path":display_path(&path), "kind":"file"}))
    }
}

fn prepare_paths(paths: &[Value]) -> Result<Value, String> {
    paths
        .iter()
        .map(|path| {
            path.as_str()
                .ok_or_else(|| "附件路径必须是字符串".to_owned())
                .and_then(|path| prepare(Path::new(path)))
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Value::Array)
}

fn store(root: &Path, request: &Value) -> Result<Value, String> {
    let name = text(request, "name")?;
    if name.is_empty()
        || Path::new(name).components().count() != 1
        || !matches!(
            Path::new(name).components().next(),
            Some(Component::Normal(_))
        )
        || name.contains(['/', '\\'])
    {
        return Err("附件名称必须是不含目录的文件名".into());
    }
    let bytes = STANDARD
        .decode(text(request, "data")?)
        .map_err(|e| format!("附件 {name} 的内容不是有效 Base64：{e}"))?;
    let base = attachment_root(root);
    fs::create_dir_all(&base).map_err(|e| context("无法创建附件目录", &base, e))?;
    let directory = base.join(uuid::Uuid::new_v4().to_string());
    fs::create_dir(&directory).map_err(|e| context("无法创建附件目录", &directory, e))?;
    let target = directory.join(name);
    let pending = directory.join(if name == ".upload.pending" {
        ".upload-2.pending"
    } else {
        ".upload.pending"
    });
    let write = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)
            .map_err(|e| context("无法创建待保存附件", &pending, e))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| context("无法保存附件", &pending, e))?;
        drop(file);
        fs::rename(&pending, &target).map_err(|e| context("无法提交附件", &target, e))
    })();
    if let Err(error) = write {
        let _ = fs::remove_file(&pending);
        let _ = fs::remove_dir(&directory);
        return Err(error);
    }
    Ok(
        json!({"type":"file", "name":name, "path":display_path(&target), "kind":"file", "managed":true}),
    )
}

fn discard(root: &Path, request: &Value) -> Result<Value, String> {
    if request["managed"] != true {
        return Ok(Value::Null);
    }
    let path = Path::new(text(request, "path")?);
    let directory = attachment_root(root);
    let base = match fs::canonicalize(&directory) {
        Ok(base) => base,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(e) => return Err(context("无法定位附件目录", &directory, e)),
    };
    let target = match fs::canonicalize(path) {
        Ok(target) => target,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(e) => return Err(context("无法定位待移除附件", path, e)),
    };
    let relative = target
        .strip_prefix(&base)
        .map_err(|_| "只能移除应用保存的附件，原始文件保持不变".to_owned())?;
    let parts: Vec<_> = relative.components().collect();
    if parts.len() != 2
        || !matches!(parts[0], Component::Normal(id) if uuid::Uuid::parse_str(&id.to_string_lossy()).is_ok())
        || !matches!(parts[1], Component::Normal(_))
        || !target.is_file()
    {
        return Err("待移除路径不是应用保存的单个附件文件".into());
    }
    match fs::remove_file(&target) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(context("无法移除附件", &target, e)),
    }
    // 只移除空的单附件目录，不递归删除会话数据。
    let _ = fs::remove_dir(target.parent().unwrap());
    Ok(Value::Null)
}

#[cfg(windows)]
fn clipboard_paths() -> Result<Vec<Value>, String> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, ptr};
    use windows_sys::Win32::{
        System::{
            DataExchange::{
                CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
            },
            Ole::CF_HDROP,
        },
        UI::Shell::DragQueryFileW,
    };
    struct Clipboard;
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe { CloseClipboard() };
        }
    }
    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP.into()) == 0 {
            return Ok(Vec::new());
        }
        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err(format!(
                "剪贴板正被其他程序占用，请重试：{}",
                std::io::Error::last_os_error()
            ));
        }
        let _clipboard = Clipboard;
        let handle = GetClipboardData(CF_HDROP.into());
        if handle.is_null() {
            return Err(format!(
                "无法读取剪贴板文件：{}",
                std::io::Error::last_os_error()
            ));
        }
        let count = DragQueryFileW(handle, u32::MAX, ptr::null_mut(), 0);
        let mut paths = Vec::with_capacity(count as usize);
        for index in 0..count {
            let length = DragQueryFileW(handle, index, ptr::null_mut(), 0);
            let mut buffer = vec![0u16; length as usize + 1];
            if DragQueryFileW(handle, index, buffer.as_mut_ptr(), buffer.len() as u32) == 0 {
                return Err("无法读取剪贴板中的附件路径，请重新复制文件".into());
            }
            paths.push(json!(PathBuf::from(OsString::from_wide(
                &buffer[..length as usize]
            ))));
        }
        Ok(paths)
    }
}

#[cfg(not(windows))]
fn clipboard_paths() -> Result<Vec<Value>, String> {
    Ok(Vec::new())
}

pub fn execute(root: &Path, request: &Value) -> Result<Value, String> {
    match text(request, "type")? {
        "attachment.paths" => prepare_paths(
            request["paths"]
                .as_array()
                .ok_or("附件请求缺少 paths 数组")?,
        ),
        "attachment.clipboard" => prepare_paths(&clipboard_paths()?),
        "attachment.store" => store(root, request),
        "attachment.discard" => discard(root, request),
        operation => Err(format!("不支持的附件操作：{operation}")),
    }
}
