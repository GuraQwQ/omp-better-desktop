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
| session.close | id | `{path}`; refuses while unsettled; `path` is null until the session is persisted |
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

`runtime` is null or `{path,version,revision,...}`. Preferences contain `language:'en'|'zh'`, `theme:'system'|'light'|'dark'` and `motion:'rich'|'normal'|'reduced'`. Missing `motion` defaults to `rich`; reading an older configuration does not rewrite it. The UI does not import the engine. Native file/folder selection uses `@tauri-apps/plugin-dialog`.

## OMP 图形化配置

`session.rpc` 通过内置 OMP 的原生注册表、配置写入器与资源管理器执行配置操作，不调用模型。

- `desktop_settings {operation:'list'|'set'|'unset',key?,value?}` 返回 `{settings}`。设置按 `ui.tab/group` 分类，包含实际生效的 `provenance`；凭据只返回 `configured`。保存与恢复继承操作作用于当前配置档案的全局层，项目、覆盖文件和环境变量仍可提供更高优先级的值。
- `desktop_manage {resource,action,args?}` 返回列表 `{items}`、详情 `{item}`，或操作结果 `{message,restartRequired?}`。资源为 `models`、`mcp`、`skills`、`plugins`、`marketplaces`、`agents`、`ssh` 和 `resources`。各资源保留 OMP 原生的校验、作用域与持久化语义。
- 模型角色按照 `modelRoleStorage` 保存到全局或当前项目；模型预设通过 `preset_save/preset_apply/preset_delete` 管理。候选模型及可用思考程度来自运行时。
- 自定义提供商使用 `providers.config {operation:'list'|'save'|'delete',cwd,provider?}`，模型发现使用 `providers.discover {cwd,provider}`。提供商配置保存到当前数据根的 `omp/agent/models.yml`，命名配置档案使用 `omp/profiles/<profile>/agent/models.yml`（已有 `models.yaml` 时沿用）；只写入用户显式填写的逐模型覆盖，空值清除相应覆盖，其余字段采用供应商目录和 OMP 标准。
- `launch.get {cwd}` 与 `launch.set {cwd,profile}` 读取或保存当前项目的启动参数。支持追加/替换系统提示词、附加目录、工具集合、配置档案、覆盖文件和会话目录，以及规则、LSP、工具和计划开关。启动配置随 `desktop.json` 保存，新连接的 RPC 会话使用它；接管该会话的终端沿用相同参数。变更会话目录后保留旧目录的历史发现入口。

MCP 与 SSH 使用资源自身的用户/项目作用域；第三方只读来源不提供删除。技能编辑仅作用于 OMP 托管技能。插件使用原生 `install`/本地链接和市场管理器，配置页按插件声明的 schema 生成。Hooks 可启停；命令、模板和记忆资源提供来源与内容浏览。

桌面 RPC 与终端设置 `OMP_DESKTOP_MANAGED_RESOURCES=1`，技能和 MCP 的自动发现限定为 OMP 原生目录、托管技能与已启用的导入条目。“发现与导入”只有在用户点击操作后才扫描 `.agent/.agents`、Gemini、Claude、Codex、Trae、ZCode、CC Switch 以及用户指定目录。`desktop_manage {resource:'imports',action,args}` 支持 `sources/discover/list/link/enable/disable/remove`；初次链接保持停用，启用与重新连接由用户分别操作。

技能链接整个原始目录；MCP 链接原始配置所在目录，由适配器在内存中解析 JSON、TOML 或 CC Switch SQLite。注册表只保存来源引用、服务标识和启用状态，不保存凭据副本。SQLite 在真实原始路径以只读方式打开，以读取同目录 WAL。移除操作只删除受管链接与注册项，原数据保留。测试使用隔离的空技能、空 MCP 目录，真实本机发现测试保持所有链接停用。

### 外部格式映射

| 来源 | 技能与 MCP 来源 | 转为 OMP |
|---|---|---|
| `.agent/.agents` | `C:/.agent`、用户和项目对应目录下的 `skills/*/SKILL.md`、MCP JSON | 原技能目录链接；`mcpServers` 按原服务键读取 |
| Gemini / Antigravity | `.gemini/skills`、`config/skills`、`antigravity/skills`；Gemini `settings.json`；Antigravity 全局 `~/.gemini/config/mcp_config.json` 与工作区 `.agents/mcp_config.json` | `command/args/env/cwd` → stdio；Gemini `httpUrl` → HTTP、`url` → SSE；Antigravity `serverUrl`（或 `url`）→ Streamable HTTP；保留 headers、超时和可支持的 OAuth 元数据。技能与 MCP 管理列表返回原始 `importSource/importPath`，用于来源展示 |
| Claude | `.claude/skills`、`~/.claude.json` 顶层及 `projects[path].mcpServers`、项目 `.mcp.json` | 每个来源与服务键单独引用，保留项目来源及停用状态 |
| Codex | `.agents/skills`、`.codex/config.toml` 的 `[mcp_servers]` | `http_headers/env_http_headers/bearer_token_env_var` → 请求头；秒单位超时转毫秒；环境变量只在启用后的内存解析 |
| Trae | `.trae/skills`、项目 `.trae/mcp.json`；存在时探测 `Trae/User/mcp.json` 与 `Trae CN/User/mcp.json` | 原生 MCP JSON 映射；全局路径作为候选，不保证各版本一致 |
| ZCode | `.zcode/skills`、`~/.zcode/cli/config.json`、项目 `zcode.json/.zcode/config.json` | 读取 `mcp.servers`；映射 stdio/HTTP/SSE、`timeoutMs` 等字段 |
| CC Switch | `~/.cc-switch/skills` 或共享 `.agents/skills`，`~/.cc-switch/cc-switch.db` | `mcp_servers.server_config` JSON 按行 ID 只读解析，正文始终留在原技能目录 |

不支持的动态认证助手、令牌文件或授权类型会显示条目说明；这些条目可以保持链接，修正源配置后重新发现与链接再启用。

格式依据（2026-10-31 核对）：[Gemini MCP](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)、[Claude MCP](https://code.claude.com/docs/en/mcp)、[Codex MCP](https://developers.openai.com/codex/mcp)、[Codex Skills](https://developers.openai.com/codex/skills)、[Antigravity MCP](https://antigravity.google/docs/mcp)、[Antigravity Skills](https://antigravity.google/docs/skills/)、[Trae MCP](https://docs.trae.ai/ide/add-mcp-servers)、[ZCode 配置](https://github.com/zai-org/ZCode/blob/a60ba6a7e5a06742270ca605f5d2cc2766afa7e1/apps/zcode-cli/docs/usage/03-config.md)、[CC Switch schema](https://github.com/farion1231/cc-switch/blob/e49d12a5f90b70107cc4e69b6621d2e218524890/src-tauri/src/database/schema.rs#L64)。Trae 全局路径交叉参考 [skill-buddy](https://github.com/konnga/skill-buddy/blob/main/packages/core/src/mcp/catalog.ts)。

### 来源图标

`build` 调用 `scripts/fetch-agent-icons.ts`，将官方图标写到忽略的 `public/agent-icons/`，由 Vite 打入发布资源。已有有效 PNG 会直接复用；获取失败使用界面备用图标。来源、摘要和归属记录在同目录的 `manifest.json`，`clean` 同时清除这一可重建目录。界面不在启动时请求远程图标。

### 命令与任务清单

输入框的 `/` 补全合并构建时的 CLI/TUI 能力目录与当前会话的 `get_available_commands`。菜单只列出斜杠命令、已加载技能和扩展；选择候选只填写草稿，发送后按原生 RPC、配置页或内置终端执行。CLI、RPC 和工具仍在独立命令面板中使用各自入口。命令名称及参数保留原文，内置描述随界面语言切换；技能与扩展可提供 `descriptions.zh/en`，其余动态描述沿用来源原文。`available_commands_update` 更新当前会话的候选。TUI 命令的公开别名同样识别。

对话区域左侧使用独立的深色小板显示当前 Todo，默认摘要和进度，可展开分阶段列表；展开区域内部滚动，整板任务完成后自动隐藏。“上下文 → 进阶 → Todo 历史”按时间列出成功更新的完整快照。`get_state.todoPhases` 为权威快照，成功的原生 `todo` 工具结果实时更新它，`todo_auto_clear` 清空，`todo_reminder` 触发完整状态刷新。历史会话从最近一次成功工具结果恢复，已完成的任务不展示小板，切换会话不会混用任务。

界面动效使用原生 CSS 与 Web Animations。外观中的动画档位即时生效并持久化：默认“丰富”，菜单入场 180ms、弹窗 260ms、退场 120ms，增加局部渐变、轻微错峰与完成反馈；“正常”保留菜单 140ms、弹窗 220ms、退场 100ms；“减少”采用 80ms 淡入、60ms 退场及静态状态。档位同时应用于 CSS 和原生动画，不受系统偏好覆盖。首帧通过 `omp-motion` 缓存恢复，保存的应用配置为最终来源。排版变化的平移过渡在丰富/正常档分别为 220/180ms，减少档直接重排；三档均在重新换行后短暂校正当前可见文字的阅读位置，用户操作会取消校正。退出立即恢复交互焦点，保留的视觉层不可交互。

Host module ownership: `storage.rs` implements runtime/data functions taking `root: &Path`; `sessions.rs` owns RPC/PTY; `lib.rs` owns routing and application lifecycle. `storage.rs` exports `current_runtime`, `install_runtime`, `rollback_runtime`, `discover_omp`, `import_omp`, `takeover`, and `clean_cache`, returning `Result<serde_json::Value,String>` except `current_runtime` returns `Result<Option<PathBuf>,String>`.
