use omp_rpc::client::PendingResponse;
use omp_rpc::{HostTool, ToolLoadMode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

const PREFIX: &str = "desktop-ask-";

pub fn install_overlay(root: &Path) -> Result<PathBuf, String> {
    let path = root.join("cache/host-ask.json");
    let content = b"{\"ask\":{\"enabled\":false}}\n";
    // RPC 不允许重名注册；仅让本次进程的原生工厂让出 ask，原配置保持不变。
    if !fs::read(&path).is_ok_and(|bytes| bytes == content) {
        crate::storage::atomic_write(&path, content)?;
    }
    Ok(path)
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Choice {
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Question {
    id: String,
    question: String,
    options: Vec<Choice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    recommended: Option<usize>,
    #[serde(default)]
    multi: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Answer {
    id: String,
    selected_options: Vec<String>,
    #[serde(default)]
    custom_input: Option<String>,
}

#[derive(Default)]
struct State {
    pending: HashMap<String, Vec<Question>>,
    finished: HashSet<String>,
    inflight: HashMap<String, Arc<PendingResponse>>,
    interrupting: bool,
    closed: bool,
}

pub struct Questions {
    state: Mutex<State>,
    // 同一会话的回答与清理按 ACK 顺序串行，不占用全局会话锁。
    delivery: Mutex<()>,
    emit: Box<dyn Fn(Value) + Send + Sync>,
}

impl Questions {
    pub fn new(emit: impl Fn(Value) + Send + Sync + 'static) -> Self {
        Self {
            state: Mutex::new(State::default()),
            delivery: Mutex::new(()),
            emit: Box::new(emit),
        }
    }

    pub fn tool(self: &Arc<Self>) -> HostTool {
        let questions = self.clone();
        let schema = json!({
            "type":"object", "additionalProperties":false, "required":["questions"],
            "properties":{"questions":{"type":"array","minItems":1,"maxItems":3,"items":{
                "type":"object","additionalProperties":false,"required":["id","question","options"],
                "properties":{
                    "id":{"type":"string"},"question":{"type":"string"},"header":{"type":"string"},"multi":{"type":"boolean"},"recommended":{"type":"integer","minimum":0},
                    "options":{"type":"array","description":"Use an empty array for a free-text question; the user can enter multiple lines and confirm before sending.","items":{
                        "type":"object","additionalProperties":false,"required":["label"],
                        "properties":{"label":{"type":"string"},"description":{"type":"string"},"preview":{"type":"string"}}
                    }}
                }
            }}}
        });
        HostTool::new(
            "ask",
            "Ask 1–3 short questions without blocking this turn. Choose options for a selection question, or options: [] for a free-text input question. Continue work independent of the answers; confirmed user answers arrive as a later user message. An unanswered question is not approval.",
            schema.as_object().unwrap().clone(),
            move |arguments, context| {
                if context.is_cancelled() {
                    return Err("Question request was cancelled".into());
                }
                let id = questions.enqueue(Value::Object(arguments))?;
                if context.is_cancelled() {
                    questions.cancel_one(&id);
                    return Err("Question request was cancelled".into());
                }
                Ok(json!({"status":"pending","questionId":id}).to_string().into())
            },
        )
        .label("Ask")
        .load_mode(ToolLoadMode::Essential)
    }

    fn enqueue(&self, arguments: Value) -> Result<String, String> {
        let questions: Vec<Question> = serde_json::from_value(arguments["questions"].clone())
            .map_err(|_| "Invalid questions.".to_owned())?;
        if !(1..=3).contains(&questions.len()) {
            return Err("Ask between one and three questions.".into());
        }
        let mut ids = HashSet::new();
        for question in &questions {
            if question.id.trim().is_empty()
                || question.question.trim().is_empty()
                || !ids.insert(question.id.as_str())
            {
                return Err("Questions need nonempty, unique ids and question text.".into());
            }
            let mut labels = HashSet::new();
            if question.options.iter().any(|option| {
                option.label.trim().is_empty() || !labels.insert(option.label.as_str())
            }) {
                return Err("Option labels must be nonempty and unique.".into());
            }
            if question
                .recommended
                .is_some_and(|index| index >= question.options.len())
            {
                return Err("Recommended option must refer to an existing option.".into());
            }
        }
        let id = format!("{PREFIX}{}", uuid::Uuid::new_v4());
        let rendered = serde_json::to_value(&questions).unwrap();
        let mut state = self.state.lock().unwrap();
        if state.closed {
            return Err("Session is closed.".into());
        }
        state.pending.insert(id.clone(), questions);
        (self.emit)(
            json!({"type":"extension_ui_request","method":"ask","id":id,"async":true,"questions":rendered}),
        );
        Ok(id)
    }

    pub fn has_pending(&self) -> bool {
        !self.state.lock().unwrap().pending.is_empty()
    }

    pub fn respond(
        &self,
        response: &Value,
        send: impl FnOnce(String) -> Result<Value, String>,
    ) -> Option<Result<Value, String>> {
        let id = response["id"].as_str()?;
        if !id.starts_with(PREFIX) {
            return None;
        }
        if response["cancelled"] == true {
            if let Some(pending) = self.state.lock().unwrap().inflight.get(id) {
                pending.cancel();
            }
        }
        let _delivery = self.delivery.lock().unwrap();
        let questions = {
            let state = self.state.lock().unwrap();
            if state.finished.contains(id) {
                return Some(Ok(json!({"accepted":true,"duplicate":true})));
            }
            if state.closed || state.interrupting {
                return Some(Err("Session is closed or interrupted.".into()));
            }
            let Some(questions) = state.pending.get(id) else {
                return Some(Err(
                    "This question is no longer pending in this session.".into()
                ));
            };
            questions.clone()
        };
        if response["cancelled"] == true {
            self.finish(id, true);
            return Some(Ok(json!({"cancelled":true})));
        }
        let message = match answer_message(id, &questions, &response["answers"]) {
            Ok(message) => message,
            Err(error) => return Some(Err(error)),
        };
        Some(send(message).map(|ack| {
            self.finish(id, false);
            json!({"accepted":true,"ack":ack})
        }))
    }

    pub fn wait_response(
        &self,
        id: &str,
        timeout: Duration,
        start: impl FnOnce() -> Result<PendingResponse, String>,
    ) -> Result<Value, String> {
        let pending = {
            let mut state = self.state.lock().unwrap();
            if state.closed || state.interrupting {
                return Err("Session is closed or interrupted.".into());
            }
            if let Some(pending) = state.inflight.get(id) {
                pending.clone()
            } else {
                let pending = Arc::new(start()?);
                state.inflight.insert(id.to_owned(), pending.clone());
                pending
            }
        };
        match pending.wait(timeout) {
            Ok(None) => Err(
                "Answer confirmation is still pending. Retry to check the same submission.".into(),
            ),
            result => {
                self.state.lock().unwrap().inflight.remove(id);
                result
                    .map(|value| value.unwrap_or(Value::Null))
                    .map_err(|error| error.to_string())
            }
        }
    }

    fn finish(&self, id: &str, cancelled: bool) {
        let mut state = self.state.lock().unwrap();
        if state.pending.remove(id).is_none() {
            return;
        }
        state.finished.insert(id.to_owned());
        if let Some(pending) = state.inflight.remove(id) {
            pending.cancel();
        }
        drop(state);
        if cancelled {
            (self.emit)(
                json!({"type":"extension_ui_request","method":"cancel","id":uuid::Uuid::new_v4().to_string(),"targetId":id}),
            );
        }
    }

    fn cancel_one(&self, id: &str) {
        if let Some(pending) = self.state.lock().unwrap().inflight.get(id) {
            pending.cancel();
        }
        let _delivery = self.delivery.lock().unwrap();
        self.finish(id, true);
    }

    pub fn interrupt<T>(&self, send: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        self.cancel_waiters(false);
        let _delivery = self.delivery.lock().unwrap();
        self.clear_locked(false);
        let result = send();
        self.clear_locked(false);
        self.state.lock().unwrap().interrupting = false;
        result
    }

    pub fn close(&self) {
        self.cancel_waiters(true);
        let _delivery = self.delivery.lock().unwrap();
        self.clear_locked(true);
    }

    fn cancel_waiters(&self, closed: bool) {
        let mut state = self.state.lock().unwrap();
        state.closed |= closed;
        state.interrupting = true;
        for pending in state.inflight.values() {
            pending.cancel();
        }
    }

    fn clear_locked(&self, closed: bool) {
        let ids = {
            let mut state = self.state.lock().unwrap();
            state.closed |= closed;
            state.pending.keys().cloned().collect::<Vec<_>>()
        };
        for id in ids {
            self.finish(&id, true);
        }
    }
}

fn answer_message(id: &str, questions: &[Question], value: &Value) -> Result<String, String> {
    let answers: Vec<Answer> = serde_json::from_value(value.clone())
        .map_err(|_| "Invalid question answers.".to_owned())?;
    if answers.len() != questions.len() {
        return Err("Answer every question before submitting.".into());
    }
    let mut rows = Vec::new();
    for (question, answer) in questions.iter().zip(answers) {
        let custom = answer.custom_input.as_deref().unwrap_or("");
        let mut selected = HashSet::new();
        if answer.id != question.id
            || answer.selected_options.iter().any(|label| {
                !question.options.iter().any(|option| option.label == *label)
                    || !selected.insert(label.as_str())
            })
            || answer.selected_options.is_empty() && custom.trim().is_empty()
            || !question.multi
                && (answer.selected_options.len() > 1
                    || !answer.selected_options.is_empty() && !custom.trim().is_empty())
        {
            return Err("Choose valid answers or enter a custom response.".into());
        }
        rows.push(json!({"id":question.id,"question":question.question,"header":question.header,"selectedOptions":answer.selected_options,"customInput":custom}));
    }
    Ok(format!(
        "[omp-desktop-question-response]\n{}\n[/omp-desktop-question-response]",
        json!({"questionId":id,"answers":rows})
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use omp_rpc::{Client, ClientOptions};
    use std::{
        io::{BufRead, BufReader, Write},
        net::{TcpListener, TcpStream},
        sync::{
            atomic::{AtomicUsize, Ordering},
            mpsc,
        },
        thread,
        time::Duration,
    };

    fn input() -> Value {
        json!({"questions":[{"id":"scope","question":"Which scope?","header":"Scope","recommended":0,"options":[{"label":"Small","preview":"Small scope"},{"label":"Large"}]}]})
    }

    fn answer(id: &str) -> Value {
        json!({"id":id,"answers":[{"id":"scope","selectedOptions":["Small"],"customInput":""}]})
    }

    fn collector() -> (Arc<Questions>, Arc<Mutex<Vec<Value>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        (
            Arc::new(Questions::new(move |event| {
                sink.lock().unwrap().push(event)
            })),
            events,
        )
    }

    #[test]
    fn overlay_install_is_idempotent_and_keeps_user_configuration() {
        let root = std::env::temp_dir().join(format!("omp-ask-overlay-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("omp/agent")).unwrap();
        let original = b"ask:\n  enabled: true\n";
        fs::write(root.join("omp/agent/config.yml"), original).unwrap();
        let overlay = install_overlay(&root).unwrap();
        let modified = fs::metadata(&overlay).unwrap().modified().unwrap();
        assert_eq!(install_overlay(&root).unwrap(), overlay);
        assert_eq!(
            fs::metadata(&overlay).unwrap().modified().unwrap(),
            modified
        );
        fs::write(&overlay, "interrupted").unwrap();
        install_overlay(&root).unwrap();
        let value: Value = serde_json::from_slice(&fs::read(&overlay).unwrap()).unwrap();
        assert_eq!(value, json!({"ask":{"enabled":false}}));
        assert_eq!(
            fs::read(root.join("omp/agent/config.yml")).unwrap(),
            original
        );
        assert_eq!(root.parent(), Some(std::env::temp_dir().as_path()));
        assert!(
            root.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("omp-ask-overlay-")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_delivery_stays_retryable_and_success_is_sent_once() {
        let (questions, events) = collector();
        let id = questions.enqueue(input()).unwrap();
        assert!(questions.has_pending());
        assert_eq!(events.lock().unwrap()[0]["questions"][0]["recommended"], 0);
        let response = answer(&id);
        assert!(
            questions
                .respond(&response, |_| Err("offline".into()))
                .unwrap()
                .is_err()
        );
        assert!(questions.has_pending());
        let sends = AtomicUsize::new(0);
        for _ in 0..2 {
            questions
                .respond(&response, |message| {
                    sends.fetch_add(1, Ordering::Relaxed);
                    assert!(message.contains("Which scope?"));
                    assert!(message.contains("Small"));
                    Ok(json!({"queued":true}))
                })
                .unwrap()
                .unwrap();
        }
        assert_eq!(sends.load(Ordering::Relaxed), 1);
        assert!(!questions.has_pending());
    }

    #[test]
    fn text_question_requires_confirmation_content_and_keeps_multiline_answer() {
        let (questions, _) = collector();
        let id = questions
            .enqueue(
                json!({"questions":[{"id":"details","question":"需要哪些结果？","options":[]}]}),
            )
            .unwrap();
        let mut response =
            json!({"id":id,"answers":[{"id":"details","selectedOptions":[],"customInput":"  "}]});
        assert!(
            questions
                .respond(&response, |_| panic!("空白答案不能提交"))
                .unwrap()
                .is_err()
        );
        response["answers"][0]["customInput"] = json!("第一行\n第二行");
        assert!(
            questions
                .respond(&response, |_| Err("offline".into()))
                .unwrap()
                .is_err()
        );
        assert!(questions.has_pending());
        questions
            .respond(&response, |message| {
                let content = message
                    .strip_prefix("[omp-desktop-question-response]\n")
                    .unwrap()
                    .strip_suffix("\n[/omp-desktop-question-response]")
                    .unwrap();
                let record: Value = serde_json::from_str(content).unwrap();
                assert_eq!(record["questionId"], id);
                assert_eq!(record["answers"][0]["id"], "details");
                assert_eq!(record["answers"][0]["customInput"], "第一行\n第二行");
                Ok(json!({"queued":true}))
            })
            .unwrap()
            .unwrap();
        assert!(!questions.has_pending());
    }

    #[test]
    fn cancellation_and_close_only_clear_the_owning_session() {
        let (first, first_events) = collector();
        let (second, second_events) = collector();
        let first_id = first.enqueue(input()).unwrap();
        let second_id = second.enqueue(input()).unwrap();
        assert!(
            second
                .respond(&answer(&first_id), |_| panic!("不能跨会话发送答案"))
                .unwrap()
                .is_err()
        );
        first
            .respond(&json!({"id":first_id,"cancelled":true}), |_| {
                panic!("取消不发模型请求")
            })
            .unwrap()
            .unwrap();
        assert!(!first.has_pending());
        assert!(second.has_pending());
        assert_eq!(first_events.lock().unwrap()[1]["targetId"], first_id);
        second.close();
        second.close();
        assert!(!second.has_pending());
        assert_eq!(second_events.lock().unwrap().len(), 2);
        assert_eq!(second_events.lock().unwrap()[1]["targetId"], second_id);
        assert!(second.enqueue(input()).is_err());
    }

    #[test]
    fn interrupt_cancels_pending_and_allows_later_questions() {
        let (questions, events) = collector();
        let id = questions.enqueue(input()).unwrap();
        questions
            .interrupt(|| {
                assert!(!questions.has_pending());
                questions.enqueue(input()).unwrap();
                Ok(())
            })
            .unwrap();
        assert!(!questions.has_pending());
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|event| event["method"] == "cancel")
                .count(),
            2
        );
        questions
            .respond(&answer(&id), |_| panic!("中止后的旧答案不能重启任务"))
            .unwrap()
            .unwrap();
        assert!(questions.enqueue(input()).is_ok());
    }

    #[test]
    fn malformed_questions_and_answers_do_not_consume_pending_work() {
        let (questions, _) = collector();
        assert!(questions.enqueue(json!({"questions":[]})).is_err());
        assert!(
            questions
                .enqueue(json!({"questions":[input()["questions"][0],input()["questions"][0]]}))
                .is_err()
        );
        let id = questions.enqueue(input()).unwrap();
        for answers in [
            json!([]),
            json!([{"id":"other","selectedOptions":["Small"]}]),
            json!([{"id":"scope","selectedOptions":["Unknown"]}]),
            json!([{"id":"scope","selectedOptions":[]}]),
        ] {
            assert!(
                questions
                    .respond(&json!({"id":id,"answers":answers}), |_| panic!(
                        "非法答案不能提交"
                    ))
                    .unwrap()
                    .is_err()
            );
            assert!(questions.has_pending());
        }
        assert!(
            questions
                .respond(&json!({"id":"native-id","cancelled":true}), |_| panic!(
                    "原生问题应交回原协议"
                ))
                .is_none()
        );
    }

    #[test]
    fn vendor_dispatch_returns_pending_before_answer_and_prompt_waits_only_for_ack() {
        fn send(stream: &mut TcpStream, value: Value) {
            serde_json::to_writer(&mut *stream, &value).unwrap();
            stream.write_all(b"\n").unwrap();
        }
        fn read(reader: &mut BufReader<TcpStream>) -> Value {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            serde_json::from_str(&line).unwrap()
        }
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let peer = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (received, pending) = mpsc::sync_channel(1);
        let (acknowledge, wait_to_acknowledge) = mpsc::sync_channel(1);
        let (finish_server, wait_to_finish) = mpsc::sync_channel(1);
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            send(&mut socket, json!({"type":"ready"}));
            let registration = read(&mut reader);
            assert_eq!(registration["type"], "set_host_tools");
            assert_eq!(registration["tools"][0]["name"], "ask");
            send(
                &mut socket,
                json!({"type":"response","id":registration["id"],"command":"set_host_tools","success":true,"data":{"toolNames":["ask"]}}),
            );
            send(
                &mut socket,
                json!({"type":"host_tool_call","id":"host-1","toolCallId":"call-1","toolName":"ask","arguments":input()}),
            );
            let result = read(&mut reader);
            assert_eq!(result["type"], "host_tool_result");
            let body: Value =
                serde_json::from_str(result["result"]["content"][0]["text"].as_str().unwrap())
                    .unwrap();
            assert_eq!(body["status"], "pending");
            received
                .send(body["questionId"].as_str().unwrap().to_owned())
                .unwrap();
            let prompt = read(&mut reader);
            assert_eq!(prompt["type"], "prompt");
            assert_eq!(prompt["streamingBehavior"], "steer");
            wait_to_acknowledge
                .recv_timeout(Duration::from_secs(3))
                .unwrap();
            send(
                &mut socket,
                json!({"type":"response","id":prompt["id"],"command":"prompt","success":true,"data":{"queued":true}}),
            );
            // 刻意不发 prompt_result，证明宿主仅等待接收确认。
            let cancelled = read(&mut reader);
            assert_eq!(cancelled["type"], "prompt");
            wait_to_finish.recv_timeout(Duration::from_secs(3)).unwrap();
        });
        let (questions, _) = collector();
        let options = ClientOptions {
            tools: vec![questions.tool()],
            default_timeout: Duration::from_secs(3),
            ..ClientOptions::default()
        };
        let (client, _) = Client::from_io(peer.try_clone().unwrap(), peer, options).unwrap();
        let id = pending.recv_timeout(Duration::from_secs(3)).unwrap();
        assert!(questions.has_pending());
        assert!(
            questions
                .respond(&answer(&id), |message| {
                    questions.wait_response(&id, Duration::ZERO, || {
                        client
                            .begin_raw(json!({"type":"prompt","message":message,"streamingBehavior":"steer"}))
                            .map_err(|error| error.to_string())
                    })
                })
                .unwrap()
                .is_err()
        );
        assert!(
            questions
                .respond(&answer(&id), |_| {
                    questions
                        .wait_response(&id, Duration::ZERO, || panic!("等待超时后不能重发答案"))
                })
                .unwrap()
                .is_err()
        );
        assert!(questions.has_pending());
        acknowledge.send(()).unwrap();
        questions
            .respond(&answer(&id), |_| {
                questions.wait_response(&id, Duration::from_secs(3), || {
                    panic!("迟到确认应复用原请求")
                })
            })
            .unwrap()
            .unwrap();
        assert!(!questions.has_pending());
        assert!(questions.state.lock().unwrap().inflight.is_empty());

        let cancelled_id = questions.enqueue(input()).unwrap();
        assert!(
            questions
                .respond(&answer(&cancelled_id), |message| {
                    questions.wait_response(&cancelled_id, Duration::ZERO, || {
                        client
                            .begin_raw(json!({"type":"prompt","message":message}))
                            .map_err(|error| error.to_string())
                    })
                })
                .unwrap()
                .is_err()
        );
        let (waiting, wait_started) = mpsc::sync_channel(1);
        let waiter_questions = questions.clone();
        let waiter_id = cancelled_id.clone();
        let waiter = thread::spawn(move || {
            waiter_questions
                .respond(&answer(&waiter_id), |_| {
                    waiting.send(()).unwrap();
                    waiter_questions.wait_response(&waiter_id, Duration::from_secs(3), || {
                        panic!("取消前不得重发")
                    })
                })
                .unwrap()
        });
        wait_started.recv_timeout(Duration::from_secs(3)).unwrap();
        questions
            .respond(&json!({"id":cancelled_id,"cancelled":true}), |_| {
                panic!("取消不得发送")
            })
            .unwrap()
            .unwrap();
        assert!(waiter.join().unwrap().is_err());
        assert!(!questions.has_pending());
        assert!(questions.state.lock().unwrap().inflight.is_empty());
        finish_server.send(()).unwrap();
        server.join().unwrap();
    }
}
