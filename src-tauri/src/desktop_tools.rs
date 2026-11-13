use base64::{Engine, engine::general_purpose::STANDARD};
use rusqlite::{Connection, OptionalExtension, Row, TransactionBehavior, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

type Result<T> = std::result::Result<T, String>;

fn text<'a>(request: &'a Value, key: &str) -> Result<&'a str> {
    request[key].as_str().ok_or_else(|| format!("缺少 {key}"))
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn database(root: &Path) -> Result<Connection> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let connection =
        Connection::open(root.join("desktop-tools.sqlite3")).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection.execute_batch("PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, cwd TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(cwd,path));
        CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY, name TEXT NOT NULL, cwd TEXT NOT NULL, prompt TEXT NOT NULL, next_at INTEGER NOT NULL, interval_minutes INTEGER, enabled INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, job_id TEXT NOT NULL, job TEXT NOT NULL, status TEXT NOT NULL, claimed_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, session_id TEXT, path TEXT, error TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS one_running_job ON runs(job_id) WHERE status='running';
        CREATE INDEX IF NOT EXISTS due_schedules ON schedules(enabled,next_at);
").map_err(|error| error.to_string())?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version < 2 {
        connection.execute_batch("BEGIN IMMEDIATE; DELETE FROM state WHERE key GLOB 'card:card-*'; PRAGMA user_version=2; COMMIT;").map_err(|error| error.to_string())?;
    }
    Ok(connection)
}

fn absolute(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err("请使用完整路径。".into());
    }
    Ok(path.to_owned())
}

fn cwd(value: &str) -> Result<String> {
    let path = absolute(value)?
        .canonicalize()
        .map_err(|error| format!("无法打开项目目录：{error}"))?;
    if !path.is_dir() {
        return Err("请选择项目目录。".into());
    }
    Ok(crate::platform::external_path(&path)
        .to_string_lossy()
        .into_owned())
}

fn artifact_kind(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "html",
        "md" | "markdown" => "markdown",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "ico" | "svg" => "image",
        _ => "text",
    }
}

fn artifact_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(
        json!({"id":row.get::<_,String>(0)?,"path":row.get::<_,String>(1)?,"name":row.get::<_,String>(2)?,"kind":row.get::<_,String>(3)?}),
    )
}

fn artifact_list(connection: &Connection, project: &str) -> Result<Value> {
    let mut query = connection.prepare("SELECT id,path,name,kind FROM artifacts WHERE cwd=?1 COLLATE NOCASE ORDER BY created_at DESC").map_err(|error| error.to_string())?;
    let items = query
        .query_map([project], artifact_row)
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    Ok(json!({"items":items}))
}

fn artifact_read(connection: &Connection, id: &str) -> Result<Value> {
    let mut item = connection
        .query_row(
            "SELECT id,path,name,kind FROM artifacts WHERE id=?1",
            [id],
            artifact_row,
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or("登记已移除，请刷新工具库。")?;
    let path = Path::new(item["path"].as_str().unwrap());
    let limit = if item["kind"] == "image" {
        16 * 1024 * 1024
    } else {
        8 * 1024 * 1024
    };
    let file = File::open(path).map_err(|error| format!("无法读取文件，登记仍保留：{error}"))?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "文件超过 {} MiB，请在对应应用中打开。",
            limit / (1024 * 1024)
        ));
    }
    if item["kind"] == "image" {
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mime = match extension.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "avif" => "image/avif",
            _ => "image/bmp",
        };
        item["content"] = json!(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
    } else {
        let content =
            std::str::from_utf8(&bytes).map_err(|_| "文件不是 UTF-8 文本，请在对应应用中打开。")?;
        if content.contains('\0') {
            return Err("该文件为二进制，请在对应应用中打开。".into());
        }
        item["content"] = json!(content.strip_prefix('\u{feff}').unwrap_or(content));
    }
    Ok(item)
}

fn job_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(
        json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"cwd":row.get::<_,String>(2)?,"prompt":row.get::<_,String>(3)?,"nextAt":row.get::<_,i64>(4)?,"intervalMinutes":row.get::<_,Option<i64>>(5)?,"enabled":row.get::<_,bool>(6)?}),
    )
}

fn schedule_list(connection: &Connection) -> Result<Value> {
    let mut query = connection.prepare("SELECT id,name,cwd,prompt,next_at,interval_minutes,enabled FROM schedules ORDER BY next_at,name").map_err(|error| error.to_string())?;
    let jobs = query
        .query_map([], job_row)
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    let mut query = connection.prepare("SELECT id,job_id,job,status,claimed_at,started_at,finished_at,session_id,path,error FROM runs ORDER BY claimed_at DESC,id").map_err(|error| error.to_string())?;
    let runs = query.query_map([], |row| {
        let snapshot: String = row.get(2)?;
        Ok(json!({"id":row.get::<_,String>(0)?,"runId":row.get::<_,String>(0)?,"jobId":row.get::<_,String>(1)?,"job":serde_json::from_str::<Value>(&snapshot).unwrap_or(Value::Null),"status":row.get::<_,String>(3)?,"claimedAt":row.get::<_,i64>(4)?,"startedAt":row.get::<_,Option<i64>>(5)?,"finishedAt":row.get::<_,Option<i64>>(6)?,"sessionId":row.get::<_,Option<String>>(7)?,"path":row.get::<_,Option<String>>(8)?,"error":row.get::<_,Option<String>>(9)?}))
    }).map_err(|error| error.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|error| error.to_string())?;
    Ok(json!({"jobs":jobs,"runs":runs}))
}

fn valid_job(value: &Value) -> Result<Value> {
    let id = value["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let name = text(value, "name")?.trim();
    let prompt = text(value, "prompt")?.trim();
    if name.is_empty() || prompt.is_empty() {
        return Err("请填写任务名称和提示词。".into());
    }
    let next = value["nextAt"]
        .as_i64()
        .filter(|next| *next >= 0)
        .ok_or("请选择有效的运行时间。")?;
    let interval =
        if value["intervalMinutes"].is_null() || value["intervalMinutes"].as_i64() == Some(0) {
            None
        } else {
            Some(
                value["intervalMinutes"]
                    .as_i64()
                    .filter(|interval| *interval > 0 && interval.checked_mul(60_000).is_some())
                    .ok_or("重复间隔必须为正整数分钟。")?,
            )
        };
    Ok(
        json!({"id":id,"name":name,"cwd":cwd(text(value,"cwd")?)?,"prompt":prompt,"nextAt":next,"intervalMinutes":interval,"enabled":value["enabled"].as_bool().unwrap_or(true)}),
    )
}

fn save_job(connection: &Connection, job: &Value, timestamp: i64) -> Result<()> {
    connection.execute("INSERT INTO schedules(id,name,cwd,prompt,next_at,interval_minutes,enabled,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT(id) DO UPDATE SET name=excluded.name,cwd=excluded.cwd,prompt=excluded.prompt,next_at=excluded.next_at,interval_minutes=excluded.interval_minutes,enabled=excluded.enabled,updated_at=excluded.updated_at", params![text(job,"id")?,text(job,"name")?,text(job,"cwd")?,text(job,"prompt")?,job["nextAt"].as_i64().unwrap(),job["intervalMinutes"].as_i64(),job["enabled"].as_bool().unwrap(),timestamp]).map_err(|error| error.to_string())?;
    Ok(())
}

fn claim(connection: &mut Connection, timestamp: i64) -> Result<Value> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let jobs = {
        let mut query = transaction.prepare("SELECT id,name,cwd,prompt,next_at,interval_minutes,enabled FROM schedules s WHERE enabled=1 AND next_at<=?1 AND NOT EXISTS(SELECT 1 FROM runs r WHERE r.job_id=s.id AND r.status='running') ORDER BY next_at,id LIMIT 5").map_err(|error| error.to_string())?;
        query
            .query_map([timestamp], job_row)
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?
    };
    let mut claimed = Vec::new();
    for job in jobs {
        let id = text(&job, "id")?;
        let run_id = uuid::Uuid::new_v4().to_string();
        let next = if let Some(minutes) = job["intervalMinutes"].as_i64() {
            let interval = i128::from(minutes) * 60_000;
            let previous = i128::from(job["nextAt"].as_i64().unwrap());
            let next = previous + ((i128::from(timestamp) - previous) / interval + 1) * interval;
            i64::try_from(next).ok()
        } else {
            None
        };
        transaction
            .execute(
                "INSERT INTO runs(id,job_id,job,status,claimed_at) VALUES(?1,?2,?3,'running',?4)",
                params![run_id, id, job.to_string(), timestamp],
            )
            .map_err(|error| error.to_string())?;
        transaction.execute("UPDATE schedules SET next_at=COALESCE(?2,next_at),enabled=?3,updated_at=?4 WHERE id=?1", params![id,next,next.is_some(),timestamp]).map_err(|error| error.to_string())?;
        claimed.push(json!({"runId":run_id,"job":job}));
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(json!(claimed))
}

fn retry(connection: &mut Connection, run_id: &str) -> Result<Value> {
    let timestamp = now();
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let snapshot: String = transaction
        .query_row("SELECT job FROM runs WHERE id=?1", [run_id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or("运行记录已不存在。")?;
    let mut job: Value = serde_json::from_str(&snapshot).map_err(|error| error.to_string())?;
    let id = text(&job, "id")?.to_owned();
    let running: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM runs WHERE job_id=?1 AND status='running')",
            [&id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if running {
        return Ok(json!({"running":true}));
    }
    let existing = transaction
        .query_row(
            "SELECT id,name,cwd,prompt,next_at,interval_minutes,enabled FROM schedules WHERE id=?1",
            [&id],
            job_row,
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(existing) = existing {
        job = existing;
    }
    job["nextAt"] = json!(timestamp);
    job["enabled"] = json!(true);
    save_job(&transaction, &job, timestamp)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(job)
}

fn fenced(body: &str, language: &str) -> String {
    let length = body
        .split(|character| character != '`')
        .map(str::len)
        .max()
        .unwrap_or(0)
        .saturating_add(1)
        .max(3);
    let fence = "`".repeat(length);
    format!("{fence}{language}\n{body}\n{fence}")
}

fn markdown_content(content: &Value, full: bool) -> String {
    if let Some(content) = content.as_str() {
        return content.to_owned();
    }
    content
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| match part["type"].as_str().unwrap_or("text") {
                    "text" | "input_text" | "output_text" => {
                        part["text"].as_str().map(str::to_owned)
                    }
                    "thinking" if full => part["thinking"].as_str().map(|body| {
                        format!("<details>\n<summary>思考</summary>\n\n{body}\n\n</details>")
                    }),
                    "toolCall" | "tool_use" | "tool_call" if full => Some(format!(
                        "工具：{}\n\n{}",
                        part["name"].as_str().unwrap_or("调用"),
                        fenced(
                            &serde_json::to_string_pretty(
                                part.get("arguments")
                                    .or_else(|| part.get("input"))
                                    .unwrap_or(&Value::Null)
                            )
                            .unwrap_or_default(),
                            "json"
                        )
                    )),
                    "image" if full => part["data"].as_str().map(|data| {
                        if data.starts_with("data:") {
                            format!("![图片]({data})")
                        } else {
                            format!(
                                "![图片](data:{};base64,{data})",
                                part["mimeType"].as_str().unwrap_or("image/png")
                            )
                        }
                    }),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default()
}

fn markdown(messages: &[Value], title: &str, full: bool) -> (String, usize) {
    let mut result = format!("# {}\n", title.replace(['\r', '\n'], " ").trim());
    let mut count = 0;
    for value in messages {
        let message = value
            .get("message")
            .filter(|value| value.is_object())
            .unwrap_or(value);
        let role = message["role"].as_str().unwrap_or("message");
        if !full
            && (role != "assistant"
                || message["content"].as_array().is_some_and(|parts| {
                    parts.iter().any(|part| {
                        matches!(
                            part["type"].as_str(),
                            Some("toolCall" | "tool_call" | "tool_use")
                        )
                    })
                }))
        {
            continue;
        }
        let body = markdown_content(&message["content"], full);
        if body.trim().is_empty() {
            continue;
        }
        let label = match role {
            "user" => "用户",
            "assistant" => "助手",
            "toolResult" | "tool" => "工具结果",
            "system" => "系统",
            _ => "消息",
        };
        result.push_str(&format!("\n## {label}\n\n{body}\n"));
        count += 1;
    }
    (result, count)
}

fn revision(path: &Path) -> Result<Option<String>> {
    match File::open(path) {
        Ok(mut file) => {
            let mut digest = Sha256::new();
            let mut buffer = [0u8; 16 * 1024];
            loop {
                let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
                if count == 0 {
                    break;
                }
                digest.update(&buffer[..count]);
            }
            Ok(Some(format!("{:x}", digest.finalize())))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn export_lock(path: &Path) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    #[cfg(windows)]
    let key = PathBuf::from(path.to_string_lossy().to_lowercase());
    #[cfg(not(windows))]
    let key = path.to_owned();
    let mut locks = LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap();
    locks.retain(|_, lock| Arc::strong_count(lock) > 1);
    locks
        .entry(key)
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn commit_export(temporary: &Path, path: &Path, overwrite: bool) -> Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        };
        let from: Vec<_> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let flags = MOVEFILE_WRITE_THROUGH
            | if overwrite {
                MOVEFILE_REPLACE_EXISTING
            } else {
                0
            };
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), flags) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
    }
    #[cfg(not(windows))]
    {
        if overwrite {
            fs::rename(temporary, path).map_err(|error| error.to_string())?;
        } else {
            fs::hard_link(temporary, path).map_err(|error| error.to_string())?;
            fs::remove_file(temporary).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn export_markdown(root: &Path, request: &Value) -> Result<Value> {
    let supplied = absolute(text(request, "path")?)?;
    let parent = supplied.parent().ok_or("请选择输出目录。")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let path = parent
        .canonicalize()
        .map_err(|error| error.to_string())?
        .join(supplied.file_name().ok_or("请指定 Markdown 文件名。")?);
    let path = crate::platform::external_path(&path);
    let lock = export_lock(&path);
    let _writing = lock.lock().unwrap();
    let previous = revision(&path)?;
    if let Some(previous) = &previous {
        if !request["overwrite"].as_bool().unwrap_or(false)
            || request["baseRevision"].as_str() != Some(previous)
        {
            return Ok(json!({"path":path,"existing":true,"revision":previous}));
        }
    }
    let (content, count) = if let Some(content) = request["content"].as_str() {
        (content.to_owned(), 0)
    } else {
        let mut messages = if request["sessionPath"].is_string() {
            Vec::new()
        } else {
            request["messages"].as_array().cloned().unwrap_or_default()
        };
        if let Some(source) = request["sessionPath"].as_str() {
            crate::history::visit_messages(root, Path::new(source), |message, _| {
                messages.push(message.clone())
            })?;
        }
        let full = match request["mode"].as_str().unwrap_or("full") {
            "full" => true,
            "results" => false,
            _ => return Err("导出模式无效。".into()),
        };
        markdown(
            &messages,
            request["title"]
                .as_str()
                .filter(|title| !title.trim().is_empty())
                .unwrap_or("会话记录"),
            full,
        )
    };
    let parent = path.parent().ok_or("请选择输出目录。")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_file_name(format!(
        ".{}.{}.tmp",
        path.file_name()
            .ok_or("请指定 Markdown 文件名。")?
            .to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| error.to_string())?;
        drop(file);
        let current = revision(&path)?;
        if current != previous {
            return Ok(json!({"path":path,"existing":true,"revision":current}));
        }
        match commit_export(&temporary, &path, previous.is_some()) {
            Ok(()) => Ok(json!({"path":path,"count":count})),
            Err(_) if previous.is_none() && path.exists() => {
                Ok(json!({"path":path,"existing":true,"revision":revision(&path)?}))
            }
            Err(error) => Err(error),
        }
    })();
    let _ = fs::remove_file(&temporary);
    result
}

pub fn execute(root: &Path, request: &Value) -> Result<Value> {
    let command = text(request, "type")?;
    if command == "export.markdown" {
        return export_markdown(root, request);
    }
    let mut connection = database(root)?;
    match command {
        "artifact.list" => artifact_list(&connection, &cwd(text(request, "cwd")?)?),
        "artifact.add" => {
            let project = cwd(text(request, "cwd")?)?;
            let path = absolute(text(request, "path")?)?
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if !path.is_file() {
                return Err("请选择文件。".into());
            }
            let path = crate::platform::external_path(&path);
            let name = request["name"]
                .as_str()
                .filter(|name| !name.trim().is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| path.file_name().unwrap().to_string_lossy().into_owned());
            connection.execute("INSERT INTO artifacts(id,cwd,path,name,kind,created_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(cwd,path) DO UPDATE SET name=excluded.name,kind=excluded.kind",params![uuid::Uuid::new_v4().to_string(),project,path.to_string_lossy(),name,artifact_kind(&path),now()]).map_err(|error|error.to_string())?;
            artifact_list(&connection, &project)
        }
        "artifact.remove" => {
            connection
                .execute("DELETE FROM artifacts WHERE id=?1", [text(request, "id")?])
                .map_err(|error| error.to_string())?;
            Ok(Value::Null)
        }
        "artifact.read" => artifact_read(&connection, text(request, "id")?),
        "layout.get" | "desktop.state.get" => {
            let key = format!(
                "{}:{}",
                if command.starts_with("layout.") {
                    "layout"
                } else {
                    "state"
                },
                text(request, "key")?
            );
            let value: Option<String> = connection
                .query_row("SELECT value FROM state WHERE key=?1", [key], |row| {
                    row.get(0)
                })
                .optional()
                .map_err(|error| error.to_string())?;
            value
                .map(|value| serde_json::from_str(&value).map_err(|error| error.to_string()))
                .unwrap_or(Ok(Value::Null))
        }
        "layout.set" | "desktop.state.set" => {
            let key = format!(
                "{}:{}",
                if command.starts_with("layout.") {
                    "layout"
                } else {
                    "state"
                },
                text(request, "key")?
            );
            let value = request.get("value").ok_or("缺少 value")?;
            connection.execute("INSERT INTO state(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value.to_string()]).map_err(|error|error.to_string())?;
            Ok(value.clone())
        }
        "schedule.list" => schedule_list(&connection),
        "schedule.save" => {
            let job = valid_job(&request["job"])?;
            save_job(&connection, &job, now())?;
            Ok(job)
        }
        "schedule.remove" => {
            connection
                .execute("DELETE FROM schedules WHERE id=?1", [text(request, "id")?])
                .map_err(|error| error.to_string())?;
            Ok(Value::Null)
        }
        "schedule.claim" => claim(
            &mut connection,
            request["now"].as_i64().unwrap_or_else(now).max(0),
        ),
        "schedule.started" => {
            connection.execute("UPDATE runs SET session_id=?2,path=?3,started_at=COALESCE(started_at,?4) WHERE id=?1 AND status='running'",params![text(request,"runId")?,text(request,"sessionId")?,request["path"].as_str().unwrap_or(""),now()]).map_err(|error|error.to_string())?;
            Ok(Value::Null)
        }
        "schedule.finish" => {
            let status = text(request, "status")?;
            if !matches!(status, "completed" | "error" | "interrupted") {
                return Err("运行状态无效。".into());
            }
            connection.execute("UPDATE runs SET status=?2,finished_at=?3,error=?4 WHERE id=?1 AND status='running'",params![text(request,"runId")?,status,now(),request["error"].as_str()]).map_err(|error|error.to_string())?;
            Ok(Value::Null)
        }
        "schedule.recover" => {
            let count = connection.execute("UPDATE runs SET status='interrupted',finished_at=?1,error=COALESCE(error,'应用退出前任务尚未完成。') WHERE status='running'",[now()]).map_err(|error|error.to_string())?;
            Ok(json!({"recovered":count}))
        }
        "schedule.retry" => retry(&mut connection, text(request, "runId")?),
        _ => Err("未知桌面工具操作。".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("omp-desktop-tools-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn registry_state_and_export_keep_local_files() {
        let root = directory();
        let path = root.join("工具.html");
        fs::write(&path, "<h1>本地工具</h1>").unwrap();
        let request = json!({"type":"artifact.add","cwd":root,"path":path});
        let first = execute(&root, &request).unwrap();
        let id = first["items"][0]["id"].clone();
        assert_eq!(
            execute(&root, &request).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            execute(&root, &json!({"type":"artifact.read","id":id})).unwrap()["content"],
            "<h1>本地工具</h1>"
        );
        execute(&root, &json!({"type":"artifact.remove","id":id})).unwrap();
        assert!(path.exists());
        let layout = json!({"panels":["editor","chat"],"ratio":0.4});
        execute(
            &root,
            &json!({"type":"layout.set","key":"main","value":layout}),
        )
        .unwrap();
        assert_eq!(
            execute(&root, &json!({"type":"layout.get","key":"main"})).unwrap(),
            layout
        );
        assert!(
            execute(&root, &json!({"type":"desktop.state.get","key":"main"}))
                .unwrap()
                .is_null()
        );
        let output = root.join("导出.md");
        let mut export = json!({"type":"export.markdown","path":output,"title":"测试","mode":"results","messages":[{"role":"user","content":"问题"},{"role":"assistant","content":[{"type":"thinking","thinking":"过程"},{"type":"text","text":"结果"}]}]});
        assert_eq!(execute(&root, &export).unwrap()["count"], 1);
        let content = fs::read_to_string(&output).unwrap();
        assert!(content.contains("结果"));
        assert!(!content.contains("过程"));
        let conflict = execute(&root, &export).unwrap();
        assert_eq!(conflict["existing"], true);
        export["overwrite"] = json!(true);
        export["baseRevision"] = conflict["revision"].clone();
        fs::write(&output, "外部编辑").unwrap();
        assert_eq!(execute(&root, &export).unwrap()["existing"], true);
        assert_eq!(fs::read_to_string(&output).unwrap(), "外部编辑");
        let fresh = execute(&root, &export).unwrap();
        export["baseRevision"] = fresh["revision"].clone();
        export["content"] = json!("# 旁问\n\n原对话引用与完整回答");
        execute(&root, &export).unwrap();
        assert_eq!(
            fs::read_to_string(&output).unwrap(),
            "# 旁问\n\n原对话引用与完整回答"
        );
        assert!(root.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn claim_is_single_and_recovery_retains_history() {
        let root = directory();
        execute(&root,&json!({"type":"schedule.save","job":{"id":"repeat","name":"重复任务","cwd":root,"prompt":"检查项目","nextAt":1000,"intervalMinutes":1,"enabled":true}})).unwrap();
        let first = execute(&root, &json!({"type":"schedule.claim","now":181000})).unwrap();
        let run = first[0]["runId"].clone();
        assert_eq!(first.as_array().unwrap().len(), 1);
        assert!(
            execute(&root, &json!({"type":"schedule.claim","now":241000}))
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            execute(&root, &json!({"type":"schedule.list"})).unwrap()["jobs"][0]["nextAt"],
            241000
        );
        execute(&root, &json!({"type":"schedule.retry","runId":run})).unwrap();
        assert_eq!(
            execute(&root, &json!({"type":"schedule.recover"})).unwrap()["recovered"],
            1
        );
        assert_eq!(
            execute(&root, &json!({"type":"schedule.recover"})).unwrap()["recovered"],
            0
        );
        execute(&root, &json!({"type":"schedule.remove","id":"repeat"})).unwrap();
        let list = execute(&root, &json!({"type":"schedule.list"})).unwrap();
        assert!(list["jobs"].as_array().unwrap().is_empty());
        assert_eq!(list["runs"][0]["status"], "interrupted");
        execute(&root, &json!({"type":"schedule.retry","runId":run})).unwrap();
        let retry = execute(&root, &json!({"type":"schedule.claim","now":now()+1000})).unwrap();
        assert_eq!(retry.as_array().unwrap().len(), 1);
        execute(
            &root,
            &json!({"type":"schedule.finish","runId":retry[0]["runId"],"status":"completed"}),
        )
        .unwrap();
        assert_eq!(
            execute(&root, &json!({"type":"schedule.list"})).unwrap()["runs"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(root.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_claims_have_no_duplicates_and_obey_batch_limit() {
        let root = directory();
        for index in 0..6 {
            let saved = execute(&root, &json!({"type":"schedule.save","job":{"id":format!("job-{index}"),"name":"一次任务","cwd":root,"prompt":"检查","nextAt":1000,"intervalMinutes":0}})).unwrap();
            assert!(saved["intervalMinutes"].is_null());
        }
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = (0..2)
            .map(|_| {
                let root = root.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    execute(&root, &json!({"type":"schedule.claim","now":2000})).unwrap()
                })
            })
            .collect();
        let batches: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert!(
            batches
                .iter()
                .all(|batch| batch.as_array().unwrap().len() <= 5)
        );
        let ids: Vec<_> = batches
            .iter()
            .flat_map(|batch| batch.as_array().unwrap())
            .map(|run| run["job"]["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids.len(), 6);
        assert_eq!(
            ids.iter().collect::<std::collections::HashSet<_>>().len(),
            6
        );
        assert!(
            execute(&root, &json!({"type":"schedule.claim","now":2000}))
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert!(root.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(root).unwrap();
    }
}
