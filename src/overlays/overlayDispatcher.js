const { childLogger } = require('../util/logger');
const { EVENT_TYPES } = require('../tikfinity/eventBridge');
const { OverlayQueue } = require('./overlayQueue');
const { showGiftAlert, showWelcome, showMVP, qualifiesForMvp, qualifiesForWelcome } = require('./overlayController');

const log = childLogger('overlay-dispatcher');

/**
 * Bridges normalized TikFinity events (gift/join) to the overlay queue.
 * A qualifying big gift gets the full MVP treatment instead of the small
 * alert (MVP already shows gift info, no need to double up). A "join"
 * event only triggers the welcome overlay if the payload carries a `level`
 * field meeting the configured threshold - see README for why TikFinity
 * cannot currently be relied on to supply this automatically.
 */
function attachOverlayDispatcher(eventBridge, obsClient) {
  const queue = new OverlayQueue();

  eventBridge.on(EVENT_TYPES.GIFT, (event) => {
    if (qualifiesForMvp(event)) {
      queue.enqueue({ type: 'mvp', priority: 'high', run: () => showMVP(obsClient, event) });
    } else {
      queue.enqueue({ type: 'gift', priority: 'normal', run: () => showGiftAlert(obsClient, event) });
    }
  });

  eventBridge.on(EVENT_TYPES.JOIN, (event) => {
    if (!qualifiesForWelcome(event)) {
      log.debug(`Join event for ${event.user || 'unknown'} did not include a qualifying level - no welcome shown`, { event });
      return;
    }
    queue.enqueue({ type: 'welcome', priority: 'normal', run: () => showWelcome(obsClient, event) });
  });

  log.info('Overlay dispatcher attached (gift -> alert/MVP, join -> welcome when level qualifies)');
  return queue;
}

module.exports = { attachOverlayDispatcher };
