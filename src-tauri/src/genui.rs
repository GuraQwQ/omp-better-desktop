use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

struct HtmlDocument {
    html: String,
    csp: String,
    created: Instant,
}
fn documents() -> &'static Mutex<HashMap<String, HtmlDocument>> {
    static DOCUMENTS: OnceLock<Mutex<HashMap<String, HtmlDocument>>> = OnceLock::new();
    DOCUMENTS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn publish_document(request: &Value) -> Result<Value, String> {
    let csp = text(request, "csp")?;
    tauri::http::HeaderValue::from_str(csp).map_err(|error| error.to_string())?;
    let mut documents = documents().lock().map_err(|error| error.to_string())?;
    documents.retain(|_, document| document.created.elapsed() < Duration::from_secs(600));
    let token = uuid::Uuid::new_v4().to_string();
    documents.insert(
        token.clone(),
        HtmlDocument {
            html: text(request, "html")?.into(),
            csp: csp.into(),
            created: Instant::now(),
        },
    );
    while documents.len() > 128
        || documents.len() > 1
            && documents
                .values()
                .map(|document| document.html.len())
                .sum::<usize>()
                > 16 * 1024 * 1024
    {
        if let Some(oldest) = documents
            .iter()
            .filter(|(id, _)| **id != token)
            .min_by_key(|(_, document)| document.created)
            .map(|(id, _)| id.clone())
        {
            documents.remove(&oldest);
        } else {
            break;
        }
    }
    Ok(json!({"token":token}))
}

pub fn document_response(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let token = request.uri().path().strip_prefix('/');
    let document = documents().lock().ok().and_then(|mut documents| {
        documents.retain(|_, document| document.created.elapsed() < Duration::from_secs(600));
        token
            .and_then(|token| documents.get(token))
            .map(|document| (document.html.clone(), document.csp.clone()))
    });
    let (status,html,csp) = document.map_or_else(|| (404,"<!doctype html><html lang=\"zh\"><meta charset=\"utf-8\"><p>界面文档已更新，请重新渲染。</p></html>".into(),"default-src 'none'; style-src 'unsafe-inline'".into()), |(html,csp)| (200,html,csp));
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", csp)
        .header("Cache-Control", "no-store")
        .body(html.into_bytes())
        .unwrap()
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key].as_str().ok_or_else(|| format!("缺少 {key}"))
}

fn preferences(root: &Path) -> Result<Value, String> {
    let path = root.join("desktop.json");
    if !path.exists() {
        return Ok(Value::Null);
    }
    let config: Value = serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    Ok(config["preferences"]["generativeUI"].clone())
}

fn database(root: &Path) -> Result<Connection, String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let mut connection =
        Connection::open(root.join("genui.sqlite")).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let version: u32 = transaction
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version > 1 {
        return Err("生成式 UI 数据格式较新，请更新应用后读取。".into());
    }
    if version == 0 {
        transaction.execute_batch("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision TEXT NOT NULL); PRAGMA user_version=1;").map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(connection)
}

fn read(connection: &Connection, id: &str) -> Result<Option<Value>, String> {
    let body: Option<String> = connection
        .query_row("SELECT body FROM documents WHERE id=?1", [id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?;
    body.map(|body| serde_json::from_str(&body).map_err(|error| error.to_string()))
        .transpose()
}

fn capability(cwd: &Path, request: &Value, config: &Value) -> Result<Value, String> {
    if config["features"]["hostCalls"].as_bool() == Some(false) {
        return Err("宿主能力已关闭。".into());
    }
    let name = text(request, "capability")?;
    let defaults = [
        "workspace.files",
        "workspace.read",
        "workspace.diff",
        "workspace.search",
    ];
    let allowed = config["capabilities"].as_array().map_or_else(
        || defaults.contains(&name),
        |names| names.iter().any(|value| value.as_str() == Some(name)),
    );
    if !allowed {
        return Err("此宿主能力未开启。".into());
    }
    let args = &request["args"];
    match name {
        "workspace.files" => {
            let cwd = cwd.canonicalize().map_err(|error| error.to_string())?;
            let mut items = Vec::new();
            let mut truncated = false;
            for entry in ignore::WalkBuilder::new(&cwd).follow_links(false).build() {
                let entry = entry.map_err(|error| error.to_string())?;
                if entry.file_type().is_some_and(|kind| kind.is_file()) {
                    if items.len() == 1000 {
                        truncated = true;
                        break;
                    }
                    if let Ok(path) = entry.path().strip_prefix(&cwd) {
                        items.push(path.to_string_lossy().replace('\\', "/"));
                    }
                }
            }
            Ok(json!({"files":items,"truncated":truncated}))
        }
        "workspace.read" => crate::workspace_tools::execute(
            cwd,
            &json!({"type":"file.get","path":text(args,"path")?}),
        ),
        "workspace.diff" => crate::workspace_tools::execute(cwd, &json!({"type":"git.diff"})),
        "workspace.search" => {
            let mut value = crate::workspace_tools::execute(
                cwd,
                &json!({"type":"workspace.search","query":text(args,"query")?,"requestId":uuid::Uuid::new_v4().to_string()}),
            )?;
            if let Some(matches) = value["matches"].as_array_mut() {
                matches.truncate(args["limit"].as_u64().unwrap_or(100).clamp(1, 100) as usize);
            }
            Ok(value)
        }
        _ => Err("未知宿主能力。".into()),
    }
}

pub fn execute(root: &Path, request: &Value) -> Result<Value, String> {
    let operation = text(request, "type")?;
    if operation == "genui.document.release" {
        documents()
            .lock()
            .map_err(|error| error.to_string())?
            .remove(text(request, "token")?);
        return Ok(Value::Null);
    }
    let config = preferences(root)?;
    if operation == "genui.clear" {
        let path = root.join("genui.sqlite");
        if !path.exists() {
            return Ok(json!({"cleared":0}));
        }
        let connection = database(root)?;
        let count = connection
            .execute("DELETE FROM documents", [])
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch("VACUUM;")
            .map_err(|error| error.to_string())?;
        return Ok(json!({"cleared":count}));
    }
    if config["enabled"].as_bool() != Some(true) {
        return if operation == "genui.get" {
            Ok(Value::Null)
        } else {
            Err("生成式 UI 已关闭。".into())
        };
    }
    if operation == "genui.document" {
        if config["features"]["html"].as_bool() == Some(false) {
            return Err("HTML 文档已关闭。".into());
        }
        return publish_document(request);
    }
    if operation == "genui.call" {
        return capability(Path::new(text(request, "cwd")?), request, &config);
    }
    if config["features"]["persistence"].as_bool() != Some(true) {
        return Ok(Value::Null);
    }
    let id = text(request, "id")?;
    let mut connection = database(root)?;
    if operation == "genui.get" {
        return Ok(read(&connection, id)?.unwrap_or(Value::Null));
    }
    if operation != "genui.save" {
        return Err("未知生成式 UI 操作。".into());
    }
    let source = text(request, "source")?;
    let kind = text(request, "kind")?;
    if !matches!(kind, "openui" | "html") || !request["state"].is_object() {
        return Err("生成式 UI 文档格式无效。".into());
    }
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let previous = read(&transaction, id)?;
    let base = request["baseRevision"].as_str();
    if previous
        .as_ref()
        .and_then(|value| value["revision"].as_str())
        != base
    {
        return Err("界面已在其他视图更新，请重新读取后重试；当前输入仍保留。".into());
    }
    let mut body = json!({"version":1,"id":id,"source":source,"kind":kind,"state":request["state"],"configurationKey":request["configurationKey"]});
    let revision = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&body).map_err(|error| error.to_string())?)
    );
    body["revision"] = json!(revision);
    transaction.execute("INSERT INTO documents(id,body,revision) VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET body=excluded.body,revision=excluded.revision",params![id,serde_json::to_string(&body).map_err(|error| error.to_string())?,revision]).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistence_is_optional_and_concurrent_save_is_recoverable() {
        let root = std::env::temp_dir().join(format!("omp-genui-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let preferences_path = root.join("desktop.json");
        assert!(
            execute(&root, &json!({"type":"genui.get","id":"view"}))
                .unwrap()
                .is_null()
        );
        assert!(!root.join("genui.sqlite").exists());
        fs::write(preferences_path,serde_json::to_vec(&json!({"preferences":{"generativeUI":{"enabled":true,"features":{"persistence":true},"capabilities":[]}}})).unwrap()).unwrap();
        let request = json!({"type":"genui.save","id":"view","source":"root=Text(\"你好\")","kind":"openui","state":{"name":"中文"},"baseRevision":null});
        let saved = execute(&root, &request).unwrap();
        assert!(
            execute(&root, &request)
                .unwrap_err()
                .contains("界面已在其他视图更新")
        );
        assert_eq!(
            execute(&root, &json!({"type":"genui.get","id":"view"})).unwrap(),
            saved
        );
        assert!(
            execute(
                &root,
                &json!({"type":"genui.call","cwd":root,"capability":"workspace.files","args":{}})
            )
            .is_err()
        );
        execute(&root, &json!({"type":"genui.clear"})).unwrap();
        assert!(
            execute(&root, &json!({"type":"genui.get","id":"view"}))
                .unwrap()
                .is_null()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn different_interfaces_save_concurrently_without_lock_upgrade_errors() {
        let root =
            std::env::temp_dir().join(format!("omp-genui-concurrent-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("desktop.json"),serde_json::to_vec(&json!({"preferences":{"generativeUI":{"enabled":true,"features":{"persistence":true}}}})).unwrap()).unwrap();
        let barrier = std::sync::Barrier::new(2);
        let results = std::thread::scope(|scope| {
            let workers: Vec<_> = [
                ("openui-view", "openui", "root=Text(\"你好\")"),
                ("html-view", "html", "<input name=\"name\">"),
            ]
            .into_iter()
            .map(|(id, kind, source)| {
                let root = &root;
                let barrier = &barrier;
                scope.spawn(move || {
                    let mut saved = Value::Null;
                    let mut errors = Vec::new();
                    // 同时从空数据库开始，随后逐轮并发更新各自的界面。
                    for round in 0..16 {
                        barrier.wait();
                        match execute(root, &json!({"type":"genui.save","id":id,"source":source,"kind":kind,"state":{"round":round},"baseRevision":saved["revision"]})) {
                            Ok(value) => saved = value,
                            Err(error) => errors.push(error),
                        }
                    }
                    (id, saved, errors)
                })
            })
            .collect();
            workers
                .into_iter()
                .map(|worker| worker.join().unwrap())
                .collect::<Vec<_>>()
        });
        for (id, saved, errors) in results {
            assert!(errors.is_empty(), "{id} 并发保存失败：{errors:?}");
            assert_eq!(saved["state"]["round"], 15);
            assert_eq!(
                execute(&root, &json!({"type":"genui.get","id":id})).unwrap(),
                saved
            );
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn html_protocol_has_its_own_policy_and_releases_documents() {
        let published=publish_document(&json!({"html":"<!doctype html><p>中文界面</p>","csp":"default-src 'none'; script-src 'nonce-test'"})).unwrap();
        let token = published["token"].as_str().unwrap();
        let request = || {
            tauri::http::Request::builder()
                .uri(format!("http://genui.localhost/{token}"))
                .body(Vec::new())
                .unwrap()
        };
        let response = document_response(request());
        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers()["Content-Security-Policy"],
            "default-src 'none'; script-src 'nonce-test'"
        );
        assert_eq!(
            String::from_utf8(response.into_body()).unwrap(),
            "<!doctype html><p>中文界面</p>"
        );
        documents().lock().unwrap().remove(token);
        assert_eq!(document_response(request()).status(), 404);
        assert!(publish_document(&json!({"html":"test","csp":"header\ninvalid"})).is_err());
    }

    #[test]
    fn host_capabilities_read_only_selected_workspace_data() {
        let root =
            std::env::temp_dir().join(format!("omp-genui-capability-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("说明.txt"), "中文内容\n检索目标\n").unwrap();
        let configuration = json!({"enabled":true});
        let call = |name: &str, args: Value| {
            capability(
                &root,
                &json!({"capability":name,"args":args}),
                &configuration,
            )
            .unwrap()
        };
        assert!(
            call("workspace.files", json!({}))["files"]
                .as_array()
                .unwrap()
                .contains(&json!("说明.txt"))
        );
        assert_eq!(
            call("workspace.read", json!({"path":"说明.txt"}))["content"],
            "中文内容\n检索目标\n"
        );
        assert_eq!(
            call("workspace.search", json!({"query":"检索目标"}))["matches"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(
            capability(
                &root,
                &json!({"capability":"workspace.files","args":{}}),
                &json!({"capabilities":[]})
            )
            .is_err()
        );
        assert!(
            capability(
                &root,
                &json!({"capability":"workspace.read","args":{"path":"../desktop.json"}}),
                &configuration
            )
            .is_err()
        );
        fs::remove_dir_all(root).unwrap();
    }
}
