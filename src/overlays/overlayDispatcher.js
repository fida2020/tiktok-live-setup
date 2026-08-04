const { childLogger } = require('../util/logger');
const { EVENT_TYPES } = require('../tikfinity/eventBridge');
const { OverlayQueue } = require('./overlayQueue');
const { showGiftAlert, showWelcome, getGiftTier, qualifiesForWelcome, resolveAvatarUrl, getVipConfig } = require('./overlayController');

const log = childLogger('overlay-dispatcher');

/**
 * Bridges normalized events to their visuals.
 *
 * Two sources feed the same EventBridge:
 *  - TikFinity -> Streamer.bot -> webhook: only ever publishes `gift`. Routed
 *    into one of 3 tiers by diamondCount (see config/vipConfig.json): small
 *    gifts keep the existing OBS-native Gift card, bigGift and mvp tiers
 *    drive the black-gold browser overlays (biggift.html / mvp.html) via
 *    overlayServer's WebSocket.
 *  - The direct TikTok listener (src/tiktokDirect/tiktokListener.js):
 *    publishes join/follow/share/milestone/leaderboard/goal. Drives the
 *    black-gold browser-source overlays via overlayServer's WebSocket.
 *  - The dashboard's manual Box Battle button publishes `boxBattle` directly
 *    (TikTok LIVE doesn't expose a reliable automatic box-battle-result event
 *    through either pipeline, so this one stays operator-triggered). The
 *    winner is also auto-added to config/vipList.json (see dashboardServer.js).
 *
 * A join only gets the special VIP welcome card if the username is in
 * config/vipList.json - every join still gets the small Join badge regardless.
 */
function attachOverlayDispatcher(eventBridge, obsClient, overlayServer) {
  const queue = new OverlayQueue();

  eventBridge.on(EVENT_TYPES.GIFT, async (event) => {
    const tier = getGiftTier(event);
    if (tier === 'mvp') {
      const avatarUrl = await resolveAvatarUrl(event);
      overlayServer.broadcast('mvp', {
        user: event.user, giftName: event.giftName, diamondCount: event.diamondCount, avatarUrl,
        durationMs: getVipConfig().mvp.durationMs,
      });
    } else if (tier === 'bigGift') {
      const avatarUrl = await resolveAvatarUrl(event);
      overlayServer.broadcast('biggift', {
        user: event.user, giftName: event.giftName, diamondCount: event.diamondCount, avatarUrl,
        durationMs: getVipConfig().bigGift.durationMs,
      });
    } else {
      queue.enqueue({ type: 'gift', priority: 'normal', run: () => showGiftAlert(obsClient, event) });
    }
  });

  eventBridge.on(EVENT_TYPES.JOIN, (event) => {
    const user = event.user || 'Someone';
    overlayServer.broadcast('join', { user, durationMs: getVipConfig().join.durationMs });

    if (qualifiesForWelcome(event)) {
      queue.enqueue({ type: 'welcome', priority: 'normal', run: () => showWelcome(obsClient, event) });
    }
  });

  eventBridge.on(EVENT_TYPES.FOLLOW, (event) => {
    const user = event.user || 'Someone';
    overlayServer.broadcast('follow', { user, durationMs: getVipConfig().follow.durationMs });
  });

  eventBridge.on(EVENT_TYPES.SHARE, (event) => {
    const user = event.user || 'Someone';
    overlayServer.broadcast('share', { user, durationMs: getVipConfig().share.durationMs });
  });

  eventBridge.on(EVENT_TYPES.MILESTONE, (event) => {
    overlayServer.broadcast('milestone', {
      kind: event.kind,
      value: event.value,
      durationMs: getVipConfig().milestone.durationMs,
    });
  });

  eventBridge.on(EVENT_TYPES.LEADERBOARD, (event) => {
    overlayServer.broadcast('leaderboard', { top: event.top || [] });
  });

  eventBridge.on(EVENT_TYPES.GOAL, (event) => {
    overlayServer.broadcast('goal-progress', {
      diamondTotal: event.diamondTotal,
      likeTotal: event.likeTotal,
    });
  });

  eventBridge.on(EVENT_TYPES.BOX_BATTLE, async (event) => {
    const avatarUrl = await resolveAvatarUrl(event);
    overlayServer.broadcast('boxbattle', {
      winner: event.winner,
      winnerScore: event.winnerScore,
      loserScore: event.loserScore,
      avatarUrl,
      durationMs: getVipConfig().battleWinner.durationMs,
    });
  });

  log.info('Overlay dispatcher attached (gift -> alert/MVP via OBS, join/follow/share/milestone/leaderboard/goal/boxBattle -> browser overlays)');
  return queue;
}

module.exports = { attachOverlayDispatcher };
