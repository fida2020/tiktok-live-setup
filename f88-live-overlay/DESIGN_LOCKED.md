# F88 Live Overlay — Design LOCKED ✅

Final approved version of `public/overlay.html` (9 Guest Battle Arena).
Do not redesign from scratch again — only make targeted edits if explicitly asked.

## Locked layout
- Title: "9 GUEST BATTLE ARENA" — single line, bold gold gradient, top of stage
- Round pill below title (⚔ ROUND 1)
- Middle row (top-aligned, all three columns match the leader photo's height exactly):
  - Left: Leaderboard panel (top 6 guests)
  - Center: Leader — 4:6 portrait rectangle frame (gold gradient border), sunburst halo behind it, LIVE POINTS score shown INSIDE the frame as a bottom banner overlay, name below frame, "LEADER" badge below name
  - Right: Elimination panel (top half) + Recent Gifts panel (bottom half), stacked
- Below middle row: 2 rows of 4 rank cards each (ranks 2-9), gem-style cards with glass/gradient background, glowing avatar ring, rank badge, name, colored score pill
- Live comment feed pinned above the bottom safe zone (fixed position, never overlaps guest cards)
- Top ~126px and bottom ~118px reserved as safe zones for TikTok's own native UI (profile bar/follow button on top; comment box/gift icons on bottom)

## Locked colors (pixel-verified from user's reference screenshot)
- Rank 2 / 8: #12A3F9 / #0494FF (blue)
- Rank 3: #FF9E00 (orange)
- Rank 4: #A8F956 (lime-green)
- Rank 5: #BF2CFF (magenta-purple)
- Rank 6: #A243FF (violet)
- Rank 7: #FF4102 (red-orange)
- Gold: #FFD24C / #FFC02E
- Panel background: neutral dark rgba(17,13,9,.9), NOT purple-tinted
- Elimination panel: red-tinted background specifically

## Locked functionality (server.js v2.0.0)
- 9-guest roster, manually added by TikTok username (auto-fetches avatar/name)
- Scoring: 100% automatic via gift receiverUserId — no manual assignment
- Round: Start/End manually triggered from control.html
- Elimination Challenge: automatic — lowest-scoring guest gets a 60s survival timer with a threshold; auto-dropped from roster if they don't reach it in time
- Winner: automatically the highest score when round ends
- Live comments: real TikTok chat events shown in the feed

## Explicitly out of scope (confirmed with user)
- Mic on/off control — impossible from a browser overlay; handled natively by TikTok LIVE Studio's own Multi-guest panel
- Customer/subscriber account automation — N/A, this is the owner's own streaming tool, not tied to F88Bot's trading customer base

## Background (added, locked)
- Full-screen arena background baked into overlay.html itself (no separate image/video needed)
- Layers: twinkling star-field (top area), stage floor glow (bottom), 3 sweeping gold/purple spotlight beams, drifting gold particles, red theater curtain drapes framing both edges
- Fills the whole frame when there's no camera; if a guest's own camera is added as a separate source in TikTok LIVE Studio, this background shows around/behind it
- Bug fixed: internal preview hint text now correctly hides itself the moment the page connects live, so it never shows to viewers

## Leader card — final structure (locked)
- Outer frame: 4:6 rectangle (112×168px), gold gradient border, rounded corners
- Inside the frame, stacked: round DP (gold ring) → name → bold points (18px gold) → "👑 LEADER" badge
- Left/right side panels (Leaderboard, Elimination+Gifts) height-matched to this box (168px) so nothing looks unbalanced
- Leaderboard rows now show a small colored avatar circle per guest (matches rank-card avatar style)
- Recent Gifts rows now show a small gift icon (real TikTok gift image when available via giftPictureUrl, our SVG icon set as fallback)

## Gift celebration — final structure (locked)
- Full 4-second choreographed animation (entrance shake → hold/showcase with continuous sparkles → exit)
- Uses REAL TikTok gift icon image (giftPictureUrl from the live gift event) when available — this is TikTok's own artwork for that gift
- Falls back to our own hand-drawn SVG vector icon set (not emoji) per gift-name keyword match, only when no real image is available (e.g. demo mode)
- Per-gift accent color drives the screen tint, shockwave rings, and light rays

## Host camera bubble (added, position TBD)
- Live round webcam bubble for the host, captured directly by `overlay.html` via
  `getUserMedia` (`.host-cam` / `#hostCamVideo`) — no separate OBS/LIVE Studio camera
  source needed
- Placeholder position: top-left, above the leader zone (`.host-cam` CSS, `top`/`left`
  values) — explicitly a temporary spot, meant to be repositioned later
- Requires a secure context (`http://localhost:PORT` or any `https://` URL, e.g. an
  ngrok tunnel) — browsers block camera access on a plain `http://` LAN IP
- Falls back to a camera-off icon (`.cam-offline`) if permission is denied or
  unsupported, without breaking anything else on the page

## Guest auto-detection (server.js v2.1.0)
- Listens for TikTok's linkMic co-host join/leave event to auto-detect people currently in the multi-guest call
- Control panel shows detected guests with a live pulse indicator and a single "Add" button — no typing required
- Manual "Add by username" field kept as a backup, since the auto-detect event's exact payload shape is less documented than gift events and hasn't been verified on a real live stream yet

## Sound effects — final (locked)
- All three celebration sounds now use REAL audio files (royalty-free, Pixabay), not synthesized tones — user found synthesized sounds unsatisfying after multiple iterations.
- `public/sounds/win-dhol.mp3` — real dhol beat clip, plays on round win
- `public/sounds/gift-coin.mp3` — real coin/reward sound, plays on BOTH guest join and big gift (via two separate Audio() instances pointing to the same file, so simultaneous triggers don't cut each other off)
- Both files need a user click/keydown anywhere on the page once (browser autoplay policy) — handled automatically via unlock listeners, but note this when setting up the Browser/Web Source in TikTok LIVE Studio for the first time.
- IMPORTANT: public/sounds/ folder must stay alongside overlay.html — paths are relative ("sounds/win-dhol.mp3"). Confirmed this only works when served via server.js (npm start); direct file preview in chat does not reliably resolve the relative path.
