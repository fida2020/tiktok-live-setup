# Going live - plain-steps checklist

Follow these every time, in order. No coding required.

## One-time setup (only needed once, or after big changes)

1. Install TikFinity and log into it with your TikTok account.
2. Install Streamer.bot (free) and turn on its WebSocket Server (Server/Clients tab).
3. In TikFinity: Setup -> Streamer.bot Connection -> connect using the details Streamer.bot shows you.
4. In TikFinity's Actions & Events: create one action for "Gift" that calls a Streamer.bot Action.
5. In that Streamer.bot Action: add a "Fetch URL" sub-action (Core > Network) pointing to
   `http://127.0.0.1:3939/events?type=gift&user=%user%&giftName=%giftName%&diamondCount=%diamondCount%`
   with header `X-Bridge-Token` set to the value of `TIKFINITY_BRIDGE_TOKEN` in `.env`.
   (Exact placeholder names depend on what TikFinity exposes - check its variable list.)
6. Install VB-Audio Virtual Cable if you want the stream's audio routed through it (see `docs/audio-troubleshooting.md`).
7. Add your VIP usernames to `config/vipList.json` (usernames array) if you want the special welcome banner for specific people.
8. Set your goal target once from the dashboard (Stream Goal Bar section) - it's remembered until you change it again.

## Every time, before going live

1. Make sure OBS is closed (the controller will launch it for you with the right profile).
2. Open a terminal in the project folder and run: `npm start`
   Wait for the line "Controller is up and running."
3. Open a second terminal in the same folder and run: `npm run tiktok-listener`
   Wait for "Connected to TikTok LIVE room..." (or it will say "Waiting for @you to go live..." until you actually start your TikTok LIVE - that's normal, leave it running).
4. Open the dashboard in a browser: http://127.0.0.1:4000
   Check the status pills at the top are all green/OK.
5. In OBS, confirm you're on the "TikTokLive" profile and "TikTokLive" scene collection, and the current scene shows "STARTING".
6. Use the dashboard's Test Mode buttons to fire a few simulated events (gift, follow, join, milestone) and visually confirm they show correctly in OBS's preview.
7. Enter your TikTok stream key in OBS (Settings -> Stream) if not already saved, and start your TikTok LIVE from your phone/TikTok LIVE Studio as normal.
8. Switch OBS from "STARTING" to "MAIN" (dashboard Scene Controls) once you're actually live and ready.
9. During the stream: use the dashboard's "Box Battle Winner" form the moment a box battle ends (this one has no automatic trigger).
10. When taking a break: switch scene to "BRB". When ending: switch to "ENDING", then stop your TikTok LIVE.

## Stopping everything

1. Stop your TikTok LIVE from your phone/TikTok LIVE Studio.
2. Press Ctrl+C in both terminals (`npm start` and `npm run tiktok-listener`).
3. Close OBS.

Restarting `npm run tiktok-listener` resets the Milestone and Goal-bar progress counters to zero - so restart it fresh before every stream (step 3 above already does this).
