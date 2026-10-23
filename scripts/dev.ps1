param([Parameter(ValueFromRemainingArguments = $true)][string[]]$TaskArgs)
$ErrorActionPreference = 'Stop'
$env:BUN_INSTALL_CACHE_DIR = 'F:\omp-better-desktop\cache\bun'
$env:npm_config_cache = 'F:\omp-better-desktop\cache\npm'
$env:CARGO_HOME = 'O:\Depth learning\AI_PVP\.tools\rust\cargo-home'
$env:RUSTUP_HOME = 'O:\Depth learning\AI_PVP\.tools\rust\rustup-home'
$env:CARGO_TARGET_DIR = 'F:\omp-better-desktop\build\desktop-msvc'
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
$compilerBin = 'F:\omp-better-desktop\tools\llvm-mingw-20261020-ucrt-x86_64\bin'
if (Test-Path -LiteralPath $compilerBin) {
    $env:PATH = "$compilerBin;$env:PATH"
    $env:CC = 'clang-cl'
    $env:CXX = 'clang-cl'
    $env:AR = 'llvm-lib'
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $env:RUSTUP_HOME 'toolchains\stable-x86_64-pc-windows-msvc\lib\rustlib\x86_64-pc-windows-msvc\bin\rust-lld.exe'
    $sdk = 'F:\omp-better-desktop\tools\msvc-sdk'
    $env:INCLUDE = "$sdk\crt\include;$sdk\sdk\include\ucrt;$sdk\sdk\include\shared;$sdk\sdk\include\um;$sdk\sdk\include\winrt"
    $env:LIB = "$sdk\crt\lib\x86_64;$sdk\sdk\lib\ucrt\x86_64;$sdk\sdk\lib\um\x86_64"
}
$env:OMP_DESKTOP_HOME = 'F:\omp-better-desktop'
$env:TAURI_BUNDLER_CACHE_DIR = 'F:\omp-better-desktop\cache\tauri'
$env:TEMP = 'F:\omp-better-desktop\cache\tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Set-Location (Split-Path $PSScriptRoot)
if ($TaskArgs.Count -eq 0) { $TaskArgs = @('desktop', 'dev') }
& bun run @TaskArgs
exit $LASTEXITCODE
