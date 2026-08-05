# Step 0 of the setup sequence: audits this Windows VPS before anything is installed/restored.
# Run this FIRST, before Setup-Prerequisites.ps1, so you (or whoever is helping you) know
# exactly what's already here and what's missing.
#
# Reports:
#   - Windows version/build, uptime
#   - CPU, RAM, disk space
#   - Whether each piece of required software (README.md's "Required software" table) is
#     already installed, and where
#   - Whether the project repo and the backup folder already exist at the expected paths
#   - Listening ports this project cares about (4000/4100/3939/4455), in case something else
#     is already squatting on one of them
#
# Usage: .\Audit-Vps.ps1  (no admin required, read-only - makes no changes)

[CmdletBinding()]
param(
    [string]$RepoDir = "C:\Users\Administrator\tiktok-live-setup",
    [string]$BackupRoot = "C:\Users\Administrator\Desktop\Streaming_Backup_2026-08-05"
)

function Write-Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[ok]      $msg" -ForegroundColor Green }
function Write-Missing($msg) { Write-Host "[missing] $msg" -ForegroundColor Red }
function Write-Info2($msg) { Write-Host "[info]    $msg" -ForegroundColor Yellow }

Write-Host "TikTok LIVE automation - VPS audit" -ForegroundColor Magenta
Write-Host "Run this output back to whoever is helping you diagnose/set up this project."

# --- OS / hardware ---
Write-Section "Windows version"
try {
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Host "$($os.Caption) (build $($os.BuildNumber)), installed $($os.InstallDate)"
    Write-Host "Last boot: $($os.LastBootUpTime)"
} catch { Write-Info2 "Could not query OS info: $($_.Exception.Message)" }

Write-Section "CPU / RAM / storage"
try {
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    Write-Host "CPU: $($cpu.Name) ($($cpu.NumberOfCores) cores / $($cpu.NumberOfLogicalProcessors) logical)"
    $os = Get-CimInstance Win32_OperatingSystem
    $totalRamGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $freeRamGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    Write-Host "RAM: $freeRamGb GB free / $totalRamGb GB total"
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        $freeGb = [math]::Round($_.FreeSpace / 1GB, 1)
        $sizeGb = [math]::Round($_.Size / 1GB, 1)
        Write-Host "Disk $($_.DeviceID) $freeGb GB free / $sizeGb GB total"
    }
} catch { Write-Info2 "Could not query hardware info: $($_.Exception.Message)" }

Write-Section "GPU (relevant for OBS hardware encoding + virtual display)"
try {
    Get-CimInstance Win32_VideoController | ForEach-Object { Write-Host "$($_.Name) - driver $($_.DriverVersion)" }
} catch { Write-Info2 "Could not query GPU info: $($_.Exception.Message)" }

# --- Required software ---
Write-Section "Required software (README.md 'Required software' table)"

function Check-Command($cmd, $label) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) { Write-Ok "$label -> $($found.Source)" } else { Write-Missing "$label (command '$cmd' not found on PATH)" }
}

function Check-Path($path, $label) {
    if (Test-Path $path) { Write-Ok "$label -> $path" } else { Write-Missing "$label (expected at $path)" }
}

Check-Command "git" "Git"
Check-Command "node" "Node.js"
Check-Command "npm" "npm"
Check-Command "winget" "winget (used by Setup-Prerequisites.ps1 for silent installs)"

Check-Path "C:\Program Files\obs-studio\bin\64bit\obs64.exe" "OBS Studio (default install path)"
Check-Path "C:\Program Files\obs-studio\data\obs-plugins\obs-websocket" "obs-websocket plugin (bundled with OBS 28+, same install)"

$vbCable = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceName -match "VB-Audio|CABLE" }
if ($vbCable) { Write-Ok "VB-Audio Virtual Cable driver -> $($vbCable[0].DeviceName)" } else { Write-Missing "VB-Audio Virtual Cable (no matching audio driver found)" }

$tiktokStudio = Get-ChildItem "C:\Program Files\TikTok LIVE Studio" -Filter "TikTok LIVE Studio.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($tiktokStudio) { Write-Ok "TikTok LIVE Studio -> $($tiktokStudio.FullName)" } else { Write-Missing "TikTok LIVE Studio (not found under C:\Program Files\TikTok LIVE Studio)" }

Check-Path "$env:LOCALAPPDATA\Programs\tikfinity\TikFinity.exe" "TikFinity"
Check-Path "C:\Streamerbot\Streamer.bot.exe" "Streamer.bot (expected path used by vps-setup\Start-StreamingStack.ps1)"

# --- Project / backup paths ---
Write-Section "Project + backup folder"
if (Test-Path (Join-Path $RepoDir ".git")) {
    Write-Ok "Repo already cloned at $RepoDir"
    Push-Location $RepoDir
    try { git status --short --branch } catch {}
    Pop-Location
} else {
    Write-Missing "Repo not found at $RepoDir - clone with: git clone https://github.com/fida2020/tiktok-live-setup.git `"$RepoDir`""
}

if (Test-Path (Join-Path $RepoDir ".env")) { Write-Ok ".env exists in $RepoDir" } else { Write-Missing ".env not found in $RepoDir - copy from .env.example after cloning" }
if (Test-Path (Join-Path $RepoDir "node_modules")) { Write-Ok "node_modules already installed in $RepoDir" } else { Write-Missing "node_modules not found - run 'npm install' in $RepoDir" }

if (Test-Path $BackupRoot) {
    Write-Ok "Backup folder found at $BackupRoot"
    Write-Host "Top-level contents:"
    Get-ChildItem -Path $BackupRoot -ErrorAction SilentlyContinue | ForEach-Object {
        $type = if ($_.PSIsContainer) { "dir " } else { "file" }
        Write-Host "  [$type] $($_.Name)"
    }
} else {
    Write-Missing "Backup folder NOT found at $BackupRoot - double check the exact path/spelling"
}

# --- Ports this project uses ---
Write-Section "Ports this project needs (4455 OBS WS, 4000 dashboard, 4100 overlay, 3939 TikFinity bridge)"
foreach ($port in @(4455, 4000, 4100, 3939)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        $owningProcess = Get-Process -Id ($listener[0].OwningProcess) -ErrorAction SilentlyContinue
        Write-Info2 "Port $port is ALREADY in use by: $($owningProcess.ProcessName) (PID $($listener[0].OwningProcess))"
    } else {
        Write-Ok "Port $port is free"
    }
}

Write-Section "Next step"
Write-Host "Run vps-setup\Setup-Prerequisites.ps1 next to install anything marked [missing] above that has a silent installer (Git/Node/OBS), and open download pages for the rest (VB-Cable/TikTok LIVE Studio/TikFinity/Streamer.bot)."
