/**
 * Standalone process: connects directly to TikTok LIVE's public event feed
 * (no login, no TikFinity, no Streamer.bot) for the configured TIKTOK_USERNAME,
 * and forwards Join/Follow/Share/Milestone/Leaderboard/Goal-progress to the
 * same local webhook bridge the main controller listens on. Run separately:
 *
 *   npm run tiktok-listener
 *
 * Restarting this process resets its in-memory milestone/goal counters -
 * intentional, since "restart it before you go live" is already step one of
 * the pre-live checklist.
 *
 * Deliberately does NOT forward `gift` events to the bridge - the existing
 * TikFinity -> Streamer.bot pipeline already owns the Gift/MVP/VIP-welcome
 * OBS visuals, and double-publishing gifts here would trigger them twice.
 */
const fs = require('fs');
const path = require('path');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('tiktok-listener');

const VIP_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'vipConfig.json');

function loadMilestoneConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(VIP_CONFIG_PATH, 'utf8'));
    return {
      likeThresholds: (parsed.milestone && parsed.milestone.likeThresholds) || [],
      viewerThresholds: (parsed.milestone && parsed.milestone.viewerThresholds) || [],
      leaderboardThrottleMs: (parsed.leaderboard && parsed.leaderboard.updateThrottleMs) || 4000,
    };
  } catch (err) {
    log.error('Could not load config/vipConfig.json, milestone thresholds disabled', { error: err.message });
    return { likeThresholds: [], viewerThresholds: [], leaderboardThrottleMs: 4000 };
  }
}

let milestoneConfig = loadMilestoneConfig();
fs.watchFile(VIP_CONFIG_PATH, { interval: 2000 }, () => {
  log.info('config/vipConfig.json changed, reloading milestone thresholds');
  milestoneConfig = loadMilestoneConfig();
});

const BRIDGE_URL = `http://${config.tikfinityBridge.host}:${config.tikfinityBridge.port}/events`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postEvent(type, payload) {
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': config.tikfinityBridge.token },
      body: JSON.stringify({ type, ...payload }),
    });
    if (!res.ok) {
      log.warn(`Bridge rejected ${type} event`, { status: res.status });
    }
  } catch (err) {
    log.error(`Failed to POST ${type} event to controller bridge`, { error: err.message, url: BRIDGE_URL });
  }
}

function throttle(fn, intervalMs) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      fn(...args);
    }
  };
}

function extractUser(data) {
  return (data.user && (data.user.uniqueId || data.user.nickname)) || 'Someone';
}

async function main() {
  if (!config.tiktok.username) {
    log.error('TIKTOK_USERNAME is not set in .env - cannot start the direct TikTok listener.');
    process.exit(1);
  }

  const connection = new TikTokLiveConnection(config.tiktok.username, { enableExtendedGiftInfo: true });

  let diamondTotal = 0;
  const firedLikeThresholds = new Set();
  const firedViewerThresholds = new Set();

  const publishGoal = throttle(() => postEvent('goal', { diamondTotal, likeTotal: lastLikeTotal }), 1000);
  const publishLeaderboard = throttle((top) => postEvent('leaderboard', { top }), milestoneConfig.leaderboardThrottleMs);

  let lastLikeTotal = 0;

  connection.on(WebcastEvent.MEMBER, (data) => {
    postEvent('join', { user: extractUser(data) });
  });

  connection.on(WebcastEvent.FOLLOW, (data) => {
    postEvent('follow', { user: extractUser(data) });
  });

  connection.on(WebcastEvent.SHARE, (data) => {
    postEvent('share', { user: extractUser(data) });
  });

  connection.on(WebcastEvent.LIKE, (data) => {
    lastLikeTotal = Number(data.totalLikeCount) || lastLikeTotal;
    for (const threshold of milestoneConfig.likeThresholds) {
      if (lastLikeTotal >= threshold && !firedLikeThresholds.has(threshold)) {
        firedLikeThresholds.add(threshold);
        postEvent('milestone', { kind: 'like', value: threshold });
      }
    }
    publishGoal();
  });

  connection.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data.viewerCount) || 0;
    for (const threshold of milestoneConfig.viewerThresholds) {
      if (viewerCount >= threshold && !firedViewerThresholds.has(threshold)) {
        firedViewerThresholds.add(threshold);
        postEvent('milestone', { kind: 'viewer', value: threshold });
      }
    }

    const ranks = Array.isArray(data.ranksList) ? data.ranksList : [];
    const top = ranks
      .slice(0, 3)
      .map((entry) => ({
        user: (entry.user && (entry.user.uniqueId || entry.user.nickname)) || 'Someone',
        total: Number(entry.coinCount) || 0,
      }));
    if (top.length) publishLeaderboard(top);
  });

  connection.on(WebcastEvent.GIFT, (data) => {
    const giftType = data.giftDetails && data.giftDetails.giftType;
    // Streaks (giftType 1) fire repeatedly while the streak is in progress;
    // only count once it ends (or immediately for non-streakable gifts) so
    // the running diamond total doesn't inflate mid-streak.
    if (giftType === 1 && !data.repeatEnd) return;

    const perGiftDiamonds = (data.giftDetails && data.giftDetails.diamondCount)
      || (data.extendedGiftInfo && data.extendedGiftInfo.diamond_count)
      || 0;
    const repeatCount = Number(data.repeatCount) || 1;
    diamondTotal += perGiftDiamonds * repeatCount;
    publishGoal();
  });

  connection.on(ControlEvent.CONNECTED, (state) => {
    log.info(`Connected to TikTok LIVE room ${state.roomId} for @${config.tiktok.username}`);
  });

  connection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
    log.warn('Disconnected from TikTok LIVE, will reconnect once live again', { code, reason });
    scheduleReconnect();
  });

  connection.on(ControlEvent.ERROR, ({ info, exception }) => {
    log.error('TikTok listener error', { info, error: exception && exception.message });
  });

  let reconnecting = false;
  async function scheduleReconnect() {
    if (reconnecting) return;
    reconnecting = true;
    await sleep(15000);
    reconnecting = false;
    connectLoop();
  }

  async function connectLoop() {
    while (true) {
      try {
        log.info(`Waiting for @${config.tiktok.username} to go live...`);
        await connection.waitUntilLive(30);
        await connection.connect();
        return;
      } catch (err) {
        log.error('Connect attempt failed, retrying in 15s', { error: err.message });
        await sleep(15000);
      }
    }
  }

  await connectLoop();
  log.info(`TikTok direct listener up. Forwarding join/follow/share/milestone/leaderboard/goal events to ${BRIDGE_URL}`);
}

main().catch((err) => {
  log.error('Fatal error in tiktok-listener', { error: err.message, stack: err.stack });
  process.exit(1);
});
