# Windows 安装、迁移与恢复

## 预览安装器

Windows x64 的 NSIS 安装包包含匹配的 OMP 运行时。下载后核对 `SHA256SUMS`，再运行安装器。预览包未签名；首次启动需选择可写的非系统盘数据目录。桌面程序只使用已安装的 WebView2 或明确指定的 Fixed Version 运行时。

程序安装位置与首次启动时选择的数据位置独立。安装目录存放桌面程序与随包 OMP；数据根存放配置、托管运行时、OMP 会话和凭据，以及浏览器与临时数据。卸载应用文件不会自动删除数据根。

## 数据位置

启动按以下顺序选择数据根：

1. `OMP_DESKTOP_HOME` 环境变量。
2. 可执行文件旁 `portable.json` 的 `dataRoot` 字段，支持相对路径。
3. 原生目录选择框。

开发脚本默认使用仓库下 `.local-data`；发行安装不依赖开发目录。选择已有数据根可以恢复原有配置和托管会话。更换位置前关闭所有会话和终端，备份并复制整个数据根，再通过环境变量或 `portable.json` 指向副本。

## 导入已有 OMP 数据

在设置的数据页面发现并导入既有 OMP 用户根。导入会复制源数据，保留命名 profiles，对 SQLite 数据库生成一致性快照，并通过迁移日志记录逐文件进度。中断后使用同一来源重试；已导入后的本地修改不会被重复导入覆盖。原目录继续保留。操作前关闭本应用所有会话和终端，并退出正在写入源数据的其他 OMP 实例。

托管 CLI 与桌面使用同一 `OMP_USER_ROOT`。若启用了 CLI 接管，卸载前先在设置中撤销；普通 OMP 的原始用户根不会因撤销而被删除。

## 本地解包安装

`scripts/install.ps1` 适用于自行编译的宿主与运行时包。它校验文件清单和 SHA-256，逐文件替换，重复运行会跳过内容相同的文件；中断后可使用相同参数重试。它不替代 NSIS 安装器。

```powershell
./scripts/install.ps1 `
  -DesktopExe './build/desktop-msvc/release/omp-better-desktop.exe' `
  -RuntimePackage './artifacts/runtime-windows-x64' `
  -Destination 'D:/Applications/Better OMP Desktop' `
  -DataRoot 'D:/OMPData' `
  -Launch
```

这些路径是示例，可替换为自己的非系统盘路径。已安装目录中的 `portable.json` 会被复用；省略 `DataRoot` 时保留现有配置，新安装默认使用安装目录下的 `data`。

## WebView2

已有 Evergreen WebView2 时直接复用。缺少时可从 Microsoft 获取 Fixed Version WebView2，解压到自选目录，再传入包含 `msedgewebview2.exe` 的文件夹：

```powershell
./scripts/install.ps1 `
  -DesktopExe './build/desktop-msvc/release/omp-better-desktop.exe' `
  -RuntimePackage './artifacts/runtime-windows-x64' `
  -Destination 'D:/Applications/Better OMP Desktop' `
  -WebView2Runtime 'D:/Runtimes/WebView2'
```

也可设置 `OMP_WEBVIEW2_RUNTIME` 或 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER`。环境变量优先于 `portable.json` 的 `webview2RuntimePath`；未检测到运行时时，启动过程提供原生目录选择。NSIS 不自动下载 WebView2，Fixed Version 的磁盘占用另计。

## 运行时恢复与清理

在设置中导入匹配的本地运行时包或回退到上一份托管运行时。操作前关闭活动会话和终端。运行时文件按 manifest 校验，内容不同的包保存在独立目录，完成后才切换当前版本。

设置中的缓存清理只处理应用管理的缓存。开发时 `bun run clean` 清理仓库的 `.cache`、`build`、`dist`，保留 `.local-data` 和 `artifacts/runtime-windows-x64`。移除应用或清理构建不会删除已有 OMP 源数据。
