# End-to-end verification of the TikTok LIVE automation stack, run AFTER
# Restore-StreamingStack.ps1 and Start-StreamingStack.ps1 (or `npm start` +
# `npm run tiktok-listener` manually).
#
# Checks, in order:
#   1. Required processes are running (OBS, Streamer.bot, TikFinity, TikTok LIVE Studio,
#      the Node controller).
#   2. Required ports are listening (OBS WebSocket 4455, dashboard 4000, overlay 4100,
#      TikFinity bridge 3939).
#   3. The controller's own /api/status reports OBS WebSocket connected + a current scene.
#   4. OBS Virtual Camera status.
#   5. Fires each TEST MODE event (gift/big gift/MVP gift/follow/share/VIP join/milestone/
#      leaderboard) through the SAME dashboard API the "Test Mode" buttons use, so the real
#      EventBridge -> overlayDispatcher -> overlay path gets exercised end-to-end.
#   6. Tails logs/errors.log and logs/crashes.log for anything written recently.
#
# IMPORTANT: this script can confirm the pipeline fired without errors and that OBS/overlay
# state changed, but it cannot see your screen. You must still glance at the OBS Preview
# (or Virtual Camera output) while step 5 runs to visually confirm each overlay actually
# renders correctly - that part cannot be automated from a script.
#
# Usage: .\Test-StreamingStack.ps1

[CmdletBinding()]
param(
    [string]$DashboardBase = "http://127.0.0.1:4000",
    [int]$ObsWsPort = 4455,
    [int]$OverlayPort = 4100,
    [int]$TikfinityBridgePort = 3939,
    [string]$RepoDir = "C:\Users\Administrator\tiktok-live-setup"
)

$ErrorActionPreference = "Continue"
$failures = @()

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[ok]   $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[fail] $msg" -ForegroundColor Red; $script:failures += $msg }
function Write-Warn2($msg){ Write-Host "[warn] $msg" -ForegroundColor Yellow }

# --- 1. Processes ---
Write-Step "1. Process check"
$procChecks = @(
    @{ Name = "obs64";              Label = "OBS Studio" },
    @{ Name = "Streamer.bot";       Label = "Streamer.bot" },
    @{ Name = "TikFinity";          Label = "TikFinity" },
    @{ Name = "TikTok LIVE Studio"; Label = "TikTok LIVE Studio" },
    @{ Name = "node";               Label = "Node controller / tiktok-listener (node.exe)" }
)
foreach ($p in $procChecks) {
    if (Get-Process -Name $p.Name -ErrorAction SilentlyContinue) {
        Write-Ok "$($p.Label) is running"
    } else {
        Write-Fail "$($p.Label) is NOT running"
    }
}

# --- 2. Ports ---
Write-Step "2. Port check"
$portChecks = @(
    @{ Port = $ObsWsPort;            Label = "OBS WebSocket" },
    @{ Port = 4000;                  Label = "Dashboard" },
    @{ Port = $OverlayPort;          Label = "Overlay web server" },
    @{ Port = $TikfinityBridgePort;  Label = "TikFinity bridge" }
)
foreach ($p in $portChecks) {
    $test = Test-NetConnection -ComputerName "127.0.0.1" -Port $p.Port -WarningAction SilentlyContinue
    if ($test.TcpTestSucceeded) {
        Write-Ok "$($p.Label) listening on port $($p.Port)"
    } else {
        Write-Fail "$($p.Label) NOT listening on port $($p.Port)"
    }
}

# --- 3. Controller status ---
Write-Step "3. Controller /api/status"
try {
    $status = Invoke-RestMethod -Uri "$DashboardBase/api/status" -TimeoutSec 5
    $status | ConvertTo-Json -Depth 6 | Write-Host
    if ($status.obs.websocketConnected) { Write-Ok "Controller reports OBS WebSocket connected" } else { Write-Fail "Controller reports OBS WebSocket NOT connected" }
    if ($status.obs.currentScene) { Write-Ok "Current OBS scene: $($status.obs.currentScene)" } else { Write-Warn2 "No current scene reported (OBS may still be launching)" }
    if ($status.camera.enabled) { Write-Ok "OBS Virtual Camera is enabled" } else { Write-Warn2 "OBS Virtual Camera reports disabled - enable it in OBS or via the dashboard's Camera toggle" }
} catch {
    Write-Fail "Could not reach $DashboardBase/api/status - is `npm start` running? ($($_.Exception.Message))"
}

# --- 4. Fire every TEST MODE event end-to-end ---
Write-Step "4. Firing TEST MODE events (watch OBS Preview / Virtual Camera now)"
$testEvents = @(
    "testmode/normal-gift", "testmode/big-gift", "testmode/mvp-gift",
    "testmode/follow", "testmode/share", "testmode/vip-join",
    "testmode/non-qualifying-join", "testmode/milestone", "testmode/leaderboard"
)
foreach ($ep in $testEvents) {
    try {
        $r = Invoke-RestMethod -Uri "$DashboardBase/api/$ep" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 5
        if ($r.ok) { Write-Ok "Fired $ep" } else { Write-Fail "Fired $ep but response was not ok: $($r | ConvertTo-Json -Compress)" }
    } catch {
        Write-Fail "Failed to fire $ep ($($_.Exception.Message))"
    }
    Start-Sleep -Milliseconds 800
}
Write-Warn2 "Visually confirm in OBS's Preview that each alert/overlay above actually rendered (gift card, big-gift/MVP full-screen overlay, join/follow/share/milestone/leaderboard overlays) - this script can only confirm the API call succeeded, not what's on screen."

# --- 5. Background music / video sanity (API-level only) ---
Write-Step "5. Background + music status"
try {
    $bg = Invoke-RestMethod -Uri "$DashboardBase/api/backgrounds" -TimeoutSec 5
    Write-Ok "Backgrounds available: $($bg.backgrounds -join ', ') (current: $($bg.current))"
    if (-not $bg.backgrounds -or $bg.backgrounds.Count -eq 0) { Write-Warn2 "No background videos found - $RepoDir\backgrounds is empty, add your own clips (see README 'What's NOT included')." }
} catch { Write-Fail "Could not reach /api/backgrounds ($($_.Exception.Message))" }
try {
    $music = Invoke-RestMethod -Uri "$DashboardBase/api/music/status" -TimeoutSec 5
    Write-Ok "Music status: $($music | ConvertTo-Json -Compress)"
} catch { Write-Fail "Could not reach /api/music/status ($($_.Exception.Message))" }

# --- 6. Recent error/crash logs ---
Write-Step "6. Recent error/crash logs"
foreach ($logFile in @("errors.log", "crashes.log")) {
    $path = Join-Path $RepoDir "logs\$logFile"
    if (Test-Path $path) {
        $content = Get-Content $path -Tail 20 -ErrorAction SilentlyContinue
        if ($content) {
            Write-Warn2 "$logFile has content - last 20 lines:"
            $content | ForEach-Object { Write-Host "  $_" }
        } else {
            Write-Ok "$logFile is empty"
        }
    } else {
        Write-Ok "$logFile does not exist yet (no errors logged)"
    }
}

# --- Summary ---
Write-Step "Summary"
if ($failures.Count -eq 0) {
    Write-Host "All automated checks passed." -ForegroundColor Green
} else {
    Write-Host "$($failures.Count) check(s) failed:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host @"

Remaining steps that genuinely require YOU (cannot be scripted or verified remotely):
  - Confirm each test-mode overlay above actually looked correct in OBS Preview.
  - Confirm your microphone is audible through OBS (RDP audio redirection is a known
    problem area - see docs\audio-troubleshooting.md if silent).
  - Confirm the Virtual Camera feed shows up correctly inside TikTok LIVE Studio's
    Camera source.
  - Log into TikTok LIVE Studio and TikFinity with your TikTok account (if not already).
  - Enter your TikTok RTMP stream key in OBS (Settings -> Stream).
  - Send a REAL small gift on a real/test TikTok LIVE (or trigger via TikFinity's own
    test-event feature, if it has one) to confirm the TikFinity -> Streamer.bot ->
    controller webhook path fires - the /api/testmode/* calls above bypass TikFinity/
    Streamer.bot entirely and only prove the controller + OBS + overlay side works.
"@
