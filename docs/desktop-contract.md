# Desktop boundary

The webview calls `invoke('desktop_command', { request })`. Requests have a string `type` and the fields below. Results are JSON. Failures reject with a readable error. The host emits `desktop-event` with `{ sessionId, event }`, where event is the original OMP frame; lifecycle events use `{type:'desktop_status',status,error?}`. Terminal output uses `{type:'terminal_data',data}` and termination `{type:'terminal_exit'}`.

| Request type | Fields | Result |
|---|---|---|
| bootstrap | none | `{dataRoot,runtime,preferences,projects}` |
| preferences.set | patch | updated preferences |
| runtime.install | path (local package directory/manifest) | installation record |
| runtime.rollback | none | installation record |
| runtime.clean | none | cleanup summary |
| data.discover | none | array of `{path,profiles,sessionCount,...}` |
| data.import | path | migration summary |
| data.takeover | enabled | takeover status |
| project.add | path | updated projects array (`{path,name}`) |
| project.remove | path | updated projects array |
| session.list | cwd? | `{path,id,title,cwd,updatedAt}[]` |
| session.history | path, cursor?, limit? | `{messages,nextCursor}`; no agent process |
| session.open | cwd, path? | `{id,cwd,path?,state}` |
| session.close | id | null; refuses while unsettled |
| session.rpc | id, command | OMP response data |
| session.ui | id, response | null; extension_ui_response frame |
| workspace.diff | cwd | `{diff,status}` |
| workspace.files | cwd | relative file path array |
| workspace.read | cwd,path | string |
| command.catalog | none | generated built-in/CLI feature catalog |
| command.cli | cwd,args | `{stdout,stderr,code}`; uses managed runtime |
| terminal.open | id,cols,rows | `{id}`; transfer idle session to TUI |
| terminal.write | id,data | null |
| terminal.resize | id,cols,rows | null |
| terminal.close | id | null; resume through session.open |

`runtime` is null or `{path,version,revision,...}`. Preferences contain `language:'en'|'zh'`, `theme:'system'|'light'|'dark'`. The UI does not import the engine. Native file/folder selection uses `@tauri-apps/plugin-dialog`.

Host module ownership: `storage.rs` implements runtime/data functions taking `root: &Path`; `sessions.rs` owns RPC/PTY; `lib.rs` owns routing and application lifecycle. `storage.rs` exports `current_runtime`, `install_runtime`, `rollback_runtime`, `discover_omp`, `import_omp`, `takeover`, and `clean_cache`, returning `Result<serde_json::Value,String>` except `current_runtime` returns `Result<Option<PathBuf>,String>`.
