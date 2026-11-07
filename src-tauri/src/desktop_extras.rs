use crate::{config, desktop_tools, platform, text};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::{Manager, WebviewUrl};

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
    let id = text(request, "id")?;
    let label = if id.starts_with("card-") {
        id.to_string()
    } else {
        card_label(id)
    };
    let key = format!("card:{label}");
    match operation {
        "card.sync" => desktop_tools::execute(
            root,
            &json!({"type":"desktop.state.set","key":key,"value":request["value"]}),
        ),
        "card.get" => desktop_tools::execute(root, &json!({"type":"desktop.state.get","key":key})),
        "card.open" => {
            if let Some(window) = app.get_webview_window(&label) {
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
            } else {
                let handle = app.clone();
                let directory = root.join("webview");
                let (send, receive) = std::sync::mpsc::channel();
                app.run_on_main_thread(move || {
                    let result = tauri::WebviewWindowBuilder::new(
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
                    .map(|_| ())
                    .map_err(|e| e.to_string());
                    let _ = send.send(result);
                })
                .map_err(|e| e.to_string())?;
                receive.recv().map_err(|e| e.to_string())??;
            }
            Ok(Value::Null)
        }
        "card.focus" => {
            if let Some(window) = app.get_webview_window("main") {
                window.unminimize().map_err(|e| e.to_string())?;
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
            }
            use tauri::Emitter;
            app.emit_to("main", "desktop-card-focus", request["sessionId"].clone())
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        _ => Err("未知任务卡操作。".into()),
    }
}
