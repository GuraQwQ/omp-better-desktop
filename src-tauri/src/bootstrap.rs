use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Location {
    data_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    webview2_runtime_path: Option<String>,
}

fn executable_directory() -> Result<PathBuf, String> {
    env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(Path::to_owned)
        .ok_or_else(|| "Cannot resolve the application directory.".into())
}

fn read_location(directory: &Path) -> Result<Option<Location>, String> {
    let file = directory.join("portable.json");
    match fs::read(&file) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| format!("Read {}: {e}", file.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Read {}: {e}", file.display())),
    }
}

fn save_location(directory: &Path, location: &Location) -> Result<(), String> {
    let destination = directory.join("portable.json");
    let temporary = directory.join("portable.json.pending");
    let mut bytes = serde_json::to_vec_pretty(location).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    fs::write(&temporary, bytes).map_err(|e| format!("Write portable location: {e}"))?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn MoveFileExW(existing: *const u16, destination: *const u16, flags: u32) -> i32;
        }
        let from: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 0x1 | 0x8) } == 0 {
            return Err(format!(
                "Save portable location: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    #[cfg(not(windows))]
    fs::rename(temporary, destination).map_err(|e| e.to_string())?;
    Ok(())
}

fn configured_path(directory: &Path, path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("Choose an application data directory.".into());
    }
    let path = Path::new(path);
    Ok(if path.is_absolute() {
        path.to_owned()
    } else {
        directory.join(path)
    })
}

fn check_non_system_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Choose an absolute application data directory.".into());
    }
    #[cfg(windows)]
    {
        let text = path
            .to_string_lossy()
            .replace('/', "\\")
            .to_ascii_lowercase();
        if text.starts_with("c:\\") || text.starts_with("\\\\?\\c:\\") {
            return Err("Choose a directory outside C: for application data and downloads.\n请选择 C 盘以外的目录保存应用数据和下载。".into());
        }
    }
    Ok(())
}

fn prepare_root(path: PathBuf) -> Result<PathBuf, String> {
    check_non_system_path(&path)?;
    // 先检查最近的已有祖先，避免通过目录链接写入系统盘。
    if let Some(existing) = path.ancestors().find(|p| p.exists()) {
        check_non_system_path(&fs::canonicalize(existing).map_err(|e| e.to_string())?)?;
    }
    fs::create_dir_all(&path).map_err(|e| format!("Create {}: {e}", path.display()))?;
    let root = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    check_non_system_path(&root)?;
    for suffix in ["omp", "cache/tmp", "webview"] {
        fs::create_dir_all(root.join(suffix)).map_err(|e| format!("Create data folders: {e}"))?;
    }
    // 此函数必须在线程和 WebView 启动之前执行。
    unsafe {
        env::set_var("OMP_DESKTOP_HOME", &root);
        // 全局覆盖会取代登录窗口的独立目录，各窗口改用显式配置。
        env::remove_var("WEBVIEW2_USER_DATA_FOLDER");
        env::set_var("TEMP", root.join("cache/tmp"));
        env::set_var("TMP", root.join("cache/tmp"));
    }
    Ok(root)
}

pub fn resolve_root() -> Result<PathBuf, String> {
    let directory = executable_directory()?;
    if let Some(root) = env::var_os("OMP_DESKTOP_HOME").filter(|v| !v.is_empty()) {
        return prepare_root(PathBuf::from(root));
    }
    if let Some(location) = read_location(&directory)? {
        return prepare_root(configured_path(&directory, &location.data_root)?);
    }
    let selected = choose_root()?;
    check_non_system_path(&directory)?;
    let root = prepare_root(selected)?;
    let location = Location {
        data_root: root.to_string_lossy().to_string(),
        webview2_runtime_path: None,
    };
    save_location(&directory, &location).map_err(|e| format!("Save data location next to the application: {e}. Run scripts/install.ps1 or set OMP_DESKTOP_HOME."))?;
    Ok(root)
}

pub fn prepare_webview(root: &Path) -> Result<(), String> {
    let directory = executable_directory()?;
    let location = read_location(&directory)?;
    let configured = env::var_os("OMP_WEBVIEW2_RUNTIME")
        .filter(|v| !v.is_empty())
        .or_else(|| env::var_os("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER").filter(|v| !v.is_empty()))
        .map(PathBuf::from)
        .or_else(|| {
            location
                .and_then(|location| location.webview2_runtime_path)
                .and_then(|path| configured_path(&directory, &path).ok())
        });
    #[cfg(windows)]
    {
        if let Some(path) = configured {
            let path = fs::canonicalize(&path).map_err(|e| {
                format!(
                    "Read the supplied Fixed Version WebView2 folder {}: {e}",
                    path.display()
                )
            })?;
            if !path.join("msedgewebview2.exe").is_file() {
                return Err(
                    "The Fixed Version WebView2 folder must contain msedgewebview2.exe.".into(),
                );
            }
            unsafe {
                env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", path);
            }
        } else if tauri::webview_version().is_err() {
            let path = choose_folder("Select an extracted WebView2 Fixed Version runtime / 选择已解压的 WebView2 运行时")?
                .ok_or("WebView2 is not installed. Supply an extracted Fixed Version runtime using scripts/install.ps1 -WebView2Runtime or OMP_WEBVIEW2_RUNTIME. No runtime was downloaded.")?;
            if !path.join("msedgewebview2.exe").is_file() {
                return Err("The selected folder does not contain msedgewebview2.exe.".into());
            }
            let mut location = read_location(&directory)?.unwrap_or(Location {
                data_root: root.to_string_lossy().to_string(),
                webview2_runtime_path: None,
            });
            location.webview2_runtime_path = Some(path.to_string_lossy().to_string());
            check_non_system_path(&directory)?;
            save_location(&directory, &location)?;
            unsafe {
                env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", path);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = (root, configured);
    Ok(())
}

pub fn install_pending_runtime(root: &Path) -> Result<(), String> {
    let directory = executable_directory()?;
    let request = directory.join("runtime-install.json");
    if !request.is_file() {
        return Ok(());
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(&request).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let source = value["package"]
        .as_str()
        .ok_or("The pending runtime install has no package path.")?;
    let source = configured_path(&directory, source)?;
    crate::storage::install_runtime(root, &source)?;
    fs::remove_file(&request).map_err(|e| format!("Complete runtime import: {e}"))?;
    Ok(())
}

pub fn install_bundled_runtime(root: &Path, package: &Path) -> Result<(), String> {
    let manifest_path = package.join("runtime-manifest.json");
    if !manifest_path.is_file() {
        return Err(format!(
            "The bundled OMP runtime is missing: {}",
            manifest_path.display()
        ));
    }
    crate::storage::install_bundled_runtime(root, package)?;
    match fs::remove_file(executable_directory()?.join("runtime-install.json")) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Clear completed runtime installation request: {error}"
        )),
    }
}

#[cfg(windows)]
fn choose_root() -> Result<PathBuf, String> {
    loop {
        let path = choose_folder(
            "Choose an application data directory outside C: / 选择 C 盘以外的应用数据目录",
        )?
        .ok_or("Application setup was cancelled. No runtime was installed.")?;
        match check_non_system_path(&path) {
            Ok(()) => return Ok(path),
            Err(error) => {
                message("Choose another directory / 请选择其他目录", &error, 0x30);
            }
        }
    }
}

#[cfg(not(windows))]
fn choose_root() -> Result<PathBuf, String> {
    let directory = executable_directory()?;
    Ok(directory.join("data"))
}

#[cfg(windows)]
fn message(title: &str, body: &str, flags: u32) -> i32 {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBoxW(window: isize, text: *const u16, caption: *const u16, flags: u32) -> i32;
    }
    let title: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
    let body: Vec<u16> = body.encode_utf16().chain(Some(0)).collect();
    unsafe { MessageBoxW(0, body.as_ptr(), title.as_ptr(), flags) }
}

pub fn show_startup_error(error: &str) {
    #[cfg(windows)]
    {
        message("Better OMP Desktop", error, 0x10);
    }
    #[cfg(not(windows))]
    eprintln!("{error}");
}

#[cfg(windows)]
fn choose_folder(title: &str) -> Result<Option<PathBuf>, String> {
    #[repr(C)]
    struct BrowseInfo {
        owner: isize,
        root: *const std::ffi::c_void,
        display_name: *mut u16,
        title: *const u16,
        flags: u32,
        callback: Option<unsafe extern "system" fn(isize, u32, isize, isize) -> i32>,
        parameter: isize,
        image: i32,
    }
    #[link(name = "shell32")]
    unsafe extern "system" {
        fn SHBrowseForFolderW(info: *const BrowseInfo) -> *mut std::ffi::c_void;
        fn SHGetPathFromIDListW(id: *const std::ffi::c_void, path: *mut u16) -> i32;
    }
    #[link(name = "ole32")]
    unsafe extern "system" {
        fn CoInitializeEx(reserved: *const std::ffi::c_void, mode: u32) -> i32;
        fn CoUninitialize();
        fn CoTaskMemFree(memory: *mut std::ffi::c_void);
    }
    let title: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
    let mut name = [0u16; 260];
    let mut path = [0u16; 260];
    let initialized = unsafe { CoInitializeEx(std::ptr::null(), 2) };
    let info = BrowseInfo {
        owner: 0,
        root: std::ptr::null(),
        display_name: name.as_mut_ptr(),
        title: title.as_ptr(),
        flags: 0x51,
        callback: None,
        parameter: 0,
        image: 0,
    };
    let id = unsafe { SHBrowseForFolderW(&info) };
    let output = if id.is_null() {
        Ok(None)
    } else {
        let valid = unsafe { SHGetPathFromIDListW(id, path.as_mut_ptr()) };
        unsafe { CoTaskMemFree(id) };
        if valid == 0 {
            Err("The selection must be a filesystem directory.".into())
        } else {
            let length = path.iter().position(|x| *x == 0).unwrap_or(path.len());
            Ok(Some(PathBuf::from(String::from_utf16_lossy(
                &path[..length],
            ))))
        }
    };
    if initialized >= 0 {
        unsafe { CoUninitialize() };
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_location_is_relative_to_the_executable() {
        let directory = Path::new("F:/applications/Better OMP Desktop");
        assert_eq!(
            configured_path(directory, "data").unwrap(),
            directory.join("data")
        );
        assert_eq!(
            configured_path(directory, "O:/agent-data").unwrap(),
            PathBuf::from("O:/agent-data")
        );
        assert!(configured_path(directory, "").is_err());
        assert!(check_non_system_path(Path::new("C:/Users/example/data")).is_err());
        assert!(check_non_system_path(Path::new("F:/agent-data")).is_ok());
    }
}
