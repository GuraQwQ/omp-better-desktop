use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

type Result<T> = std::result::Result<T, String>;
type SearchTokens = HashMap<String, (Arc<AtomicBool>, Instant)>;

fn text<'a>(request: &'a Value, key: &str) -> Result<&'a str> {
    request[key].as_str().ok_or_else(|| format!("缺少 {key}"))
}

fn relative(value: &str) -> Result<&Path> {
    let path = Path::new(value);
    if value.is_empty()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_) | Component::CurDir))
    {
        return Err("请选择工作区内的文件。".into());
    }
    Ok(path)
}

fn file_path(cwd: &Path, value: &str) -> Result<PathBuf> {
    let base = cwd.canonicalize().map_err(|error| error.to_string())?;
    let path = base
        .join(relative(value)?)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !path.starts_with(base) || !path.is_file() {
        return Err("请选择工作区内的文件。".into());
    }
    Ok(path)
}

fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn file_value(path: &Path) -> Result<Value> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let raw = std::str::from_utf8(&bytes)
        .map_err(|_| "此文件使用其他编码或为二进制，请在对应应用中编辑。")?;
    if raw.contains('\0') {
        return Err("二进制文件不能作为文本编辑。".into());
    }
    let bom = raw.starts_with('\u{feff}');
    let content = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let newline = if content.contains("\r\n") {
        if content.replace("\r\n", "").contains('\n') {
            "mixed"
        } else {
            "crlf"
        }
    } else {
        "lf"
    };
    Ok(
        json!({"content":content,"revision":revision(&bytes),"encoding":if bom {"utf8-bom"} else {"utf8"},"newline":newline}),
    )
}

fn line_endings(original: &str, edited: &str) -> String {
    let original = original.strip_prefix('\u{feff}').unwrap_or(original);
    let normalized = edited.replace("\r\n", "\n");
    let mut endings = Vec::new();
    let mut old_lines: HashMap<&str, std::collections::VecDeque<&str>> = HashMap::new();
    for line in original.split_inclusive('\n') {
        let ending = if line.ends_with("\r\n") {
            "\r\n"
        } else if line.ends_with('\n') {
            "\n"
        } else {
            ""
        };
        let body = line.strip_suffix(ending).unwrap_or(line);
        if !ending.is_empty() {
            endings.push(ending);
            old_lines.entry(body).or_default().push_back(ending);
        }
    }
    let fallback = endings.first().copied().unwrap_or("\n");
    let mut result = String::new();
    for (index, line) in normalized.split_inclusive('\n').enumerate() {
        let body = line.strip_suffix('\n').unwrap_or(line);
        result.push_str(body);
        if line.ends_with('\n') {
            let ending = old_lines
                .get_mut(body)
                .and_then(|values| values.pop_front())
                .or_else(|| endings.get(index).copied())
                .unwrap_or(fallback);
            result.push_str(ending);
        }
    }
    result
}

fn replace_file(temporary: &Path, destination: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        };
        let from: Vec<_> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<_> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        if unsafe {
            MoveFileExW(
                from.as_ptr(),
                to.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        fs::rename(temporary, destination).map_err(|error| error.to_string())
    }
}

fn save_file(cwd: &Path, request: &Value) -> Result<Value> {
    let path = file_path(cwd, text(request, "path")?)?;
    let base = text(request, "baseRevision")?;
    let original = fs::read(&path).map_err(|error| error.to_string())?;
    if revision(&original) != base {
        return Err("文件已被其他程序修改。请重载并核对后再保存，编辑内容仍保留。".into());
    }
    let original_text = std::str::from_utf8(&original).map_err(|_| "文件编码已变化，请重载。")?;
    if original_text.contains('\0') {
        return Err("二进制文件不能作为文本保存。".into());
    }
    let content = line_endings(original_text, text(request, "content")?);
    let content = if original_text.starts_with('\u{feff}') {
        format!("\u{feff}{content}")
    } else {
        content
    };
    let temporary = path.with_file_name(format!(
        ".{}.{}.tmp",
        path.file_name().unwrap().to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| error.to_string())?;
        fs::set_permissions(
            &temporary,
            fs::metadata(&path)
                .map_err(|error| error.to_string())?
                .permissions(),
        )
        .map_err(|error| error.to_string())?;
        // 写入候选后再核对一次，缩短外部编辑与替换之间的窗口。
        if revision(&fs::read(&path).map_err(|error| error.to_string())?) != base {
            return Err("文件在保存期间发生变化。请重载并核对后重试。".into());
        }
        replace_file(&temporary, &path)?;
        file_value(&path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn search_tokens() -> &'static Mutex<SearchTokens> {
    static TOKENS: OnceLock<Mutex<SearchTokens>> = OnceLock::new();
    TOKENS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn search_flag(id: &str) -> Arc<AtomicBool> {
    let mut tokens = search_tokens().lock().unwrap();
    tokens.retain(|_, (flag, created)| {
        Arc::strong_count(flag) > 1 || created.elapsed() < Duration::from_secs(60)
    });
    tokens
        .entry(id.to_owned())
        .or_insert_with(|| (Arc::new(AtomicBool::new(false)), Instant::now()))
        .0
        .clone()
}

fn search(cwd: &Path, request: &Value) -> Result<Value> {
    let query = text(request, "query")?;
    if query.is_empty() {
        return Ok(json!({"matches":[],"truncated":false,"cancelled":false,"skipped":0}));
    }
    let id = text(request, "requestId")?;
    let flag = search_flag(id);
    let limit = request["limit"].as_u64().unwrap_or(200).clamp(1, 1000) as usize;
    let case_sensitive = request["caseSensitive"].as_bool().unwrap_or(false);
    let needle = if case_sensitive {
        query.to_owned()
    } else {
        query.to_lowercase()
    };
    let cwd = cwd.canonicalize().map_err(|error| error.to_string())?;
    let mut matches = Vec::new();
    let mut skipped = 0;
    let mut truncated = false;
    let mut failures = Vec::new();
    for entry in ignore::WalkBuilder::new(&cwd)
        .require_git(false)
        .parents(false)
        .hidden(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build()
    {
        if flag.load(Ordering::Acquire) {
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                failures.push(error.to_string());
                continue;
            }
        };
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        // shortcut: 全文搜索限定单文件 2 MiB，需要搜索大文件时改为流式分段读取。
        if entry
            .metadata()
            .map(|meta| meta.len() > 2 * 1024 * 1024)
            .unwrap_or(true)
        {
            skipped += 1;
            continue;
        }
        let bytes = match fs::read(entry.path()) {
            Ok(bytes) => bytes,
            Err(error) => {
                failures.push(format!("{}: {error}", entry.path().display()));
                continue;
            }
        };
        let content = match std::str::from_utf8(&bytes) {
            Ok(content) if !content.contains('\0') => content,
            _ => {
                skipped += 1;
                continue;
            }
        };
        let relative = entry
            .path()
            .strip_prefix(&cwd)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        for (index, line) in content.lines().enumerate() {
            if flag.load(Ordering::Acquire) {
                break;
            }
            let candidate = if case_sensitive {
                line.to_owned()
            } else {
                line.to_lowercase()
            };
            if candidate.contains(&needle) {
                if matches.len() == limit {
                    truncated = true;
                    break;
                }
                matches.push(json!({"path":relative,"line":index + 1,"text":line.chars().take(600).collect::<String>()}));
            }
        }
        if truncated {
            break;
        }
    }
    let cancelled = flag.load(Ordering::Acquire);
    search_tokens().lock().unwrap().remove(id);
    Ok(
        json!({"matches":matches,"truncated":truncated,"cancelled":cancelled,"skipped":skipped,"errors":failures}),
    )
}

fn git(cwd: &Path, args: &[&str]) -> Result<std::process::Output> {
    let output = crate::platform::hidden(
        Command::new("git")
            .args(args)
            .env("LC_ALL", "C")
            .current_dir(cwd),
    )
    .output()
    .map_err(|error| format!("无法运行 Git：{error}"))?;
    if !output.status.success() {
        return Err(format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
        .trim()
        .to_owned());
    }
    Ok(output)
}

fn git_status(cwd: &Path) -> Result<Value> {
    let output = git(cwd, &["status", "--porcelain=v1", "-z", "--", "."])?;
    let mut fields = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut items = Vec::new();
    while let Some(field) = fields.next() {
        if field.len() < 4 {
            continue;
        }
        let status = String::from_utf8_lossy(&field[..2]);
        let path = String::from_utf8_lossy(&field[3..]).to_string();
        let original = if status.contains('R') || status.contains('C') {
            fields
                .next()
                .map(|value| String::from_utf8_lossy(value).to_string())
        } else {
            None
        };
        items.push(json!({"path":path,"original":original,"status":status,"staged":field[0] != b' ' && field[0] != b'?',"unstaged":field[1] != b' ' || field[0] == b'?'}));
    }
    Ok(json!({"items":items}))
}

fn paths(request: &Value) -> Result<Vec<String>> {
    let values = request["paths"].as_array().ok_or("请选择文件。")?;
    if values.is_empty() {
        return Err("请选择文件。".into());
    }
    values
        .iter()
        .map(|value| {
            let value = value.as_str().ok_or("文件路径无效。")?;
            relative(value)?;
            Ok(value.to_owned())
        })
        .collect()
}

fn worktrees(cwd: &Path) -> Result<Value> {
    let output = git(cwd, &["worktree", "list", "--porcelain", "-z"])?;
    let mut items = Vec::new();
    let mut item = json!({});
    for field in output.stdout.split(|byte| *byte == 0) {
        let field = String::from_utf8_lossy(field);
        if let Some(path) = field.strip_prefix("worktree ") {
            if item["path"].is_string() {
                items.push(item);
            }
            item = json!({"path":path});
        } else if let Some(branch) = field.strip_prefix("branch ") {
            item["branch"] = json!(branch.strip_prefix("refs/heads/").unwrap_or(branch));
        } else if let Some(head) = field.strip_prefix("HEAD ") {
            item["head"] = json!(head);
        } else if field == "detached" {
            item["detached"] = json!(true);
        } else if field.starts_with("locked") {
            item["locked"] = json!(true);
        }
    }
    if item["path"].is_string() {
        items.push(item);
    }
    Ok(json!(items))
}

fn worktree_add(cwd: &Path, request: &Value) -> Result<Value> {
    let path = Path::new(text(request, "path")?);
    if !path.is_absolute() {
        return Err("请填写新工作树的完整路径。".into());
    }
    let parent = path
        .parent()
        .ok_or("工作树目录无效。")?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let path = parent.join(path.file_name().ok_or("请指定新目录名。")?);
    let external = crate::platform::external_path(&path);
    if let Some(item) = worktrees(cwd)?.as_array().and_then(|items| {
        items.iter().find(|item| {
            item["path"].as_str().is_some_and(|value| {
                Path::new(value)
                    .canonicalize()
                    .is_ok_and(|existing| existing == path)
            })
        })
    }) {
        return Ok(item.clone());
    }
    let path_string = external.to_string_lossy();
    let branch = request["branch"].as_str().unwrap_or("");
    let reference = request["ref"]
        .as_str()
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");
    let mut args = vec!["worktree", "add"];
    if !branch.is_empty() {
        git(cwd, &["check-ref-format", "--branch", branch])?;
        args.extend(["-b", branch]);
    } else {
        args.push("--detach");
    }
    args.extend(["--", &path_string, reference]);
    git(cwd, &args)?;
    Ok(json!({"path":external,"branch":branch}))
}

fn worktree_remove(cwd: &Path, request: &Value) -> Result<Value> {
    let supplied = Path::new(text(request, "path")?);
    let entries = worktrees(cwd)?;
    let selected = entries.as_array().unwrap().iter().find(|item| {
        item["path"].as_str().is_some_and(|value| {
            let stored = Path::new(value);
            stored == supplied
                || stored
                    .canonicalize()
                    .ok()
                    .zip(supplied.canonicalize().ok())
                    .is_some_and(|(left, right)| left == right)
        })
    });
    let Some(selected) = selected else {
        return Ok(entries);
    };
    let target = Path::new(selected["path"].as_str().unwrap());
    let main = entries
        .as_array()
        .unwrap()
        .first()
        .and_then(|item| item["path"].as_str())
        .map(Path::new);
    if main == Some(target) {
        return Err("主工作目录不能作为附加工作树移除。".into());
    }
    let status = git(
        target,
        &["status", "--porcelain=v1", "--ignored=matching", "-z"],
    )?;
    if !status.stdout.is_empty() {
        return Err("工作树仍有未提交文件，请先提交或保存这些改动。".into());
    }
    // 目标来自 Git 的真实工作树清单，正常移除保留 Git 对锁定和脏数据的检查。
    git(
        cwd,
        &[
            "worktree",
            "remove",
            "--",
            selected["path"].as_str().unwrap(),
        ],
    )?;
    worktrees(cwd)
}

pub fn execute(cwd: &Path, request: &Value) -> Result<Value> {
    match text(request, "type")? {
        "workspace.search" => search(cwd, request),
        "workspace.search.cancel" => {
            search_flag(text(request, "requestId")?).store(true, Ordering::Release);
            Ok(Value::Null)
        }
        "file.get" => file_value(&file_path(cwd, text(request, "path")?)?),
        "file.save" => save_file(cwd, request),
        "git.status" => git_status(cwd),
        "git.diff" => {
            let mut args = vec!["--literal-pathspecs", "diff", "--no-ext-diff", "--no-color"];
            if request["staged"].as_bool().unwrap_or(false) {
                args.push("--cached");
            }
            let path = request["path"].as_str();
            args.push("--");
            if let Some(path) = path {
                relative(path)?;
                args.push(path);
            } else {
                args.push(".");
            }
            Ok(json!({"diff":String::from_utf8_lossy(&git(cwd, &args)?.stdout)}))
        }
        "git.stage" | "git.unstage" => {
            let files = paths(request)?;
            let mut args = vec!["--literal-pathspecs"];
            if request["type"] == "git.stage" {
                args.extend(["add", "--"]);
            } else {
                let head = crate::platform::hidden(
                    Command::new("git")
                        .args(["rev-parse", "--verify", "--quiet", "HEAD"])
                        .current_dir(cwd),
                )
                .output()
                .map_err(|error| error.to_string())?;
                if head.status.success() {
                    args.extend(["reset", "--quiet", "HEAD", "--"]);
                } else if head.status.code() == Some(1) {
                    args.extend(["rm", "--cached", "--"]);
                } else {
                    return Err(String::from_utf8_lossy(&head.stderr).to_string());
                }
            }
            args.extend(files.iter().map(String::as_str));
            git(cwd, &args)?;
            git_status(cwd)
        }
        "git.commit" => {
            let message = text(request, "message")?;
            if message.trim().is_empty() {
                return Err("请填写提交说明。".into());
            }
            let output = git(cwd, &["commit", "-m", message])?;
            Ok(json!({"output":String::from_utf8_lossy(&output.stdout),"status":git_status(cwd)?}))
        }
        "worktree.list" => worktrees(cwd),
        "worktree.add" => worktree_add(cwd, request),
        "worktree.remove" => worktree_remove(cwd, request),
        _ => Err("未知工作区操作。".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("omp-workspace-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn saving_preserves_encoding_and_rejects_external_changes() {
        let cwd = directory();
        let path = cwd.join("中文.txt");
        fs::write(&path, "\u{feff}第一行\r\n第二行\r\n").unwrap();
        let before = execute(&cwd, &json!({"type":"file.get","path":"中文.txt"})).unwrap();
        execute(&cwd, &json!({"type":"file.save","path":"中文.txt","content":"第一行\n修改\n","baseRevision":before["revision"]})).unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "\u{feff}第一行\r\n修改\r\n"
        );
        let changed = fs::read(&path).unwrap();
        assert!(execute(&cwd, &json!({"type":"file.save","path":"中文.txt","content":"旧内容","baseRevision":before["revision"]})).is_err());
        assert_eq!(fs::read(&path).unwrap(), changed);
        assert!(execute(&cwd, &json!({"type":"file.get","path":"../escape.txt"})).is_err());
        fs::remove_dir_all(cwd).unwrap();
    }

    #[test]
    fn mixed_endings_keep_unchanged_lines_and_cancel_search() {
        assert_eq!(
            line_endings("甲\r\n乙\n丙\r\n", "甲\n修改\n丙\n"),
            "甲\r\n修改\n丙\r\n"
        );
        let cwd = directory();
        fs::write(cwd.join("text.txt"), "匹配\n匹配\n").unwrap();
        let limited = execute(
            &cwd,
            &json!({"type":"workspace.search","query":"匹配","requestId":"limit","limit":1}),
        )
        .unwrap();
        assert_eq!(limited["matches"].as_array().unwrap().len(), 1);
        assert_eq!(limited["truncated"], true);
        execute(
            &cwd,
            &json!({"type":"workspace.search.cancel","requestId":"cancel"}),
        )
        .unwrap();
        let cancelled = execute(
            &cwd,
            &json!({"type":"workspace.search","query":"匹配","requestId":"cancel"}),
        )
        .unwrap();
        assert_eq!(cancelled["cancelled"], true);
        assert!(cancelled["matches"].as_array().unwrap().is_empty());
        fs::remove_dir_all(cwd).unwrap();
    }

    #[test]
    fn unborn_git_stage_unstage_and_commit() {
        let cwd = directory();
        git(&cwd, &["init", "--quiet"]).unwrap();
        git(&cwd, &["config", "user.name", "测试"]).unwrap();
        git(&cwd, &["config", "user.email", "test@example.invalid"]).unwrap();
        fs::write(cwd.join("文件.txt"), "内容\n").unwrap();
        execute(&cwd, &json!({"type":"git.stage","paths":["文件.txt"]})).unwrap();
        assert_eq!(git_status(&cwd).unwrap()["items"][0]["staged"], true);
        execute(&cwd, &json!({"type":"git.unstage","paths":["文件.txt"]})).unwrap();
        assert!(cwd.join("文件.txt").exists());
        execute(&cwd, &json!({"type":"git.stage","paths":["文件.txt"]})).unwrap();
        execute(
            &cwd,
            &json!({"type":"git.commit","message":"测试：初次提交"}),
        )
        .unwrap();
        assert!(
            git_status(&cwd).unwrap()["items"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        let extra = cwd
            .parent()
            .unwrap()
            .join(format!("omp-worktree-test-{}", uuid::Uuid::new_v4()));
        execute(
            &cwd,
            &json!({"type":"worktree.add","path":extra,"branch":"功能测试"}),
        )
        .unwrap();
        execute(
            &cwd,
            &json!({"type":"worktree.add","path":extra,"branch":"功能测试"}),
        )
        .unwrap();
        fs::write(extra.join("未提交.txt"), "保留").unwrap();
        assert!(execute(&cwd, &json!({"type":"worktree.remove","path":extra})).is_err());
        assert!(extra.join("未提交.txt").exists());
        fs::remove_file(extra.join("未提交.txt")).unwrap();
        fs::write(extra.join(".gitignore"), ".env\n").unwrap();
        git(&extra, &["add", ".gitignore"]).unwrap();
        git(&extra, &["commit", "-m", "测试：保留忽略文件"]).unwrap();
        fs::write(extra.join(".env"), "本地配置").unwrap();
        assert!(execute(&cwd, &json!({"type":"worktree.remove","path":extra})).is_err());
        assert!(extra.join(".env").exists());
        fs::remove_file(extra.join(".env")).unwrap();
        execute(&cwd, &json!({"type":"worktree.remove","path":extra})).unwrap();
        assert!(!extra.exists());
        execute(&cwd, &json!({"type":"worktree.remove","path":extra})).unwrap();
        fs::remove_dir_all(cwd).unwrap();
    }
}
