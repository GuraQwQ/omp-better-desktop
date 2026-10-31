use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub fn runtime_environment(root: &Path) -> [(&'static str, PathBuf); 4] {
    [
        ("OMP_USER_ROOT", root.join("omp")),
        // 原生加载器早于 OMP 配置初始化，必须显式传入缓存目录。
        ("PI_NATIVES_DIR", root.join("cache/natives")),
        ("TEMP", root.join("cache/tmp")),
        ("TMP", root.join("cache/tmp")),
    ]
}

pub fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

#[cfg(windows)]
pub struct ProcessJob(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
unsafe impl Send for ProcessJob {}
#[cfg(windows)]
unsafe impl Sync for ProcessJob {}

#[cfg(windows)]
impl ProcessJob {
    pub fn attach(pid: u32) -> Result<Self, String> {
        use windows_sys::Win32::{
            Foundation::CloseHandle,
            System::{JobObjects::*, Threading::*},
        };
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                std::mem::size_of_val(&info) as u32,
            );
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            let assigned = !process.is_null()
                && configured != 0
                && AssignProcessToJobObject(job, process) != 0;
            if !process.is_null() {
                CloseHandle(process);
            }
            if !assigned {
                let error = std::io::Error::last_os_error().to_string();
                CloseHandle(job);
                return Err(error);
            }
            Ok(Self(job))
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(not(windows))]
pub struct ProcessJob;
#[cfg(not(windows))]
impl ProcessJob {
    pub fn attach(_: u32) -> Result<Self, String> {
        Ok(Self)
    }
}
