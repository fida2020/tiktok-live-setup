# Restores the TikTok LIVE streaming stack on a fresh Windows VPS:
#   1. Clones/updates this repo and runs `npm install`.
#   2. Restores the OBS "TikTokLive" profile + scene collection from this repo's own
#      obs/ backup (see obs/README.md).
#   3. Best-effort restores OBS-websocket config, Streamer.bot data, TikFinity settings,
#      and media files from an external backup folder (e.g. an ad-hoc copy someone made
#      of %APPDATA%\obs-studio, a Streamer.bot install, %LOCALAPPDATA%\tikfinity, etc.)
#      before this machine was rebuilt.
#
# This script does NOT know the exact internal layout of your backup folder ahead of
# time, so every step is defensive: it looks for a handful of common folder/file name
# patterns, restores whatever it actually finds, and prints [skip]/[warn] for anything
# it can't locate so you can restore that piece by hand. Safe to re-run.
#
# Usage (run as Administrator, from an elevated PowerShell prompt):
#   .\Restore-StreamingStack.ps1
#   .\Restore-StreamingStack.ps1 -BackupRoot "D:\MyBackup" -RepoDir "C:\TikTokLiveAutomation"
#
# What this script CANNOT do (must be done by hand in each app's UI - see README.md
# "Manual steps on the new VPS" and docs/GOING_LIVE_CHECKLIST.md):
#   - Install OBS Studio, VB-Audio Virtual Cable, TikTok LIVE Studio, TikFinity, Streamer.bot.
#   - Log into TikTok inside TikTok LIVE Studio / TikFinity (no session/cookies are ever backed up).
#   - Enter your OBS stream key.
#   - Wire TikFinity's Gift action -> Streamer.bot's Fetch URL sub-action (TikFinity/Streamer.bot
#     event mappings live in their own internal databases, not plain restorable files).

[CmdletBinding()]
param(
    [string]$RepoUrl = "https://github.com/fida2020/tiktok-live-setup.git",
    [string]$RepoDir = "C:\TikTokLiveAutomation",
    [string]$BackupRoot = "C:\Users\Administrator\Streaming_Backup_2026-08-05",
    [string]$StreamerBotDir = "C:\Streamerbot",
    [string]$TikFinityAppData = "$env:LOCALAPPDATA\tikfinity"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[ok]   $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "[skip] $msg" -ForegroundColor Yellow }
function Write-Warn2($msg){ Write-Host "[warn] $msg" -ForegroundColor Red }

function Find-FirstMatchingDir($root, [string[]]$candidateNames) {
    if (-not (Test-Path $root)) { return $null }
    foreach ($name in $candidateNames) {
        $direct = Join-Path $root $name
        if (Test-Path $direct -PathType Container) { return $direct }
    }
    # Case-insensitive / fuzzy pass over the backup root's immediate children.
    $children = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue
    foreach ($name in $candidateNames) {
        $hit = $children | Where-Object { $_.Name -ieq $name -or $_.Name -imatch [regex]::Escape($name) } | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

Write-Host "TikTok LIVE stack restore" -ForegroundColor Magenta
Write-Host "RepoDir:     $RepoDir"
Write-Host "BackupRoot:  $BackupRoot"
Write-Host "StreamerBot: $StreamerBotDir"
Write-Host "TikFinity:   $TikFinityAppData"

if (-not (Test-Path $BackupRoot)) {
    Write-Warn2 "Backup folder '$BackupRoot' not found. Continuing with repo-only restore (step 2 below) - pass -BackupRoot to point at the real location."
}

# --- 1. Clone / update the repo, install dependencies ---
Write-Step "1. Clone/update repo + npm install"
if (Test-Path (Join-Path $RepoDir ".git")) {
    Write-Skip "Repo already present at $RepoDir - pulling latest instead of cloning"
    Push-Location $RepoDir
    git pull
    Pop-Location
} else {
    git clone $RepoUrl $RepoDir
    Write-Ok "Cloned $RepoUrl -> $RepoDir"
}

Push-Location $RepoDir
npm install
Write-Ok "npm install complete"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Ok "Created .env from .env.example - you still need to fill in OBS_WS_PASSWORD, TIKFINITY_BRIDGE_TOKEN, TIKTOK_USERNAME"
} else {
    Write-Skip ".env already exists - leaving it as-is"
}
Pop-Location

# --- 2. Restore OBS profile + scene collection from this repo's own obs/ backup ---
Write-Step "2. Restore OBS profile/scene collection (repo obs/ backup)"
$obsAppData = "$env:APPDATA\obs-studio\basic"
$repoObsDir = Join-Path $RepoDir "obs"

$profileSrc = Join-Path $repoObsDir "profiles\TikTokLive"
$profileDst = Join-Path $obsAppData "profiles\TikTokLive"
if (Test-Path $profileSrc) {
    New-Item -ItemType Directory -Path (Split-Path $profileDst) -Force | Out-Null
    Copy-Item -Path $profileSrc -Destination $profileDst -Recurse -Force
    Write-Ok "Restored OBS profile -> $profileDst"
} else {
    Write-Warn2 "Repo obs/profiles/TikTokLive not found - skipping profile restore"
}

$sceneSrc = Join-Path $repoObsDir "scenes\TikTokLive.json"
$sceneDstDir = Join-Path $obsAppData "scenes"
if (Test-Path $sceneSrc) {
    New-Item -ItemType Directory -Path $sceneDstDir -Force | Out-Null
    Copy-Item -Path $sceneSrc -Destination (Join-Path $sceneDstDir "TikTokLive.json") -Force
    Write-Ok "Restored OBS scene collection -> $sceneDstDir\TikTokLive.json"
    Write-Warn2 "Reminder: the 'PhoneMic' vdo.ninja browser source URL was redacted to YOUR_ROOM_CODE - update it in OBS after launch."
} else {
    Write-Warn2 "Repo obs/scenes/TikTokLive.json not found - skipping scene restore"
}

# --- 3. Best-effort restore of obs-websocket password/config from the external backup ---
Write-Step "3. Restore obs-websocket plugin config"
$wsConfigDst = "$env:APPDATA\obs-studio\plugin_config\obs-websocket\config.json"
$wsConfigSrcCandidates = @(
    (Join-Path $BackupRoot "obs-websocket\config.json"),
    (Join-Path $BackupRoot "OBS\plugin_config\obs-websocket\config.json"),
    (Join-Path $BackupRoot "obs-studio\plugin_config\obs-websocket\config.json")
) | Where-Object { Test-Path $_ }

if ($wsConfigSrcCandidates.Count -gt 0) {
    New-Item -ItemType Directory -Path (Split-Path $wsConfigDst) -Force | Out-Null
    Copy-Item -Path $wsConfigSrcCandidates[0] -Destination $wsConfigDst -Force
    Write-Ok "Restored real obs-websocket config from backup -> $wsConfigDst"
    Write-Warn2 "Make sure OBS_WS_PASSWORD in .env matches this config's server_password."
} else {
    $wsTemplate = Join-Path $repoObsDir "obs-websocket.config.example.json"
    if (Test-Path $wsTemplate) {
        New-Item -ItemType Directory -Path (Split-Path $wsConfigDst) -Force | Out-Null
        Copy-Item -Path $wsTemplate -Destination $wsConfigDst -Force
        Write-Skip "No real obs-websocket config found under $BackupRoot - installed the template instead."
        Write-Warn2 "Open OBS -> Tools -> WebSocket Server Settings, set a password, and put the SAME value in .env's OBS_WS_PASSWORD."
    } else {
        Write-Warn2 "No obs-websocket config found anywhere - set one up manually in OBS -> Tools -> WebSocket Server Settings."
    }
}

# --- 4. Streamer.bot: best-effort restore from the backup folder ---
Write-Step "4. Restore Streamer.bot (portable app - copies its folder + data backups)"
$sbSrc = Find-FirstMatchingDir $BackupRoot @("Streamer.bot", "Streamerbot", "StreamerBot")
if ($sbSrc) {
    if (-not (Test-Path $StreamerBotDir)) {
        Write-Host "Streamer.bot is a portable app - copying the entire backed-up folder to $StreamerBotDir ..."
        Copy-Item -Path $sbSrc -Destination $StreamerBotDir -Recurse -Force
        Write-Ok "Restored Streamer.bot -> $StreamerBotDir (includes actions/settings if the backup had a 'data' folder)"
    } else {
        Write-Skip "Streamer.bot already present at $StreamerBotDir - not overwriting. If you need to restore a specific save state, see:"
        Write-Skip "  $sbSrc\backups\backup-<date>-<time>.zip  ->  extract into  $StreamerBotDir\data  (Streamer.bot closed)"
        $latestZip = Get-ChildItem -Path (Join-Path $sbSrc "backups") -Filter "backup-*.zip" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestZip) { Write-Host "  Newest data backup found: $($latestZip.FullName)" }
    }
} else {
    Write-Warn2 "No Streamer.bot folder found under $BackupRoot (looked for Streamer.bot/Streamerbot/StreamerBot). Install it fresh and redo the wiring in docs/GOING_LIVE_CHECKLIST.md step 2-5."
}

# --- 5. TikFinity: best-effort restore of non-session config from the backup folder ---
Write-Step "5. Restore TikFinity settings (login session is NEVER restored - you must re-login)"
$tfSrc = Find-FirstMatchingDir $BackupRoot @("TikFinity", "tikfinity")
if ($tfSrc) {
    New-Item -ItemType Directory -Path $TikFinityAppData -Force | Out-Null
    $skipDirs = @("Cache", "Code Cache", "GPUCache", "blob_storage", "Session Storage", "logs", "Crashpad")
    $copied = 0
    Get-ChildItem -Path $tfSrc -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($tfSrc.Length).TrimStart('\')
        if ($skipDirs | Where-Object { $rel -imatch [regex]::Escape($_) }) { return }
        $dst = Join-Path $TikFinityAppData $rel
        New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
        Copy-Item -Path $_.FullName -Destination $dst -Force
        $copied++
    }
    Write-Ok "Copied $copied non-cache config file(s) from $tfSrc -> $TikFinityAppData"
    Write-Warn2 "You still need to log into TikFinity with your TikTok account by hand - login/session data is deliberately never backed up."
    Write-Warn2 "Re-check TikFinity's Gift action -> Streamer.bot wiring still points at http://127.0.0.1:3939 per docs/GOING_LIVE_CHECKLIST.md."
} else {
    Write-Warn2 "No TikFinity folder found under $BackupRoot. Install it fresh, log in, and redo the Gift-action wiring in docs/GOING_LIVE_CHECKLIST.md."
}

# --- 6. Media (backgrounds/music/media) - optional, large binaries not in git ---
Write-Step "6. Restore media (backgrounds/music/media contents, if present in backup)"
foreach ($mediaFolder in @("backgrounds", "music", "media")) {
    $src = Join-Path $BackupRoot $mediaFolder
    $dst = Join-Path $RepoDir $mediaFolder
    if (Test-Path $src) {
        Copy-Item -Path (Join-Path $src "*") -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue
        Write-Ok "Restored $mediaFolder\* from backup"
    } else {
        Write-Skip "$mediaFolder\ not found in backup - $dst will stay empty until you add your own files"
    }
}

# --- Summary ---
Write-Step "Done - manual steps still required"
Write-Host @"
1. Launch OBS once, confirm you're on the 'TikTokLive' profile + scene collection.
2. Enter your TikTok stream key in OBS: Settings -> Stream.
3. If a real obs-websocket config wasn't found in the backup, set a WebSocket password
   in OBS (Tools -> WebSocket Server Settings) and put the same value in .env's OBS_WS_PASSWORD.
4. Update the 'PhoneMic' browser source's vdo.ninja room code in OBS (it's redacted in the backup).
5. Re-select audio devices under the TikTokLive profile (device IDs don't carry over machines).
6. Log into TikTok LIVE Studio and TikFinity with your TikTok account (never backed up).
7. In TikFinity: confirm/redo the Gift action -> Streamer.bot 'Fetch URL' wiring
   (docs/GOING_LIVE_CHECKLIST.md, one-time setup steps 2-5) pointing at
   http://127.0.0.1:3939/events (TIKFINITY_BRIDGE_TOKEN from .env as the X-Bridge-Token header).
8. Set TIKTOK_USERNAME in $RepoDir\.env, then run: vps-setup\Start-StreamingStack.ps1
   (or manually: npm run setup:obs, then npm start, then npm run tiktok-listener).
9. Follow docs/GOING_LIVE_CHECKLIST.md's 'Every time, before going live' section.
"@
