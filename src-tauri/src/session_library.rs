use crate::{history, storage};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn text<'a>(request: &'a Value, key: &str) -> Result<&'a str, String> {
    request[key].as_str().ok_or_else(|| format!("缺少 {key}"))
}

fn path_key(path: &str) -> String {
    let path = path.strip_prefix("\\\\?\\").unwrap_or(path);
    if cfg!(windows) {
        path.replace('\\', "/").to_lowercase()
    } else {
        path.to_owned()
    }
}

fn metadata(root: &Path) -> Result<Value, String> {
    match fs::read(root.join("desktop-library.json")) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if !value["archives"].is_object() {
                return Err("会话归档记录格式不正确。".into());
            }
            Ok(value)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({"archives":{}})),
        Err(e) => Err(e.to_string()),
    }
}

pub fn list(root: &Path, cwd: Option<&str>, include_archived: bool) -> Result<Value, String> {
    let saved = metadata(root)?;
    let mut sessions = history::list(root, cwd)?;
    if let Some(items) = sessions.as_array_mut() {
        for session in items.iter_mut() {
            let key = path_key(session["path"].as_str().unwrap_or_default());
            session["archived"] = json!(saved["archives"].get(key).is_some());
        }
        if !include_archived {
            items.retain(|session| session["archived"] != true);
        }
    }
    Ok(sessions)
}

fn archive(root: &Path, request: &Value) -> Result<Value, String> {
    let path = text(request, "path")?;
    let archived = request["archived"].as_bool().ok_or("缺少 archived")?;
    let snapshot = if archived {
        let canonical = history::session_path(root, Path::new(path))?;
        let key = path_key(&canonical.to_string_lossy());
        Some(
            history::list(root, None)?
                .as_array()
                .unwrap()
                .iter()
                .find(|session| path_key(session["path"].as_str().unwrap_or_default()) == key)
                .cloned()
                .ok_or("会话已移动或删除，请刷新列表。")?,
        )
    } else {
        None
    };
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(root.join("desktop-library.lock"))
        .map_err(|e| e.to_string())?;
    lock.lock().map_err(|e| e.to_string())?;
    let mut value = metadata(root)?;
    let key = path_key(
        snapshot
            .as_ref()
            .and_then(|s| s["path"].as_str())
            .unwrap_or(path),
    );
    let archives = value["archives"].as_object_mut().unwrap();
    if let Some(snapshot) = snapshot {
        archives.insert(key, snapshot);
    } else {
        archives.remove(&key);
    }
    storage::atomic_write(
        &root.join("desktop-library.json"),
        &serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?,
    )?;
    Ok(json!({"path":path,"archived":archived}))
}

fn archives(root: &Path) -> Result<Value, String> {
    let live: HashMap<_, _> = history::list(root, None)?
        .as_array()
        .unwrap()
        .iter()
        .map(|s| (path_key(s["path"].as_str().unwrap_or_default()), s.clone()))
        .collect();
    let mut items: Vec<_> = metadata(root)?["archives"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(key, old)| {
            let mut summary = live.get(key).unwrap_or(old).clone();
            summary["archived"] = json!(true);
            summary["missing"] = json!(!live.contains_key(key));
            summary
        })
        .collect();
    items.sort_by_key(|s| std::cmp::Reverse(s["updatedAt"].as_u64().unwrap_or(0)));
    Ok(json!(items))
}

fn visible_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_owned();
    }
    content
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter(|part| {
                    matches!(
                        part["type"].as_str(),
                        Some("text" | "input_text" | "output_text")
                    )
                })
                .filter_map(|part| part["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn snippet(text: &str, query: &str) -> String {
    let line = text
        .lines()
        .find(|line| line.to_lowercase().contains(query))
        .unwrap_or(text)
        .trim();
    let lower = line.to_lowercase();
    let position = lower
        .find(query)
        .map(|index| lower[..index].chars().count())
        .unwrap_or(0);
    let start = position.saturating_sub(60);
    let clipped: String = line.chars().skip(start).take(240).collect();
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        clipped,
        if line.chars().count() > start + 240 {
            "…"
        } else {
            ""
        }
    )
}

fn search(root: &Path, request: &Value) -> Result<Value, String> {
    let query = text(request, "query")?.trim().to_lowercase();
    if query.is_empty() {
        return Ok(json!({"items":[],"total":0,"nextCursor":null,"warnings":[]}));
    }
    let offset = cursor(request);
    let limit = limit(request, 30);
    let sessions = list(
        root,
        request["cwd"].as_str(),
        request["includeArchived"].as_bool().unwrap_or(false),
    )?;
    let mut total = 0usize;
    let mut items = Vec::new();
    let mut warnings = Vec::new();
    for session in sessions.as_array().unwrap() {
        let path = session["path"].as_str().unwrap_or_default();
        if let Err(error) = history::visit_messages(root, Path::new(path), |message, row| {
            if !matches!(message["role"].as_str(), Some("user" | "assistant")) {
                return;
            }
            let body = visible_text(&message["content"]);
            if !body.to_lowercase().contains(&query) {
                return;
            }
            if total >= offset && items.len() < limit {
                items.push(json!({"session":session,"messageId":row["id"],"role":message["role"],"snippet":snippet(&body,&query)}));
            }
            total += 1;
        }) {
            warnings.push(json!({"path":path,"error":error}));
        }
    }
    Ok(
        json!({"items":items,"total":total,"nextCursor":if offset+items.len()<total {Some((offset+items.len()).to_string())}else{None},"warnings":warnings}),
    )
}

#[derive(Default)]
struct Usage {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    reasoning: u64,
    total: u64,
    cost: f64,
    missing_cost: u64,
    messages: u64,
    sessions: HashSet<String>,
}

impl Usage {
    fn add(&mut self, usage: &Value, path: &str) {
        self.input += usage["input"].as_u64().unwrap_or(0);
        self.output += usage["output"].as_u64().unwrap_or(0);
        self.cache_read += usage["cacheRead"].as_u64().unwrap_or(0);
        self.cache_write += usage["cacheWrite"].as_u64().unwrap_or(0);
        self.reasoning += usage["reasoningTokens"].as_u64().unwrap_or(0);
        // 推理 tokens 属于 output，不能再次计入总量。
        self.total += usage["totalTokens"].as_u64().unwrap_or_else(|| {
            ["input", "output", "cacheRead", "cacheWrite"]
                .iter()
                .map(|key| usage[key].as_u64().unwrap_or(0))
                .sum()
        });
        if let Some(cost) = usage["cost"]["total"]
            .as_f64()
            .filter(|cost| cost.is_finite())
        {
            self.cost += cost;
        } else {
            self.missing_cost += 1;
        }
        self.messages += 1;
        self.sessions.insert(path.to_owned());
    }

    fn value(&self) -> Value {
        json!({"tokens":{"input":self.input,"output":self.output,"cacheRead":self.cache_read,"cacheWrite":self.cache_write,"reasoning":self.reasoning,"total":self.total},"cost":self.cost,"missingCost":self.missing_cost,"messages":self.messages,"sessions":self.sessions.len()})
    }
}

fn iso_day(text: &str) -> Option<i64> {
    let number = |start, end| text.get(start..end)?.parse::<i64>().ok();
    let mut year = number(0, 4)?;
    let month = number(5, 7)?;
    let date = number(8, 10)?;
    if text.get(4..5)? != "-" || text.get(7..8)? != "-" || !(1..=12).contains(&month) {
        return None;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let last = match month {
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if !(1..=last).contains(&date) {
        return None;
    }
    year -= i64::from(month <= 2);
    let era = year.div_euclid(400);
    let yoe = year - era * 400;
    let mp = month + if month > 2 { -3 } else { 9 };
    let days =
        era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + (153 * mp + 2) / 5 + date - 1 - 719468;
    if text.len() == 10 {
        return Some(days);
    }
    let hour = number(11, 13)?;
    let minute = number(14, 16)?;
    let second = number(17, 19)?;
    if !(0..24).contains(&hour) || !(0..60).contains(&minute) || !(0..=60).contains(&second) {
        return None;
    }
    let tail = text.get(19..)?;
    let offset = if let Some(index) = tail.find(['+', '-']) {
        let zone = tail.get(index..)?;
        let hours = zone.get(1..3)?.parse::<i64>().ok()?;
        let minutes = zone.get(4..6)?.parse::<i64>().ok()?;
        if hours > 23 || minutes > 59 {
            return None;
        }
        (hours * 60 + minutes) * 60 * if zone.starts_with('-') { -1 } else { 1 }
    } else {
        0
    };
    Some((days * 86400 + hour * 3600 + minute * 60 + second - offset).div_euclid(86400))
}

fn day(value: &Value) -> String {
    let days = value
        .as_i64()
        .map(|milliseconds| milliseconds.div_euclid(86_400_000))
        .or_else(|| value.as_str().and_then(iso_day));
    let Some(days) = days else {
        return "unknown".into();
    };
    // 公历换算用于 UTC 趋势分组，避免为日期统计引入额外依赖。
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let date = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    format!("{year:04}-{month:02}-{date:02}")
}

fn usage_summary(root: &Path, request: &Value) -> Result<Value, String> {
    let sessions = list(root, request["cwd"].as_str(), true)?;
    let mut totals = Usage::default();
    let mut models: BTreeMap<String, Usage> = BTreeMap::new();
    let mut projects: BTreeMap<String, Usage> = BTreeMap::new();
    let mut days: BTreeMap<String, Usage> = BTreeMap::new();
    let mut warnings = Vec::new();
    for session in sessions.as_array().unwrap() {
        let path = session["path"].as_str().unwrap_or_default();
        if let Err(error) = history::visit_messages(root, Path::new(path), |message, row| {
            if message["role"] != "assistant" || !message["usage"].is_object() {
                return;
            }
            let usage = &message["usage"];
            let date = day(message.get("timestamp").unwrap_or(&row["timestamp"]));
            if request["from"]
                .as_str()
                .is_some_and(|from| date.as_str() < from)
                || request["to"].as_str().is_some_and(|to| date.as_str() > to)
            {
                return;
            }
            totals.add(usage, path);
            let model = message["model"]
                .as_str()
                .or_else(|| message["model"]["id"].as_str())
                .unwrap_or("unknown");
            let provider = message["provider"].as_str().unwrap_or_default();
            models
                .entry(format!("{provider}/{model}").trim_matches('/').to_owned())
                .or_default()
                .add(usage, path);
            projects
                .entry(session["cwd"].as_str().unwrap_or_default().to_owned())
                .or_default()
                .add(usage, path);
            days.entry(date).or_default().add(usage, path);
        }) {
            warnings.push(json!({"path":path,"error":error}));
        }
    }
    let groups = |groups: BTreeMap<String, Usage>| {
        groups
            .into_iter()
            .map(|(key, usage)| json!({"key":key,"usage":usage.value()}))
            .collect::<Vec<_>>()
    };
    Ok(
        json!({"totals":totals.value(),"models":groups(models),"projects":groups(projects),"days":groups(days),"warnings":warnings}),
    )
}

fn cursor(request: &Value) -> usize {
    request["cursor"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn limit(request: &Value, default: usize) -> usize {
    request["limit"]
        .as_u64()
        .unwrap_or(default as u64)
        .clamp(1, 100) as usize
}

fn external_home(request: &Value) -> Result<(String, PathBuf), String> {
    let source = text(request, "source")?;
    if !matches!(source, "codex" | "zcode") {
        return Err("请选择 Codex 或 ZCode。".into());
    }
    let home = if let Some(home) = request["home"]
        .as_str()
        .filter(|home| !home.trim().is_empty())
    {
        PathBuf::from(home)
    } else if source == "codex" && std::env::var_os("CODEX_HOME").is_some() {
        PathBuf::from(std::env::var_os("CODEX_HOME").unwrap())
    } else {
        let home = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .ok_or("未找到用户目录，请选择外部助手的数据目录。")?;
        PathBuf::from(home).join(if source == "codex" {
            ".codex"
        } else {
            ".zcode"
        })
    };
    if !home.is_absolute() {
        return Err("外部助手数据目录必须是绝对路径。".into());
    }
    Ok((source.to_owned(), home))
}

fn collect_logs(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_dir() {
            collect_logs(&entry.path(), files)?;
        } else if kind.is_file() && entry.path().extension().is_some_and(|ext| ext == "jsonl") {
            files.push(entry.path());
        }
    }
    Ok(())
}

fn modified(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn codex_header(path: &Path) -> Result<Option<Value>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut session = None;
    let mut title = String::new();
    for line in BufReader::new(file).lines().take(64) {
        let line = line.map_err(|e| e.to_string())?;
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if row["type"] == "session_meta" {
            let payload = &row["payload"];
            if let Some(id) = payload["id"].as_str() {
                session = Some(
                    json!({"id":id,"source":"codex","path":path,"cwd":payload["cwd"].as_str().unwrap_or_default(),"updatedAt":modified(path),"format":"jsonl"}),
                );
            }
        }
        if title.is_empty() {
            let payload = &row["payload"];
            if row["type"] == "response_item" && payload["role"] == "user" {
                title = visible_text(&payload["content"]);
            }
            if row["type"] == "event_msg" && payload["type"] == "user_message" {
                title = payload["message"].as_str().unwrap_or_default().to_owned();
            }
        }
        if session.is_some() && !title.is_empty() {
            break;
        }
    }
    if let Some(session) = session.as_mut() {
        session["title"] = json!(
            title
                .lines()
                .next()
                .unwrap_or_default()
                .chars()
                .take(100)
                .collect::<String>()
        );
    }
    Ok(session)
}

fn database(path: &Path) -> Result<Connection, String> {
    // 保留 WAL 可见性，读取一个已提交快照；历史记录不会被写回。
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("无法读取会话数据库：{e}"))?;
    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|e| e.to_string())?;
    connection
        .execute_batch("PRAGMA query_only = ON; BEGIN DEFERRED TRANSACTION;")
        .map_err(|e| e.to_string())?;
    Ok(connection)
}

fn columns(connection: &Connection, table: &str) -> Result<HashSet<String>, String> {
    connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<HashSet<_>>>()
        .map_err(|e| e.to_string())
}

fn codex_catalog(home: &Path) -> Result<(Vec<Value>, Vec<Value>), String> {
    let mut warnings = Vec::new();
    let mut files = Vec::new();
    for directory in [home.join("sessions"), home.join("archived_sessions")] {
        collect_logs(&directory, &mut files)?;
    }
    let mut by_id: HashMap<String, Value> = HashMap::new();
    for path in files {
        match codex_header(&path) {
            Ok(Some(session)) => {
                let id = session["id"].as_str().unwrap().to_owned();
                if by_id
                    .get(&id)
                    .is_none_or(|old| old["updatedAt"].as_u64() < session["updatedAt"].as_u64())
                {
                    by_id.insert(id, session);
                }
            }
            Ok(None) => {}
            Err(error) => warnings.push(json!({"path":path,"error":error})),
        }
    }
    for directory in [home.to_path_buf(), home.join("sqlite")] {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        let latest = entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let version = entry
                    .file_name()
                    .to_string_lossy()
                    .strip_prefix("state_")?
                    .strip_suffix(".sqlite")?
                    .parse::<u32>()
                    .ok()?;
                Some((version, entry.path()))
            })
            .max_by_key(|(version, _)| *version);
        let Some((_, path)) = latest else { continue };
        let result = (|| -> Result<(), String> {
            let connection = database(&path)?;
            let fields = columns(&connection, "threads")?;
            if !fields.contains("id") {
                return Err("Codex 会话索引格式暂不支持。".into());
            }
            let optional = |key: &str| {
                if fields.contains(key) {
                    key.to_owned()
                } else {
                    "NULL".into()
                }
            };
            let updated = if fields.contains("updated_at_ms") {
                "updated_at_ms"
            } else if fields.contains("updated_at") {
                "updated_at * 1000"
            } else {
                "NULL"
            };
            let sql = format!(
                "SELECT id, {}, {}, {}, {}, {}, {updated} FROM threads",
                optional("name"),
                optional("title"),
                optional("rollout_path"),
                optional("history_mode"),
                optional("cwd")
            );
            let mut query = connection.prepare(&sql).map_err(|e| e.to_string())?;
            let records = query
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<u64>>(6)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for record in records {
                let (id, name, title, rollout, mode, cwd, updated) =
                    record.map_err(|e| e.to_string())?;
                let paginated = mode.as_deref() == Some("paginated");
                if paginated
                    || rollout
                        .as_deref()
                        .is_some_and(|path| Path::new(path).is_file())
                {
                    let selected = if paginated {
                        directory.join("thread_history_1.sqlite")
                    } else {
                        PathBuf::from(rollout.as_deref().unwrap())
                    };
                    if !selected.is_file() {
                        warnings.push(json!({"path":selected,"error":"Codex 分页历史暂不可用。"}));
                        continue;
                    }
                    let mut session = by_id
                        .remove(&id)
                        .unwrap_or_else(|| json!({"id":id,"source":"codex"}));
                    session["path"] = json!(selected);
                    session["format"] = json!(if paginated { "paginated" } else { "jsonl" });
                    if let Some(cwd) = cwd {
                        session["cwd"] = json!(cwd);
                    }
                    if let Some(updated) = updated {
                        session["updatedAt"] = json!(updated);
                    }
                    if let Some(title) = name.or(title).filter(|title| !title.is_empty()) {
                        session["title"] = json!(title);
                    }
                    by_id.insert(id, session);
                } else if let Some(session) = by_id.get_mut(&id) {
                    if let Some(title) = name.or(title).filter(|title| !title.is_empty()) {
                        session["title"] = json!(title);
                    }
                }
            }
            Ok(())
        })();
        if let Err(error) = result {
            warnings.push(json!({"path":path,"error":error}));
        }
    }
    Ok((by_id.into_values().collect(), warnings))
}

fn zcode_catalog(home: &Path) -> Result<Vec<Value>, String> {
    let path = home.join("cli/db/db.sqlite");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let connection = database(&path)?;
    let mut query = connection.prepare("SELECT id, directory, title, time_updated FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC").map_err(|e| e.to_string())?;
    query.query_map([], |row| Ok(json!({"id":row.get::<_,String>(0)?,"source":"zcode","path":path,"cwd":row.get::<_,Option<String>>(1)?.unwrap_or_default(),"title":row.get::<_,Option<String>>(2)?.unwrap_or_default(),"updatedAt":row.get::<_,Option<u64>>(3)?.unwrap_or(0),"format":"database"}))).map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

fn external_sessions(request: &Value) -> Result<Value, String> {
    let (source, home) = external_home(request)?;
    let (mut sessions, warnings) = if source == "codex" {
        codex_catalog(&home)?
    } else {
        (zcode_catalog(&home)?, Vec::new())
    };
    let query = request["query"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    sessions.retain(|session| {
        ["title", "cwd", "id"].iter().any(|field| {
            session[field]
                .as_str()
                .unwrap_or_default()
                .to_lowercase()
                .contains(&query)
        }) && request["cwd"].as_str().is_none_or(|cwd| {
            path_key(session["cwd"].as_str().unwrap_or_default()) == path_key(cwd)
        })
    });
    sessions.sort_by_key(|session| std::cmp::Reverse(session["updatedAt"].as_u64().unwrap_or(0)));
    let total = sessions.len();
    let start = cursor(request).min(total);
    let end = (start + limit(request, 30)).min(total);
    Ok(
        json!({"items":sessions[start..end],"total":total,"home":home,"nextCursor":if end<total {Some(end.to_string())}else{None},"warnings":warnings}),
    )
}

fn push_codex(messages: &mut Vec<Value>, row: &Value, ordinal: usize) {
    let payload = row.get("payload").unwrap_or(row);
    let event = row["type"] == "event_msg";
    let role = if event {
        match payload["type"].as_str() {
            Some("user_message") => "user",
            Some("agent_message") => "assistant",
            _ => return,
        }
    } else {
        payload["role"].as_str().unwrap_or_default()
    };
    if !matches!(role, "user" | "assistant") || payload["channel"] == "analysis" {
        return;
    }
    let body = if event {
        payload["message"].as_str().unwrap_or_default().to_owned()
    } else {
        visible_text(&payload["content"])
    };
    if body.trim().is_empty() {
        return;
    }
    let mirror = if event { "event" } else { "response" };
    if messages.last().is_some_and(|last| {
        last["role"] == role && last["content"] == body && last["_mirror"] != mirror
    }) {
        return;
    }
    let id = payload["id"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| format!("line-{ordinal}"));
    messages.push(
        json!({"id":id,"role":role,"content":body,"timestamp":row["timestamp"],"_mirror":mirror}),
    );
}

fn codex_history(path: &Path) -> Result<(Vec<Value>, Vec<Value>), String> {
    let mut messages: Vec<Value> = Vec::new();
    let mut warnings = Vec::new();
    let reader = BufReader::new(fs::File::open(path).map_err(|e| e.to_string())?);
    for (ordinal, line) in reader.lines().enumerate() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let row: Value = match serde_json::from_str(&line) {
            Ok(row) => row,
            Err(_) => {
                warnings.push(json!({"line":ordinal+1,"error":"部分记录尚未写完或无法解析。"}));
                continue;
            }
        };
        match row["type"].as_str() {
            Some("response_item" | "event_msg") => {
                if row["payload"]["type"] == "thread_rolled_back" {
                    let mut turns = row["payload"]["num_turns"].as_u64().unwrap_or(0);
                    while turns > 0 {
                        let Some(start) = messages
                            .iter()
                            .rposition(|message| message["role"] == "user")
                        else {
                            break;
                        };
                        messages.truncate(start);
                        turns -= 1;
                    }
                } else {
                    push_codex(&mut messages, &row, ordinal);
                }
            }
            Some("compacted") => {
                if let Some(replacement) = row["payload"]["replacement_history"].as_array() {
                    messages.clear();
                    for (index, item) in replacement.iter().enumerate() {
                        push_codex(&mut messages, item, ordinal * 10000 + index);
                    }
                }
            }
            _ => {}
        }
    }
    for message in &mut messages {
        message.as_object_mut().unwrap().remove("_mirror");
    }
    Ok((messages, warnings))
}

fn codex_paginated(path: &Path, id: &str) -> Result<Vec<Value>, String> {
    let connection = database(path)?;
    let mut query = connection.prepare("SELECT item_id, created_at_ms, item_json FROM thread_items WHERE thread_id = ?1 ORDER BY rollout_ordinal, item_id").map_err(|e| e.to_string())?;
    let mut records = query.query([id]).map_err(|e| e.to_string())?;
    let mut messages = Vec::new();
    while let Some(record) = records.next().map_err(|e| e.to_string())? {
        let raw: String = record.get(2).map_err(|e| e.to_string())?;
        let item: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let (role, body) = match item["type"].as_str() {
            Some("userMessage") => ("user", visible_text(&item["content"])),
            Some("agentMessage" | "plan") => (
                "assistant",
                item["text"].as_str().unwrap_or_default().to_owned(),
            ),
            _ => continue,
        };
        if !body.is_empty() {
            messages.push(json!({"id":record.get::<_,String>(0).map_err(|e| e.to_string())?,"role":role,"content":body,"timestamp":record.get::<_,Option<u64>>(1).map_err(|e| e.to_string())?}));
        }
    }
    Ok(messages)
}

fn zcode_history(path: &Path, id: &str) -> Result<Vec<Value>, String> {
    let connection = database(path)?;
    let session_fields = columns(&connection, "session")?;
    let revert = if session_fields.contains("revert") {
        connection
            .query_row("SELECT revert FROM session WHERE id = ?1", [id], |row| {
                row.get::<_, Option<String>>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .flatten()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let mut parts: HashMap<String, Vec<(String, Value)>> = HashMap::new();
    let order = |fields: &HashSet<String>| {
        if fields.contains("sequence") {
            "coalesce(sequence,time_created), time_created, id"
        } else {
            "time_created, id"
        }
    };
    let part_fields = columns(&connection, "part")?;
    let mut query = connection
        .prepare(&format!(
            "SELECT id, message_id, data FROM part WHERE session_id = ?1 ORDER BY {}",
            order(&part_fields)
        ))
        .map_err(|e| e.to_string())?;
    let mut records = query.query([id]).map_err(|e| e.to_string())?;
    while let Some(record) = records.next().map_err(|e| e.to_string())? {
        let raw: String = record.get(2).map_err(|e| e.to_string())?;
        parts
            .entry(record.get(1).map_err(|e| e.to_string())?)
            .or_default()
            .push((
                record.get(0).map_err(|e| e.to_string())?,
                serde_json::from_str(&raw).map_err(|e| e.to_string())?,
            ));
    }
    let message_fields = columns(&connection, "message")?;
    let mut query = connection
        .prepare(&format!(
            "SELECT id, time_created, data FROM message WHERE session_id = ?1 ORDER BY {}",
            order(&message_fields)
        ))
        .map_err(|e| e.to_string())?;
    let mut records = query.query([id]).map_err(|e| e.to_string())?;
    let mut messages = Vec::new();
    while let Some(record) = records.next().map_err(|e| e.to_string())? {
        let message_id: String = record.get(0).map_err(|e| e.to_string())?;
        let reverted = revert["messageID"] == message_id;
        if reverted && !revert["partID"].is_string() {
            break;
        }
        let raw: String = record.get(2).map_err(|e| e.to_string())?;
        let data: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let role = data["role"].as_str().unwrap_or_default();
        if matches!(role, "user" | "assistant")
            && data["semantics"]["uiVisibility"] != "hidden"
            && data["semantics"]["transcriptVisibility"] != "hidden"
            && !matches!(
                data["semantics"]["kind"].as_str(),
                Some("system_reminder" | "todo_reminder" | "timeline_event")
            )
        {
            let mut body = Vec::new();
            for (part_id, part) in parts.get(&message_id).into_iter().flatten() {
                if reverted && revert["partID"] == *part_id {
                    break;
                }
                if part["type"] == "text" && part["ignored"] != true && part["synthetic"] != true {
                    if let Some(text) = part["text"].as_str().filter(|text| !text.is_empty()) {
                        body.push(text);
                    }
                }
            }
            if !body.is_empty() {
                messages.push(json!({"id":message_id,"role":role,"content":body.join("\n\n"),"timestamp":record.get::<_,Option<u64>>(1).map_err(|e|e.to_string())?}));
            }
        }
        if reverted {
            break;
        }
    }
    Ok(messages)
}

fn external_history(request: &Value) -> Result<Value, String> {
    let (source, home) = external_home(request)?;
    let home = fs::canonicalize(home).map_err(|e| e.to_string())?;
    let path = fs::canonicalize(text(request, "path")?).map_err(|e| e.to_string())?;
    if !path.starts_with(&home) {
        return Err("请选择该外部助手数据目录中的会话。".into());
    }
    let id = text(request, "id")?;
    let (messages, warnings) = if source == "zcode" {
        if path != fs::canonicalize(home.join("cli/db/db.sqlite")).map_err(|e| e.to_string())? {
            return Err("请选择 ZCode 会话数据库。".into());
        }
        (zcode_history(&path, id)?, Vec::new())
    } else if path
        .file_name()
        .is_some_and(|name| name == "thread_history_1.sqlite")
    {
        (codex_paginated(&path, id)?, Vec::new())
    } else {
        if path.extension().is_none_or(|ext| ext != "jsonl") {
            return Err("请选择 Codex 会话日志。".into());
        }
        codex_history(&path)?
    };
    let end = request["cursor"]
        .as_str()
        .and_then(|cursor| cursor.parse::<usize>().ok())
        .unwrap_or(messages.len())
        .min(messages.len());
    let start = end.saturating_sub(limit(request, 80));
    Ok(
        json!({"messages":messages[start..end],"nextCursor":if start>0 {Some(start.to_string())}else{None},"total":messages.len(),"warnings":warnings}),
    )
}

pub fn execute(root: &Path, request: &Value) -> Result<Value, String> {
    match text(request, "type")? {
        "session.search" => search(root, request),
        "session.archive" => archive(root, request),
        "session.archives" => archives(root),
        "session.locate" => history::locate(
            root,
            Path::new(text(request, "path")?),
            text(request, "messageId")?,
            limit(request, 80),
        ),
        "session.after" => history::after(
            root,
            Path::new(text(request, "path")?),
            text(request, "cursor")?,
            request["limit"].as_u64().unwrap_or(100).clamp(1, 256) as usize,
        ),
        "usage.summary" => usage_summary(root, request),
        "external.sessions" => external_sessions(request),
        "external.history" => external_history(request),
        _ => Err("未知的会话资料命令。".into()),
    }
}

#[cfg(test)]
#[path = "session_library/tests.rs"]
mod tests;
