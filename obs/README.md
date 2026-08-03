# OBS configuration backup

This folder is a backup of the `TikTokLive` OBS profile and scene collection, exported
from `%APPDATA%\obs-studio\basic\`. Secrets have been stripped — see below.

## Contents

- `profiles/TikTokLive/basic.ini` — profile settings (output, video, audio device names).
- `profiles/TikTokLive/service.json` — streaming service settings. The stream key field is
  empty in the source install (this automation never auto-fills or stores a stream key) —
  enter it directly in OBS on the new machine.
- `scenes/TikTokLive.json` — the full scene collection (sources, filters, layout).
  The vdo.ninja phone-camera browser source URL has been redacted to
  `YOUR_ROOM_CODE` — replace it with your own vdo.ninja room link after restoring.
- `obs-websocket.config.example.json` — template for OBS's `obs-websocket` plugin config.
  The real file (`%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`) contains a
  plaintext WebSocket password and was **not** committed. Copy this template into place and
  set your own `server_password`, matching `OBS_WS_PASSWORD` in the automation's `.env`.

## Restoring on a fresh Windows VPS

1. Install OBS Studio (same major version if possible — see root README).
2. Copy `profiles/TikTokLive/` to `%APPDATA%\obs-studio\basic\profiles\TikTokLive\`.
3. Copy `scenes/TikTokLive.json` to `%APPDATA%\obs-studio\basic\scenes\TikTokLive.json`.
4. Launch OBS once, select the `TikTokLive` profile and scene collection.
5. Re-enter your TikTok RTMP server/stream key in Settings → Stream (never stored here).
6. Install the `obs-websocket` plugin (bundled with modern OBS) and set a WebSocket password
   in Tools → WebSocket Server Settings — use the same value as `OBS_WS_PASSWORD` in `.env`.
7. Update the vdo.ninja source URL in the "PhoneMic" browser source with your own room code.
8. Re-select audio devices under the `TikTokLive` profile (device IDs are hardware-specific
   and will not carry over — see root README's "Manual steps" section for the VB-Audio Cable
   / virtual camera setup needed).
