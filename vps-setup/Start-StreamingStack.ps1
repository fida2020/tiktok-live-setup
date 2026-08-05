# Launches the full TikTok LIVE streaming stack in the right order:
# OBS (TikTokLive profile/collection) -> Streamer.bot -> TikFinity ->
# TikTok LIVE Studio -> the Node controller (npm start) -> the direct
# TikTok listener (npm run tiktok-listener). Safe to re-run: every step
# checks whether its process is already running before launching it.
#
# Usage: right-click -> Run with PowerShell, or double-click the
# "Start TikTok Streaming Stack" shortcut on the Desktop.
#   .\Start-StreamingStack.ps1
#   .\Start-StreamingStack.ps1 -RepoDir "C:\path\to\tiktok-live-setup"

[CmdletBinding()]
param(
    [string]$RepoDir = "C:\Users\Administrator\tiktok-live-setup"
)

$ErrorActionPreference = 'Continue'
$repoDir = $RepoDir

function Start-IfNotRunning($processName, $action, $label) {
    if (Get-Process -Name $processName -ErrorAction SilentlyContinue) {
        Write-Host "[skip] $label already running"
    } else {
        Write-Host "[start] $label"
        & $action
    }
}

Start-IfNotRunning "obs64" {
    Start-Process -FilePath "C:\Program Files\obs-studio\bin\64bit\obs64.exe" `
        -ArgumentList "--profile","TikTokLive","--collection","TikTokLive","--disable-shutdown-check" `
        -WorkingDirectory "C:\Program Files\obs-studio\bin\64bit"
} "OBS Studio"
Start-Sleep -Seconds 8

Start-IfNotRunning "Streamer.bot" {
    Start-Process -FilePath "C:\Streamerbot\Streamer.bot.exe" -WorkingDirectory "C:\Streamerbot"
} "Streamer.bot"
Start-Sleep -Seconds 3

Start-IfNotRunning "TikFinity" {
    Start-Process -FilePath "$env:LOCALAPPDATA\Programs\tikfinity\TikFinity.exe"
} "TikFinity"

Start-IfNotRunning "TikTok LIVE Studio" {
    $exe = Get-ChildItem "C:\Program Files\TikTok LIVE Studio" -Filter "TikTok LIVE Studio.exe" -Recurse | Select-Object -First 1
    if ($exe) { Start-Process -FilePath $exe.FullName }
} "TikTok LIVE Studio"

Write-Host "[start] Node controller (npm start) in a new window"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$repoDir`" && npm start" -WorkingDirectory $repoDir

Write-Host "[start] Direct TikTok listener (npm run tiktok-listener) in a new window"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$repoDir`" && npm run tiktok-listener" -WorkingDirectory $repoDir

Write-Host ""
Write-Host "All processes launched. Dashboard: http://127.0.0.1:4000  Overlay server: http://127.0.0.1:4100"
Write-Host "Next: confirm TikFinity's Gift action + Streamer.bot wiring, confirm TikTok LIVE Studio's Camera source = OBS Virtual Camera, then follow docs/GOING_LIVE_CHECKLIST.md."
