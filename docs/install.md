# Local Windows installation

Private builds ship as a desktop executable plus a matching OMP runtime directory containing `runtime-manifest.json`. No GitHub login or online bootstrap is needed.

Use PowerShell 7:

```powershell
./scripts/install.ps1 `
  -DesktopExe 'F:/build/omp-better-desktop.exe' `
  -RuntimePackage 'F:/build/runtime-windows-x64' `
  -Destination 'F:/Applications/Better OMP Desktop' `
  -DataRoot 'F:/omp-better-desktop' `
  -Launch
```

The installer validates package checksums, copies through temporary files and preserves existing data. Rerunning it skips matching files and retries incomplete copies. Each staged runtime has its own manifest-derived directory, so an interrupted update leaves the previous package intact. Close the desktop before replacing its executable. On first launch, the desktop validates compatibility and activates the runtime using the same managed installation operation as the settings UI. Failed activation keeps the pending request for retry.

The default installation directory is `F:/omp-better-desktop/app`. Without `-DataRoot`, a new installation keeps data in `data` beside the executable; repeated installs retain the existing location. `portable.json` records relative paths where possible, so the entire installation can be moved together. External data directories stay external. A completed runtime import can be verified in Settings; its source package may be kept for reinstalling.

## Data location

Startup checks these locations in order:

1. An explicit `OMP_DESKTOP_HOME` environment variable.
2. `portable.json` beside the executable, with a `dataRoot` field.
3. A native folder selection; on machines with F:, the dialog offers `F:/omp-better-desktop` first.

Application data, temporary files and WebView cache use the selected non-C: location. Existing OMP source data is discovered separately and is never moved or deleted automatically. If an extracted executable is on C:, move it to a writable non-C: directory or use the local installer before configuring its portable marker.

## WebView2

The desktop uses an already installed WebView2 runtime when available. It does not download the Evergreen installer or write a browser runtime to C:.

If WebView2 is missing, obtain and extract Microsoft's **Fixed Version WebView2 Runtime** to a non-C: directory. Pass the directory containing `msedgewebview2.exe`:

```powershell
./scripts/install.ps1 -DesktopExe 'F:/build/omp-better-desktop.exe' `
  -RuntimePackage 'F:/build/runtime-windows-x64' `
  -WebView2Runtime 'F:/Runtimes/WebView2'
```

You can also set `OMP_WEBVIEW2_RUNTIME` or `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER`. Explicit environment configuration takes precedence over `webview2RuntimePath` in `portable.json`. If no runtime is detected, startup offers a native folder picker before creating a WebView. The Fixed Version runtime remains a separately measured disk/download cost.

The first private installation path is the local script. The Tauri NSIS configuration skips automatic WebView2 installation; public installer and code-signing validation remain release work.

## Restore and remove

Use Settings to restore the previous managed runtime. Revoke CLI takeover before removing the desktop if you enabled it. Application files and data have separate locations: removing the executable does not remove sessions, credentials or imported files. Source OMP data remains at its original location.
