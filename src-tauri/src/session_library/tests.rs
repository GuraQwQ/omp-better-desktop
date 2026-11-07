use super::*;
use std::io::Write;

struct Fixture {
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target/session-library-tests")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(root.join("omp/agent/sessions/project")).unwrap();
        Self { root }
    }
    fn log(&self, name: &str, rows: &[Value]) -> PathBuf {
        let path = self.root.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let content = rows
            .iter()
            .map(|row| serde_json::to_string(row).unwrap())
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&path, format!("{content}\n")).unwrap();
        path
    }
    fn omp(&self) -> PathBuf {
        self.log("omp/agent/sessions/project/one.jsonl", &[
            json!({"type":"session","id":"one","cwd":"D:/项目"}),
            json!({"type":"message","id":"u1","parentId":null,"timestamp":"2026-11-06T10:00:00Z","message":{"role":"user","content":"中文 needle first"}}),
            json!({"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[{"type":"text","text":"first answer"}],"provider":"test","model":"m1","timestamp":1793923200000u64,"usage":{"input":100,"output":20,"cacheRead":10,"cacheWrite":5,"reasoningTokens":10,"totalTokens":135,"cost":{"total":0.125}}}}),
            json!({"type":"message","id":"abandoned","parentId":"a1","message":{"role":"user","content":"discarded needle"}}),
            json!({"type":"message","id":"discarded","parentId":"abandoned","message":{"role":"assistant","usage":{"input":999999,"cost":{"total":99}}}}),
            json!({"type":"message","id":"u2","parentId":"a1","timestamp":"2026-11-07T10:00:00Z","message":{"role":"user","content":"retained needle"}}),
            json!({"type":"message","id":"a2","parentId":"u2","timestamp":"2026-11-07T10:00:00Z","message":{"role":"assistant","content":"second answer","provider":"test","model":"m2","usage":{"input":200,"output":40}}}),
        ])
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let boundary =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/session-library-tests");
        assert!(self.root.starts_with(&boundary) && self.root != boundary);
        fs::remove_dir_all(&self.root).unwrap();
    }
}

#[test]
fn search_locates_current_branch_and_observes_appends() {
    let fixture = Fixture::new();
    let path = fixture.omp();
    let request = json!({"type":"session.search","query":"needle","limit":1});
    let first = execute(&fixture.root, &request).unwrap();
    assert_eq!(first["total"], 2);
    assert_eq!(first["items"][0]["messageId"], "u1");
    assert_eq!(first["nextCursor"], "1");
    let second = execute(
        &fixture.root,
        &json!({"type":"session.search","query":"needle","cursor":"1"}),
    )
    .unwrap();
    assert_eq!(second["items"][0]["messageId"], "u2");
    let target = history::locate(&fixture.root, &path, "u2", 1).unwrap();
    assert_eq!(target["messages"][0]["id"], "u2");
    assert!(history::locate(&fixture.root, &path, "abandoned", 10).is_err());
    let target = execute(
        &fixture.root,
        &json!({"type":"session.locate","path":path,"messageId":"u1","limit":1}),
    )
    .unwrap();
    let mut cursor = target["afterCursor"].as_str().map(str::to_owned);
    let mut following = Vec::new();
    while let Some(current) = cursor {
        let page = execute(
            &fixture.root,
            &json!({"type":"session.after","path":path,"cursor":current,"limit":1}),
        )
        .unwrap();
        following.extend(
            page["messages"]
                .as_array()
                .unwrap()
                .iter()
                .map(|message| message["id"].as_str().unwrap().to_owned()),
        );
        cursor = page["afterCursor"].as_str().map(str::to_owned);
        assert!(following.len() <= 3);
    }
    assert_eq!(following, ["a1", "u2", "a2"]);
    let mut file = OpenOptions::new().append(true).open(&path).unwrap();
    writeln!(file,"{}",json!({"type":"message","id":"u3","parentId":"a2","message":{"role":"user","content":"new needle"}})).unwrap();
    assert_eq!(execute(&fixture.root, &request).unwrap()["total"], 3);
    assert_eq!(
        execute(
            &fixture.root,
            &json!({"type":"session.after","path":path,"cursor":"4","limit":1})
        )
        .unwrap()["messages"][0]["id"],
        "u3"
    );
    drop(file);
    history::clear_cache(&fixture.root);
}

#[test]
fn after_pages_are_bounded_and_handle_empty_or_exhausted_history() {
    let fixture = Fixture::new();
    let mut rows = vec![json!({"type":"session","id":"many","cwd":"D:/项目"})];
    for index in 0..350 {
        rows.push(json!({"type":"message","id":format!("m{index}"),"parentId":if index==0 {None}else{Some(format!("m{}",index-1))},"message":{"role":"user","content":format!("消息 {index}")}}));
    }
    let path = fixture.log("omp/agent/sessions/project/many.jsonl", &rows);
    let original = fs::read(&path).unwrap();
    let page = execute(
        &fixture.root,
        &json!({"type":"session.after","path":path,"cursor":"1","limit":1000}),
    )
    .unwrap();
    assert_eq!(page["messages"].as_array().unwrap().len(), 256);
    assert_eq!(page["messages"][0]["id"], "m1");
    assert_eq!(page["messages"][255]["id"], "m256");
    assert_eq!(page["afterCursor"], "257");
    let tail = execute(
        &fixture.root,
        &json!({"type":"session.after","path":path,"cursor":"257","limit":256}),
    )
    .unwrap();
    assert_eq!(tail["messages"].as_array().unwrap().len(), 93);
    assert_eq!(tail["messages"][92]["id"], "m349");
    assert!(tail["afterCursor"].is_null());
    for cursor in ["350", "9999", "invalid"] {
        assert!(
            execute(
                &fixture.root,
                &json!({"type":"session.after","path":path,"cursor":cursor})
            )
            .unwrap()["messages"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    assert_eq!(fs::read(&path).unwrap(), original);
    let empty = fixture.log(
        "omp/agent/sessions/project/empty.jsonl",
        &[json!({"type":"session","id":"empty","cwd":"D:/项目"})],
    );
    assert!(
        execute(
            &fixture.root,
            &json!({"type":"session.after","path":empty,"cursor":"0"})
        )
        .unwrap()["messages"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    history::clear_cache(&fixture.root);
}

#[test]
fn archive_is_idempotent_and_restores_missing_sources() {
    let fixture = Fixture::new();
    let path = fixture.omp();
    let original = fs::read(&path).unwrap();
    let archive = json!({"type":"session.archive","path":path,"archived":true});
    execute(&fixture.root, &archive).unwrap();
    execute(&fixture.root, &archive).unwrap();
    fs::write(
        fixture.root.join(".desktop-library.json.pending"),
        b"interrupted",
    )
    .unwrap();
    execute(&fixture.root, &archive).unwrap();
    assert!(!fixture.root.join(".desktop-library.json.pending").exists());
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(
        list(&fixture.root, None, false)
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        archives(&fixture.root).unwrap().as_array().unwrap().len(),
        1
    );
    assert_eq!(
        execute(
            &fixture.root,
            &json!({"type":"session.search","query":"needle"})
        )
        .unwrap()["total"],
        0
    );
    assert_eq!(
        execute(
            &fixture.root,
            &json!({"type":"session.search","query":"needle","includeArchived":true})
        )
        .unwrap()["total"],
        2
    );
    assert!(path.starts_with(&fixture.root));
    fs::remove_file(&path).unwrap();
    assert_eq!(archives(&fixture.root).unwrap()[0]["missing"], true);
    let restore = json!({"type":"session.archive","path":path,"archived":false});
    execute(&fixture.root, &restore).unwrap();
    execute(&fixture.root, &restore).unwrap();
    assert!(
        archives(&fixture.root)
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(!path.exists());
    history::clear_cache(&fixture.root);
}

#[test]
fn usage_keeps_reasoning_in_output_and_reports_missing_cost() {
    let fixture = Fixture::new();
    fixture.omp();
    let summary = execute(&fixture.root, &json!({"type":"usage.summary"})).unwrap();
    assert_eq!(summary["totals"]["tokens"]["total"], 375);
    assert_eq!(summary["totals"]["tokens"]["reasoning"], 10);
    assert_eq!(summary["totals"]["cost"], 0.125);
    assert_eq!(summary["totals"]["missingCost"], 1);
    assert_eq!(summary["totals"]["sessions"], 1);
    assert_eq!(summary["models"].as_array().unwrap().len(), 2);
    assert_eq!(summary["days"].as_array().unwrap().len(), 2);
    assert_eq!(day(&json!(0)), "1970-01-01");
    assert_eq!(day(&json!(1709164800000u64)), "2024-02-29");
    assert_eq!(day(&json!("2026-11-07T00:30:00+08:00")), "2026-11-06");
    assert_eq!(day(&json!("2026-02-30T00:00:00Z")), "unknown");
    let filtered = execute(
        &fixture.root,
        &json!({"type":"usage.summary","from":"2026-11-07","to":"2026-11-07"}),
    )
    .unwrap();
    assert_eq!(filtered["totals"]["tokens"]["total"], 240);
    history::clear_cache(&fixture.root);
}

#[test]
fn codex_mirrors_rollback_and_compaction_preserve_visible_history() {
    let fixture = Fixture::new();
    let user = |text: &str| json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":text}]}});
    let path = fixture.log("codex/sessions/one.jsonl", &[
        json!({"type":"session_meta","payload":{"id":"one","cwd":"D:/项目"}}),
        user("first"),
        json!({"type":"event_msg","payload":{"type":"user_message","message":"first"}}),
        json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"answer"}]}}),
        json!({"type":"event_msg","payload":{"type":"agent_message","message":"answer"}}),
        json!({"type":"response_item","payload":{"type":"message","role":"assistant","channel":"analysis","content":[{"type":"output_text","text":"private reasoning"}]}}),
        user("rolled back"),
        json!({"type":"event_msg","payload":{"type":"thread_rolled_back","num_turns":1}}),
    ]);
    let bytes = fs::read(&path).unwrap();
    let home = fixture.root.join("codex");
    let catalog = execute(
        &fixture.root,
        &json!({"type":"external.sessions","source":"codex","home":home}),
    )
    .unwrap();
    assert_eq!(catalog["total"], 1);
    let history = execute(&fixture.root,&json!({"type":"external.history","source":"codex","home":home,"path":path,"id":"one","limit":1})).unwrap();
    assert_eq!(history["total"], 2);
    assert_eq!(history["messages"][0]["content"], "answer");
    assert_eq!(history["nextCursor"], "1");
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let compacted = fixture.log("codex/sessions/two.jsonl", &[
        user("old"),
        json!({"type":"compacted","payload":{"replacement_history":[{"type":"message","role":"user","content":[{"type":"input_text","text":"retained"}]}]}}),
    ]);
    assert_eq!(
        codex_history(&compacted).unwrap().0[0]["content"],
        "retained"
    );
}

#[test]
fn codex_state_locator_and_paginated_history_are_read_only() {
    let fixture = Fixture::new();
    let home = fixture.root.join("codex");
    fs::create_dir_all(&home).unwrap();
    let state = home.join("state_5.sqlite");
    let connection = Connection::open(&state).unwrap();
    connection.execute_batch("CREATE TABLE threads(id TEXT, name TEXT, title TEXT, rollout_path TEXT, history_mode TEXT, cwd TEXT, updated_at_ms INTEGER);").unwrap();
    connection
        .execute(
            "INSERT INTO threads VALUES(?1,?2,NULL,NULL,'paginated',?3,10)",
            ["one", "中文标题", "D:/项目"],
        )
        .unwrap();
    drop(connection);
    let path = home.join("thread_history_1.sqlite");
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TABLE thread_items(thread_id TEXT,item_id TEXT,created_at_ms INTEGER,item_json TEXT,rollout_ordinal INTEGER);").unwrap();
    for (index, item) in [
        json!({"type":"userMessage","content":[{"type":"text","text":"question"}]}),
        json!({"type":"reasoning","text":"hidden"}),
        json!({"type":"agentMessage","text":"answer"}),
    ]
    .iter()
    .enumerate()
    {
        connection
            .execute(
                "INSERT INTO thread_items VALUES('one',?1,10,?2,?3)",
                rusqlite::params![format!("i{index}"), item.to_string(), index],
            )
            .unwrap();
    }
    drop(connection);
    let original = fs::read(&path).unwrap();
    let catalog = execute(
        &fixture.root,
        &json!({"type":"external.sessions","source":"codex","home":home}),
    )
    .unwrap();
    assert_eq!(catalog["items"][0]["title"], "中文标题");
    let history = execute(
        &fixture.root,
        &json!({"type":"external.history","source":"codex","home":home,"path":path,"id":"one"}),
    )
    .unwrap();
    assert_eq!(history["messages"].as_array().unwrap().len(), 2);
    assert_eq!(fs::read(&path).unwrap(), original);
}

#[test]
fn zcode_sqlite_reads_text_and_omits_reverted_parts_without_mutation() {
    let fixture = Fixture::new();
    let home = fixture.root.join("zcode");
    let path = home.join("cli/db/db.sqlite");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TABLE session(id TEXT,parent_id TEXT,directory TEXT,title TEXT,time_updated INTEGER,revert TEXT); CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,data TEXT); CREATE TABLE part(id TEXT,message_id TEXT,session_id TEXT,time_created INTEGER,data TEXT);").unwrap();
    connection
        .execute(
            "INSERT INTO session VALUES('one',NULL,'D:/项目','中文标题',10,?1)",
            [json!({"messageID":"a1","partID":"cut"}).to_string()],
        )
        .unwrap();
    for (id, role) in [("u1", "user"), ("a1", "assistant"), ("a2", "assistant")] {
        connection
            .execute(
                "INSERT INTO message VALUES(?1,'one',?2,?3)",
                rusqlite::params![
                    id,
                    if id == "u1" {
                        1
                    } else if id == "a1" {
                        2
                    } else {
                        3
                    },
                    json!({"role":role}).to_string()
                ],
            )
            .unwrap();
    }
    for (index, (id, message, data)) in [
        ("u-text", "u1", json!({"type":"text","text":"question"})),
        (
            "thinking",
            "a1",
            json!({"type":"reasoning","text":"hidden"}),
        ),
        ("answer", "a1", json!({"type":"text","text":"answer"})),
        ("cut", "a1", json!({"type":"text","text":"discarded"})),
        ("after", "a2", json!({"type":"text","text":"later"})),
    ]
    .iter()
    .enumerate()
    {
        connection
            .execute(
                "INSERT INTO part VALUES(?1,?2,'one',?3,?4)",
                rusqlite::params![id, message, index, data.to_string()],
            )
            .unwrap();
    }
    drop(connection);
    let original = fs::read(&path).unwrap();
    let catalog = execute(
        &fixture.root,
        &json!({"type":"external.sessions","source":"zcode","home":home}),
    )
    .unwrap();
    assert_eq!(catalog["total"], 1);
    let history = execute(
        &fixture.root,
        &json!({"type":"external.history","source":"zcode","home":home,"path":path,"id":"one"}),
    )
    .unwrap();
    assert_eq!(history["total"], 2);
    assert_eq!(history["messages"][1]["content"], "answer");
    assert_eq!(fs::read(&path).unwrap(), original);
    let missing = fixture.root.join("missing-zcode");
    assert_eq!(
        execute(
            &fixture.root,
            &json!({"type":"external.sessions","source":"zcode","home":missing})
        )
        .unwrap()["total"],
        0
    );
    assert!(!missing.exists());
}

#[test]
fn concurrent_archives_keep_both_markers_and_unicode_snippets() {
    let fixture = Fixture::new();
    let first = fixture.omp();
    let second = fixture.log(
        "omp/agent/sessions/project/two.jsonl",
        &[json!({"type":"session","id":"two","cwd":"D:/项目"})],
    );
    let threads: Vec<_> = [first, second]
        .into_iter()
        .map(|path| {
            let root = fixture.root.clone();
            std::thread::spawn(move || {
                execute(
                    &root,
                    &json!({"type":"session.archive","path":path,"archived":true}),
                )
                .unwrap()
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    assert_eq!(
        archives(&fixture.root).unwrap().as_array().unwrap().len(),
        2
    );
    let text = format!("{}NeEdLe后续", "前".repeat(400));
    let preview = snippet(&text, "needle");
    assert!(preview.contains("NeEdLe"));
    assert!(preview.starts_with('…'));
    history::clear_cache(&fixture.root);
}
