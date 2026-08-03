const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { childLogger } = require('../util/logger');

const log = childLogger('overlays');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'vipConfig.json');
const AVATARS_DIR = path.join(__dirname, '..', '..', 'assets', 'avatars');
const SOUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds');
const DEFAULT_AVATAR_URL = `file:///${path.join(AVATARS_DIR, 'avatar_placeholder_1.png').replace(/\\/g, '/')}`;
const AVATAR_CHECK_TIMEOUT_MS = 2500;

function loadVipConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    log.error('Could not load config/vipConfig.json, using built-in defaults', { error: err.message });
    return { gift: { alertDurationMs: 5000 }, mvp: { minDiamondValue: 500, durationMs: 10000 }, welcome: { minLevel: 20, durationMs: 6000 } };
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

async function restartMedia(obs, inputName) {
  await obs.call('TriggerMediaInputAction', { inputName, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
}

const GIFT_SOURCES = ['GiftCardImage', 'GiftAvatar', 'GiftUsernameText', 'GiftDetailText'];
const WELCOME_SOURCES = ['WelcomeCardImage', 'WelcomeAvatar', 'WelcomeUsernameText'];
const MVP_SOURCES = ['MVPSceneImage', 'MVPAvatar', 'MVPUsernameText', 'MVPGiftText', 'MVPTitleText', 'MVPParticles'];

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
  await sleep(vipConfig.gift.alertDurationMs);
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
 * Full-screen MVP/big-gifter presentation. Only ever touches MVP_SOURCES -
 * never the background layer - so BG_<theme> keeps playing underneath,
 * untouched, for the whole sequence (see backgroundController.js / the
 * always-on background layer design).
 */
async function showMVP(obs, payload) {
  const username = payload.user || 'Someone';
  const giftName = payload.giftName || 'a gift';
  const diamondCount = payload.diamondCount || '';

  log.info(`Showing MVP presentation for ${username}`, { giftName, diamondCount });
  const avatarUrl = await resolveAvatarUrl(payload);
  await setText(obs, 'MVPUsernameText', username);
  await setText(obs, 'MVPGiftText', diamondCount ? `${giftName} - ${diamondCount} diamonds` : giftName);
  await setAvatar(obs, 'MVPAvatar', avatarUrl);
  await playSfx(obs, 'mvp_fanfare.mp3').catch((err) => log.warn('MVP sfx failed', { error: err.message }));

  await setGroupEnabled(obs, MVP_SOURCES, true);
  // Force the title/particle videos to play from frame 0 every time, rather
  // than resuming wherever they happened to be left (e.g. mid-pulse) from a
  // previous trigger.
  await restartMedia(obs, 'MVPTitleText').catch(() => {});
  await restartMedia(obs, 'MVPParticles').catch(() => {});

  await sleep(vipConfig.mvp.durationMs);
  await setGroupEnabled(obs, MVP_SOURCES, false);
}

function qualifiesForMvp(payload) {
  const value = Number(payload.diamondCount) || 0;
  return value >= vipConfig.mvp.minDiamondValue;
}

function qualifiesForWelcome(payload) {
  if (payload.level === undefined || payload.level === null) return false;
  return Number(payload.level) >= vipConfig.welcome.minLevel;
}

function getVipConfig() {
  return vipConfig;
}

module.exports = {
  showGiftAlert,
  showWelcome,
  showMVP,
  qualifiesForMvp,
  qualifiesForWelcome,
  getVipConfig,
  GIFT_SOURCES,
  WELCOME_SOURCES,
  MVP_SOURCES,
};
