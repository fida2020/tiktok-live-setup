// server.js
// v1.0.0
//
// Runs two jobs:
//   1. Serves overlay.html (add as a Browser/Web Source in your streaming
//      software) and control.html (open in your own browser).
//   2. Runs a WebSocket hub: control.html sends "showMVP"/"showLevelUp"
//      trigger messages, overlay.html plays the matching animation.
//
// No TikTok LIVE connection at all — everything here is manually
// triggered from the control panel. The one exception is looking up an
// MVP's real TikTok display name/avatar, which fetches their public
// profile page (no login, no API key) the same way f88-live-overlay does.

const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3100;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// TikTok public profile lookup — same technique as f88-live-overlay's
// server.js: fetches the public profile page (no login, no paid API) to
// get the MVP's real avatar + display name from just a username.
// ---------------------------------------------------------------------------
app.get("/api/lookup", async (req, res) => {
  const username = (req.query.username || "").trim().replace(/^@/, "");
  if (!username) {
    res.status(400).json({ error: "Missing username." });
    return;
  }

  try {
    const response = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      }
    });
    if (!response.ok) throw new Error(`TikTok returned ${response.status}`);

    const html = await response.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) throw new Error("Could not find profile data on the page — TikTok may have changed their layout.");

    const data = JSON.parse(match[1]);
    const userInfo = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
    if (!userInfo || !userInfo.user) throw new Error(`No profile found for @${username}.`);

    res.json({
      username: userInfo.user.uniqueId,
      name: userInfo.user.nickname || userInfo.user.uniqueId,
      avatar: userInfo.user.avatarMedium || userInfo.user.avatarLarger || userInfo.user.avatarThumb || null
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

const httpServer = app.listen(PORT, () => {
  console.log(`\n✅ Server running.`);
  console.log(`   Overlay (add as a Browser/Web Source): http://localhost:${PORT}/overlay.html`);
  console.log(`   Control panel (open in your browser):    http://localhost:${PORT}/control.html\n`);
});

// ---------------------------------------------------------------------------
// WebSocket hub — pure relay, no state to track beyond the connected
// sockets themselves. Whatever control.html sends gets broadcast to every
// connected overlay.html.
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on("connection", (socket) => {
  clients.add(socket);
  socket.on("message", (raw) => {
    // Relay as-is to every other connected client (the overlay page(s)).
    for (const other of clients) {
      if (other !== socket && other.readyState === other.OPEN) other.send(raw.toString());
    }
  });
  socket.on("close", () => clients.delete(socket));
});
