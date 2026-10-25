#Requires -Version 7.0
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$TaskArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
$cacheRoot = if ($env:OMP_DESKTOP_CACHE) { [IO.Path]::GetFullPath($env:OMP_DESKTOP_CACHE) } else { Join-Path $projectRoot '.cache' }
if ([IO.Path]::GetPathRoot($cacheRoot).TrimEnd('\') -ieq 'C:') { throw 'Choose a non-C: OMP_DESKTOP_CACHE.' }
$env:OMP_DESKTOP_CACHE = $cacheRoot
$env:BUN_INSTALL_CACHE_DIR = Join-Path $cacheRoot 'bun'
$env:npm_config_cache = Join-Path $cacheRoot 'npm'
$env:TAURI_BUNDLER_CACHE_DIR = Join-Path $cacheRoot 'tauri'
if (-not $env:CARGO_HOME) { $env:CARGO_HOME = Join-Path $cacheRoot 'cargo' }
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $projectRoot 'build/desktop-msvc' }
$env:TEMP = Join-Path $cacheRoot 'tmp'
$env:TMP = $env:TEMP
[IO.Directory]::CreateDirectory($env:TEMP) | Out-Null
if (-not $env:OMP_DESKTOP_HOME) { $env:OMP_DESKTOP_HOME = Join-Path $projectRoot '.local-data' }
if ($env:RUSTUP_HOME) { $env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');$env:PATH" }
$msvc = $env:MSVC_ROOT
if (-not $msvc) {
    $vswhere = if ($env:VSWHERE) { $env:VSWHERE } else { "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" }
    $vsRoot = if ($env:VS_INSTALL_ROOT) { $env:VS_INSTALL_ROOT } else { & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
    if (-not $vsRoot) { throw 'Install Visual Studio C++ Build Tools or set MSVC_ROOT.' }
    $msvc = (Get-ChildItem -LiteralPath (Join-Path $vsRoot 'VC/Tools/MSVC') -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).FullName
}
$sdkRoot = if ($env:WINDOWS_SDK_ROOT) { $env:WINDOWS_SDK_ROOT } else { "${env:ProgramFiles(x86)}\Windows Kits\10" }
$sdkVersion = if ($env:WINDOWS_SDK_VERSION) { $env:WINDOWS_SDK_VERSION } else { (Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Include') -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name }
$env:MSVC_ROOT = $msvc
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $msvc 'bin/Hostx64/x64/link.exe'
$env:PATH = "$(Join-Path $msvc 'bin/Hostx64/x64');$env:PATH"
$env:INCLUDE = (@((Join-Path $msvc 'include')) + @('ucrt', 'shared', 'um', 'winrt', 'cppwinrt' | ForEach-Object { Join-Path $sdkRoot "Include/$sdkVersion/$_" })) -join ';'
$env:LIB = @((Join-Path $msvc 'lib/x64'), (Join-Path $sdkRoot "Lib/$sdkVersion/ucrt/x64"), (Join-Path $sdkRoot "Lib/$sdkVersion/um/x64")) -join ';'
Set-Location $projectRoot
if ($TaskArgs.Count -eq 0) { $TaskArgs = @('desktop', 'dev') }
$bun = if ($env:BUN_EXECUTABLE) { $env:BUN_EXECUTABLE } else { 'bun' }
& $bun run @TaskArgs
exit $LASTEXITCODE
