# tanku Anime one-line installer for Windows (PowerShell 5.1 or newer).
#
#   irm https://raw.githubusercontent.com/DanielDcool/tankuanime/master/scripts/install.ps1 | iex
#
# What it does (idempotent - run it again to update):
#   1. Downloads the source zip into %USERPROFILE%\tankuanime (no git needed). If that folder is
#      already a git checkout, it runs `git pull --ff-only` instead.
#   2. Makes sure Node.js 22 is available: uses the one on PATH if it is already 22, otherwise
#      downloads the official nodejs.org build into tankuanime\.tools\node (SHA-256 verified).
#   3. Makes sure ffmpeg + ffprobe are available: uses PATH if present, otherwise downloads the
#      gyan.dev "release essentials" build linked from ffmpeg.org into tankuanime\.tools\ffmpeg.
#   4. npm ci (skipped when package-lock.json did not change and node_modules exists).
#   5. npm run setup:jmdict (dictionary; failure is not fatal).
#   6. Puts a "tanku Anime" shortcut on the Desktop and launches the app once.
#
# Nothing here needs administrator rights, touches the system PATH, or edits profiles. Everything
# lives inside the install folder; deleting it (plus the Desktop shortcut) is a complete uninstall.
#
# Environment overrides:
#   TANKU_INSTALL_DIR    install folder (default: $env:USERPROFILE\tankuanime)
#   TANKU_REF            git ref to download (default: master; CI passes a commit SHA)
#   TANKU_NO_LAUNCH=1    do not start the app at the end
#   TANKU_SKIP_JMDICT=1  skip the dictionary download

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is much faster without the progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$RepoUrl   = 'https://github.com/DanielDcool/tankuanime'
$Ref       = if ($env:TANKU_REF) { $env:TANKU_REF } else { 'master' }
$InstallDir = if ($env:TANKU_INSTALL_DIR) { $env:TANKU_INSTALL_DIR } else { Join-Path $env:USERPROFILE 'tankuanime' }
$ToolsDir  = Join-Path $InstallDir '.tools'
$NodeDist  = 'https://nodejs.org/dist/latest-v22.x'
$FfmpegZip = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$Launcher  = 'tanku Anime.bat'
$Arch      = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }

function Log($msg)  { Write-Host "`n[tanku Anime] $msg" }
function Warn($msg) { Write-Host "`n[tanku Anime] WARNING: $msg" -ForegroundColor Yellow }
function Fail($msg) { throw "[tanku Anime] ERROR: $msg" }

function Download($url, $dest) {
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

function Sha256($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }

function HaveCommand($name) { $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

# Native commands are probed with ErrorActionPreference=Continue: on Windows PowerShell 5.1,
# anything a native command writes to stderr would otherwise be turned into a terminating error.
function NodeMajor($exe) {
  $ErrorActionPreference = 'Continue'
  try { $out = & $exe -p 'process.versions.node.split(".")[0]'; if ($LASTEXITCODE -eq 0) { "$out".Trim() } else { $null } } catch { $null }
}

$TmpDir = Join-Path ([IO.Path]::GetTempPath()) ("tanku-install-" + [IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

# ---------------------------------------------------------------- 1. source
function Get-Source {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  if (Test-Path -LiteralPath (Join-Path $InstallDir '.git')) {
    Log "$InstallDir is a git checkout; updating with git pull --ff-only."
    if (-not (HaveCommand git)) { Warn 'git is not installed; continuing with the files already there.'; return }
    Push-Location $InstallDir
    try {
      $ErrorActionPreference = 'Continue'
      git pull --ff-only
      if ($LASTEXITCODE -ne 0) { Warn 'git pull failed; continuing with the files already there.' }
    } finally { Pop-Location }
    return
  }
  Log "Downloading tanku Anime ($Ref) into $InstallDir ..."
  $zip = Join-Path $TmpDir 'source.zip'
  Download "$RepoUrl/archive/$Ref.zip" $zip
  $extract = Join-Path $TmpDir 'source'
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
  $top = Get-ChildItem -LiteralPath $extract -Directory | Select-Object -First 1
  if (-not $top) { Fail 'The downloaded archive was empty.' }
  # robocopy merges into the existing folder and never deletes extra files, so user data
  # (server\data, server\vendor, node_modules, .tools) is left untouched. Exit codes < 8 are success.
  robocopy $top.FullName $InstallDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail "Copying the source into $InstallDir failed (robocopy exit $LASTEXITCODE)." }
}

# ---------------------------------------------------------------- 2. node 22
function Ensure-Node {
  $localNode = Join-Path $ToolsDir 'node'
  if (Test-Path -LiteralPath (Join-Path $localNode 'node.exe')) { $env:Path = "$localNode;$env:Path" }
  if ((HaveCommand node) -and ((NodeMajor 'node') -eq '22')) {
    Log "Node.js $(node -v) found; using it."
    return
  }

  Log 'Node.js 22 not found; downloading the official build from nodejs.org ...'
  $sums = Join-Path $TmpDir 'SHASUMS256.txt'
  Download "$NodeDist/SHASUMS256.txt" $sums
  $line = Get-Content $sums | Where-Object { $_ -match "node-v22\.\d+\.\d+-win-${Arch}\.zip$" } | Select-Object -First 1
  if (-not $line) { Fail "Could not find a Node 22 build for win-$Arch in $NodeDist" }
  $sha, $file = ($line -split '\s+', 2)

  $zip = Join-Path $TmpDir $file
  Download "$NodeDist/$file" $zip
  if ((Sha256 $zip) -ne $sha.ToLowerInvariant()) { Fail "SHA-256 mismatch for $file; aborting." }

  # Extract next to the final location so the last step is a same-volume rename.
  $staging = Join-Path $ToolsDir 'node.tmp'
  if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  Expand-Archive -LiteralPath $zip -DestinationPath $staging -Force
  $inner = Get-ChildItem -LiteralPath $staging -Directory | Select-Object -First 1
  if (-not $inner) { Fail 'The Node.js archive was empty.' }
  if (Test-Path -LiteralPath $localNode) { Remove-Item -LiteralPath $localNode -Recurse -Force }
  Move-Item -LiteralPath $inner.FullName -Destination $localNode
  Remove-Item -LiteralPath $staging -Recurse -Force
  $env:Path = "$localNode;$env:Path"

  if ((NodeMajor (Join-Path $localNode 'node.exe')) -ne '22') { Fail 'Downloaded Node did not run as expected.' }
  Log "Installed Node.js $(node -v) into $localNode (private to tanku Anime)."
}

# ---------------------------------------------------------------- 3. ffmpeg
function Have-Ffmpeg {
  if (-not ((HaveCommand ffmpeg) -and (HaveCommand ffprobe))) { return $false }
  $ErrorActionPreference = 'Continue'
  try {
    & ffmpeg -version | Out-Null
    if ($LASTEXITCODE -ne 0) { return $false }
    & ffprobe -version | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}

function Ensure-Ffmpeg {
  $localFfmpeg = Join-Path $ToolsDir 'ffmpeg'
  if (Test-Path -LiteralPath (Join-Path $localFfmpeg 'ffprobe.exe')) { $env:Path = "$localFfmpeg;$env:Path" }
  if (Have-Ffmpeg) {
    Log 'ffmpeg and ffprobe found; using them.'
    return
  }

  Log 'Downloading FFmpeg (gyan.dev release essentials, linked from ffmpeg.org, about 110 MB) ...'
  try {
    $zip = Join-Path $TmpDir 'ffmpeg.zip'
    Download $FfmpegZip $zip
    $extract = Join-Path $TmpDir 'ffmpeg'
    Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
    $ffmpegExe = Get-ChildItem -LiteralPath $extract -Recurse -Filter ffmpeg.exe | Select-Object -First 1
    $ffprobeExe = Get-ChildItem -LiteralPath $extract -Recurse -Filter ffprobe.exe | Select-Object -First 1
    if (-not $ffmpegExe -or -not $ffprobeExe) { throw 'ffmpeg.exe / ffprobe.exe not found in the archive.' }
    New-Item -ItemType Directory -Path $localFfmpeg -Force | Out-Null
    Copy-Item -LiteralPath $ffmpegExe.FullName -Destination (Join-Path $localFfmpeg 'ffmpeg.exe') -Force
    Copy-Item -LiteralPath $ffprobeExe.FullName -Destination (Join-Path $localFfmpeg 'ffprobe.exe') -Force
    $env:Path = "$localFfmpeg;$env:Path"
  } catch {
    Warn "FFmpeg download failed: $($_.Exception.Message)"
  }

  if (Have-Ffmpeg) { Log "FFmpeg ready: $((Get-Command ffmpeg).Source)" }
  else { Warn 'FFmpeg is still missing. The app will start, but importing/playing local video needs it. See https://ffmpeg.org/download.html' }
}

# ---------------------------------------------------------------- 4. deps
function Install-Deps {
  Push-Location $InstallDir
  try {
    $lockAfter = Sha256 'package-lock.json'
    if ((Test-Path -LiteralPath 'node_modules') -and ($lockAfter -eq $LockBefore)) {
      Log 'Dependencies unchanged; skipping npm ci.'
      return
    }
    Log 'Installing dependencies (npm ci) ...'
    $ErrorActionPreference = 'Continue'   # npm writes warnings to stderr; we check the exit code ourselves
    npm ci --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { Fail "npm ci failed (exit $LASTEXITCODE)." }
  } finally { Pop-Location }
}

# ---------------------------------------------------------------- 5. dictionary
function Setup-Dictionary {
  if ($env:TANKU_SKIP_JMDICT -eq '1') { return }
  Push-Location $InstallDir
  try {
    if (Test-Path -LiteralPath 'server\vendor\jmdict-eng.json') { Log 'JMdict already downloaded; skipping.'; return }
    Log 'Downloading the Japanese dictionary (JMdict, CC BY-SA 4.0) ...'
    $ErrorActionPreference = 'Continue'
    npm run setup:jmdict
    if ($LASTEXITCODE -ne 0) { Warn "Dictionary setup failed. You can retry later inside $InstallDir with: npm run setup:jmdict" }
  } finally { Pop-Location }
}

# ---------------------------------------------------------------- 6. shortcut + launch
function New-DesktopShortcut {
  try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop -or -not (Test-Path -LiteralPath $desktop)) { return }
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut((Join-Path $desktop 'tanku Anime.lnk'))
    $lnk.TargetPath = Join-Path $InstallDir $Launcher
    $lnk.WorkingDirectory = $InstallDir
    $lnk.Description = 'Start tanku Anime'
    $lnk.Save()
    Log "Desktop shortcut created: $desktop\tanku Anime.lnk"
  } catch {
    Warn "Could not create the Desktop shortcut: $($_.Exception.Message)"
  }
}

function Start-App {
  if ($env:TANKU_NO_LAUNCH -eq '1') { return }
  Log 'Starting tanku Anime in a new window; the browser opens when it is ready.'
  Start-Process -FilePath (Join-Path $InstallDir $Launcher) -WorkingDirectory $InstallDir
}

# ---------------------------------------------------------------- main
try {
  Log "Installing tanku Anime into $InstallDir"
  $LockBefore = ''
  $lockPath = Join-Path $InstallDir 'package-lock.json'
  if (Test-Path -LiteralPath $lockPath) { $LockBefore = Sha256 $lockPath }

  Get-Source
  Ensure-Node
  Ensure-Ffmpeg
  Install-Deps
  Setup-Dictionary
  New-DesktopShortcut

  Write-Host @"

[tanku Anime] Done.
  Folder:     $InstallDir
  Start:      double-click "tanku Anime" on the Desktop (or "$Launcher" in the folder), or run: cd "$InstallDir"; npm start
  Update:     run this install command again
  Uninstall:  delete the folder above and the Desktop shortcut
"@
  Start-App
} finally {
  Remove-Item -LiteralPath $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
