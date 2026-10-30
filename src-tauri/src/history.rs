use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant, SystemTime},
};

const SUMMARY_LIMIT: usize = 4096;
const INDEX_LIMIT: usize = 8;
const INDEX_BYTES: u64 = 16 * 1024 * 1024;
const CACHE_AGE: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, PartialEq, Eq)]
struct FileStamp {
    length: u64,
    modified: Option<SystemTime>,
}

fn file_stamp(path: &Path) -> std::io::Result<FileStamp> {
    let metadata = fs::metadata(path)?;
    Ok(FileStamp {
        length: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

struct Summary {
    stamp: FileStamp,
    value: Option<Value>,
    used: Instant,
}

struct SessionIndex {
    stamp: FileStamp,
    rows: Vec<Value>,
    messages: Vec<usize>,
    stats: Value,
}

#[derive(Default)]
struct HistoryCache {
    summaries: HashMap<PathBuf, Summary>,
    indexes: HashMap<PathBuf, (Arc<SessionIndex>, Instant)>,
}

impl HistoryCache {
    fn expire(&mut self) {
        self.summaries
            .retain(|_, value| value.used.elapsed() < CACHE_AGE);
        self.indexes
            .retain(|_, (_, used)| used.elapsed() < CACHE_AGE);
    }

    fn summary(&mut self, path: &Path, stamp: FileStamp, value: Option<Value>) {
        if stamp.modified.is_none() {
            return;
        }
        if self.summaries.len() >= SUMMARY_LIMIT
            && !self.summaries.contains_key(path)
            && let Some(oldest) = self
                .summaries
                .iter()
                .min_by_key(|(_, value)| value.used)
                .map(|(path, _)| path.clone())
        {
            self.summaries.remove(&oldest);
        }
        self.summaries.insert(
            path.to_owned(),
            Summary {
                stamp,
                value,
                used: Instant::now(),
            },
        );
    }

    fn index(&mut self, path: &Path, value: Arc<SessionIndex>) {
        self.indexes.remove(path);
        if value.stamp.modified.is_none() || value.stamp.length > INDEX_BYTES {
            return;
        }
        while self.indexes.len() >= INDEX_LIMIT
            || self
                .indexes
                .values()
                .map(|(index, _)| index.stamp.length)
                .sum::<u64>()
                + value.stamp.length
                > INDEX_BYTES
        {
            let Some(oldest) = self
                .indexes
                .iter()
                .min_by_key(|(_, (_, used))| *used)
                .map(|(path, _)| path.clone())
            else {
                break;
            };
            self.indexes.remove(&oldest);
        }
        self.indexes
            .insert(path.to_owned(), (value, Instant::now()));
    }
}

fn cache() -> &'static Mutex<HistoryCache> {
    static CACHE: OnceLock<Mutex<HistoryCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HistoryCache::default()))
}

pub fn clear_cache(root: &Path) {
    let root = fs::canonicalize(root).unwrap_or_else(|_| root.to_owned());
    let mut cache = cache().lock().unwrap();
    cache.summaries.retain(|path, _| !path.starts_with(&root));
    cache.indexes.retain(|path, _| !path.starts_with(&root));
}

pub fn session_path(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let real = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let managed = fs::canonicalize(root.join("omp")).map_err(|e| e.to_string())?;
    if !real.starts_with(managed) || real.extension().and_then(|s| s.to_str()) != Some("jsonl") {
        return Err("Choose a session from the imported OMP data.".into());
    }
    Ok(real)
}

fn entries(path: &Path) -> Result<Vec<Value>, String> {
    let reader = BufReader::new(fs::File::open(path).map_err(|e| e.to_string())?);
    let mut result = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        // 活跃日志末尾可能尚未写完，浏览历史不修写源文件。
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            result.push(value);
        }
    }
    Ok(result)
}

fn summary_value(
    path: &Path,
    stamp: &FileStamp,
    header: Option<&Value>,
    title: Option<&str>,
) -> Option<Value> {
    let header = header?;
    let modified = stamp
        .modified
        .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Some(
        json!({"id":header["id"],"cwd":header["cwd"],"path":path,"title":title.or(header["title"].as_str()).unwrap_or("Untitled session"),"updatedAt":modified}),
    )
}

fn summary(path: &Path, stamp: FileStamp) -> Result<Option<Value>, String> {
    let mut cache = cache().lock().unwrap();
    if let Some(saved) = cache
        .summaries
        .get_mut(path)
        .filter(|saved| saved.stamp == stamp)
    {
        saved.used = Instant::now();
        return Ok(saved.value.clone());
    }
    cache.indexes.remove(path);
    let reader = BufReader::new(fs::File::open(path).map_err(|e| e.to_string())?);
    let mut header = None;
    let mut title = None;
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if let Ok(row) = serde_json::from_str::<Value>(&line) {
            if row["type"] == "session" && header.is_none() {
                header = Some(row.clone());
            }
            if matches!(row["type"].as_str(), Some("title_change" | "title"))
                && let Some(value) = row["title"].as_str()
            {
                title = Some(value.to_owned());
            }
        }
    }
    let value = summary_value(path, &stamp, header.as_ref(), title.as_deref());
    if file_stamp(path).is_ok_and(|current| current == stamp) {
        cache.summary(path, stamp, value.clone());
    }
    Ok(value)
}

fn index(path: &Path) -> Result<Arc<SessionIndex>, String> {
    let stamp = file_stamp(path).map_err(|e| e.to_string())?;
    let mut cache = cache().lock().unwrap();
    cache.expire();
    if let Some((index, used)) = cache
        .indexes
        .get_mut(path)
        .filter(|(index, _)| index.stamp == stamp)
    {
        *used = Instant::now();
        return Ok(index.clone());
    }
    let rows = entries(path)?;
    let branch = branch_entries(&rows);
    let messages = branch
        .iter()
        .copied()
        .filter(|&row| rows[row]["type"] == "message")
        .collect();
    let stats = session_stats(path, &rows, &branch);
    let header = rows.iter().find(|row| row["type"] == "session");
    let title = rows
        .iter()
        .rev()
        .filter(|row| matches!(row["type"].as_str(), Some("title_change" | "title")))
        .find_map(|row| row["title"].as_str());
    let summary = summary_value(path, &stamp, header, title);
    let index = Arc::new(SessionIndex {
        stamp: stamp.clone(),
        rows,
        messages,
        stats,
    });
    if file_stamp(path).is_ok_and(|current| current == stamp) {
        cache.summary(path, stamp, summary);
        cache.index(path, index.clone());
    }
    Ok(index)
}

fn find_sessions(path: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    for item in fs::read_dir(path).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let kind = item.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            find_sessions(&item.path(), out)?;
        } else if item.path().extension().and_then(|s| s.to_str()) == Some("jsonl") {
            out.push(item.path());
        }
    }
    Ok(())
}

pub fn list(root: &Path, cwd: Option<&str>) -> Result<Value, String> {
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let canonical_cwd = cwd.and_then(|cwd| fs::canonicalize(cwd).ok());
    let mut files = Vec::new();
    find_sessions(&root.join("omp/agent/sessions"), &mut files)?;
    let profiles = root.join("omp/profiles");
    if profiles.is_dir() {
        for profile in fs::read_dir(profiles).map_err(|e| e.to_string())? {
            find_sessions(
                &profile
                    .map_err(|e| e.to_string())?
                    .path()
                    .join("agent/sessions"),
                &mut files,
            )?;
        }
    }
    {
        let mut cache = cache().lock().unwrap();
        cache.expire();
        let live: HashSet<_> = files.iter().collect();
        cache
            .summaries
            .retain(|path, _| !path.starts_with(&root) || live.contains(path));
        cache
            .indexes
            .retain(|path, _| !path.starts_with(&root) || live.contains(path));
    }
    let mut sessions = Vec::new();
    let mut project_paths = HashMap::new();
    for path in files {
        let stamp = match file_stamp(&path) {
            Ok(stamp) => stamp,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        let value = match summary(&path, stamp) {
            Ok(Some(value)) => value,
            Ok(None) => continue,
            Err(_) if !path.exists() => continue,
            Err(error) => return Err(error),
        };
        if cwd.is_some_and(|cwd| {
            !value["cwd"].as_str().is_some_and(|saved| {
                saved == cwd
                    || canonical_cwd.as_ref().is_some_and(|canonical| {
                        project_paths
                            .entry(saved.to_owned())
                            .or_insert_with(|| fs::canonicalize(saved).ok())
                            .as_ref()
                            == Some(canonical)
                    })
            })
        }) {
            continue;
        }
        sessions.push(value);
    }
    sessions.sort_by_key(|s| std::cmp::Reverse(s["updatedAt"].as_u64().unwrap_or(0)));
    Ok(json!(sessions))
}

fn branch_entries(rows: &[Value]) -> Vec<usize> {
    let by_id: HashMap<&str, usize> = rows
        .iter()
        .enumerate()
        .filter_map(|(index, row)| row["id"].as_str().map(|id| (id, index)))
        .collect();
    let mut leaf = rows
        .iter()
        .rev()
        .find(|r| r["parentId"].is_string() || r.get("parentId").is_some())
        .and_then(|r| r["id"].as_str());
    let mut chain = Vec::new();
    let mut seen = HashSet::new();
    while let Some(id) = leaf {
        if !seen.insert(id) {
            break;
        }
        let Some(&index) = by_id.get(id) else { break };
        chain.push(index);
        leaf = rows[index]["parentId"].as_str();
    }
    chain.reverse();
    chain
}

pub fn page(root: &Path, path: &Path, cursor: Option<&str>, limit: usize) -> Result<Value, String> {
    let path = session_path(root, path)?;
    let index = index(&path)?;
    let end = cursor
        .and_then(|c| c.parse::<usize>().ok())
        .unwrap_or(index.messages.len())
        .min(index.messages.len());
    let start = end.saturating_sub(limit.clamp(1, 256));
    let messages: Vec<Value> = index.messages[start..end]
        .iter()
        .map(|&row| {
            let row = &index.rows[row];
            let mut message = row["message"].clone();
            message["id"] = row["id"].clone();
            message
        })
        .collect();
    Ok(json!({"messages":messages,"nextCursor":if start>0 {Some(start.to_string())}else{None}}))
}

pub fn stats(root: &Path, path: &Path) -> Result<Value, String> {
    let path = session_path(root, path)?;
    Ok(index(&path)?.stats.clone())
}

fn session_stats(path: &Path, rows: &[Value], branch: &[usize]) -> Value {
    let header = rows.iter().find(|row| row["type"] == "session");
    let mut user_messages = 0;
    let mut assistant_messages = 0;
    let mut tool_calls = 0;
    let mut tool_results = 0;
    let mut total_messages = 0;
    let mut tokens =
        json!({"input":0u64,"output":0u64,"cacheRead":0u64,"cacheWrite":0u64,"reasoning":0u64});
    let mut cost = 0.0;
    let mut premium_requests = 0;
    let mut context_window = header
        .and_then(|row| row["model"]["contextWindow"].as_u64())
        .filter(|value| *value > 0);
    let mut context_usage = Value::Null;
    for &row in branch {
        let row = &rows[row];
        if row["type"] == "model_change" {
            context_window = row["model"]["contextWindow"]
                .as_u64()
                .filter(|value| *value > 0);
            context_usage = Value::Null;
        }
        if row["type"] != "message" {
            continue;
        }
        total_messages += 1;
        let message = &row["message"];
        match message["role"].as_str() {
            Some("user") => user_messages += 1,
            Some("toolResult") => tool_results += 1,
            Some("assistant") => {
                assistant_messages += 1;
                tool_calls += message["content"].as_array().map_or(0, |content| {
                    content
                        .iter()
                        .filter(|part| part["type"] == "toolCall")
                        .count()
                });
                let usage = &message["usage"];
                for (key, field) in [
                    ("input", "input"),
                    ("output", "output"),
                    ("cacheRead", "cacheRead"),
                    ("cacheWrite", "cacheWrite"),
                    ("reasoning", "reasoningTokens"),
                ] {
                    tokens[key] = json!(
                        tokens[key].as_u64().unwrap_or(0) + usage[field].as_u64().unwrap_or(0)
                    );
                }
                cost += usage["cost"]["total"].as_f64().unwrap_or(0.0);
                premium_requests += usage["premiumRequests"].as_u64().unwrap_or(0);
                if let Some(window) = message["model"]["contextWindow"]
                    .as_u64()
                    .filter(|value| *value > 0)
                {
                    context_window = Some(window);
                }
                if let (Some(used), Some(window)) =
                    (usage["contextTokens"].as_u64(), context_window)
                {
                    context_usage = json!({"tokens":used,"contextWindow":window,"percent":used as f64/window as f64*100.0});
                }
            }
            _ => {}
        }
    }
    // 推理 tokens 是输出的子集，不重复计入总量。
    tokens["total"] = json!(
        ["input", "output", "cacheRead", "cacheWrite"]
            .iter()
            .map(|key| tokens[key].as_u64().unwrap_or(0))
            .sum::<u64>()
    );
    json!({"sessionId":header.and_then(|row|row["id"].as_str()).unwrap_or_default(),"sessionFile":path,"userMessages":user_messages,"assistantMessages":assistant_messages,"toolCalls":tool_calls,"toolResults":tool_results,"totalMessages":total_messages,"tokens":tokens,"cost":cost,"premiumRequests":premium_requests,"contextUsage":context_usage})
}
