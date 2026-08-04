const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { childLogger } = require('../util/logger');
const { config } = require('../util/config');
const vipList = require('./vipList');

const log = childLogger('overlays');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'vipConfig.json');
const AVATARS_DIR = path.join(__dirname, '..', '..', 'assets', 'avatars');
const SOUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds');
// http (not file://): this same URL is also used as an <img src> inside the
// http-served overlays-web pages (mvp.html/biggift.html/boxbattle.html),
// which Chromium blocks from loading file:// resources. Served by
// overlayServer's /avatars static route.
const DEFAULT_AVATAR_URL = `http://${config.overlay.host}:${config.overlay.port}/avatars/avatar_placeholder_1.png`;
const AVATAR_CHECK_TIMEOUT_MS = 2500;

function loadVipConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    log.error('Could not load config/vipConfig.json, using built-in defaults', { error: err.message });
    return {
      gift: { smallDurationMs: 3000 },
      bigGift: { minDiamondValue: 2999, durationMs: 3000 },
      mvp: { minDiamondValue: 9999, durationMs: 10000 },
      battleWinner: { durationMs: 10000 },
      welcome: { durationMs: 6000 },
      join: { durationMs: 4000 },
      follow: { durationMs: 4000 },
      share: { durationMs: 4500 },
      milestone: { likeThresholds: [], viewerThresholds: [], durationMs: 6000 },
      boxBattle: { durationMs: 8000 },
      leaderboard: { updateThrottleMs: 4000 },
    };
  }
}

let vipConfig = loadVipConfig();
fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => {
  log.info('config/vipConfig.json changed, reloading');
  vipConfig = loadVipConfig();
});

/**
 * Verifies a remote avatar URL actually responds before handing it to OBS's
 * browser_source. A browser_source pointed at a dead/unreachable URL won't
 * "fail" visibly - it just shows a blank/broken page - so without this check
 * a bad URL would silently break the presentation instead of falling back.
 */
function checkUrlReachable(url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      const lib = url.startsWith('https://') ? https : http;
      const req = lib.request(url, { method: 'HEAD', timeout: AVATAR_CHECK_TIMEOUT_MS }, (res) => {
        finish(res.statusCode >= 200 && res.statusCode < 400);
        res.resume();
      });
      req.on('timeout', () => { req.destroy(); finish(false); });
      req.on('error', () => finish(false));
      req.end();
    } catch (err) {
      finish(false);
    }
  });
}

async function resolveAvatarUrl(payload) {
  if (!payload.avatarUrl) return DEFAULT_AVATAR_URL;

  // Local file:// URLs (test mode's own placeholder assets) are trusted
  // directly - no network to verify, and they're locally controlled.
  if (/^file:\/\//i.test(payload.avatarUrl)) return payload.avatarUrl;

  if (/^https?:\/\//i.test(payload.avatarUrl)) {
    const reachable = await checkUrlReachable(payload.avatarUrl);
    if (reachable) return payload.avatarUrl;
    log.warn('Avatar URL unreachable, using fallback placeholder', { url: payload.avatarUrl });
  }
  return DEFAULT_AVATAR_URL;
}

async function setGroupEnabled(obs, names, enabled) {
  for (const sourceName of names) {
    const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName: 'MAIN', sourceName });
    await obs.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: enabled });
  }
}

async function setText(obs, inputName, text) {
  await obs.call('SetInputSettings', { inputName, inputSettings: { text } });
}

async function setAvatar(obs, inputName, url) {
  await obs.call('SetInputSettings', { inputName, inputSettings: { url } });
}

async function playSfx(obs, fileName) {
  const filePath = path.join(SOUNDS_DIR, fileName);
  await obs.call('SetInputSettings', { inputName: 'SfxPlayer', inputSettings: { local_file: filePath, is_local_file: true } });
  await obs.call('TriggerMediaInputAction', { inputName: 'SfxPlayer', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
}

const GIFT_SOURCES = ['GiftCardImage', 'GiftAvatar', 'GiftUsernameText', 'GiftDetailText'];
const WELCOME_SOURCES = ['WelcomeCardImage', 'WelcomeAvatar', 'WelcomeUsernameText'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showGiftAlert(obs, payload) {
  const username = payload.user || 'Someone';
  const giftName = payload.giftName || 'a gift';
  const diamondCount = payload.diamondCount || payload.repeatCount || '';

  log.info(`Showing gift alert for ${username}`, { giftName, diamondCount });
  const avatarUrl = await resolveAvatarUrl(payload);
  await setText(obs, 'GiftUsernameText', username);
  await setText(obs, 'GiftDetailText', diamondCount ? `sent ${giftName} (${diamondCount})` : `sent ${giftName}`);
  await setAvatar(obs, 'GiftAvatar', avatarUrl);
  await playSfx(obs, 'gift_alert.mp3').catch((err) => log.warn('Gift sfx failed', { error: err.message }));

  await setGroupEnabled(obs, GIFT_SOURCES, true);
  await sleep(vipConfig.gift.smallDurationMs);
  await setGroupEnabled(obs, GIFT_SOURCES, false);
}

async function showWelcome(obs, payload) {
  const username = payload.user || 'Someone';
  log.info(`Showing VIP welcome for ${username}`, { level: payload.level });

  const avatarUrl = await resolveAvatarUrl(payload);
  await setText(obs, 'WelcomeUsernameText', username);
  await setAvatar(obs, 'WelcomeAvatar', avatarUrl);
  await playSfx(obs, 'welcome.mp3').catch((err) => log.warn('Welcome sfx failed', { error: err.message }));

  await setGroupEnabled(obs, WELCOME_SOURCES, true);
  await sleep(vipConfig.welcome.durationMs);
  await setGroupEnabled(obs, WELCOME_SOURCES, false);
}

/**
 * Which of the 3 gift tiers a diamondCount falls into - see the _comment in
 * config/vipConfig.json for what each tier shows.
 */
function getGiftTier(payload) {
  const value = Number(payload.diamondCount) || 0;
  if (value >= vipConfig.mvp.minDiamondValue) return 'mvp';
  if (value >= vipConfig.bigGift.minDiamondValue) return 'bigGift';
  return 'small';
}

function qualifiesForWelcome(payload) {
  return vipList.isVip(payload.user);
}

function getVipConfig() {
  return vipConfig;
}

module.exports = {
  showGiftAlert,
  showWelcome,
  getGiftTier,
  qualifiesForWelcome,
  resolveAvatarUrl,
  getVipConfig,
  GIFT_SOURCES,
  WELCOME_SOURCES,
};
