# Storage module contract

`src-tauri/src/storage.rs` is owned by the storage task. It needs `sha2`, `rusqlite` with `bundled,backup`, and Windows-only `winreg` in addition to serde/serde_json. The application must not start managed sessions while `data.import` runs; it must reject import while any session is open.

All operations take `root: &Path`. API: `current_runtime(root) -> Result<Option<PathBuf>, String>`; `runtime_info(root)`, `install_runtime(root, source: &Path)`, `rollback_runtime(root)`, `discover_omp(root)`, `import_omp(root, source: &Path)`, `takeover(root, enabled: bool)`, `clean_cache(root)` return `Result<Value,String>`.

The managed OMP user root is `root.join("omp")`; the application passes it as `OMP_USER_ROOT` to GUI and CLI processes. Runtime manifests are `runtime-manifest.json` with `{version,revision,protocolVersion,executable,files:[{path,sha256}]}`. Each path is relative to the manifest directory. `executable` must be included in `files`. A local manifest path or its containing directory is accepted. The revision and protocol version must match `upstream.lock.json`. A deterministic digest of the compatibility metadata and file inventory names the runtime directory. `runtime_info` returns null or `{path,version,revision,protocolVersion,id}`.

Migration copies an entire discovered OMP user root (including named profiles), taking SQLite snapshots. Discovery never prints or reads credentials. Import journal stores file paths and content digests, never contents. Source data remains untouched. Generated Windows CLI shims set `OMP_USER_ROOT`, resolve the active runtime selector on every invocation and preserve argument forwarding. Takeover does not modify user shell profile scripts.

Storage verification requires a working C compiler for bundled SQLite. The installed Rust GNU linker stub is insufficient (`cc1` is missing); use the desktop's MSVC build environment.

Implementation status: `storage.rs` is complete and rustfmt-clean. An isolated `cargo check --tests` and both embedded tests passed on 2026-10-22. The isolated test harness uses the same Rust source, SQLite's external-link feature and the existing Windows `winsqlite3.dll` copied to its F: cache; the desktop still uses bundled SQLite and needs the normal MSVC build. Tests cover verified/idempotent runtime activation + rollback and WAL-backed SQLite migration + preservation of subsequent local edits. No real user PATH or OMP data was changed during these checks.

## Relocatable startup follow-up

New `bootstrap.rs` is ready for root integration. Before starting any Tauri threads, `run()` should call `bootstrap::resolve_root()`, then `bootstrap::install_pending_runtime(&root)`, then `bootstrap::prepare_webview(&root)`. On error, call `bootstrap::show_startup_error(&error)` and return. All return `Result<_,String>`; `resolve_root` returns `PathBuf`, the others `()`. Add `mod bootstrap;` and replace the old hardcoded directory/environment setup. This module sets TEMP, TMP and WEBVIEW2_USER_DATA_FOLDER before WebView creation.

Root resolution: OMP_DESKTOP_HOME, executable-adjacent portable.json, then native Windows folder selection (F: default offered). `OMP_WEBVIEW2_RUNTIME` / WEBVIEW2_BROWSER_EXECUTABLE_FOLDER / portable.json fixed-runtime path is supported; otherwise `tauri::webview_version()` detects Evergreen, with a native picker if absent. No download or global environment write occurs. A `runtime-install.json` marker triggers the normal verified installation before UI startup and is removed only on success. The local `scripts/install.ps1` makes this marker, installs a relocatable portable.json, and validates/copies files idempotently. See docs/install.md.

Ownership remains bootstrap.rs, scripts/install.ps1 and docs/install.md; root owns lib.rs integration. PowerShell parser, rustfmt and the portable path unit test pass. The local installer was exercised twice with synthetic executables/manifests: it retained relative data paths and a Fixed Version runtime path, and rejected a C: destination before writing. Native startup checks follow integration.
