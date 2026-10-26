mod bootstrap;
mod browser_login;
mod history;
mod platform;
mod sessions;
mod storage;

use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{Emitter, Manager};

pub struct Desktop {
    root: PathBuf,
    sessions: sessions::Sessions,
    configuration: Mutex<()>,
    data_access: std::sync::RwLock<()>,
    exiting: AtomicBool,
}

fn text<'a>(request: &'a Value, key: &str) -> Result<&'a str, String> {
    request[key]
        .as_str()
        .ok_or_else(|| format!("Missing {key}"))
}
fn load(path: &Path, default: Value) -> Result<Value, String> {
    match fs::read(path) {
        Ok(data) => serde_json::from_slice(&data).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(default),
        Err(e) => Err(e.to_string()),
    }
}

fn save(path: &Path, value: &Value) -> Result<(), String> {
    let temporary = path.with_extension("tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        };
        let from: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe {
            MoveFileExW(
                from.as_ptr(),
                to.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
    }
    #[cfg(not(windows))]
    fs::rename(temporary, path).map_err(|e| e.to_string())?;
    Ok(())
}

fn config(root: &Path) -> Result<Value, String> {
    load(
        &root.join("desktop.json"),
        json!({"preferences":{"language":"en","theme":"system"},"projects":[]}),
    )
}

fn inside(cwd: &Path, path: &str) -> Result<PathBuf, String> {
    let base = fs::canonicalize(cwd).map_err(|e| e.to_string())?;
    let target = fs::canonicalize(base.join(path)).map_err(|e| e.to_string())?;
    if !target.starts_with(&base) {
        return Err("File is outside this project.".into());
    }
    Ok(target)
}

fn execute(app: tauri::AppHandle, request: Value) -> Result<Value, String> {
    let desktop = app.state::<Desktop>();
    let root = &desktop.root;
    match text(&request, "type")? {
        "bootstrap" => {
            let cfg = config(root)?;
            Ok(
                json!({"dataRoot":root,"runtime":storage::runtime_info(root)?,"preferences":cfg["preferences"],"projects":cfg["projects"]}),
            )
        }
        "preferences.set" => {
            let _lock = desktop.configuration.lock().unwrap();
            let mut cfg = config(root)?;
            let patch = request["patch"].as_object().ok_or("Invalid preferences")?;
            for (key, value) in patch {
                match key.as_str() {
                    "language" if matches!(value.as_str(), Some("en" | "zh")) => {}
                    "theme" if matches!(value.as_str(), Some("system" | "light" | "dark")) => {}
                    _ => return Err(format!("Invalid preference {key}")),
                };
                cfg["preferences"][key] = value.clone();
            }
            save(&root.join("desktop.json"), &cfg)?;
            Ok(cfg["preferences"].clone())
        }
        "runtime.install" | "runtime.rollback" | "runtime.clean" | "data.import"
        | "data.takeover" => {
            let _exclusive = desktop.data_access.write().unwrap();
            if !desktop.sessions.is_empty() {
                return Err("Close active sessions and terminals before changing the runtime or managed data.".into());
            }
            match request["type"].as_str().unwrap() {
                "runtime.install" => {
                    storage::install_runtime(root, Path::new(text(&request, "path")?))
                }
                "runtime.rollback" => storage::rollback_runtime(root),
                "runtime.clean" => storage::clean_cache(root),
                "data.import" => storage::import_omp(root, Path::new(text(&request, "path")?)),
                _ => {
                    storage::takeover(root, request["enabled"].as_bool().ok_or("Missing enabled")?)
                }
            }
        }
        "data.discover" => storage::discover_omp(root),
        "project.add" | "project.remove" => {
            let _lock = desktop.configuration.lock().unwrap();
            let path = text(&request, "path")?;
            let mut cfg = config(root)?;
            let projects = cfg["projects"].as_array_mut().ok_or("Invalid projects")?;
            projects.retain(|p| p["path"].as_str() != Some(path));
            if request["type"] == "project.add" {
                let project = Path::new(path);
                if !project.is_dir() {
                    return Err("Choose an existing folder.".into());
                }
                projects.push(json!({"path":path,"name":project.file_name().and_then(|s|s.to_str()).unwrap_or(path)}));
            }
            save(&root.join("desktop.json"), &cfg)?;
            Ok(cfg["projects"].clone())
        }
        "session.list" => history::list(root, request["cwd"].as_str()),
        "session.history" => history::page(
            root,
            Path::new(text(&request, "path")?),
            request["cursor"].as_str(),
            request["limit"].as_u64().unwrap_or(100) as usize,
        ),
        "session.stats" => history::stats(root, Path::new(text(&request, "path")?)),
        "session.activate" => desktop
            .sessions
            .activate(app.clone(), request["id"].as_str()),
        "session.open" => {
            let _guard = desktop.data_access.read().unwrap();
            desktop.sessions.open(
                app.clone(),
                root,
                Path::new(text(&request, "cwd")?),
                request["path"].as_str().map(Path::new),
            )
        }
        "session.rpc" => desktop.sessions.rpc(
            app.clone(),
            text(&request, "id")?,
            request["command"].clone(),
        ),
        "session.ui" => desktop
            .sessions
            .ui(text(&request, "id")?, request["response"].clone()),
        "session.close" => desktop.sessions.close(text(&request, "id")?),
        "terminal.open" => {
            let _guard = desktop.data_access.read().unwrap();
            desktop.sessions.terminal_open(
                app.clone(),
                root,
                text(&request, "id")?,
                request["cols"].as_u64().unwrap_or(100) as u16,
                request["rows"].as_u64().unwrap_or(30) as u16,
            )
        }
        "terminal.write" => desktop
            .sessions
            .terminal_write(text(&request, "id")?, text(&request, "data")?),
        "terminal.resize" => desktop.sessions.terminal_resize(
            text(&request, "id")?,
            request["cols"].as_u64().unwrap_or(100) as u16,
            request["rows"].as_u64().unwrap_or(30) as u16,
        ),
        "terminal.close" => desktop.sessions.terminal_close(text(&request, "id")?),
        "workspace.diff" => {
            let cwd = Path::new(text(&request, "cwd")?);
            let diff = platform::run("git", &["diff", "--no-ext-diff", "--no-color", "HEAD"], cwd)?;
            let status = platform::run("git", &["status", "--short"], cwd)?;
            if !status.status.success() {
                return Err(String::from_utf8_lossy(&status.stderr).into());
            }
            Ok(
                json!({"diff":String::from_utf8_lossy(&diff.stdout),"status":String::from_utf8_lossy(&status.stdout)}),
            )
        }
        "workspace.files" => {
            let output = platform::run(
                "git",
                &[
                    "ls-files",
                    "-z",
                    "--cached",
                    "--others",
                    "--exclude-standard",
                ],
                Path::new(text(&request, "cwd")?),
            )?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).into());
            }
            Ok(json!(
                String::from_utf8_lossy(&output.stdout)
                    .split('\0')
                    .filter(|path| !path.is_empty())
                    .collect::<Vec<_>>()
            ))
        }
        "workspace.read" => {
            let path = inside(Path::new(text(&request, "cwd")?), text(&request, "path")?)?;
            let data = fs::read(&path).map_err(|e| e.to_string())?;
            String::from_utf8(data)
                .map(|s| json!(s))
                .map_err(|_| "This file is binary. Open it in its native application.".into())
        }
        "command.catalog" => serde_json::from_str(include_str!("../../src/generated/catalog.json"))
            .map_err(|e| e.to_string()),
        "command.cli" => {
            let _guard = desktop.data_access.read().unwrap();
            let args = request["args"]
                .as_array()
                .ok_or("Missing command arguments")?
                .iter()
                .map(|v| v.as_str().ok_or("Invalid argument"))
                .collect::<Result<Vec<_>, _>>()?;
            let output = sessions::command(root)?
                .current_dir(text(&request, "cwd")?)
                .args(args)
                .output()
                .map_err(|e| e.to_string())?;
            Ok(
                json!({"stdout":String::from_utf8_lossy(&output.stdout),"stderr":String::from_utf8_lossy(&output.stderr),"code":output.status.code()}),
            )
        }
        "system.open_url" => {
            let url = text(&request, "url")?;
            if !url.starts_with("https://")
                && !url.starts_with("http://localhost")
                && !url.starts_with("http://127.0.0.1")
            {
                return Err("Unsupported URL scheme".into());
            }
            #[cfg(windows)]
            {
                platform::hidden(
                    std::process::Command::new("rundll32.exe")
                        .arg("url.dll,FileProtocolHandler")
                        .arg(url),
                )
                .spawn()
                .map_err(|e| e.to_string())?;
            }
            #[cfg(not(windows))]
            {
                std::process::Command::new(if cfg!(target_os = "macos") {
                    "open"
                } else {
                    "xdg-open"
                })
                .arg(url)
                .spawn()
                .map_err(|e| e.to_string())?;
            }
            Ok(Value::Null)
        }
        other => Err(format!("Unknown desktop command: {other}")),
    }
}

#[tauri::command]
async fn desktop_command(app: tauri::AppHandle, request: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || execute(app, request))
        .await
        .map_err(|e| e.to_string())?
}

pub fn run() {
    let initialized = bootstrap::resolve_root().and_then(|root| {
        bootstrap::prepare_webview(&root)?;
        Ok(root)
    });
    let root = match initialized {
        Ok(root) => root,
        Err(error) => {
            bootstrap::show_startup_error(&error);
            return;
        }
    };
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows[0].create = false;
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Desktop {
            root,
            sessions: sessions::Sessions::default(),
            configuration: Mutex::new(()),
            data_access: std::sync::RwLock::new(()),
            exiting: AtomicBool::new(false),
        })
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let desktop = app.state::<Desktop>();
            let bundled = resources.join("runtime-windows-x64");
            let package = if bundled.join("runtime-manifest.json").is_file() {
                bundled
            } else {
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../artifacts/runtime-windows-x64")
            };
            if let Err(error) = bootstrap::install_bundled_runtime(&desktop.root, &package) {
                bootstrap::show_startup_error(&error);
                return Err(std::io::Error::other(error).into());
            }
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .data_directory(desktop.root.join("webview"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_command])
        .build(context)
        .expect("Could not start Better OMP Desktop");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let desktop = app.state::<Desktop>();
            if !desktop.exiting.swap(true, Ordering::AcqRel) {
                api.prevent_exit();
                let handle = app.clone();
                let _ = app.emit("desktop-shutdown", ());
                std::thread::spawn(move || {
                    handle.state::<Desktop>().sessions.shutdown();
                    handle.exit(0);
                });
            }
        }
    });
}
