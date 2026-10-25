# 贡献说明

当前以 Windows x64 为构建和验证目标。开发依赖与构建命令见根目录 README；从干净克隆开始时，先安装锁定依赖并运行 `bun run build:runtime`，再启动桌面。

改动保持在相应边界：React 不导入 OMP 引擎；Rust 宿主管理进程、数据和 WebView；上游功能通过可重放补丁修改。更新 OMP 时同时更新锁定提交、生成协议和 Rust RPC 客户端，以运行时烟测验证同一组输入。`upstream.lock.json` 记录版本锁定原因和更新责任，Bun 1.4 是当前上游发行构建的最低要求，CI 使用 1.4.4 复现已验证构建；上游更新负责人需同步复查工具版本。

提交前执行：

```powershell
bun run check
./scripts/dev.ps1 desktop build --no-bundle
```

Rust 改动另执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`。涉及运行时或协议时重新执行 `bun run build:runtime`，它执行实际二进制的协议烟测。公开检查入口由 `.github/workflows/check.yml` 定义。为有行为变化的逻辑增加小而聚焦的验证；不要为改文案扩展套件。

本机 `test/` 保留忽略规则，公开 CI 不依赖该目录。提交使用中文说明。PR 写明用户可见变化、验证结果与仍未验证的外部服务。Issue 模板提供复现信息入口。
