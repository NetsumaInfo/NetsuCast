# Downloads the player tools NetsuCast drives: mpv (shinchiro Windows build, the one linked from
# mpv.io) and yt-dlp (official release). Both land in tools\mpv\, which is git-ignored.
# yt-dlp sits next to mpv.exe on purpose: Windows looks in the caller's folder first, so mpv's
# ytdl hook finds it without touching PATH.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-tools.ps1 [-Force]
#
# Without -Force an existing mpv is kept and yt-dlp only updates itself (sites break it often).

param([switch]$Force)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'tools\mpv'
$mpvExe = Join-Path $dest 'mpv.exe'
$ytdlpExe = Join-Path $dest 'yt-dlp.exe'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

function Get-File([string]$Url, [string]$OutFile) {
    Write-Host "[INFO] Downloading $Url"
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile -Headers @{ 'User-Agent' = 'NetsuCast-installer' }
}

# --- mpv -------------------------------------------------------------------------------------
if ((Test-Path $mpvExe) -and -not $Force) {
    Write-Host "[OK] mpv already installed ($mpvExe). Use -Force to reinstall."
} else {
    $apiHeaders = @{ 'User-Agent' = 'NetsuCast-installer' }
    # CI runners share IPs and hit the anonymous API rate limit; the workflow passes its token.
    if ($env:GITHUB_TOKEN) { $apiHeaders['Authorization'] = "Bearer $env:GITHUB_TOKEN" }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest' -Headers $apiHeaders
    # Plain x86_64 build, not "-v3": v3 needs AVX2 and gains nothing measurable for playback.
    $asset = $release.assets | Where-Object { $_.name -match '^mpv-x86_64-\d{8}-git-[0-9a-f]+\.7z$' } | Select-Object -First 1
    if (-not $asset) { throw "No mpv x86_64 asset in release $($release.tag_name)." }

    $archive = Join-Path $env:TEMP $asset.name
    Get-File $asset.browser_download_url $archive

    # System32 tar is bsdtar (libarchive), which reads 7z. A GNU tar earlier in PATH would not.
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    $staging = Join-Path $env:TEMP 'netsucast-mpv'
    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
    New-Item -ItemType Directory -Path $staging | Out-Null
    & $tar -xf $archive -C $staging
    if ($LASTEXITCODE -ne 0) { throw "Extraction failed ($archive)." }

    Get-ChildItem $staging -Force | ForEach-Object { Copy-Item $_.FullName -Destination $dest -Recurse -Force }
    Remove-Item -Recurse -Force $staging
    Remove-Item -Force $archive
    Write-Host "[OK] mpv $($release.tag_name) installed."
}

# --- yt-dlp ----------------------------------------------------------------------------------
if ((Test-Path $ytdlpExe) -and -not $Force) {
    Write-Host '[INFO] Updating yt-dlp...'
    & $ytdlpExe -U
} else {
    Get-File 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' $ytdlpExe
    Write-Host '[OK] yt-dlp installed.'
}

# --- deno ------------------------------------------------------------------------------------
# yt-dlp needs a JavaScript runtime to solve YouTube's player challenges; without it formats go
# missing. Deno is the one it enables by default.
$denoExe = Join-Path $dest 'deno.exe'
if ((Test-Path $denoExe) -and -not $Force) {
    Write-Host "[OK] deno already installed."
} else {
    $zip = Join-Path $env:TEMP 'netsucast-deno.zip'
    Get-File 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip' $zip
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Remove-Item -Force $zip
    Write-Host '[OK] deno installed.'
}

& $mpvExe --version | Select-Object -First 1
