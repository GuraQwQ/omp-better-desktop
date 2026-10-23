use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

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
    let mut sessions = Vec::new();
    for path in files {
        let rows = entries(&path)?;
        let Some(header) = rows.first().filter(|v| v["type"] == "session") else {
            continue;
        };
        if cwd.is_some_and(|cwd| header["cwd"].as_str() != Some(cwd)) {
            continue;
        }
        let title = rows
            .iter()
            .rev()
            .find_map(|row| {
                if row["type"] == "session_info" {
                    row["name"].as_str().or(row["title"].as_str())
                } else {
                    None
                }
            })
            .or(header["name"].as_str())
            .or(header["title"].as_str())
            .unwrap_or("Untitled session");
        let modified = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        sessions.push(json!({"id":header["id"],"cwd":header["cwd"],"path":path,"title":title,"updatedAt":modified}));
    }
    sessions.sort_by_key(|s| std::cmp::Reverse(s["updatedAt"].as_u64().unwrap_or(0)));
    Ok(json!(sessions))
}

pub fn page(root: &Path, path: &Path, cursor: Option<&str>, limit: usize) -> Result<Value, String> {
    let path = session_path(root, path)?;
    let rows = entries(&path)?;
    let by_id: HashMap<&str, &Value> = rows
        .iter()
        .filter_map(|r| r["id"].as_str().map(|id| (id, r)))
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
        let Some(row) = by_id.get(id) else { break };
        if row["type"] == "message" {
            let mut message = row["message"].clone();
            message["id"] = json!(id);
            chain.push(message);
        }
        leaf = row["parentId"].as_str();
    }
    chain.reverse();
    let end = cursor
        .and_then(|c| c.parse::<usize>().ok())
        .unwrap_or(chain.len())
        .min(chain.len());
    let start = end.saturating_sub(limit.clamp(1, 256));
    Ok(
        json!({"messages":&chain[start..end],"nextCursor":if start>0 {Some(start.to_string())}else{None}}),
    )
}
