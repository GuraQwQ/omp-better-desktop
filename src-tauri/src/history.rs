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
    let mut sessions = Vec::new();
    for path in files {
        let rows = entries(&path)?;
        let Some(header) = rows.iter().find(|v| v["type"] == "session") else {
            continue;
        };
        if cwd.is_some_and(|cwd| {
            !header["cwd"].as_str().is_some_and(|saved| {
                saved == cwd
                    || canonical_cwd.as_ref().is_some_and(|canonical| {
                        fs::canonicalize(saved).ok().as_ref() == Some(canonical)
                    })
            })
        }) {
            continue;
        }
        let title = rows
            .iter()
            .rev()
            .find_map(|row| {
                if row["type"] == "title_change" || row["type"] == "title" {
                    row["title"].as_str()
                } else {
                    None
                }
            })
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

fn branch_entries(rows: &[Value]) -> Vec<&Value> {
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
        chain.push(*row);
        leaf = row["parentId"].as_str();
    }
    chain.reverse();
    chain
}

pub fn page(root: &Path, path: &Path, cursor: Option<&str>, limit: usize) -> Result<Value, String> {
    let path = session_path(root, path)?;
    let rows = entries(&path)?;
    let messages: Vec<Value> = branch_entries(&rows)
        .iter()
        .filter(|row| row["type"] == "message")
        .map(|row| {
            let mut message = row["message"].clone();
            message["id"] = row["id"].clone();
            message
        })
        .collect();
    let end = cursor
        .and_then(|c| c.parse::<usize>().ok())
        .unwrap_or(messages.len())
        .min(messages.len());
    let start = end.saturating_sub(limit.clamp(1, 256));
    Ok(
        json!({"messages":&messages[start..end],"nextCursor":if start>0 {Some(start.to_string())}else{None}}),
    )
}

pub fn stats(root: &Path, path: &Path) -> Result<Value, String> {
    let path = session_path(root, path)?;
    let rows = entries(&path)?;
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
    for row in branch_entries(&rows) {
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
    Ok(
        json!({"sessionId":header.and_then(|row|row["id"].as_str()).unwrap_or_default(),"sessionFile":path,"userMessages":user_messages,"assistantMessages":assistant_messages,"toolCalls":tool_calls,"toolResults":tool_results,"totalMessages":total_messages,"tokens":tokens,"cost":cost,"premiumRequests":premium_requests,"contextUsage":context_usage}),
    )
}
