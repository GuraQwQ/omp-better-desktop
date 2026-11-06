use std::{
    collections::VecDeque,
    fmt::Display,
    io::{Read, Write},
    process::Command,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::Duration,
};

const TAIL_BYTES: usize = 8192;

pub struct RuntimeDiagnostics {
    tail: Arc<Mutex<VecDeque<u8>>>,
    drained: mpsc::Receiver<()>,
}

impl RuntimeDiagnostics {
    pub fn attach(command: &mut Command) -> Result<Self, String> {
        let (mut reader, writer) = std::io::pipe().map_err(|error| error.to_string())?;
        command.stderr(writer);
        let tail = Arc::new(Mutex::new(VecDeque::with_capacity(TAIL_BYTES)));
        let captured = tail.clone();
        let (finished, drained) = mpsc::channel();
        thread::spawn(move || {
            let mut buffer = [0; 2048];
            while let Ok(count) = reader.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let _ = std::io::stderr().write_all(&buffer[..count]);
                let mut bytes = captured.lock().unwrap();
                bytes.extend(&buffer[..count]);
                let overflow = bytes.len().saturating_sub(TAIL_BYTES);
                bytes.drain(..overflow);
            }
            let _ = finished.send(());
        });
        Ok(Self { tail, drained })
    }

    pub fn error(&self, stage: &str, error: impl Display) -> String {
        // 退出时 stderr 的末段可能仍在管道中，短暂等待排空即可。
        let _ = self.drained.recv_timeout(Duration::from_millis(100));
        let bytes: Vec<u8> = self.tail.lock().unwrap().iter().copied().collect();
        let detail = String::from_utf8_lossy(&bytes);
        let detail = detail.trim();
        if detail.is_empty() {
            format!("{stage}：{error}")
        } else {
            format!("{stage}：{error}\n{detail}")
        }
    }
}
