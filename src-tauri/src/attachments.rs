use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

fn btw_payload(request: &Value) -> Result<Value, String> {
    let mut files = Vec::new();
    let mut images = Vec::new();
    let mut warnings = Vec::new();
    let mut remaining = 256 * 1024usize;
    let mut image_bytes = 0usize;
    let mut seen = HashSet::new();
    let mut pending = request["attachments"]
        .as_array()
        .ok_or("附件请求缺少 attachments 数组")?
        .iter()
        .rev()
        .cloned()
        .collect::<Vec<_>>();
    while let Some(item) = pending.pop() {
        if files.len() + images.len() >= 64 || remaining == 0 {
            warnings.push(
                "附件较多，本次已读取前 64 个文件或 256 KiB 文本；可按需缩小附件范围。".to_owned(),
            );
            break;
        }
        if item["type"] == "image" {
            let bytes = STANDARD
                .decode(text(&item, "data")?)
                .map_err(|error| format!("图片附件内容无效：{error}"))?;
            let mime = image_type(&bytes).ok_or("请使用 PNG、JPEG、GIF 或 WebP 图片附件。")?;
            image_bytes += bytes.len();
            if image_bytes > 16 * 1024 * 1024 {
                return Err("旁问图片合计超过 16 MiB，请缩小图片后重试。".into());
            }
            images.push(json!({"type":"image","data":item["data"],"mimeType":mime}));
            continue;
        }
        let supplied = Path::new(text(&item, "path")?);
        let path = match fs::canonicalize(supplied) {
            Ok(path) => path,
            Err(error) => {
                warnings.push(context("无法读取附件", supplied, error));
                continue;
            }
        };
        if !seen.insert(path.clone()) {
            continue;
        }
        if path.is_dir() {
            let mut entries = match fs::read_dir(&path) {
                Ok(entries) => entries
                    .collect::<std::io::Result<Vec<_>>>()
                    .map_err(|error| context("无法读取附件目录", &path, error))?,
                Err(error) => {
                    warnings.push(context("无法读取附件目录", &path, error));
                    continue;
                }
            };
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries.into_iter().rev() {
                if entry.file_name() == ".git" {
                    continue;
                }
                pending.push(json!({"type":"file","path":entry.path()}));
            }
            continue;
        }
        let mut bytes = Vec::new();
        match File::open(&path)
            .and_then(|file| file.take(remaining as u64 + 1).read_to_end(&mut bytes))
        {
            Ok(_) => {}
            Err(error) => {
                warnings.push(context("无法读取附件", &path, error));
                continue;
            }
        }
        if let Some(mime) = image_type(&bytes) {
            let size = fs::metadata(&path)
                .map_err(|error| context("无法读取图片信息", &path, error))?
                .len();
            if size > (16 * 1024 * 1024 - image_bytes) as u64 {
                return Err("旁问图片合计超过 16 MiB，请缩小图片后重试。".into());
            }
            let bytes =
                fs::read(&path).map_err(|error| context("无法读取图片附件", &path, error))?;
            image_bytes += bytes.len();
            if image_bytes > 16 * 1024 * 1024 {
                return Err("旁问图片合计超过 16 MiB，请缩小图片后重试。".into());
            }
            images.push(json!({"type":"image","data":STANDARD.encode(bytes),"mimeType":mime}));
            continue;
        }
        let truncated = bytes.len() > remaining;
        bytes.truncate(remaining);
        let content = match std::str::from_utf8(&bytes) {
            Ok(text) if !text.contains('\0') => text.to_owned(),
            Err(error) if truncated && error.error_len().is_none() => {
                String::from_utf8(bytes[..error.valid_up_to()].to_vec()).unwrap()
            }
            _ => {
                warnings.push(format!(
                    "{} 为二进制或非 UTF-8 文件，请改用文本或图片附件。",
                    display_path(&path)
                ));
                continue;
            }
        };
        if content.contains('\0') {
            warnings.push(format!(
                "{} 为二进制文件，请改用文本或图片附件。",
                display_path(&path)
            ));
            continue;
        }
        remaining = remaining.saturating_sub(bytes.len());
        if truncated {
            warnings.push(format!("{} 的内容已截取前段。", display_path(&path)));
        }
        files.push(json!({"path":display_path(&path),"content":content,"truncated":truncated}));
    }
    if !request["attachments"].as_array().unwrap().is_empty()
        && files.is_empty()
        && images.is_empty()
    {
        return Err(if warnings.is_empty() {
            "所选附件中没有可读取的文本或图片。".into()
        } else {
            warnings.join("\n")
        });
    }
    let message = text(request, "message")?;
    let message = if files.is_empty() && warnings.is_empty() {
        message.to_owned()
    } else {
        format!(
            "{message}\n\n旁问附件材料：\n{}",
            json!({"files":files,"warnings":warnings})
        )
    };
    Ok(json!({"message":message,"images":images,"warnings":warnings}))
}

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
        "attachment.btw" => btw_payload(request),
        operation => Err(format!("不支持的附件操作：{operation}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn btw_reads_material_and_bounds_text_without_losing_utf8() {
        let root = std::env::temp_dir().join(format!("omp-btw-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("材料.txt");
        fs::write(&file, "真实附件：测试上下文").unwrap();
        let result =
            btw_payload(&json!({"message":"问题","attachments":[{"type":"file","path":file}]}))
                .unwrap();
        assert!(
            result["message"]
                .as_str()
                .unwrap()
                .contains("真实附件：测试上下文")
        );
        fs::write(&file, "中文".repeat(100_000)).unwrap();
        let result =
            btw_payload(&json!({"message":"问题","attachments":[{"type":"file","path":file}]}))
                .unwrap();
        assert!(!result["warnings"].as_array().unwrap().is_empty());
        assert!(result["message"].as_str().unwrap().len() < 270_000);
        fs::write(&file, [0, 1, 2]).unwrap();
        assert!(
            btw_payload(&json!({"message":"问题","attachments":[{"type":"file","path":file}]}))
                .is_err()
        );
        assert_eq!(
            btw_payload(&json!({"message":"问题","attachments":[]})).unwrap()["message"],
            "问题"
        );
        fs::remove_file(&file).unwrap();
        fs::remove_dir(&root).unwrap();
    }
}
