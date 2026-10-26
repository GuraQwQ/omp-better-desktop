# Windows 发行流程

当前发行目标为 Windows x64。版本字段保存在 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json`，发版时同步编辑，并更新 `Cargo.lock` 中的本项目条目，不生成另一份版本文件。

## 公开基线

合入前审阅工作树差异、跟踪文件、分支和标签；根目录许可证、第三方说明、README 和安装文档必须与实际发行内容一致。`test/`、依赖、数据根、参考 checkout 与构建产物保留在忽略规则中。可用临时目录从待发布提交作干净克隆，按 README 安装依赖、构建并核对输出；本机原有 `node_modules` 或 `artifacts` 不能替代此检查。

## 自动检查与上游更新

`check.yml` 在 Windows 上安装锁定依赖，检查 TypeScript 和 Rust 格式，再重建锁定 OMP、执行不调用模型的协议烟测与桌面编译检查。

`upstream-runtime.yml` 每 12 小时检查一次最新上游 Release，也可手动运行。只读任务克隆并构建候选运行时，验证后上传生成文件差异。独立的写入任务把生成协议、客户端与版本锁提出 PR；它不构建或执行上游代码。

随后显式触发该 PR 分支上的 `check.yml`。自动更新分支执行完整 `build:desktop`，将同一候选提交的 NSIS 安装器、SHA-256、许可证和 `build-info.json` 上传为预构建产物。构建后要求生成文件与已提交内容一致；产物按运行次数命名，支持重新运行。

`upstream-release.yml` 接收成功的 Windows 检查完成事件，按运行的 head 查找对应自动更新 PR，只处理同仓库的 `automation/omp-*` 分支。它校验预构建来源与 SHA-256，再按匹配的 head squash 合并。`main` 要求 GitHub Actions 的 `windows` 检查成功且分支与当前基线同步；检查失败、分支落后或存在冲突时，PR 保持打开，后续更新流程会重新准备候选。整个验证过程在 GitHub 上执行。

合并后，处理任务要求候选与合并提交的 Git tree 一致，再从原 Windows 运行下载的产物创建 `vX.Y.Z-preview.pr.N` 标签对应的发行，`N` 为 PR 号，标签指向合并提交。先创建草稿并上传全部附件，再公开为 Pre-release；发布阶段不重新编译。相同输入重试会复用草稿；已公开发行只核对标签和全部附件摘要，保留原有产物。中断后可重新运行该发布任务。

仓库允许 GitHub Actions 创建 PR，并将 `windows` 设为 `main` 的必需检查。`GITHUB_TOKEN` 创建的 PR 可能要求批准自动触发的工作流，因此使用 `workflow_dispatch` 明确调度检查，再通过 `workflow_run` 执行合并与发布，不依赖机器人合并后的 push 事件；见 [触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)和 [workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。构建任务保持只读，写权限仅用于创建 PR、调度检查和合并/发布的对应任务。

Bun 1.4.4 是当前已验证的发行工具版本；锁定 OMP、原生 addon 与生成 wire 的原因是协议和 ABI 兼容。更新责任人为仓库维护者，升级时同步重新验证这些输入。

## 手动创建 Windows 发行草稿

1. 在待发布提交上创建正式 `vX.Y.Z` 或预览 `vX.Y.Z-preview.N` 标签，`X.Y.Z` 与桌面各版本字段一致；将版本说明写入 `docs/releases/X.Y.Z.md`。
2. 推送该标签后，在 Actions 手动运行“Windows 发行”（`preview-release.yml`），填写已有标签。
3. 流程在只读任务中重新构建运行时与安装器，生成 `SHA256SUMS` 和许可附件；另一个只具发行写权限的任务创建草稿，正式标签使用普通 Release，预览标签使用 Pre-release。
4. 维护者检查附件哈希、实际安装、首次启动、升级与数据保留，完善版本说明后发布草稿。

同一草稿可重复运行来更新附件；已经公开的发行不会被流程覆盖。当前安装器未签名，发行说明必须保留该事实与 WebView2 要求。后续启用签名时同步修改安装器验证与发行说明。
