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
| session.ui | id, response | native: null; asynchronous ask: `{accepted,ack}` or `{cancelled:true}` |
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

## 异步提问

`preferences.asyncQuestions` 默认 `true`，设置中的“异步提问”切换对新连接生效；缺少此字段的旧配置按开启处理，读取不会重写配置。开启时由桌面宿主直接提供同名 `ask` 工具，登记问题后立即返回 `{status:'pending',questionId}`，代理可继续处理不依赖答案的工作。关闭后新连接使用 OMP 原生同步 `ask`。用户显式关闭全部工具或在工具清单中排除 `ask` 时，沿用该选择。

宿主复用上游 `ClientOptions.tools`、HostTool 与 RPC，不修改内核或 vendor。同名注册前，RPC 进程在用户启动参数之后追加受管的 `<dataRoot>/cache/host-ask.json` 配置覆盖，将原生 `ask.enabled` 设为 `false`，再注册宿主 `ask`，避免上游的同名工具冲突。覆盖文件幂等安装、原子替换，由现有缓存清理入口管理；不写用户 OMP 设置，也不进入终端接管参数。OMP 配置视图中的原生 `ask.enabled` 来源会反映这个覆盖文件，宿主工具仍可用。

问题复用 `extension_ui_request` 的 `method:'ask'`，增加 `async:true`，包含一至三个问题，字段沿用原生 `id/question/header/options/multi/recommended`。`recommended` 为选项索引，仅作提示，不代替用户选择。选项支持描述，空选项允许自由输入。GUI 的草稿、提交状态和错误按会话与问题 ID 保存在内存；切设置和切会话保留草稿，不持久化秘密输入。问题内容内部滚动，提交和取消按钮保持可见；卡片内 Esc 仅取消该问题，Ctrl/Cmd+Enter 提交。

回答仍通过 `session.ui` 回到所属会话。宿主识别自己的问题 ID，经原生 `prompt` 的 `streamingBehavior:'steer'` 通道送达，只等待命令 ACK；模型在下一安全边界读取答案，不中断正在执行的工具。正常 ACK 成功后的重复提交不重发，发送失败保留问题供用户重试。协议没有业务幂等键，若答案已收到但 ACK 丢失，手动重试仍可能重复。

等待回答期间不会释放空闲会话；普通任务完成仍保留未答问题。取消、停止、关闭、断连、重连及切换底层会话清理对应问题。问题状态限定本次应用生命周期。原有 `confirm/input/editor/select/open_url` 继续使用各自协议，工具审批沿用 OMP 策略。

## OMP 图形化配置

`session.rpc` 通过内置 OMP 的原生注册表、配置写入器与资源管理器执行配置操作，不调用模型。

实验分支的 `tokenOptimization.promptGuidance` 默认关闭，可在“上下文 → Token 优化”开启。开启后在原生模板内统一工具、Todo 和验证规则；普通本地非 PTY 命令说明为内嵌 brush/Bash，PTY 与 ACP 客户端终端按实际外部 Shell 配置说明。修改 `shellPath` 会刷新内联工具说明。自动补全的 raw 读取路径通过完整工具结果批次后的独立模型上下文反馈，保留 raw 正文和持久化历史原样。

`tokenOptimization.programmatic` 单独控制 eval 的批量读取；模板整理复用工具和 prelude 说明。两项均不承诺减少完整任务 token，需分别对照验证。测试脚本、夹具、请求记录和报告仅保存在本机忽略目录。

- `desktop_settings {operation:'list'|'set'|'unset',key?,value?}` 返回 `{settings}`。设置按 `ui.tab/group` 分类，包含实际生效的 `provenance`；凭据只返回 `configured`。保存与恢复继承操作作用于当前配置档案的全局层，项目、覆盖文件和环境变量仍可提供更高优先级的值。
- `desktop_manage {resource,action,args?}` 返回列表 `{items}`、详情 `{item}`，或操作结果 `{message,restartRequired?}`。资源为 `models`、`mcp`、`skills`、`plugins`、`marketplaces`、`agents`、`ssh` 和 `resources`。各资源保留 OMP 原生的校验、作用域与持久化语义。
- 模型角色按照 `modelRoleStorage` 保存到全局或当前项目；模型预设通过 `preset_save/preset_apply/preset_delete` 管理。候选模型及可用思考程度来自运行时。
- 模型目录、能力和逐模型参数统一来自原生模型注册表中的提供商配置。显式配置的提供商采用用户选择的模型清单，其余已登录提供商沿用原生目录；模型选择器和角色页读取同一目录。保存或删除配置后刷新同一配置档案的已连接会话，进行中的调用使用原参数，下一次调用绑定更新后的能力。各会话保留当前选模和思考程度；当前模型被删除时需要重新选模。保存结果中的 `refreshErrors` 展示已保存配置对应的刷新问题。
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

当前 Todo 使用可拖动的悬浮面板，默认收起为任务图标，悬停显示当前任务和进度；展开后分阶段显示清单，面板位置限制在工作区内，拖动或收起均不改变聊天与预览分栏的宽度。Alt + 方向键可微调位置，拖动时按 Esc 恢复原位；任务全部完成后自动隐藏。“上下文 → 进阶 → Todo 历史”按时间列出成功更新的完整快照。`get_state.todoPhases` 为权威快照，成功的原生 `todo` 工具结果实时更新它，`todo_auto_clear` 清空，`todo_reminder` 触发完整状态刷新。历史会话从最近一次成功工具结果恢复，已完成的任务不展示小板，切换会话不会混用任务。

界面动效使用原生 CSS 与 Web Animations。外观中的动画档位即时生效并持久化：默认“丰富”，菜单入场 180ms、弹窗 260ms、退场 120ms，增加局部渐变、轻微错峰与完成反馈；“正常”保留菜单 140ms、弹窗 220ms、退场 100ms；“减少”采用 80ms 淡入、60ms 退场及静态状态。档位同时应用于 CSS 和原生动画，不受系统偏好覆盖。首帧通过 `omp-motion` 缓存恢复，保存的应用配置为最终来源。排版变化的平移过渡在丰富/正常档分别为 220/180ms，减少档直接重排；三档均在重新换行后短暂校正当前可见文字的阅读位置，用户操作会取消校正。退出立即恢复交互焦点，保留的视觉层不可交互。

Host module ownership: `storage.rs` implements runtime/data functions taking `root: &Path`; `sessions.rs` owns RPC/PTY; `lib.rs` owns routing and application lifecycle. `storage.rs` exports `current_runtime`, `install_runtime`, `rollback_runtime`, `discover_omp`, `import_omp`, `takeover`, and `clean_cache`, returning `Result<serde_json::Value,String>` except `current_runtime` returns `Result<Option<PathBuf>,String>`.

前端 `SessionLifecycle` 集中管理会话建立、恢复、重连、身份、事件合并、状态快照、历史分页及请求顺序。同一来源的建立请求共享结果，无持久路径的草稿在运行 ID 替换后仍能定位连接；历史补齐失败保留可见身份并允许重试。本地操作即时发布，运行时事件按帧发布；后到的旧快照保留请求期间已经更新的字段。轻量刷新继承未完成的完整历史刷新，切换底层会话时合并新历史和期间到达的消息，并保持工具调用与结果配对。草稿与页面选择由界面管理，连接等待期间用户的新输入优先保留。

桌面斜杠命令由 `resolveCommand` 统一解释来源、参数和执行去向，输入框与命令面板共用这份规则。原生 RPC 与 CLI 表单继续直接使用生成协议；扩展同名命令由其原生来源处理。MCP 的发现与运行时读取共用来源格式 Module，各来源 Adapter 集中处理原配置读取、停用状态和格式映射，导入登记继续负责链接与启停。

OMP 的 RPC、CLI 和内置终端统一设置 `PI_NATIVES_DIR=<dataRoot>/cache/natives`，原生模块在此按版本解压和复用；临时目录统一为 `<dataRoot>/cache/tmp`。`runtime.clean` 沿用现有受管缓存清理规则，后续启动从内嵌资源重建。应用启动时按已保存的接管状态幂等刷新 CLI 入口，保留接管选择；单文件原子替换支持中断后重试。原有全局 OMP 缓存保持其原有归属。

输入框支持粘贴图片、Windows 剪贴板中的本地文件，以及拖入文件或文件夹。图片保留完整预览并以原始图片内容发送；文件卡片显示完整名称与路径，发送时追加路径引用。浏览器提供但没有本地路径的文件保存到数据目录的 `omp/agent/attachments/`，供后续会话读取；明确移除尚未发送的托管附件时同步移除该副本，外部原始文件保持原样。

运行耗时以观察到的 `agent_start` 为起点保存在会话状态，切换会话或重挂载界面保留；任务结束后清除。没有起点的中途恢复会话显示运行状态，收到下一次真实起点后再显示耗时。OMP 连接失败时设置页保留具体阶段和内核标准错误的尾部，支持原地重试。

### 桌面工作区与资料库

通用设置包含轮次显示、后台完成通知、异步提问和四个默认关闭的开关：结构化评审、浏览器工作区入口、浮动任务卡、外部会话查看。外观只管理语言、主题与动效。features 的局部保存合并现有设置，避免快速修改不同开关互相覆盖。勾选与开关统一使用全局控件样式，减少动态效果时保留清晰的最终状态。

| 请求 | 关键字段 | 返回或行为 |
|---|---|---|
| workspace.search / workspace.search.cancel | cwd, query, requestId | 遵循忽略规则的全文匹配；可取消 |
| file.get / file.save | cwd, path, content, baseRevision | 读取版本；保留编码与换行，冲突保留草稿 |
| git.status / git.diff / git.stage / git.unstage / git.commit | cwd, paths?, message? | 状态、差异与 Git 操作 |
| worktree.list / worktree.add / worktree.remove | cwd, path?, branch?, ref? | Git 管理工作树 |
| shell.open/list/read/write/resize/rename/close | cwd?, id?, name?, data?, cols?, rows? | 独立终端；desktop-shell 事件带 id 和单调 seq |
| session.search / session.locate / session.after | query?, cwd?, path?, messageId?, cursor?, limit? | 正文搜索、目标附近消息、向后分页 |
| session.archive / session.archives | path?, archived? | 桌面归档元数据与恢复 |
| usage.summary | cwd? | 用量、模型、项目和日期汇总 |
| external.sessions / external.history | source, home?, path?, id?, cursor? | 按需只读 Codex JSONL/SQLite 和 ZCode SQLite |
| artifact.list/add/read/remove | cwd?, path?, id?, name? | 文件登记、HTML/图片/Markdown 预览；移除只删登记 |
| layout.get/set / desktop.state.get/set | key, value? | 布局、批注、评审和网址历史 |
| schedule.list/save/claim/started/finish/recover/retry/remove | job?, runId?, sessionId?, status?, id? | 持久计划、独占领取、运行记录与恢复 |
| export.markdown | path, sessionPath 或 messages, title, mode | 全部记录或助手结果；覆盖需原版本 |
| browser.open / system.open_url | url | 系统默认浏览器；浏览器工作区开关仅控制其面板 |
| card.open/sync/get/focus | id, value?, sessionId? | 独立任务卡；关闭设置时收回卡片窗口 |

工作区、资料库和各业务面板分模块维护。App 连接入口与会话；调度和布局在独立 Hook 中，终端生命周期由原生 `ManagedPty` 管理。OMP 终端接管与独立终端共享启动、输入、尺寸和回收规则，各自保留输出事件和缓冲。Windows 的 ConPTY 主机与终端子进程一起托管，正常关闭、取消和持有者异常退出均回收本次创建的进程。

选段操作栏按点击位置显示，并在视口边缘翻转或夹紧；旁问与批注使用独立侧栏。旁问以稳定会话路径保存问答、选段与草稿，沿用原生 btw 流式事件，并显式携带当前保留的连续问答。清空或逐条删除后，后续请求只使用剩余上下文；迟到事件不能写回已清除的记录，取消绑定原请求的运行会话。清空、持久化或取消失败均保留可重试入口。

`SideQuestionSession` 集中处理旁问的发送、确认、实时事件与历史合并，复用 `SideQuestionStorage` 串行保存。侧栏负责输入与可见性，主窗口只转交事件和读取摘要；卸载后仍完成取消与保存，空闲时释放控制器及订阅。

配置页复用当前可用连接；当前会话只读或恢复失败时，使用项目内的后台空连接读取 MCP、模型角色与 OMP 配置，关闭设置后回收该连接。

计划任务在应用运行期间执行；重复任务在重开后最多补一次并跳到未来，不重复领取同一计划。中断运行保留记录，手动重试可恢复；保存失败保留表单。Markdown 全量导出从历史文件读取，包含已分页之外的记录。HTML 工具通过独立 artifact 文档协议运行，页面与宿主 IPC 隔离。

### 生成式UI

独立生成式UI设置默认关闭，采用 OpenUI Lang 和自定义组件注册。25 个基础布局、文本、表单与表格组件默认选择，用户按分组或单项调整；图表、地图、数学和媒体默认未选。实时进度预览默认关闭，开启后随流式源码增量显示；HTML 脚本在源码完整后运行。主题、本地状态、动作回传、HTML、脚本与已选宿主读取能力可分别控制。诊断、修复、自动修复、复验和持久化默认关闭。

“显示源码查看按钮”默认关闭；开启后在生成界面外的下方留白显示 24×24 源码图标，原位展开可滚动代码区，开关变化保留本地输入和持久化标识。本地生成与修复复用已配置的 OMP 模型，开发窗口关闭 OpenUI 云端调试面板的自动挂载。

GenUI runtime、地图和公式在实际使用时加载，关闭或未选组件不请求其重模块。组件注册与发送给助手的说明来自同一份配置；首次使用或说明变化时注入，保留原始用户草稿。设置立即响应并顺序保存，旧回包不覆盖新选择，失败保留选择并可重试。

genui.get/save/call/clear 由原生配置门控；可选持久化用 genui.sqlite 的短事务和 baseRevision 检查。文档与状态使用稳定会话路径和消息块标识，修复使用目标与源码版本链，旧修复不会覆盖新源码。genui.document/document.release 注册短期独立文档，genui 协议响应提供自身 CSP；脚本通过受控消息桥请求已选能力。本地表单变化不调用模型，动作或修复请求才发送消息。

`GenUIViews` 统一管理生成界面输入、卸载缓存、保存队列与冲突恢复。清空等待已发出的保存完成并撤销旧排队写入，期间的新编辑在清空后保存。`sendGenUIPrompt` 只在实际发送确认后记住说明注入；动作与修复获得提交失败反馈，发送忙碌或失败时保留可重试状态。
