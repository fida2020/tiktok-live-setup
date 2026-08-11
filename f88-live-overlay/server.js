// server.js
// v2.0.0
//
// Runs three jobs:
//   1. Connects to your TikTok LIVE room and tracks gift-diamond totals
//      per guest automatically, using each gift event's receiverUserId —
//      TikTok itself tells us which specific guest a gift was sent to,
//      so no manual assignment or comment-reading is ever needed.
//   2. Serves overlay.html (for your streaming software) and
//      control.html (for you).
//   3. Runs a WebSocket hub both pages connect to.
//
// ROSTER MANAGEMENT (who's in the battle, up to 9) is manual — you add
// guests by TikTok username from the control panel. SCORING and WINNER
// SELECTION are fully automatic once a round is running.
//
// ELIMINATION CHALLENGE (v2.0.0): once a round is running, the
// lowest-scoring guest is automatically put on a survival timer. If
// their score doesn't reach the survival threshold before the timer
// runs out, they're automatically dropped from the roster. This can
// repeat continuously while a round is active — after an elimination,
// the new lowest-scoring guest is put on the clock next.
//
// GUEST LOOKUP: adding a guest by username fetches their public profile
// page (no login, no paid API) to get their avatar/display name/numeric
// ID up front. This depends on TikTok's public page structure and can
// break if TikTok changes it; if a lookup fails, the guest is still
// added with a placeholder avatar and gets a real photo/name
// automatically the moment their first gift arrives.

require("dotenv").config();
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { TikTokLiveConnection, WebcastEvent } = require("tiktok-live-connector");

const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;
const MAX_GUESTS = 9;

// Elimination Challenge defaults — tune these to taste. Exposed to the
// control panel too, so you can change them per-round without editing code.
const DEFAULT_SURVIVAL_SECONDS = 60;
const DEFAULT_SURVIVAL_THRESHOLD = 30; // diamonds the at-risk guest must reach

if (!TIKTOK_USERNAME || TIKTOK_USERNAME === "your_tiktok_username") {
  console.error("\n❌ Set TIKTOK_USERNAME in your .env file first (copy .env.example to .env).\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Express: serves the two browser pages.
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const httpServer = app.listen(PORT, () => {
  console.log(`\n✅ Server running.`);
  console.log(`   Overlay (add as a Browser/Web Source): http://localhost:${PORT}/overlay.html`);
  console.log(`   Control panel (open in your browser):    http://localhost:${PORT}/control.html\n`);
});

// ---------------------------------------------------------------------------
// WebSocket hub
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on("connection", (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({ type: "state", ...getPublicState() }));

  socket.on("message", async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    await handleControlMessage(message, socket);
  });

  socket.on("close", () => clients.delete(socket));
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

// ---------------------------------------------------------------------------
// Roster + round + elimination state
// ---------------------------------------------------------------------------
const state = {
  roundActive: false,
  guests: [], // ordered array of { id, username, name, avatar, score } — the actual battle roster
  detected: [], // auto-detected people currently in the multi-guest video call, not yet added to the roster
  elimination: null // { targetId, targetName, deadline, threshold, startScore } | null
};

let eliminationTimer = null;

function getPublicState() {
  return {
    roundActive: state.roundActive,
    guests: state.guests,
    detected: state.detected,
    elimination: state.elimination
      ? {
          targetId: state.elimination.targetId,
          targetName: state.elimination.targetName,
          threshold: state.elimination.threshold,
          startScore: state.elimination.startScore,
          deadline: state.elimination.deadline // client computes remaining time from this
        }
      : null
  };
}

function findGuestById(userId) {
  return state.guests.find((g) => g.id === userId);
}

function findGuestByUsername(username) {
  const normalized = username.replace(/^@/, "").toLowerCase();
  return state.guests.find((g) => g.username.toLowerCase() === normalized);
}

// ---------------------------------------------------------------------------
// Elimination Challenge engine
// ---------------------------------------------------------------------------

/**
 * Looks at the current roster and puts the lowest-scoring guest on the
 * clock, if nobody is currently at risk. Call this after any score
 * change or roster change while a round is active.
 */
function refreshEliminationTarget() {
  if (!state.roundActive) return;
  if (state.elimination) return; // someone's already on the clock
  if (state.guests.length < 2) return; // need at least 2 guests for elimination to make sense

  const lowest = [...state.guests].sort((a, b) => a.score - b.score)[0];
  startEliminationClock(lowest);
}

function startEliminationClock(guest) {
  clearTimeout(eliminationTimer);

  const deadline = Date.now() + DEFAULT_SURVIVAL_SECONDS * 1000;
  state.elimination = {
    targetId: guest.id,
    targetName: guest.name,
    threshold: guest.score + DEFAULT_SURVIVAL_THRESHOLD,
    startScore: guest.score,
    deadline
  };

  broadcast({ type: "eliminationStarted", ...state.elimination });
  broadcast({ type: "state", ...getPublicState() });

  eliminationTimer = setTimeout(() => resolveElimination(guest.id), DEFAULT_SURVIVAL_SECONDS * 1000);
}

function cancelEliminationIfSurvived(guestId) {
  if (!state.elimination || state.elimination.targetId !== guestId) return;
  const guest = findGuestById(guestId);
  if (!guest) return;

  if (guest.score >= state.elimination.threshold) {
    clearTimeout(eliminationTimer);
    const survivedName = guest.name;
    state.elimination = null;
    broadcast({ type: "eliminationSurvived", name: survivedName });
    broadcast({ type: "state", ...getPublicState() });
    refreshEliminationTarget(); // immediately queue up the next-lowest guest
  }
}

function resolveElimination(guestId) {
  const guest = findGuestById(guestId);
  state.elimination = null;

  if (!guest) {
    broadcast({ type: "state", ...getPublicState() });
    return;
  }

  // Guest survived exactly at the wire (score check on timeout, in case
  // the timer fired a tick after the score update landed).
  const requiredScore = guest.score;
  const survived = requiredScore >= (state.elimination?.threshold ?? Infinity);

  if (!survived) {
    state.guests = state.guests.filter((g) => g.id !== guestId);
    broadcast({ type: "eliminated", name: guest.name });
  }

  broadcast({ type: "state", ...getPublicState() });
  refreshEliminationTarget();
}

function stopEliminationChallenge() {
  clearTimeout(eliminationTimer);
  state.elimination = null;
}

// ---------------------------------------------------------------------------
// TikTok public profile lookup (avatar + display name + numeric user ID
// from just a username, with no login and no paid API).
// ---------------------------------------------------------------------------
async function lookupTikTokProfile(username) {
  const cleanUsername = username.replace(/^@/, "");
  const response = await fetch(`https://www.tiktok.com/@${cleanUsername}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`TikTok returned ${response.status} for @${cleanUsername}`);
  }

  const html = await response.text();
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("Could not find profile data on the page — TikTok may have changed their layout.");
  }

  const data = JSON.parse(match[1]);
  const userInfo = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
  if (!userInfo || !userInfo.user) {
    throw new Error(`No profile found for @${cleanUsername} — check the username is correct.`);
  }

  return {
    id: String(userInfo.user.id),
    username: userInfo.user.uniqueId,
    name: userInfo.user.nickname || userInfo.user.uniqueId,
    avatar: userInfo.user.avatarMedium || userInfo.user.avatarLarger || userInfo.user.avatarThumb || null
  };
}

// ---------------------------------------------------------------------------
// Control panel commands
// ---------------------------------------------------------------------------
async function handleControlMessage(message, socket) {
  switch (message.type) {
    case "addDetectedGuest": {
      const candidate = state.detected.find((g) => g.id === message.userId);
      if (!candidate) {
        send(socket, { type: "actionError", action: "addDetectedGuest", error: "That guest is no longer detected — they may have left." });
        return;
      }
      if (state.guests.length >= MAX_GUESTS) {
        send(socket, { type: "actionError", action: "addDetectedGuest", error: `Roster is full (max ${MAX_GUESTS}).` });
        return;
      }
      if (findGuestById(candidate.id)) {
        send(socket, { type: "actionError", action: "addDetectedGuest", error: "Already in the roster." });
        return;
      }

      // No profile lookup needed at all — we already have their real
      // avatar/name straight from TikTok's own multi-guest join event.
      state.guests.push({ id: candidate.id, username: candidate.username, name: candidate.name, avatar: candidate.avatar, score: 0 });
      state.detected = state.detected.filter((g) => g.id !== candidate.id);
      broadcast({ type: "state", ...getPublicState() });
      refreshEliminationTarget();
      break;
    }

    case "addGuest": {
      const username = (message.username || "").trim();
      if (!username) {
        send(socket, { type: "actionError", action: "addGuest", error: "Enter a username." });
        return;
      }
      if (state.guests.length >= MAX_GUESTS) {
        send(socket, { type: "actionError", action: "addGuest", error: `Roster is full (max ${MAX_GUESTS}).` });
        return;
      }
      if (findGuestByUsername(username)) {
        send(socket, { type: "actionError", action: "addGuest", error: "That guest is already in the roster." });
        return;
      }

      let profile;
      try {
        profile = await lookupTikTokProfile(username);
      } catch (err) {
        console.warn(`⚠️ Profile lookup failed for @${username}: ${err.message}`);
        profile = {
          id: `pending_${username.toLowerCase()}_${Date.now()}`,
          username,
          name: username,
          avatar: null
        };
      }

      state.guests.push({ id: profile.id, username: profile.username, name: profile.name, avatar: profile.avatar, score: 0 });
      broadcast({ type: "state", ...getPublicState() });
      refreshEliminationTarget();
      break;
    }

    case "dropGuest": {
      state.guests = state.guests.filter((g) => g.id !== message.userId);
      if (state.elimination && state.elimination.targetId === message.userId) {
        stopEliminationChallenge();
        refreshEliminationTarget();
      }
      broadcast({ type: "state", ...getPublicState() });
      break;
    }

    case "startRound": {
      state.roundActive = true;
      for (const guest of state.guests) guest.score = 0;
      stopEliminationChallenge();
      broadcast({ type: "roundStarted" });
      broadcast({ type: "state", ...getPublicState() });
      refreshEliminationTarget();
      break;
    }

    case "endRound": {
      state.roundActive = false;
      stopEliminationChallenge();
      const winner = [...state.guests].sort((a, b) => b.score - a.score)[0] || null;
      broadcast({ type: "roundEnded", winner });
      broadcast({ type: "state", ...getPublicState() });
      break;
    }

    case "resetScores": {
      for (const guest of state.guests) guest.score = 0;
      stopEliminationChallenge();
      broadcast({ type: "state", ...getPublicState() });
      refreshEliminationTarget();
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// TikTok LIVE connection
// ---------------------------------------------------------------------------
const connection = new TikTokLiveConnection(TIKTOK_USERNAME);

connection.connect()
  .then((connState) => {
    console.log(`✅ Connected to @${TIKTOK_USERNAME}'s LIVE (roomId ${connState.roomId})`);
    broadcast({ type: "connectionStatus", connected: true });
  })
  .catch((err) => {
    console.error("❌ Could not connect — are you actually live right now on TikTok?");
    console.error("   Error:", err.message);
    broadcast({ type: "connectionStatus", connected: false, error: err.message });
  });

connection.on("disconnect", () => {
  console.warn("⚠️ Disconnected from TikTok LIVE.");
  broadcast({ type: "connectionStatus", connected: false });
});

connection.on(WebcastEvent.GIFT, (data) => {
  const isStreakable = data.giftType === 1;
  if (isStreakable && !data.repeatEnd) return;

  const diamonds = (data.diamondCount || 0) * (data.repeatCount || 1);
  if (diamonds <= 0) return;

  const receiverUserId = String(
    data.receiverUserId || (data.monitorExtra && data.monitorExtra.to_user_id) || ""
  );
  if (!receiverUserId) return;

  let guest = findGuestById(receiverUserId);
  if (!guest && data.receiverUser) {
    guest = state.guests.find(
      (g) => g.id.startsWith("pending_") && g.username.toLowerCase() === (data.receiverUser.uniqueId || "").toLowerCase()
    );
    if (guest) {
      guest.id = receiverUserId;
      guest.name = data.receiverUser.nickname || guest.name;
      guest.avatar = data.receiverUser.profilePictureUrl || guest.avatar;
    }
  }
  if (!guest) return;
  if (!state.roundActive) return;

  guest.score += diamonds;

  broadcast({
    type: "gift",
    guestId: guest.id,
    guestName: guest.name,
    newScore: guest.score,
    diamonds,
    giftName: data.giftName || "Gift",
    giftImage: data.giftPictureUrl || null,
    senderName: data.user ? (data.user.nickname || data.user.uniqueId) : "Someone"
  });
  broadcast({ type: "state", ...getPublicState() });

  cancelEliminationIfSurvived(guest.id);
});

// ---------------------------------------------------------------------------
// Multi-guest auto-detection. Fires when someone joins or leaves the
// multi-guest video call — this is what powers the control panel's
// "detected guests, one click to add" list, so you never have to type
// a username for people who are already visibly in the call.
//
// NOTE: this event's exact payload shape is less documented than gift
// events, so this is defensive/best-effort. If it doesn't pick someone
// up on your setup, the manual "add by username" field in the control
// panel is always there as a reliable fallback — nothing else in the
// app depends on this working perfectly.
// ---------------------------------------------------------------------------
connection.on(WebcastEvent.LINK_MIC_METHOD, (data) => {
  try {
    const user = data.user || (data.linkMicUser && data.linkMicUser.user);
    if (!user || !user.id) return;

    const id = String(user.id);
    const isLeaving = /leave|exit|remove|kick/i.test(data.messageType || data.linkMicMethodType || "");

    if (isLeaving) {
      state.detected = state.detected.filter((g) => g.id !== id);
      broadcast({ type: "state", ...getPublicState() });
      return;
    }

    // Already in the roster or already detected — nothing new to show.
    if (findGuestById(id)) return;
    if (state.detected.some((g) => g.id === id)) return;

    state.detected.push({
      id,
      username: user.uniqueId || id,
      name: user.nickname || user.uniqueId || "Guest",
      avatar: user.profilePictureUrl || null
    });
    broadcast({ type: "state", ...getPublicState() });
  } catch (err) {
    console.warn("⚠️ Could not parse a linkMic event:", err.message);
  }
});

connection.on(WebcastEvent.MEMBER, (data) => {
  broadcast({
    type: "viewerJoin",
    name: data.user ? (data.user.nickname || data.user.uniqueId) : "Someone"
  });
});

connection.on(WebcastEvent.FOLLOW, (data) => {
  broadcast({
    type: "newFollower",
    name: data.user ? (data.user.nickname || data.user.uniqueId) : "Someone"
  });
});

connection.on(WebcastEvent.CHAT, (data) => {
  broadcast({
    type: "chat",
    name: data.user ? (data.user.nickname || data.user.uniqueId) : "Someone",
    comment: data.comment || ""
  });
});

process.on("SIGINT", () => {
  console.log("\nShutting down…");
  clearTimeout(eliminationTimer);
  connection.disconnect();
  process.exit(0);
});
