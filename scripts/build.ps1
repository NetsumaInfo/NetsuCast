<#
  Builds the standalone NetsuCast installer (NSIS .exe).
  1. checks that package.json, Cargo.toml and tauri.conf.json carry the same version
  2. runs scripts\install-tools.ps1 so a clean checkout has mpv, yt-dlp and deno in tools\mpv\
  3. stages a CLOSED list of those tools into src-tauri\resources\tools\mpv\ (+ VERSIONS.txt)
  4. tauri build (runs `pnpm build` first) -> src-tauri\target\release\bundle\nsis\*-setup.exe
     plus the updater signature (.sig) when the updater private key is available

  At runtime the tools sit in <install dir>\tools\mpv\ : on Windows Tauri installs resources next
  to the executable, which is the first folder src-tauri\src\tools.rs looks in.

  NOTE: this file is pure ASCII on purpose. Windows PowerShell 5.1 reads a BOM-less .ps1 as cp1252;
  any accented character or long dash would break the parse.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Mutex name distinct from NetsuBoard's and NetsuRush's: the checkouts build side by side and must
# never serialise against each other.
$buildMutex = New-Object System.Threading.Mutex($false, 'Local\NetsuCastBuild')
try { $hasBuildLock = $buildMutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $hasBuildLock = $true }
if (-not $hasBuildLock) {
  $buildMutex.Dispose()
  throw 'another NetsuCast build is already running'
}

try {
$tools = Join-Path $root 'tools\mpv'
$stageTools = Join-Path $root 'src-tauri\resources\tools\mpv'
$outDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'

Write-Host '== 1/4 Version check =='
$pkgVersion = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$confVersion = (Get-Content (Join-Path $root 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
$cargoLine = Get-Content (Join-Path $root 'src-tauri\Cargo.toml') | Where-Object { $_ -match '^version\s*=' } | Select-Object -First 1
$cargoVersion = ($cargoLine -replace '^version\s*=\s*"([^"]+)".*$', '$1')
if ($pkgVersion -ne $confVersion -or $pkgVersion -ne $cargoVersion) {
  throw "versions differ: package.json $pkgVersion, tauri.conf.json $confVersion, Cargo.toml $cargoVersion"
}
Write-Host "  NetsuCast $pkgVersion"
# The NSIS artefact is named after productName: NetsuCast_<version>_x64-setup.exe
$artifactFilter = "NetsuCast_$($pkgVersion)_*-setup.exe"

Write-Host '== 2/4 Player tools (mpv, yt-dlp, deno) =='
# Without -Force an existing mpv is kept and yt-dlp updates itself, so each release ships the
# newest yt-dlp (sites break older ones quickly).
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-tools.ps1')
if ($LASTEXITCODE -ne 0) { throw 'install-tools.ps1 failed' }

Write-Host '== 3/4 Stage tools into src-tauri\resources\tools\mpv =='
# CLOSED list. tools\mpv\ also holds what the upstream mpv archive carries for a standalone
# install: installer\ (mpv-install.bat registers file associations, updater.ps1 downloads and
# replaces executables), updater.bat, mpv-register.bat, doc\. None of it is used by NetsuCast, and
# a script that downloads executables inside an installer is exactly the dropper shape Defender's
# classifiers score (docs\code-signing.md). mpv.com, the console wrapper, is not needed either.
$shipped = @(
  'mpv.exe',
  'd3dcompiler_43.dll',
  'mpv\fonts.conf',
  'yt-dlp.exe',
  'deno.exe'
)
foreach ($relative in $shipped) {
  if (-not (Test-Path (Join-Path $tools $relative))) { throw "missing tool: tools\mpv\$relative" }
}
# The staging folder keeps its tracked files (THIRD-PARTY-NOTICES.txt, licenses\). Everything else
# is rebuilt, so a file dropped there by hand can never slip into the installer.
$tracked = @('THIRD-PARTY-NOTICES.txt', 'licenses')
New-Item -ItemType Directory -Force -Path $stageTools | Out-Null
Get-ChildItem -Path $stageTools -Force |
  Where-Object { $tracked -notcontains $_.Name } |
  ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
foreach ($relative in $shipped) {
  $target = Join-Path $stageTools $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -Force (Join-Path $tools $relative) $target
}
# Exact revisions, written into the installer: the mpv line names the git commit the GPL source
# offer points to (docs\licensing.md).
$mpvVersion = (& (Join-Path $stageTools 'mpv.exe') --version | Select-Object -First 3) -join "`r`n"
$ytdlpVersion = (& (Join-Path $stageTools 'yt-dlp.exe') --version | Select-Object -First 1)
$denoVersion = (& (Join-Path $stageTools 'deno.exe') --version | Select-Object -First 1)
$versions = @(
  "NetsuCast $pkgVersion - bundled third-party tools",
  '',
  '[mpv]',
  $mpvVersion,
  '',
  '[yt-dlp]',
  $ytdlpVersion,
  '',
  '[deno]',
  $denoVersion,
  ''
) -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $stageTools 'VERSIONS.txt'), $versions, [System.Text.UTF8Encoding]::new($false))
Write-Host $versions

Write-Host '== 4/4 tauri build (NSIS) =='
# Updater signature. createUpdaterArtifacts makes tauri build sign the installer with the private
# key; without it the build fails at the very end. Locally the key lives OUTSIDE the repository
# (docs\releasing.md); it is loaded here when the caller did not provide one.
# The key has no password, and the CLI must be told so: with no TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# it waits for a password prompt on stdin (even with CI=true) and the build hangs after the
# installer is written. Windows PowerShell 5.1 cannot hold an EMPTY environment variable (assigning
# '' deletes it), so tauri build is started below through ProcessStartInfo, whose environment block
# does keep an empty value.
$keyFile = Join-Path $env:USERPROFILE '.tauri\netsucast.key'
if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and (Test-Path $keyFile)) {
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyFile -Raw).Trim()
  Write-Host "  updater key: $keyFile"
}
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
  throw "updater private key missing: set TAURI_SIGNING_PRIVATE_KEY or restore $keyFile (docs\releasing.md)"
}

# Authenticode signature. OPT-IN through NETSUCAST_SIGN_COMMAND and deliberately not committed to
# tauri.conf.json: a permanent signCommand would break every build on a machine without the signing
# tool. Tauri runs the command on EVERY binary of the package, %1 = the file to sign.
# Unsigned, the installer still ships, but it restarts from zero SmartScreen reputation at every
# version. Details and certificate choice: docs\code-signing.md
$signConfig = Join-Path $root 'src-tauri\tauri.sign.conf.json'
if (Test-Path $signConfig) { Remove-Item -Force $signConfig }
$tauriArgs = @('--ci')
if ($env:NETSUCAST_SIGN_COMMAND) {
  $overlay = @{ bundle = @{ windows = @{ signCommand = $env:NETSUCAST_SIGN_COMMAND } } }
  $json = $overlay | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($signConfig, $json, [System.Text.UTF8Encoding]::new($false))
  $tauriArgs += @('--config', $signConfig)
  Write-Host "  Authenticode signing ON: $env:NETSUCAST_SIGN_COMMAND"
} else {
  Write-Warning 'NETSUCAST_SIGN_COMMAND not set: UNSIGNED installer (SmartScreen will warn).'
}
# Only the current version's artefact is removed: an old setup can never turn an incomplete build
# into a false success, and previous versions stay available.
if (Test-Path $outDir) {
  Get-ChildItem -Path $outDir -Filter $artifactFilter -File -ErrorAction SilentlyContinue |
    Remove-Item -Force
  Get-ChildItem -Path $outDir -Filter "$artifactFilter.sig" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force
}
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $env:ComSpec
$quoted = ($tauriArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
$psi.Arguments = '/d /s /c "pnpm tauri build ' + $quoted + '"'
$psi.WorkingDirectory = $root
$psi.UseShellExecute = $false
if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  $psi.EnvironmentVariables['TAURI_SIGNING_PRIVATE_KEY_PASSWORD'] = ''
}
$tauri = [System.Diagnostics.Process]::Start($psi)
$tauri.WaitForExit()
if ($tauri.ExitCode -ne 0) { throw "tauri build failed ($($tauri.ExitCode))" }

$out = Get-ChildItem -Path $outDir -Filter $artifactFilter -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $out -or $out.Length -le 0) { throw "NSIS installer missing or empty: $artifactFilter" }
if (-not (Test-Path "$($out.FullName).sig")) { throw "updater signature missing: $($out.Name).sig" }
Write-Host "`nInstaller ready: $($out.FullName)" -ForegroundColor Green
Write-Host "Next: pnpm update:manifest (writes latest.json beside it), see docs\releasing.md"
} finally {
  $buildMutex.ReleaseMutex()
  $buildMutex.Dispose()
}
