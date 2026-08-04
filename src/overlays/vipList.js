const fs = require('fs');
const path = require('path');
const { childLogger } = require('../util/logger');

const log = childLogger('vip-list');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'vipList.json');

function normalize(username) {
  return String(username || '').trim().replace(/^@/, '').toLowerCase();
}

function loadVipList() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const usernames = Array.isArray(parsed.usernames) ? parsed.usernames : [];
    return new Set(usernames.map(normalize).filter(Boolean));
  } catch (err) {
    log.error('Could not load config/vipList.json, VIP welcome will never trigger', { error: err.message });
    return new Set();
  }
}

let vipSet = loadVipList();
fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => {
  log.info('config/vipList.json changed, reloading');
  vipSet = loadVipList();
});

function isVip(username) {
  return vipSet.has(normalize(username));
}

/**
 * Appends a username to config/vipList.json if it isn't already there
 * (case-insensitive). Used to auto-VIP a Box/Guest Battle winner. The
 * fs.watchFile above picks up the change and reloads vipSet automatically.
 */
function addVip(username) {
  const normalized = normalize(username);
  if (!normalized) return;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    log.error('Could not read config/vipList.json to add VIP', { error: err.message });
    return;
  }
  const usernames = Array.isArray(parsed.usernames) ? parsed.usernames : [];
  if (usernames.some((u) => normalize(u) === normalized)) return;

  usernames.push(username.trim().replace(/^@/, ''));
  parsed.usernames = usernames;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2) + '\n');
  vipSet.add(normalized);
  log.info(`Added ${username} to config/vipList.json`);
}

module.exports = { isVip, addVip };
