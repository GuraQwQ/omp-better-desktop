use std::path::Path;

#[cfg(windows)]
pub fn recycle(path: &Path) -> Result<(), String> {
    let path = path.to_owned();
    std::thread::spawn(move || recycle_in_apartment(&path))
        .join()
        .map_err(|_| {
            "回收站操作未能完成，请重试。 / Recycle Bin operation could not finish. Retry."
                .to_owned()
        })?
}

#[cfg(windows)]
fn recycle_in_apartment(path: &Path) -> Result<(), String> {
    use windows::{
        Win32::{
            System::Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
                CoUninitialize,
            },
            UI::Shell::{
                FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FOFX_RECYCLEONDELETE,
                FileOperation, IFileOperation, IShellItem, SHCreateItemFromParsingName,
            },
        },
        core::HSTRING,
    };
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }
    // 强制回收；系统无法使用回收站时返回错误，避免退化成永久删除。
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
        let _apartment = Apartment;
        let operation: IFileOperation =
            CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| error.to_string())?;
        operation
            .SetOperationFlags(
                FOF_ALLOWUNDO
                    | FOF_NOCONFIRMATION
                    | FOF_NOERRORUI
                    | FOF_SILENT
                    | FOFX_RECYCLEONDELETE,
            )
            .map_err(|error| error.to_string())?;
        let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(path.as_os_str()), None)
            .map_err(|error| error.to_string())?;
        operation
            .DeleteItem(&item, None)
            .map_err(|error| error.to_string())?;
        operation
            .PerformOperations()
            .map_err(|error| error.to_string())?;
        if operation
            .GetAnyOperationsAborted()
            .map_err(|error| error.to_string())?
            .as_bool()
            || path.exists()
        {
            return Err("会话未移入回收站，请重试。 / The conversation was not moved to the Recycle Bin. Retry.".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn recycle(_: &Path) -> Result<(), String> {
    Err("此版本仅支持 Windows 回收站。 / This version supports the Windows Recycle Bin.".into())
}
