use omp_rpc::{Client, RpcInbound};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use tauri::webview::{Cookie, NewWindowFeatures, NewWindowResponse, Url};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct BrowserLogins {
    pending: Mutex<HashMap<(String, String), Arc<AtomicBool>>>,
}

impl BrowserLogins {
    pub fn start(
        self: &Arc<Self>,
        app: AppHandle,
        root: PathBuf,
        session: String,
        client: Arc<Client>,
        request: Value,
    ) {
        let id = request["id"].as_str().unwrap_or_default().to_owned();
        let cancelled = Arc::new(AtomicBool::new(false));
        self.pending
            .lock()
            .unwrap()
            .insert((session.clone(), id.clone()), cancelled.clone());
        let logins = self.clone();
        thread::spawn(move || {
            let result = capture(&app, &root, &request, &cancelled);
            let response = match result {
                Ok(Some(value)) => json!({"type":"extension_ui_response","id":id,"value":value}),
                Ok(None) => json!({"type":"extension_ui_response","id":id,"cancelled":true}),
                Err(error) => {
                    notify(&app, &session, &error, "error");
                    json!({"type":"extension_ui_response","id":id,"cancelled":true})
                }
            };
            if let Ok(response) = RpcInbound::from_value(response) {
                let _ = client.send(&response);
            }
            logins.pending.lock().unwrap().remove(&(session, id));
            drop(client);
            app.state::<crate::Desktop>().sessions.release_idle(&app);
        });
    }

    pub fn cancel(&self, session: &str, id: Option<&str>) {
        for ((owner, request), cancelled) in self.pending.lock().unwrap().iter() {
            if owner == session && id.is_none_or(|id| id == request) {
                cancelled.store(true, Ordering::Release);
            }
        }
    }
}

fn notify(app: &AppHandle, session: &str, message: &str, kind: &str) {
    let _ = app.emit(
        "desktop-event",
        json!({"sessionId":session,"event":{
            "type":"extension_ui_request","id":uuid::Uuid::new_v4().to_string(),
            "method":"notify","message":message,"notifyType":kind
        }}),
    );
}

fn matching_cookie(cookies: &[Cookie<'_>], names: &[String]) -> Option<String> {
    names.iter().find_map(|name| {
        cookies
            .iter()
            .find(|cookie| cookie.name() == name && !cookie.value().is_empty())
            .map(|cookie| cookie.value().to_owned())
    })
}

fn login_window(
    app: &AppHandle,
    profile: &Path,
    label: String,
    url: Url,
    windows: Arc<Mutex<Vec<String>>>,
    cancelled: Arc<AtomicBool>,
    features: Option<NewWindowFeatures>,
) -> Result<WebviewWindow, String> {
    let popup_app = app.clone();
    let popup_profile = profile.to_owned();
    let popup_windows = windows.clone();
    let popup_cancelled = cancelled.clone();
    let primary = features.is_none();
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title("OMP — Sign in / 登录")
        .inner_size(1000.0, 760.0)
        .data_directory(profile.to_owned())
        .incognito(true)
        .on_new_window(move |_, features| {
            if popup_cancelled.load(Ordering::Acquire) {
                return NewWindowResponse::Deny;
            }
            let label = format!("omp-login-{}", uuid::Uuid::new_v4());
            match login_window(
                &popup_app,
                &popup_profile,
                label,
                "about:blank".parse().unwrap(),
                popup_windows.clone(),
                popup_cancelled.clone(),
                Some(features),
            ) {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    eprintln!("Could not open OMP login popup: {error}");
                    NewWindowResponse::Deny
                }
            }
        });
    if let Some(features) = features {
        builder = builder.window_features(features);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    windows.lock().unwrap().push(label);
    if primary {
        window.on_window_event(move |event| {
            if matches!(
                event,
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
            ) {
                cancelled.store(true, Ordering::Release);
            }
        });
    }
    Ok(window)
}

fn capture(
    app: &AppHandle,
    root: &Path,
    request: &Value,
    cancelled: &Arc<AtomicBool>,
) -> Result<Option<String>, String> {
    let url: Url = request["url"]
        .as_str()
        .ok_or("Missing browser login URL.")?
        .parse()
        .map_err(|_| "Invalid browser login URL.")?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err("Browser login requires an HTTPS URL.".into());
    }
    let names: Vec<String> = request["cookieNames"]
        .as_array()
        .ok_or("Missing login cookie names.")?
        .iter()
        .map(|name| {
            name.as_str()
                .filter(|name| !name.is_empty())
                .map(str::to_owned)
                .ok_or("Invalid login cookie name.")
        })
        .collect::<Result<_, _>>()?;
    if names.is_empty() {
        return Err("Missing login cookie names.".into());
    }
    let directory = root.join("cache/browser-login");
    let profile = directory.join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    let windows = Arc::new(Mutex::new(Vec::new()));
    let result = (|| {
        if cancelled.load(Ordering::Acquire) {
            return Ok(None);
        }
        let window = login_window(
            app,
            &profile,
            format!("omp-login-{}", uuid::Uuid::new_v4()),
            url.clone(),
            windows.clone(),
            cancelled.clone(),
            None,
        )?;
        let deadline = Instant::now() + Duration::from_secs(600);
        loop {
            if cancelled.load(Ordering::Acquire) {
                return Ok(None);
            }
            if Instant::now() >= deadline {
                return Err("Browser login timed out. Retry sign-in.".into());
            }
            // WebView2 读取 HttpOnly cookie 必须离开窗口事件线程，避免死锁。
            let cookies = match window.cookies_for_url(url.clone()) {
                Ok(cookies) => cookies,
                Err(_) if cancelled.load(Ordering::Acquire) => return Ok(None),
                Err(error) => return Err(error.to_string()),
            };
            if let Some(value) = matching_cookie(&cookies, &names) {
                return Ok(Some(value));
            }
            thread::sleep(Duration::from_millis(500));
        }
    })();
    cancelled.store(true, Ordering::Release);
    let labels = windows.lock().unwrap().clone();
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.clear_all_browsing_data();
            let _ = window.close();
        }
    }
    // WebView2 关闭后可能短暂持有文件；只清理本次 UUID 目录，失败由现有缓存清理入口重试。
    if let (Ok(target), Ok(base)) = (fs::canonicalize(&profile), fs::canonicalize(&directory))
        && target.parent() == Some(base.as_path())
    {
        for _ in 0..20 {
            match fs::remove_dir_all(&target) {
                Ok(()) => break,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(_) => thread::sleep(Duration::from_millis(250)),
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_only_targets_the_owning_session_and_request() {
        let logins = BrowserLogins::default();
        let first = Arc::new(AtomicBool::new(false));
        let second = Arc::new(AtomicBool::new(false));
        let other = Arc::new(AtomicBool::new(false));
        logins.pending.lock().unwrap().extend([
            (("session".into(), "first".into()), first.clone()),
            (("session".into(), "second".into()), second.clone()),
            (("other".into(), "first".into()), other.clone()),
        ]);
        logins.cancel("session", Some("first"));
        assert!(first.load(Ordering::Acquire));
        assert!(!second.load(Ordering::Acquire));
        assert!(!other.load(Ordering::Acquire));
        logins.cancel("session", None);
        assert!(second.load(Ordering::Acquire));
        assert!(!other.load(Ordering::Acquire));
    }

    #[test]
    fn returns_only_requested_nonempty_cookie_in_preference_order() {
        let cookies = vec![
            Cookie::new("other", "unrelated"),
            Cookie::new("fallback", "second"),
            Cookie::new("preferred", "first"),
        ];
        assert_eq!(
            matching_cookie(&cookies, &["preferred".into(), "fallback".into()]),
            Some("first".into())
        );
        assert_eq!(matching_cookie(&cookies, &["missing".into()]), None);
        assert_eq!(
            matching_cookie(&[Cookie::new("preferred", "")], &["preferred".into()]),
            None
        );
    }
}
