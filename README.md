# TikTok LIVE Workstation — Backup & Restore

Backup of an automated TikTok LIVE streaming setup: a Windows VPS running OBS Studio +
TikTok LIVE Studio + TikFinity, driven by a custom Node.js controller that reacts to live
viewer events (gifts, follows, comments) with scene/overlay/music changes over OBS's
WebSocket API. This repo exists so the whole workstation can be reconstructed on a fresh
Windows VPS with minimal guesswork.

**This is a configuration/automation backup, not a working clone of the machine.** Installed
applications, TikTok/TikFinity login sessions, stream keys, and large media files are
deliberately excluded — see [What's NOT included](#whats-not-included-and-why) and
[Manual steps](#manual-steps-on-the-new-vps) below.

## How it fits together

```
Phone camera ──(vdo.ninja browser source)──> OBS Studio (scene: TikTokLive)
                                                 │
                                                 ├─ Virtual Camera ──> TikTok LIVE Studio (Camera source) ──> TikTok LIVE
                                                 │
                                                 └─ obs-websocket (localhost:4455)
                                                          ▲
TikTok viewers ─> TikTok LIVE ─> TikFinity (Electron app) ─(local webhook)─> Node controller (this repo)
                                                                                   │
                                                                     reacts per config/eventActions.json
                                                                     + config/vipConfig.json, and drives
                                                                     OBS scenes/backgrounds/music/overlays
                                                                     via src/obs, src/backgrounds, src/music,
                                                                     src/overlays. Exposes a local dashboard
                                                                     (public/ + src/dashboard) on :4000.
```

The controller never logs into TikTok and never starts a LIVE itself — it only talks to a
local, already-running OBS instance and to TikFinity's local webhook bridge.

## Folder structure

```
.
├── src/                     Node.js controller source
│   ├── obs/                 obs-websocket client + scene switching
│   ├── backgrounds/         looping background-video controller
│   ├── music/               background music playlist controller
│   ├── camera/              virtual camera control
│   ├── overlays/            alert/overlay dispatch + queueing
│   ├── playlist/            media probing / ping-pong playback
│   ├── tikfinity/           local webhook bridge + event → action mapping
│   ├── reliability/         health monitor, OBS process manager, state store, single-instance lock
│   ├── dashboard/           local control dashboard server
│   ├── setup/               one-time OBS setup helper (`npm run setup:obs`)
│   └── test/                smoke tests / manual verification scripts
├── config/
│   ├── eventActions.json    maps TikFinity events -> OBS actions (edit freely, no code changes needed)
│   └── vipConfig.json       gift/VIP/welcome thresholds and alert durations
├── assets/                  overlay graphics, sound effects, avatar placeholders (small, included)
├── public/                  static files for the local dashboard (HTML/CSS/JS)
├── obs/                     backup of the OBS "TikTokLive" profile + scene collection (secrets stripped)
├── vps-setup/               VPS provisioning/diagnostic scripts (virtual display, VCam diagnostics)
├── docs/                    known-issue writeups (e.g. audio routing on Windows Server RDP)
├── backgrounds/, music/, media/, logs/, state/   empty on purpose — see below, populated at runtime
├── reference/               placeholder; a local design-reference video was excluded (see reference/README.md)
├── .env.example             template for required environment variables
└── package.json
```

## Required software (versions used on the source machine)

| Software | Version used | Purpose |
|---|---|---|
| Windows Server 2025 Datacenter | 10.0.26100 | Host OS (any recent Windows Server/10/11 should work) |
| Node.js | 24.18.0 (repo requires >=18) | Runs the controller in `src/` |
| Git | 2.55.0 | Source control |
| OBS Studio | 32.2.1 | Scene composition, virtual camera, obs-websocket server |
| obs-websocket | bundled with OBS 28+ | Lets the controller drive OBS remotely |
| VB-Audio Virtual Cable | latest | Virtual audio routing (see audio caveat below) |
| TikTok LIVE Studio | 1.33.0 | Actual TikTok broadcast client |
| TikFinity | 2.0.0 | TikTok LIVE event capture -> local webhook |
| Parsec Virtual Display Driver | 0.45.0.0 | Virtual monitor so OBS can render on a headless/RDP VPS |
| Cursor | 3.13.25 | Editor used for this project (optional) |
| Claude Code | 2.1.220 (`@anthropic-ai/claude-code` via npm) | AI coding assistant used for this project (optional) |
| SplitCam | 10.9.2 | Attempted audio/video mixer workaround (optional, see docs) |
| Sunshine + Parsec/Moonlight | 2026.516.143833 | Attempted console-session workaround for RDP audio isolation (optional, see docs) |
| Python | 3.12.10 | Only used for an experimental local music-generation venv, not required by `src/` |

## Installation order on a fresh Windows VPS

1. **Provision the VPS** with a virtual display driver if it's headless/RDP-only (Parsec VDD or
   equivalent — see `vps-setup/Set-SkyRigDisplay.ps1` for one way to force it primary and detach
   the fallback "Microsoft Basic Display"/VGX adapter; `vps-setup/Verify-SkyRigDisplay.ps1` is a
   post-reboot safety net that re-applies this). These scripts are written against this
   machine's specific virtual-display driver signatures — treat them as a reference, not a
   drop-in guarantee, on a differently provisioned VPS.
2. Install **Node.js** (18+; 24.x was used here) and **Git**.
3. Install **OBS Studio** (32.x). The `obs-websocket` plugin ships with it.
4. Install **VB-Audio Virtual Cable**.
5. Install **TikTok LIVE Studio** and log in with your TikTok account (manual — see below).
6. Install **TikFinity** and log in / connect it to your TikTok account (manual — see below).
7. Clone this repo to `C:\TikTokLiveAutomation` (or update `.env`'s paths if you use a different location):
   ```
   git clone https://github.com/fida2020/tiktok-live-setup.git C:\TikTokLiveAutomation
   cd C:\TikTokLiveAutomation
   npm install
   ```
8. Restore the OBS profile/scene collection — follow `obs/README.md`.
9. Copy `.env.example` to `.env` and fill in real values (OBS WebSocket password, TikFinity
   bridge token, ports). **Never commit `.env`.**
10. Start OBS, select the `TikTokLive` profile/scene collection, start the Virtual Camera.
11. Run `npm run setup:obs` once to verify the controller can reach OBS.
12. Run `npm start` to launch the controller (health monitor, TikFinity bridge, dashboard on
    `http://127.0.0.1:4000` by default).
13. Point TikFinity's webhook/Streamer.bot-style action config at the controller's bridge port
    (`TIKFINITY_BRIDGE_PORT` in `.env`, default 3939) — this mapping lives inside TikFinity's own
    UI and isn't exportable as a file (see Manual steps).

## Dependencies (npm)

From `package.json`:
- `obs-websocket-js` — OBS WebSocket v5 client
- `dotenv` — loads `.env`
- `winston` — logging
- `express` — dashboard + TikFinity webhook bridge HTTP server
- `proper-lockfile` — single-instance lock (see `src/reliability/singleInstanceLock.js`)

Run `npm install` to install all of them from `package-lock.json` (committed, so versions are pinned).

## Manual steps on the new VPS

These cannot be scripted/restored from this repo and must be redone by hand:

1. **TikTok account logins** — TikTok LIVE Studio and TikFinity both require an interactive
   TikTok login. No TikTok credentials, session tokens, or cookies are stored in this repo.
2. **OBS stream key** — enter your TikTok RTMP server/stream key directly in OBS
   (Settings → Stream). It was never stored on the source machine either.
3. **OBS WebSocket password** — set one in OBS (Tools → WebSocket Server Settings) and put the
   same value in `.env` as `OBS_WS_PASSWORD`. The source machine's password was redacted from
   this backup (see `obs/README.md`).
4. **vdo.ninja room code** — the "PhoneMic" browser source in the scene collection had its room
   code redacted; open your own vdo.ninja room and update the source URL in OBS.
5. **Audio device selection** — Windows audio device IDs (e.g. VB-Cable's `MonitoringDeviceId`
   in `obs/profiles/TikTokLive/basic.ini`) are hardware/install-specific and will not carry over;
   reselect devices in OBS after installing VB-Audio Cable on the new machine.
6. **TikFinity → controller wiring** — the mapping of TikTok events to the local webhook bridge
   is configured inside TikFinity's own UI (per-account) and is not exportable as a file; redo it
   pointing at `TIKFINITY_BRIDGE_HOST:TIKFINITY_BRIDGE_PORT` from `.env`.
7. **Known limitation: audio on Windows Server + RDP** — see `docs/audio-troubleshooting.md`.
   Windows Server's RDS session audio isolation blocks every virtual-audio-cable path tried on
   the source machine. If the new VPS is also Windows Server accessed via RDP, expect the same
   problem; the documented workarounds (fix the Sunshine/Moonlight console-session connection, a
   single-user managed desktop, or a cloud-gaming-PC service) are the real fixes, not this repo.
8. **Media library content** — `backgrounds/`, `music/`, and `media/` ship empty (`.gitkeep`
   only). Add your own background loop videos, music tracks, and clips; the source machine's
   files were excluded as large binaries / possible copyright content. `assets/` (small overlay
   graphics, sound effects, avatar placeholders) *is* included since the controller reads it
   directly.
9. **Virtual display driver** — reinstall/re-provision whatever virtual display solution your
   new VPS provider uses; `vps-setup/` scripts assume this machine's specific driver signatures.
10. **n8n** — not found anywhere on the source machine (no install, no `.n8n` data, no exported
    workflow JSON), so there was nothing to back up. If you do use n8n for this workflow
    elsewhere, add its exported workflow JSON under a new `n8n/` folder.

## What's NOT included (and why)

| Excluded | Why |
|---|---|
| `node_modules/` | Regenerate with `npm install` |
| `.env` | Contains real secrets (OBS WS password, bridge token) |
| `.buildtmp/` | One-off UI-automation debug screenshots/logs from configuring TikFinity actions, not portable |
| `.musicenv/` | A 4.7GB local Python virtualenv (PyTorch) for experimental music generation, not wired into `src/` and trivially regenerable |
| `backgrounds/*`, `music/*`, `media/*` (contents) | Large binary media / possible copyright; folders kept via `.gitkeep` |
| `logs/*`, `state/*` (contents) | Runtime-generated, machine-specific |
| OBS WebSocket real password | Was stored in plaintext in `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`; replaced with a template |
| vdo.ninja room code | A live, joinable video-room link — redacted from the scene JSON and docs |
| This instance's public IP / hostname | Redacted from `docs/audio-troubleshooting.md` |
| TikTok LIVE Studio / TikFinity AppData | Entirely browser cache, crash logs, and TikTok login session/cookies — not portable and not safe to share |
| n8n workflows | Not present on the source machine |
| Reference design video (`reference/background-animation-reference.mp4`) | ~10MB video file, not read by any code path |

## Notes on Cursor / Claude Code

Neither tool stores project-specific configuration inside this project folder on the source
machine (no `.cursor/`, `.claude/`, or `CLAUDE.md` here) — both simply operate on this repo as a
regular folder. Install Cursor and/or Claude Code on the new VPS and open this cloned folder;
there's nothing else to restore.
