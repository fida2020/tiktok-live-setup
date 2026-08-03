const { childLogger } = require('../../util/logger');
const { EVENT_TYPES } = require('../eventBridge');

const log = childLogger('simulated-adapter');

/**
 * Fires synthetic TikFinity-shaped events on a timer so the event bridge
 * and OBS action-mapping pipeline can be exercised end-to-end without a
 * real TikTok LIVE session or TikFinity connection. Enable only for local
 * testing (see src/test/runSmokeTests.js) - never wired into normal startup.
 */
function startSimulatedAdapter(eventBridge, { intervalMs = 5000 } = {}) {
  const samples = [
    () => ({ type: EVENT_TYPES.COMMENT, user: 'test_user', text: 'hello!' }),
    () => ({ type: EVENT_TYPES.FOLLOW, user: 'new_follower' }),
    () => ({ type: EVENT_TYPES.LIKE, user: 'liker_1', count: 5 }),
    () => ({ type: EVENT_TYPES.SHARE, user: 'sharer_1' }),
    () => ({ type: EVENT_TYPES.GIFT, user: 'gifter_1', giftName: 'Rose', repeatCount: 1, diamondCount: 1 }),
  ];
  let i = 0;

  const timer = setInterval(() => {
    const { type, ...payload } = samples[i % samples.length]();
    i += 1;
    eventBridge.publish(type, payload);
  }, intervalMs);

  log.info(`Simulated TikFinity event adapter running (every ${intervalMs}ms)`);
  return () => clearInterval(timer);
}

module.exports = { startSimulatedAdapter };
