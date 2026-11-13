use crate::{config, desktop_tools, platform, text};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Mutex, OnceLock},
};
use tauri::{Emitter, Manager, WebviewUrl};

fn card_snapshots() -> &'static Mutex<HashMap<String, Value>> {
    static SNAPSHOTS: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new();
    SNAPSHOTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn card_label(id: &str) -> String {
    format!("card-{:x}", Sha256::digest(id.as_bytes()))[..29].to_string()
}

pub fn open_url(value: &str) -> Result<Value, String> {
    let url = tauri::Url::parse(value).map_err(|_| "请输入完整网址。")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("请输入 HTTP 或 HTTPS 网址。".into());
    }
    #[cfg(windows)]
    platform::hidden(
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url.as_str()),
    )
    .spawn()
    .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    std::process::Command::new(if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    })
    .arg(url.as_str())
    .spawn()
    .map_err(|e| e.to_string())?;
    Ok(json!({"url":url.as_str()}))
}

pub fn path_info(value: &str) -> Result<Value, String> {
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err("请选择完整文件路径。 / Choose an absolute path.".into());
    }
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    Ok(json!({"isFile":metadata.is_file(),"isDirectory":metadata.is_dir()}))
}

pub fn reveal_path(value: &str) -> Result<Value, String> {
    let info = path_info(value)?;
    let path = Path::new(value);
    #[cfg(windows)]
    {
        let mut command = std::process::Command::new("explorer.exe");
        if info["isFile"] == true {
            command.arg(format!("/select,{}", path.display()));
        }
        if info["isFile"] != true {
            command.arg(path);
        }
        platform::hidden(&mut command)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("open");
        if info["isFile"] == true {
            command.arg("-R");
        }
        command
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(if info["isFile"] == true {
            path.parent().unwrap_or(path)
        } else {
            path
        })
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(info)
}

pub fn artifact_response(
    root: &Path,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    let result = desktop_tools::execute(root, &json!({"type":"artifact.read","id":id}));
    match result {
        Ok(value) if value["kind"] == "html" => tauri::http::Response::builder().header("Content-Type", "text/html; charset=utf-8").header("Cache-Control", "no-store").header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; connect-src 'none'").body(value["content"].as_str().unwrap_or("").as_bytes().to_vec()).unwrap(),
        _ => tauri::http::Response::builder().status(404).header("Content-Type", "text/plain; charset=utf-8").body("无法读取已登记的 HTML 产物，请重新选择文件。".as_bytes().to_vec()).unwrap(),
    }
}

pub fn execute(app: tauri::AppHandle, root: &Path, request: &Value) -> Result<Value, String> {
    let operation = text(request, "type")?;
    let preferences = config(root)?;
    let feature = if operation.starts_with("browser.") {
        "browser"
    } else {
        "cards"
    };
    if preferences["preferences"]["features"][feature] != true {
        return Err("请先在设置中开启此功能。".into());
    }
    if operation == "browser.open" {
        return open_url(text(request, "url")?);
    }
    if operation == "card.list" {
        let snapshots = card_snapshots().lock().unwrap().clone();
        return Ok(json!(
            snapshots
                .iter()
                .filter(|(label, _)| app.get_webview_window(label).is_some())
                .filter_map(|(_, value)| value["sessionId"].as_str())
                .collect::<Vec<_>>()
        ));
    }
    let id = text(request, "id")?;
    let label = if id.starts_with("card-") {
        id.to_string()
    } else {
        card_label(id)
    };
    match operation {
        "card.sync" => {
            let Some(window) = app.get_webview_window(&label) else {
                card_snapshots().lock().unwrap().remove(&label);
                return Ok(json!({"open":false}));
            };
            let value = request["value"].clone();
            let mut snapshots = card_snapshots().lock().unwrap();
            let changed = snapshots.get(&label) != Some(&value);
            snapshots.insert(label.clone(), value.clone());
            drop(snapshots);
            if changed
                && window.is_visible().map_err(|error| error.to_string())?
                && !window.is_minimized().map_err(|error| error.to_string())?
            {
                app.emit_to(&label, "desktop-card-change", value)
                    .map_err(|error| error.to_string())?;
            }
            Ok(json!({"open":true}))
        }
        "card.get" => Ok(card_snapshots()
            .lock()
            .unwrap()
            .get(&label)
            .cloned()
            .unwrap_or(Value::Null)),
        "card.open" => {
            let handle = app.clone();
            let directory = root.join("webview");
            let value = request["value"].clone();
            let session_id = id.to_owned();
            let (send, receive) = std::sync::mpsc::channel();
            app.run_on_main_thread(move || {
                // 窗口查找与建立都在主线程完成，连续点击也复用同一个 WebView。
                let result = (|| -> Result<(), String> {
                    if value.is_object() {
                        card_snapshots()
                            .lock()
                            .unwrap()
                            .insert(label.clone(), value.clone());
                    }
                    if let Some(window) = handle.get_webview_window(&label) {
                        window.show().map_err(|e| e.to_string())?;
                        window.set_focus().map_err(|e| e.to_string())?;
                        if value.is_object() {
                            handle
                                .emit_to(&label, "desktop-card-change", value)
                                .map_err(|error| error.to_string())?;
                        }
                    } else {
                        let window = tauri::WebviewWindowBuilder::new(
                            &handle,
                            &label,
                            WebviewUrl::App(format!("index.html?card={label}").into()),
                        )
                        .title("OMP 任务卡")
                        .inner_size(360., 260.)
                        .min_inner_size(300., 180.)
                        .always_on_top(true)
                        .data_directory(directory)
                        .build()
                        .map_err(|e| e.to_string())?;
                        let closed_label = label.clone();
                        let closed_session = session_id.clone();
                        let closed_handle = handle.clone();
                        window.on_window_event(move |event| {
                            if matches!(event, tauri::WindowEvent::Destroyed) {
                                card_snapshots().lock().unwrap().remove(&closed_label);
                                let _ = closed_handle.emit_to(
                                    "main",
                                    "desktop-card-closed",
                                    &closed_session,
                                );
                            }
                        });
                    }
                    handle
                        .emit_to("main", "desktop-card-opened", session_id)
                        .map_err(|error| error.to_string())?;
                    Ok(())
                })();
                if result.is_err() && handle.get_webview_window(&label).is_none() {
                    card_snapshots().lock().unwrap().remove(&label);
                }
                let _ = send.send(result);
            })
            .map_err(|e| e.to_string())?;
            receive.recv().map_err(|e| e.to_string())??;
            Ok(Value::Null)
        }
        "card.focus" => {
            if let Some(window) = app.get_webview_window("main") {
                window.unminimize().map_err(|e| e.to_string())?;
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
            }
            app.emit_to("main", "desktop-card-focus", request["sessionId"].clone())
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        _ => Err("未知任务卡操作。".into()),
    }
}
