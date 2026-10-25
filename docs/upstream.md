# 上游集成与功能边界

`upstream.lock.json` 锁定 OMP 提交、运行时版本及 RPC 协议。桌面宿主与引擎分开构建，原始参考 checkout 留在产品仓库之外；发行只携带指定提交、可重放补丁、生成契约和配套运行时。

## 构建链

`bun run build:runtime` 创建隔离的上游 checkout，顺序应用 `patches/`，用 Bun 1.4 或更新版本安装上游锁定依赖并生成协议。Windows 原生 addon 与 OMP 使用相同版本，保证 ABI sentinel 一致；随后调用上游官方 release builder。

运行时包保存到 `artifacts/runtime-windows-x64`，包含 `omp.exe`、`LICENSE.omp`、上游 `THIRD-PARTY-NOTICES.txt` 和逐文件 SHA-256 manifest。生成协议与 Rust RPC 客户端来自同一已打补丁的源码。协议烟测、类型和 Rust 编译检查通过后才保留该候选；错误恢复会还原替换前文件。

`bun run build:desktop` 再生成 NSIS 安装器，默认输出到 `build/desktop-msvc/release/bundle/nsis`。缓存默认位于仓库 `.cache`；脚本发现系统 MSVC 与 SDK，或使用显式环境变量，不依赖维护者的磁盘布局。`OMP_SOURCE_ROOT` 可提供本地只读克隆源，默认从锁定上游远程克隆。

## 补丁

- `0001-desktop-runtime.patch`：绝对 `OMP_USER_ROOT`、统一 profile 根、通过上游注册表访问 `desktop_settings`、内置命令目录，以及 GUI OAuth 密码输入与取消处理。MCP 授权复用上游 OAuth 引擎。
- `0003-rpc-raw-call.patch`：在上游相关请求分发上暴露桌面所需 `call_raw`，保留单一传输实现。
- `0004-browser-session.patch`：`onBrowserSession` 映射为 `browser_session` UI 请求并支持取消，配套生成各语言 wire。

设置通过实际会话的 `desktop_settings` 读取和修改，不调用模型。字段元数据来自上游校验与持久化实现，凭据不作为普通设置值返回。

## 桌面执行入口

| 能力 | 执行方式 |
|---|---|
| 项目、会话、模型、设置、提供商、上下文、差异、任务与会话树 | 原生桌面页面 |
| new、quit、exit、restart | 原生会话生命周期 |
| btw、goal、live、queue | 上游 RPC；命令面板提供字段表单，旁支问答与语音/目标状态可见 |
| 具有通用 RPC 处理器的 slash 命令 | 上游 prompt 分发 |
| guided-goal、plan/vibe/loop、clear/delete、copy/open、skills，以及协作、录制等 TUI 专属交互 | 空闲会话交给内嵌终端，预填精确命令并提供运行入口；返回后重读实际会话 |
| 第三方自定义 TUI 组件 | 内嵌终端 |

`fresh` 保留上游清理提供商状态的语义；`clear` 保留原会话重置上下文的语义。目录中的执行 surface 来自上游注册信息，桌面选择器会按具体命令路由；[功能目录](feature-map.md) 是清单而非全功能验证声明。

## 登录桥接

常规 OAuth 授权 URL 与输入请求使用现有桌面交互，密码字段使用密码输入。MCP loopback OAuth 复用上游实现。

需要 `onBrowserSession` 的提供商在所选数据根下打开隔离的临时 WebView2 登录窗口，支持同环境登录弹窗。宿主只读取请求 URL 下指定名称的 cookie（包括 HttpOnly），直接回传给 OMP 验证，不进入 React 会话状态。关闭窗口、上游 abort、断开或超时会取消，结束后关闭窗口并清理临时浏览器数据；系统仍占用的缓存可在设置中重试清理。

真实 Perplexity 企业 SSO、付费提供商、外部 MCP 服务、实时语音设备和协作服务需要各自环境验证。MCP 手动回调码界面尚未补齐。部分身份提供方可能限制嵌入式浏览器，不能由本地协议与编译检查证明其兼容性。

## 验证

公开 CI 不依赖忽略的 `test/`，执行类型、Rust 格式与编译检查，以及隔离目录中的实际二进制 RPC 烟测；烟测只检查 ready、协议协商和 get_state，不发送模型请求。宿主内置小测试覆盖数据安装/迁移、cookie 选择和按会话取消；本地行为检查覆盖命令路由和会话事件。

完整构建不代表真实服务与安装体验已验收。发布前的干净克隆、附件哈希与人工安装检查见 [发行流程](releasing.md)。
