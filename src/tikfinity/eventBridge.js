const { EventEmitter } = require('events');
const { childLogger } = require('../util/logger');

const log = childLogger('event-bridge');

/**
 * Normalized event types this automation understands. Adapters translate
 * whatever their source sends into one of these before emitting.
 */
const EVENT_TYPES = Object.freeze({
  COMMENT: 'comment',
  FOLLOW: 'follow',
  LIKE: 'like',
  SHARE: 'share',
  GIFT: 'gift',
  JOIN: 'join',
  MILESTONE: 'milestone',
  LEADERBOARD: 'leaderboard',
  GOAL: 'goal',
  BOX_BATTLE: 'boxBattle',
});

/**
 * Central hub that TikFinity (or any other) event sources publish into, and
 * that OBS action-mapping subscribes to. Kept separate from the transport
 * (webhook, simulated, future adapters) so new event sources can be added
 * without touching anything downstream.
 */
class EventBridge extends EventEmitter {
  constructor() {
    super();
    this.lastEventAt = null;
    this.eventCount = 0;
  }

  publish(type, payload = {}) {
    if (!Object.values(EVENT_TYPES).includes(type)) {
      log.warn(`Ignoring event with unknown type: ${type}`);
      return;
    }
    const normalized = { type, receivedAt: new Date().toISOString(), ...payload };
    this.lastEventAt = normalized.receivedAt;
    this.eventCount += 1;
    log.info(`Event received: ${type}`, { payload });
    this.emit('event', normalized);
    this.emit(type, normalized);
  }
}

module.exports = { EventBridge, EVENT_TYPES };
