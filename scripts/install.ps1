#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DesktopExe,
    [string]$RuntimePackage,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$DataRoot,
    [string]$WebView2Runtime,
    [switch]$Launch
)

$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)

function Resolve-NonSystemPath([string]$Value) {
    $resolved = [IO.Path]::GetFullPath($Value)
    if ([IO.Path]::GetPathRoot($resolved).TrimEnd('\', '/') -ieq 'C:') {
        throw "Choose a directory outside C: for installation and application data: $resolved"
    }
    $ancestor = $resolved
    while (-not (Test-Path -LiteralPath $ancestor)) {
        $parent = Split-Path -Parent $ancestor
        if (-not $parent -or $parent -eq $ancestor) { throw "The destination drive is unavailable: $resolved" }
        $ancestor = $parent
    }
    $item = Get-Item -LiteralPath $ancestor
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $target = $item.ResolveLinkTarget($true)
        if ($target -and [IO.Path]::GetPathRoot($target.FullName).TrimEnd('\', '/') -ieq 'C:') {
            throw "The selected directory resolves to C: through a link: $resolved"
        }
    }
    return $resolved
}

function Write-AtomicText([string]$Path, [string]$Value) {
    $temporary = "$Path.pending"
    [IO.File]::WriteAllText($temporary, $Value + "`n", $utf8)
    [IO.File]::Move($temporary, $Path, $true)
}

function Copy-Checked([string]$Source, [string]$Target, [string]$Expected) {
    if ((Test-Path -LiteralPath $Target -PathType Leaf) -and (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash -ieq $Expected) { return }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Target)) | Out-Null
    $temporary = "$Target.pending"
    Copy-Item -LiteralPath $Source -Destination $temporary -Force
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ine $Expected) {
        throw "Checksum mismatch while installing $Source. Existing files remain available; retry the installer."
    }
    [IO.File]::Move($temporary, $Target, $true)
}

$installDirectory = Resolve-NonSystemPath $Destination
$desktopSource = (Resolve-Path -LiteralPath $DesktopExe).Path
if (-not (Test-Path -LiteralPath $desktopSource -PathType Leaf)) { throw 'DesktopExe must be a compiled desktop executable.' }
$packageSource = if ($RuntimePackage) {
    (Resolve-Path -LiteralPath $RuntimePackage).Path
} else {
    Join-Path (Split-Path -Parent $desktopSource) 'runtime-windows-x64'
}
if (-not (Test-Path -LiteralPath $packageSource)) { throw "OMP runtime package not found: $packageSource" }
$packageSource = (Resolve-Path -LiteralPath $packageSource).Path
$manifestPath = if (Test-Path -LiteralPath $packageSource -PathType Container) { Join-Path $packageSource 'runtime-manifest.json' } else { $packageSource }
$packageSource = Split-Path -Parent $manifestPath
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $manifest.files -or -not $manifest.executable -or -not $manifest.revision -or $manifest.protocolVersion -ne 2) {
    throw 'Select a matching OMP runtime package with its runtime-manifest.json.'
}
$configPath = Join-Path $installDirectory 'portable.json'
$previous = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
if (-not $DataRoot) {
    $DataRoot = if ($previous) { [IO.Path]::GetFullPath($previous.dataRoot, $installDirectory) } else { Join-Path $installDirectory 'data' }
}
$managedRoot = Resolve-NonSystemPath $DataRoot
$fixedRuntime = $null
if ($WebView2Runtime) {
    $fixedRuntime = (Resolve-Path -LiteralPath $WebView2Runtime).Path
    if (-not (Test-Path -LiteralPath (Join-Path $fixedRuntime 'msedgewebview2.exe') -PathType Leaf)) {
        throw 'WebView2Runtime must be an extracted Fixed Version runtime folder containing msedgewebview2.exe.'
    }
}

[IO.Directory]::CreateDirectory($installDirectory) | Out-Null
[IO.Directory]::CreateDirectory($managedRoot) | Out-Null
$packageDestination = Join-Path $installDirectory 'runtime-windows-x64'
[IO.Directory]::CreateDirectory($packageDestination) | Out-Null
$names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($file in $manifest.files) {
    if ([IO.Path]::IsPathRooted($file.path) -or $file.path -match '(^|[\\/])\.\.([\\/]|$)' -or -not $names.Add($file.path)) {
        throw "Invalid or duplicate runtime package path: $($file.path)"
    }
    $source = [IO.Path]::GetFullPath((Join-Path $packageSource $file.path))
    $target = [IO.Path]::GetFullPath((Join-Path $packageDestination $file.path))
    if (-not $source.StartsWith($packageSource.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        -not $target.StartsWith($packageDestination.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Runtime file escapes its package: $($file.path)"
    }
    if ($file.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ine $file.sha256) {
        throw "Runtime checksum mismatch: $($file.path)"
    }
    Copy-Checked $source $target $file.sha256
}
if (-not $names.Contains($manifest.executable)) { throw 'The runtime executable is absent from the file inventory.' }
Copy-Checked $manifestPath (Join-Path $packageDestination 'runtime-manifest.json') (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
$installedExe = Join-Path $installDirectory 'omp-better-desktop.exe'
Copy-Checked $desktopSource $installedExe (Get-FileHash -LiteralPath $desktopSource -Algorithm SHA256).Hash
foreach ($name in @('LICENSE', 'THIRD-PARTY-NOTICES.md')) {
    $source = Join-Path (Split-Path $PSScriptRoot) $name
    Copy-Checked $source (Join-Path $installDirectory $name) (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
}

$location = [ordered]@{ dataRoot = [IO.Path]::GetRelativePath($installDirectory, $managedRoot) }
if ($fixedRuntime) { $location.webview2RuntimePath = [IO.Path]::GetRelativePath($installDirectory, $fixedRuntime) }
elseif ($previous -and $previous.webview2RuntimePath) { $location.webview2RuntimePath = $previous.webview2RuntimePath }
Write-AtomicText $configPath ($location | ConvertTo-Json)

[pscustomobject]@{
    executable = $installedExe
    dataRoot = $managedRoot
    runtimePackage = $packageDestination
    webview2 = if ($location.webview2RuntimePath) { [IO.Path]::GetFullPath($location.webview2RuntimePath, $installDirectory) } else { 'Existing system WebView2; missing installations prompt for an extracted Fixed Version runtime' }
} | Format-List
if ($Launch) { Start-Process -FilePath $installedExe -WorkingDirectory $installDirectory -WindowStyle Hidden }
