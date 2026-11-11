use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
};

pub fn runtime_environment(root: &Path) -> [(&'static str, PathBuf); 4] {
    let root = external_path(root);
    [
        ("OMP_USER_ROOT", root.join("omp")),
        // 原生加载器早于 OMP 配置初始化，必须显式传入缓存目录。
        ("PI_NATIVES_DIR", root.join("cache/natives")),
        ("TEMP", root.join("cache/tmp")),
        ("TMP", root.join("cache/tmp")),
    ]
}

pub fn external_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let mut normal = match prefix.kind() {
                Prefix::VerbatimDisk(drive) => PathBuf::from(format!("{}:", char::from(drive))),
                Prefix::VerbatimUNC(server, share) => {
                    let mut unc = PathBuf::from(r"\\");
                    unc.push(server);
                    unc.push(share);
                    unc
                }
                _ => return path.to_owned(),
            };
            // Bun 的原生模块 require 不识别 Win32 扩展前缀；仅在外部进程边界转换。
            normal.push(components.as_path());
            return normal;
        }
    }
    path.to_owned()
}

pub fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

pub struct ManagedPty {
    master: Option<Box<dyn portable_pty::MasterPty + Send>>,
    slave: Option<Box<dyn portable_pty::SlavePty + Send>>,
    writer: Option<Box<dyn Write + Send>>,
    child: Option<Box<dyn portable_pty::Child + Send + Sync>>,
    child_job: Option<ProcessJob>,
    host_job: Option<ProcessJob>,
}

impl ManagedPty {
    pub fn reader(&self) -> Result<Box<dyn Read + Send>, String> {
        self.master
            .as_ref()
            .ok_or("终端已关闭。")?
            .try_clone_reader()
            .map_err(|error| error.to_string())
    }

    pub fn spawn(
        &mut self,
        commands: impl IntoIterator<Item = portable_pty::CommandBuilder>,
    ) -> Result<(), String> {
        let slave = self.slave.as_ref().ok_or("终端已启动或已关闭。")?;
        let mut failure = "未指定终端程序。".to_owned();
        for command in commands {
            let mut child = match slave.spawn_command(command) {
                Ok(child) => child,
                Err(error) => {
                    failure = error.to_string();
                    continue;
                }
            };
            match child
                .process_id()
                .ok_or("终端未启动。".to_owned())
                .and_then(ProcessJob::attach)
            {
                Ok(job) => {
                    self.child_job = Some(job);
                    self.child = Some(child);
                }
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(error);
                }
            }
            drop(self.slave.take());
            return Ok(());
        }
        Err(format!("无法启动终端：{failure}"))
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), String> {
        let writer = self.writer.as_mut().ok_or("终端已关闭。")?;
        writer
            .write_all(data)
            .and_then(|_| writer.flush())
            .map_err(|error| error.to_string())
    }

    pub fn resize(&self, size: portable_pty::PtySize) -> Result<(), String> {
        let master = self.master.as_ref().ok_or("终端已关闭。")?;
        if master.get_size().map_err(|error| error.to_string())? != size {
            master.resize(size).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn close(&mut self) -> Result<(), String> {
        let mut result = Ok(());
        if let Some(mut child) = self.child.take() {
            if child.try_wait().ok().flatten().is_none() {
                result = child.kill().map_err(|error| error.to_string());
            }
            drop(self.child_job.take());
            if let Err(error) = child.wait() {
                if result.is_ok() {
                    result = Err(error.to_string());
                }
            }
        }
        // 待光标回复的 ConPTY 必须先结束主机，再关闭控制句柄。
        drop(self.host_job.take());
        drop(self.writer.take());
        drop(self.slave.take());
        drop(self.master.take());
        result
    }
}

impl Drop for ManagedPty {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

#[cfg(windows)]
fn console_hosts(parent: u32) -> Result<std::collections::HashSet<u32>, String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
    };
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut hosts = std::collections::HashSet::new();
        let mut available = Process32FirstW(snapshot, &mut entry);
        while available != 0 {
            let length = entry
                .szExeFile
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..length]);
            if entry.th32ParentProcessID == parent
                && (name.eq_ignore_ascii_case("conhost.exe")
                    || name.eq_ignore_ascii_case("OpenConsole.exe"))
            {
                hosts.insert(entry.th32ProcessID);
            }
            available = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
        Ok(hosts)
    }
}

pub fn open_pty(size: portable_pty::PtySize) -> Result<ManagedPty, String> {
    // 两种内嵌终端共用这个短临界区，准确归属本次创建的主机。
    static OPENING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _opening = OPENING.lock().unwrap();
    #[cfg(windows)]
    let before = console_hosts(std::process::id())?;
    let pair = portable_pty::native_pty_system()
        .openpty(size)
        .map_err(|error| error.to_string())?;
    let mut managed = ManagedPty {
        master: Some(pair.master),
        slave: Some(pair.slave),
        writer: None,
        child: None,
        child_job: None,
        host_job: None,
    };
    #[cfg(windows)]
    {
        let after = console_hosts(std::process::id())?;
        let created: Vec<_> = after.difference(&before).copied().collect();
        if created.len() != 1 {
            return Err("未能识别本次终端主机，请重试。".into());
        }
        let host = created[0];
        managed.host_job = match ProcessJob::attach(host) {
            Ok(job) => Some(job),
            Err(error) => {
                // 此 PID 来自当前进程创建前后的主机差集，仅收回本次资源。
                use windows_sys::Win32::{
                    Foundation::CloseHandle,
                    System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess},
                };
                unsafe {
                    let process = OpenProcess(PROCESS_TERMINATE, 0, host);
                    if !process.is_null() {
                        TerminateProcess(process, 1);
                        CloseHandle(process);
                    }
                }
                return Err(error);
            }
        };
    }
    managed.writer = Some(
        managed
            .master
            .as_ref()
            .unwrap()
            .take_writer()
            .map_err(|error| error.to_string())?,
    );
    Ok(managed)
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        process::{Child, Stdio},
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };

    struct Owner {
        child: Child,
        _job: ProcessJob,
    }

    impl Drop for Owner {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }

    #[test]
    #[ignore = "由父测试通过隔离子进程调用"]
    fn pty_owner_fixture() {
        println!("OMP_PTY_WAITING");
        std::io::stdout().flush().unwrap();
        let mut start = String::new();
        std::io::stdin().read_line(&mut start).unwrap();
        if start.trim() != "go" {
            return;
        }
        let waiting_command = || {
            let mut command = portable_pty::CommandBuilder::new("cmd.exe");
            command.args(["/d", "/c", "pause"]);
            command
        };
        let before = console_hosts(std::process::id()).unwrap();
        let mut managed = open_pty(portable_pty::PtySize::default()).unwrap();
        assert!(
            managed
                .spawn([portable_pty::CommandBuilder::new(
                    "omp-missing-pty-test.exe"
                )])
                .is_err()
        );
        managed.spawn([waiting_command()]).unwrap();
        managed.close().unwrap();
        managed.close().unwrap();
        assert!(managed.write(b"closed").is_err());
        let started = Instant::now();
        while !console_hosts(std::process::id())
            .unwrap()
            .is_subset(&before)
        {
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "关闭后终端主机仍存活"
            );
            thread::sleep(Duration::from_millis(20));
        }
        managed = open_pty(portable_pty::PtySize::default()).unwrap();
        managed.spawn([waiting_command()]).unwrap();
        println!("OMP_PTY_READY");
        std::io::stdout().flush().unwrap();
        loop {
            thread::sleep(Duration::from_secs(1));
        }
    }

    #[test]
    fn killing_pty_owner_releases_its_console_host() {
        let executable = std::env::current_exe().unwrap();
        let mut command = Command::new(executable);
        command
            .args([
                "--ignored",
                "--exact",
                "platform::tests::pty_owner_fixture",
                "--nocapture",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = hidden(&mut command).spawn().unwrap();
        let job = match ProcessJob::attach(child.id()) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("无法托管测试进程：{error}");
            }
        };
        let mut owner = Owner { child, _job: job };
        let (send, receive) = mpsc::channel();
        let output = owner.child.stdout.take().unwrap();
        thread::spawn(move || {
            for line in BufReader::new(output)
                .lines()
                .map_while(std::result::Result::ok)
            {
                if line.contains("OMP_PTY_WAITING") {
                    let _ = send.send(());
                } else if line.contains("OMP_PTY_READY") {
                    let _ = send.send(());
                    return;
                }
            }
        });
        receive
            .recv_timeout(Duration::from_secs(10))
            .expect("测试进程启动未就绪，父 Job 会回收测试进程与主机");
        // 子进程启动时的普通控制台不属于本次 ConPTY。
        let before = console_hosts(owner.child.id()).unwrap();
        owner
            .child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(b"go\n")
            .unwrap();
        receive
            .recv_timeout(Duration::from_secs(10))
            .expect("终端创建未就绪，父 Job 会回收测试进程与主机");
        let hosts: std::collections::HashSet<_> = console_hosts(owner.child.id())
            .unwrap()
            .difference(&before)
            .copied()
            .collect();
        assert_eq!(hosts.len(), 1, "测试进程应仅创建一个终端主机");
        owner.child.kill().unwrap();
        owner.child.wait().unwrap();
        // 父 Job 仍存活；主机应由被强制结束的持有者自己的 Job 回收。
        let started = Instant::now();
        loop {
            if hosts.is_disjoint(&console_hosts(owner.child.id()).unwrap()) {
                break;
            }
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "强制取消后终端主机仍存活"
            );
            thread::sleep(Duration::from_millis(20));
        }
    }
}
