const fs = require('fs');
const path = require('path');
const { childLogger } = require('../util/logger');

const log = childLogger('action-mapper');

const RULES_PATH = path.join(__dirname, '..', '..', 'config', 'eventActions.json');

const ACTION_HANDLERS = {
  logOnly: async (_obsClient, action, event) => {
    log.info(`[action:logOnly] ${event.type} from ${event.user || 'unknown'}`, { note: action.note, event });
  },
  switchScene: async (obsClient, action) => {
    await obsClient.call('SetCurrentProgramScene', { sceneName: action.sceneName });
  },
  showSource: async (obsClient, action) => {
    const { sceneItemId } = await obsClient.call('GetSceneItemId', { sceneName: action.sceneName, sourceName: action.sourceName });
    await obsClient.call('SetSceneItemEnabled', { sceneName: action.sceneName, sceneItemId, sceneItemEnabled: true });
  },
  hideSource: async (obsClient, action) => {
    const { sceneItemId } = await obsClient.call('GetSceneItemId', { sceneName: action.sceneName, sourceName: action.sourceName });
    await obsClient.call('SetSceneItemEnabled', { sceneName: action.sceneName, sceneItemId, sceneItemEnabled: false });
  },
};

function loadRules() {
  try {
    const raw = fs.readFileSync(RULES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.rules) ? parsed.rules : [];
  } catch (err) {
    log.error(`Could not load ${RULES_PATH}, no event actions will run`, { error: err.message });
    return [];
  }
}

function ruleMatches(rule, event) {
  if (rule.eventType !== event.type) return false;
  if (rule.minValue !== undefined) {
    const field = rule.valueField || 'count';
    const value = Number(event[field]) || 0;
    if (value < rule.minValue) return false;
  }
  return true;
}

/**
 * Wires EventBridge events to OBS actions per config/eventActions.json.
 * The action-handler set (logOnly/switchScene/showSource/hideSource) is the
 * extension point for future gift/follow/like/share/comment reactions -
 * add a new rule + handler without touching the event source code.
 */
function attachActionMapper(eventBridge, obsClient) {
  let rules = loadRules();

  fs.watchFile(RULES_PATH, { interval: 2000 }, () => {
    log.info('config/eventActions.json changed, reloading rules');
    rules = loadRules();
  });

  eventBridge.on('event', async (event) => {
    const matched = rules.filter((r) => ruleMatches(r, event));
    for (const rule of matched) {
      const handler = ACTION_HANDLERS[rule.action && rule.action.kind];
      if (!handler) {
        log.warn(`No handler for action kind: ${rule.action && rule.action.kind}`);
        continue;
      }
      try {
        await handler(obsClient, rule.action, event);
      } catch (err) {
        log.error('Action handler failed', { rule, error: err.message });
      }
    }
  });

  log.info(`Action mapper attached with ${rules.length} rule(s)`);
}

module.exports = { attachActionMapper, ACTION_HANDLERS };
