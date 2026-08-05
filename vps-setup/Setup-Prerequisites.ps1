# Installs/verifies the software this project needs on a fresh Windows VPS (README.md's
# "Required software" table). Run BEFORE Restore-StreamingStack.ps1.
#
# What this script CAN install silently (stable winget package IDs, no login required):
#   - Git, Node.js LTS, OBS Studio (obs-websocket ships bundled with it)
#
# What this script CANNOT install silently, and only opens the official download page for
# you to install by hand (no stable direct-download URL, or an interactive installer/login
# is unavoidable - see README.md "Manual steps on the new VPS"):
#   - VB-Audio Virtual Cable (donationware, no installer API)
#   - TikTok LIVE Studio (requires TikTok login + account LIVE-access eligibility)
#   - TikFinity (requires TikTok login)
#   - Streamer.bot (portable zip, no traditional installer - extract + run exe)
#
# Usage (run as Administrator):
#   .\Setup-Prerequisites.ps1
#   .\Setup-Prerequisites.ps1 -SkipBrowserDownloads   # only do the silent winget installs

[CmdletBinding()]
param(
    [switch]$SkipBrowserDownloads
)

$ErrorActionPreference = "Continue"

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[ok]   $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "[skip] $msg" -ForegroundColor Yellow }
function Write-Warn2($msg){ Write-Host "[warn] $msg" -ForegroundColor Red }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn2 "Not running as Administrator - winget installs below may fail. Re-run this script from an elevated PowerShell prompt."
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Warn2 "winget is not available on this machine (Windows Server images often lack it)."
    Write-Warn2 "Install 'App Installer' from the Microsoft Store, or download winget directly:"
    Write-Warn2 "  https://github.com/microsoft/winget-cli/releases/latest"
    Write-Warn2 "Then re-run this script. Skipping silent installs for now."
} else {
    Write-Step "Installing Git, Node.js LTS, OBS Studio via winget"

    function Install-WingetPackage($id, $label) {
        $already = winget list --id $id -e 2>$null | Select-String -SimpleMatch $id
        if ($already) {
            Write-Skip "$label already installed ($id)"
            return
        }
        Write-Host "Installing $label ($id) ..."
        winget install --id $id -e --accept-package-agreements --accept-source-agreements --silent
        if ($LASTEXITCODE -eq 0) { Write-Ok "$label installed" } else { Write-Warn2 "$label install returned exit code $LASTEXITCODE - check output above" }
    }

    Install-WingetPackage "Git.Git" "Git"
    Install-WingetPackage "OpenJS.NodeJS.LTS" "Node.js LTS"
    Install-WingetPackage "OBSProject.OBSStudio" "OBS Studio"
}

Write-Step "Verifying installs (you may need to open a NEW PowerShell window for PATH updates to apply)"
foreach ($cmd in @("git", "node", "npm")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) { Write-Ok "$cmd -> $($found.Source)" } else { Write-Warn2 "$cmd not found on PATH yet - open a new terminal, or log off/on, then re-check" }
}
$obsExe = "C:\Program Files\obs-studio\bin\64bit\obs64.exe"
if (Test-Path $obsExe) { Write-Ok "OBS Studio -> $obsExe" } else { Write-Warn2 "OBS Studio not found at $obsExe - check the winget install output above" }

if (-not $SkipBrowserDownloads) {
    Write-Step "Opening official download pages for apps that need an interactive install/login"
    Write-Host "These cannot be scripted (no stable silent-install path, or a TikTok login is required mid-install)."
    $pages = @(
        @{ Name = "VB-Audio Virtual Cable"; Url = "https://vb-audio.com/Cable/" },
        @{ Name = "TikTok LIVE Studio";     Url = "https://www.tiktok.com/studio/download" },
        @{ Name = "TikFinity";              Url = "https://tikfinity.zerody.one/app/" },
        @{ Name = "Streamer.bot";           Url = "https://streamer.bot/downloads" }
    )
    foreach ($p in $pages) {
        Write-Host "  - $($p.Name): $($p.Url)"
        try { Start-Process $p.Url } catch { Write-Warn2 "Couldn't auto-open a browser for $($p.Name) - open the URL above manually." }
    }
    Write-Host ""
    Write-Host "For each: download, run the installer, and (VB-Audio Cable only) reboot when prompted."
    Write-Host "Streamer.bot is a portable zip - extract it to C:\Streamerbot (matches vps-setup\Start-StreamingStack.ps1's expected path) and run Streamer.bot.exe as Administrator once to finish its own first-run setup."
} else {
    Write-Skip "Skipped opening browser download pages (-SkipBrowserDownloads)"
}

Write-Step "Next steps"
Write-Host @"
1. Finish installing VB-Audio Virtual Cable, TikTok LIVE Studio, TikFinity, and Streamer.bot
   from the pages opened above (or run this script again without -SkipBrowserDownloads).
2. Log into TikTok LIVE Studio and TikFinity with your TikTok account (required, cannot be scripted).
3. Run vps-setup\Restore-StreamingStack.ps1 to clone the repo, npm install, and restore the
   OBS profile/scenes + your backup folder's Streamer.bot/TikFinity/media content.
4. Run vps-setup\Test-StreamingStack.ps1 to verify everything end-to-end before going live.
"@
