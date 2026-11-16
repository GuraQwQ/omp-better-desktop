use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Condvar, Mutex},
    time::{Duration, Instant},
};

const FILES: &[(&str, &str)] = &[
    (
        "index.ts",
        include_str!("../../extensions/desktop-swarm/index.ts"),
    ),
    (
        "runtime.ts",
        include_str!("../../extensions/desktop-swarm/runtime.ts"),
    ),
    (
        "store.ts",
        include_str!("../../extensions/desktop-swarm/store.ts"),
    ),
    (
        "types.ts",
        include_str!("../../extensions/desktop-swarm/types.ts"),
    ),
];

pub fn install(root: &Path) -> Result<PathBuf, String> {
    let _lock = crate::storage::storage_lock(root)?;
    let directory = root.join("desktop-extensions/swarm");
    for (name, source) in FILES {
        let path = directory.join(name);
        if !fs::read(&path).is_ok_and(|bytes| bytes == source.as_bytes()) {
            crate::storage::atomic_write(&path, source.as_bytes())?;
        }
    }
    Ok(directory.join("index.ts"))
}

// 使用标准扩展状态事件回传，控制消息不会进入模型或对话历史。
pub fn event(event: &Value) -> Option<Value> {
    if event["type"] != "extension_ui_request"
        || event["method"] != "setStatus"
        || event["statusKey"] != "desktop:swarm"
    {
        return None;
    }
    let payload: Value = serde_json::from_str(event["statusText"].as_str()?).ok()?;
    (payload["snapshot"].is_object() || payload["error"].is_string()).then_some(payload)
}

#[derive(Default)]
struct State {
    snapshot: Value,
    replies: HashMap<String, Option<Value>>,
    closed: bool,
}

#[derive(Default)]
pub struct Control {
    state: Mutex<State>,
    changed: Condvar,
}

impl Control {
    pub fn publish(&self, payload: &Value) {
        let mut state = self.state.lock().unwrap();
        if payload["snapshot"].is_object() {
            state.snapshot = payload["snapshot"].clone();
        }
        if let Some(id) = payload["requestId"].as_str()
            && let Some(reply) = state.replies.get_mut(id)
        {
            *reply = Some(payload.clone());
        }
        self.changed.notify_all();
    }

    pub fn busy(&self) -> bool {
        let state = self.state.lock().unwrap();
        state.snapshot["running"].as_u64().unwrap_or(0) > 0
            || state.snapshot["enabled"] == true
                && state.snapshot["pending"].as_u64().unwrap_or(0) > 0
            || !state.replies.is_empty()
    }

    pub fn close(&self) {
        self.state.lock().unwrap().closed = true;
        self.changed.notify_all();
    }

    pub fn request(
        &self,
        action: &str,
        args: Value,
        send: impl FnOnce(Value) -> Result<Value, String>,
    ) -> Result<Value, String> {
        if !matches!(
            action,
            "status" | "enable" | "disable" | "create" | "add" | "post" | "stop" | "resume"
        ) {
            return Err("未知的协作操作。".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.state.lock().unwrap().replies.insert(id.clone(), None);
        let result = (|| {
            let message = format!(
                "/desktop-swarm {}",
                json!({"requestId":id,"action":action,"args":args})
            );
            let response = send(json!({"type":"prompt","message":message}))?;
            if response["agentInvoked"] != false {
                return Err("协作控制命令未由扩展处理，请重新连接会话。".into());
            }
            let deadline = Instant::now() + Duration::from_secs(30);
            let mut state = self.state.lock().unwrap();
            loop {
                if let Some(Some(reply)) = state.replies.get(&id) {
                    return if let Some(error) = reply["error"].as_str() {
                        Err(error.into())
                    } else {
                        Ok(reply["snapshot"].clone())
                    };
                }
                if state.closed {
                    return Err("协作连接已关闭，请重新连接后查看已保存的状态。".into());
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err("协作操作仍未确认，请刷新状态后重试。".into());
                }
                state = self.changed.wait_timeout(state, remaining).unwrap().0;
            }
        })();
        self.state.lock().unwrap().replies.remove(&id);
        result
    }
}
