# TikTok LIVE Studio Audio Troubleshooting — Summary

Date: 2026-08-03

## Goal
Get microphone/audio from OBS (fed by a phone via vdo.ninja) into TikTok LIVE Studio so viewers can hear the streamer.

## Root Cause
This machine is a cloud Windows Server instance running **Windows Server 2025 Datacenter**. Windows Server enforces
Remote Desktop Session Host (RDS) multi-session audio isolation by design — RDP sessions on Server editions
do not get normal access to local/virtual audio recording or playback devices, unlike regular Windows 10/11.
This blocks **every** audio path at the OS level, confirmed independently by four different applications:

- PowerShell / AudioDeviceCmdlets: zero recording devices visible; direct device-ID lookups fail.
- OBS Studio's own device enumeration: zero capture devices; only "Remote Audio" for playback.
- TikTok LIVE Studio: "No audio found" for Microphone/Speaker; Application Audio Capture of obs64.exe
  initializes and is wired to the real broadcast track, but receives continuous silent frames
  (500+ `SilentFrameDetect` warnings in its own logs, spanning periods when OBS's own audio was
  independently confirmed live and strong).
- SplitCam: "No audio inputs found"; its own Application Audio Capture fails to even initialize
  (error 0x80070002).

## What Works
- **Video pipeline**: OBS Virtual Camera → TikTok LIVE Studio Camera source. Confirmed working after
  enabling "Start Virtual Camera" in OBS.
- **OBS's own audio**: PhoneMic (vdo.ninja browser source) reliably receives real live
  audio from the phone — confirmed via OBS's own real-time volume meter (peaks to ~1.0 while speaking).
  The problem is strictly downstream of OBS: getting that audio OUT of OBS and INTO TikTok's actual
  broadcast/RTMP output.

## What Was Tried and Failed (all root-caused to the same OS-level restriction)
1. VB-Audio Virtual Cable — installed correctly, but invisible to Windows' audio engine in this session.
2. ByteCast's pre-installed virtual audio device — same failure.
3. TikTok LIVE Studio Microphone/Speaker device selection — no devices ever listed.
4. TikTok LIVE Studio Application Audio Capture (obs64.exe) — wired to broadcast track, but silent frames only.
5. TikTok LIVE Studio "Link" (embedded browser) source pointed at the same vdo.ninja URL — video works,
   but Link-type sources are never mixed into the actual broadcast audio (only Camera-type sources are).
6. SplitCam (video+audio mixer) as an intermediary — Application Audio Capture fails to initialize.
7. Direct OBS→TikTok RTMP streaming (bypassing TikTok LIVE Studio's capture entirely) — not available;
   this TikTok account does not have RTMP/external-tool streaming access.
8. vdo.ninja published from local PC instead of phone (audio-only, no webcam) — inconclusive, no
   confirmed signal reaching OBS at last check.
9. Sunshine/Moonlight (connecting via the console session instead of RDP, to sidestep RDS audio
   isolation entirely) — Sunshine is running and correctly configured server-side (all 4 ports
   listening, Windows Firewall open), but external connection from Moonlight times out — likely a
   cloud provider Security Group / Network ACL issue that wasn't fully resolved.

## Remaining Real Options
1. **Fix the Sunshine/Moonlight connection** (free, uses the already-paid-for instance): needs the
   cloud provider's Security Group (same one that allows RDP/3389) to allow inbound TCP+UDP on
   47984, 47989, 47990, 48010 from the connecting IP. This was attempted but still timing out as of
   last check — may need to verify the correct Security Group was edited, or check for a Network ACL
   blocking it at the VPC level.
2. **A managed single-user Windows desktop (e.g. AWS WorkSpaces)** — genuinely fixes the root cause
   (single-user desktop, no RDS audio isolation), but the GPU-capable bundle needed for NVENC hardware
   encoding is a significant cost jump from a plain EC2/VPS instance. Non-GPU bundles are much cheaper
   but lack the GPU encoding this OBS setup currently uses.
3. **Third-party cloud gaming PC service** (e.g. Shadow PC) — built for this exact use case, licensing
   already handled, alternative to a raw cloud VM.

## Key Config Locations (on this machine)
- OBS profile/scenes: `%APPDATA%\obs-studio\basic\profiles\TikTokLive\` (backed up under `obs/` in this repo)
- OBS scene collection: `%APPDATA%\obs-studio\basic\scenes\TikTokLive.json` (backed up under `obs/scenes/`)
- OBS WebSocket: port 4455, password stored in `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`
  (not committed — see `obs/README.md`)
- TikTok LIVE Studio logs: `%APPDATA%\TikTok LIVE Studio\logs\`
- Sunshine config: `sunshine.conf` — WAN access enabled, ports 47984/47989/47990/48010 confirmed listening

> Redacted from the original: the OBS WebSocket password and this instance's public IP address.
