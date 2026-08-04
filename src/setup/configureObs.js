/**
 * One-time (idempotent) OBS provisioning for TikTok LIVE vertical streaming.
 * Run with: npm run setup:obs
 *
 * Uses only documented obs-websocket v5 requests - no scene-collection file
 * hand-editing - so OBS itself guarantees a consistent config.
 */
const fs = require('fs');
const path = require('path');
const { ObsClient } = require('../obs/obsClient');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');
const { listBackgrounds } = require('../backgrounds/backgroundLibrary');

const log = childLogger('setup-obs');

const SCENES = ['STARTING', 'MAIN', 'BRB', 'ENDING'];
const SCENE_TEXT = {
  STARTING: 'Starting soon...',
  BRB: 'Be right back',
  ENDING: 'Thanks for watching!',
};

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const OVERLAYS_DIR = path.join(ASSETS_DIR, 'overlays');

const FULLSCREEN_TRANSFORM = {
  boundsType: 'OBS_BOUNDS_STRETCH',
  boundsAlignment: 0,
  boundsWidth: 1080,
  boundsHeight: 1920,
  alignment: 5,
  positionX: 0,
  positionY: 0,
};

// Bottom-to-top render order. Each entry is a scene item name; earlier
// entries end up further back. Backgrounds/content sit at the bottom,
// alerts stack above them, MVP is the topmost so it fully takes over.
function buildLayerOrder(bgInputNames) {
  return [
    ...bgInputNames,
    'Camera',
    'PlaylistA', 'PlaylistB',
    'Desktop Audio', 'Mic/Aux', 'MusicPlayer',
    'GiftCardImage', 'GiftAvatar', 'GiftUsernameText', 'GiftDetailText',
    'WelcomeCardImage', 'WelcomeAvatar', 'WelcomeUsernameText',
    'JoinOverlay', 'FollowOverlay', 'ShareOverlay', 'MilestoneOverlay',
    'LeaderboardOverlay', 'GoalBarOverlay',
    // Full-takeover moments, topmost so they cover everything else - MVP
    // last/highest since it is the rarest and most important.
    'BigGiftOverlay', 'BoxBattleOverlay', 'CountdownOverlay', 'BattleDropOverlay', 'MVPOverlay',
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Profile/scene-collection switches make OBS briefly restart its WebSocket
 * server, dropping the client. Ride that out before issuing the next call.
 */
async function settleAfterContextSwitch(client, ms = 2000) {
  await sleep(ms);
  // Rely on ObsClient's own auto-reconnect (scheduled on ConnectionClosed)
  // rather than dialing manually, to avoid racing two connect attempts.
  for (let attempt = 0; attempt < 10 && !client.connected; attempt += 1) {
    await sleep(1000);
  }
  if (!client.connected) {
    throw new Error('OBS WebSocket did not come back after profile/scene-collection switch');
  }
}

async function ensureProfile(client) {
  const { profiles, currentProfileName } = await client.call('GetProfileList');
  if (!profiles.includes(config.obs.profileName)) {
    log.info(`Creating OBS profile ${config.obs.profileName}`);
    await client.call('CreateProfile', { profileName: config.obs.profileName });
    await settleAfterContextSwitch(client);
    return;
  }
  if (currentProfileName !== config.obs.profileName) {
    await client.call('SetCurrentProfile', { profileName: config.obs.profileName });
    await settleAfterContextSwitch(client);
  }
}

async function ensureSceneCollection(client) {
  const { sceneCollections, currentSceneCollectionName } = await client.call('GetSceneCollectionList');
  if (!sceneCollections.includes(config.obs.sceneCollectionName)) {
    log.info(`Creating scene collection ${config.obs.sceneCollectionName}`);
    await client.call('CreateSceneCollection', { sceneCollectionName: config.obs.sceneCollectionName });
    await settleAfterContextSwitch(client);
    return;
  }
  if (currentSceneCollectionName !== config.obs.sceneCollectionName) {
    await client.call('SetCurrentSceneCollection', { sceneCollectionName: config.obs.sceneCollectionName });
    await settleAfterContextSwitch(client);
  }
}

async function ensureVideoSettings(client) {
  log.info('Setting vertical canvas 1080x1920 @ 30fps');
  await client.call('SetVideoSettings', {
    baseWidth: 1080,
    baseHeight: 1920,
    outputWidth: 1080,
    outputHeight: 1920,
    fpsNumerator: 30,
    fpsDenominator: 1,
  });
}

async function ensureEncoderSettings(client) {
  log.info('Configuring Simple output: NVENC H.264, 6000 Kbps video / 160 Kbps audio');
  const params = [
    ['Output', 'Mode', 'Simple'],
    ['SimpleOutput', 'StreamEncoder', 'nvenc'],
    ['SimpleOutput', 'VBitrate', '6000'],
    ['SimpleOutput', 'ABitrate', '160'],
    ['SimpleOutput', 'UseAdvanced', 'false'],
    ['SimpleOutput', 'NVENCPreset2', 'p5'],
    ['SimpleOutput', 'RescaleFilter', 'false'],
  ];
  for (const [category, name, value] of params) {
    await client.call('SetProfileParameter', { parameterCategory: category, parameterName: name, parameterValue: value });
  }
}

async function ensureScenes(client) {
  const { scenes } = await client.call('GetSceneList');
  const existingNames = scenes.map((s) => s.sceneName);

  // Rename the default scene to STARTING instead of deleting+recreating,
  // so we never leave the collection with zero scenes mid-setup.
  if (existingNames.length === 1 && !SCENES.includes(existingNames[0])) {
    await client.call('SetSceneName', { sceneName: existingNames[0], newSceneName: SCENES[0] });
  }

  const { scenes: afterRename } = await client.call('GetSceneList');
  const current = afterRename.map((s) => s.sceneName);

  for (const name of SCENES) {
    if (!current.includes(name)) {
      log.info(`Creating scene ${name}`);
      await client.call('CreateScene', { sceneName: name });
    }
  }
}

async function ensureAudioSources(client) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  if (!names.includes('Desktop Audio')) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName: 'Desktop Audio',
      inputKind: 'wasapi_output_capture',
      inputSettings: {},
    }).catch(() => {});
  }

  if (!names.includes('Mic/Aux')) {
    try {
      await client.call('CreateInput', {
        sceneName: 'MAIN',
        inputName: 'Mic/Aux',
        inputKind: 'wasapi_input_capture',
        inputSettings: { device_id: 'default' },
      });
    } catch (err) {
      log.warn('Could not create Mic/Aux input (no input device present, continuing without it)', { error: err.message });
    }
  }

  for (const sceneName of SCENES) {
    for (const sourceName of ['Desktop Audio', 'Mic/Aux']) {
      await addExistingSourceToScene(client, sceneName, sourceName);
    }
  }
}

async function addExistingSourceToScene(client, sceneName, sourceName) {
  const { inputs } = await client.call('GetInputList');
  if (!inputs.some((i) => i.inputName === sourceName)) return;

  const { sceneItems } = await client.call('GetSceneItemList', { sceneName });
  if (sceneItems.some((i) => i.sourceName === sourceName)) return;

  await client.call('CreateSceneItem', { sceneName, sourceName }).catch((err) => {
    log.warn(`Could not add ${sourceName} to ${sceneName}`, { error: err.message });
  });
}

async function ensurePlaceholderVisuals(client) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  if (!names.includes('BackgroundColor')) {
    await client.call('CreateInput', {
      sceneName: SCENES[0],
      inputName: 'BackgroundColor',
      inputKind: 'color_source_v3',
      inputSettings: { color: 4278190080, width: 1080, height: 1920 }, // opaque black (ABGR)
    });
  }

  for (const sceneName of ['STARTING', 'BRB', 'ENDING']) {
    await addExistingSourceToScene(client, sceneName, 'BackgroundColor');

    // Legacy plain-text placeholder, kept as a fallback layer (disabled) in
    // case the browser overlay ever fails to load - see
    // ensureStartingBrbEndingScreens for the real black-gold visual.
    const textInputName = `${sceneName}Text`;
    if (!names.includes(textInputName)) {
      await client.call('CreateInput', {
        sceneName,
        inputName: textInputName,
        inputKind: 'text_gdiplus_v3',
        inputSettings: { text: SCENE_TEXT[sceneName], font: { face: 'Arial', size: 72, style: '' }, color1: 4294967295, align: 'center' },
      }).catch((err) => log.warn(`Could not create ${textInputName}`, { error: err.message }));
    } else {
      await addExistingSourceToScene(client, sceneName, textInputName);
    }
    const { sceneItemId: textItemId } = await client.call('GetSceneItemId', { sceneName, sourceName: textInputName });
    await client.call('SetSceneItemEnabled', { sceneName, sceneItemId: textItemId, sceneItemEnabled: false });
  }
}

/**
 * Full-screen black-gold browser-source screens for STARTING/BRB/ENDING,
 * replacing the plain white-Arial-on-black placeholder text as the visible
 * layer in each of those scenes.
 */
async function ensureStartingBrbEndingScreens(client) {
  const PAGES = { STARTING: 'starting.html', BRB: 'brb.html', ENDING: 'ending.html' };
  for (const [sceneName, page] of Object.entries(PAGES)) {
    const inputName = `${sceneName}Overlay`;
    const url = `http://${config.overlay.host}:${config.overlay.port}/${page}`;
    const { inputs } = await client.call('GetInputList');
    const names = inputs.map((i) => i.inputName);

    // shutdown: true frees this source's CEF renderer process (~100-300MB)
    // whenever its scene isn't the active program scene - these 3 screens
    // are only ever visible one at a time, never alongside MAIN.
    if (!names.includes(inputName)) {
      await client.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings: { url, width: 1080, height: 1920, fps: 30, reroute_audio: false, shutdown: true },
      });
    } else {
      await addExistingSourceToScene(client, sceneName, inputName);
      await client.call('SetInputSettings', { inputName, inputSettings: { url, shutdown: true } });
    }

    const { sceneItemId } = await client.call('GetSceneItemId', { sceneName, sourceName: inputName });
    await client.call('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: FULLSCREEN_TRANSFORM });
    await client.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: true });
  }
}

async function ensurePlaylistSources(client) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  for (const inputName of ['PlaylistA', 'PlaylistB']) {
    if (!names.includes(inputName)) {
      log.info(`Creating media playlist source ${inputName}`);
      await client.call('CreateInput', {
        sceneName: 'MAIN',
        inputName,
        inputKind: 'ffmpeg_source',
        inputSettings: {
          is_local_file: true,
          local_file: '',
          looping: false,
          restart_on_activate: true,
          clear_on_media_end: false,
          close_when_inactive: false,
        },
      });
    } else {
      await addExistingSourceToScene(client, 'MAIN', inputName);
    }

    const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: inputName });
    await client.call('SetSceneItemTransform', {
      sceneName: 'MAIN',
      sceneItemId,
      sceneItemTransform: {
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsAlignment: 0,
        boundsWidth: 1080,
        boundsHeight: 1920,
        alignment: 5,
        positionX: 0,
        positionY: 0,
      },
    });
  }

  // Dormant by default: the animated background layer (see
  // ensureBackgroundSources) is now the primary always-on visual. This
  // sequential-video playlist module is kept working and available (e.g. to
  // re-enable later as an optional secondary content layer) but starts
  // disabled so it can never sit on top of / obscure the background.
  const { sceneItemId: idA } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: 'PlaylistA' });
  const { sceneItemId: idB } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: 'PlaylistB' });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId: idA, sceneItemEnabled: false });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId: idB, sceneItemEnabled: false });
}

async function ensureBackgroundSources(client) {
  const backgrounds = listBackgrounds();
  if (backgrounds.length === 0) {
    log.warn('No files found in backgrounds/ - add a looping vertical video and rerun setup');
    return [];
  }

  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  for (const [idx, bg] of backgrounds.entries()) {
    if (!names.includes(bg.inputName)) {
      log.info(`Creating background source ${bg.inputName}`);
      await client.call('CreateInput', {
        sceneName: 'MAIN',
        inputName: bg.inputName,
        inputKind: 'ffmpeg_source',
        inputSettings: {
          is_local_file: true,
          local_file: bg.filePath,
          looping: true,
          restart_on_activate: true,
          close_when_inactive: false,
        },
      });
    } else {
      await addExistingSourceToScene(client, 'MAIN', bg.inputName);
      // Keep the file path in sync in case the underlying video was replaced
      // in place (same filename, new content - e.g. re-exporting an
      // animated background). OBS/libobs skips reloading local_file when the
      // path STRING is unchanged, even though the file content on disk
      // changed, so setting it directly to the same value is a silent
      // no-op. Toggle through an empty value first to force it to notice.
      await client.call('SetInputSettings', { inputName: bg.inputName, inputSettings: { local_file: '' } });
      await client.call('SetInputSettings', {
        inputName: bg.inputName,
        inputSettings: { local_file: bg.filePath, is_local_file: true, looping: true },
      });
      await client.call('TriggerMediaInputAction', {
        inputName: bg.inputName,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
    }

    const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: bg.inputName });
    await client.call('SetSceneItemTransform', { sceneName: 'MAIN', sceneItemId, sceneItemTransform: FULLSCREEN_TRANSFORM });
    // Only the first background is visible by default; switching themes is
    // just enabling one BG_* item and disabling the rest (see backgroundController.js).
    await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: idx === 0 });
  }

  return backgrounds;
}

async function ensureImageOverlay(client, inputName, imageFile, transform = FULLSCREEN_TRANSFORM) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);
  const filePath = path.join(OVERLAYS_DIR, imageFile);

  if (!names.includes(inputName)) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName,
      inputKind: 'image_source',
      inputSettings: { file: filePath },
    });
  } else {
    await addExistingSourceToScene(client, 'MAIN', inputName);
    await client.call('SetInputSettings', { inputName, inputSettings: { file: filePath } });
  }
  const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: inputName });
  await client.call('SetSceneItemTransform', { sceneName: 'MAIN', sceneItemId, sceneItemTransform: transform });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: false });
}

async function ensureTextOverlay(client, inputName, defaultText, { size = 48, x = 0, y = 100, width = 1080 } = {}) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  if (!names.includes(inputName)) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName,
      inputKind: 'text_gdiplus_v3',
      inputSettings: { text: defaultText, font: { face: 'Arial', size, style: 'Bold' }, color1: 4294967295, align: 'center' },
    });
  } else {
    await addExistingSourceToScene(client, 'MAIN', inputName);
  }
  const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: inputName });
  // OBS_BOUNDS_MAX_ONLY with a fixed width lets the GDI+ text source's own
  // "align: center" setting center the text within that width, instead of
  // it always hugging the left edge at positionX.
  await client.call('SetSceneItemTransform', {
    sceneName: 'MAIN',
    sceneItemId,
    sceneItemTransform: { boundsType: 'OBS_BOUNDS_MAX_ONLY', boundsWidth: width, boundsHeight: size * 1.5, boundsAlignment: 0, alignment: 5, positionX: x, positionY: y },
  });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: false });
}

async function ensureAvatarOverlay(client, inputName, { x, y, w, h }) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);
  const placeholderUrl = `file:///${path.join(ASSETS_DIR, 'avatars', 'avatar_placeholder_1.png').replace(/\\/g, '/')}`;

  // shutdown: true frees this source's CEF renderer process while its scene
  // item is disabled (the default state - only enabled for the few seconds
  // an alert is showing), instead of keeping ~100MB+ idle in memory always.
  if (!names.includes(inputName)) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName,
      inputKind: 'browser_source',
      inputSettings: { url: placeholderUrl, width: w, height: h, fps: 1, shutdown: true },
    });
  } else {
    await addExistingSourceToScene(client, 'MAIN', inputName);
    await client.call('SetInputSettings', { inputName, inputSettings: { shutdown: true } });
  }
  const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: inputName });
  await client.call('SetSceneItemTransform', {
    sceneName: 'MAIN',
    sceneItemId,
    sceneItemTransform: { boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: w, boundsHeight: h, boundsAlignment: 0, alignment: 5, positionX: x, positionY: y },
  });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: false });
}

async function ensureCameraSource(client) {
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  if (!names.includes('Camera')) {
    log.info('Creating Camera source (webcam) - default OFF');
    try {
      await client.call('CreateInput', {
        sceneName: 'MAIN',
        inputName: 'Camera',
        inputKind: 'dshow_input',
        inputSettings: {},
      });
    } catch (err) {
      log.warn('Could not create Camera input (no video capture device present on this machine yet - the source is still usable once a webcam is plugged in and selected in OBS properties)', { error: err.message });
      return;
    }
  } else {
    await addExistingSourceToScene(client, 'MAIN', 'Camera');
  }

  const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: 'Camera' });
  await client.call('SetSceneItemTransform', { sceneName: 'MAIN', sceneItemId, sceneItemTransform: FULLSCREEN_TRANSFORM });
  // Default OFF (see requirement: camera starts disabled, background-only until the
  // dashboard turns it on). CameraController re-asserts the persisted on/off state
  // after every controller startup/reconnect the same way backgrounds do.
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: false });
}

async function ensureOverlaySources(client) {
  // Gift alert - small banner card, upper-middle area (native 1000x420, not
  // stretched). Shifted down from the very top edge (was y=60) to leave the
  // top-left/top-right corners clear for the Join/Follow badges added in
  // ensureWebOverlaySources.
  await ensureImageOverlay(client, 'GiftCardImage', 'gift_alert_card.png', {
    boundsType: 'OBS_BOUNDS_NONE', alignment: 5, positionX: 40, positionY: 210, boundsAlignment: 0,
  });
  await ensureAvatarOverlay(client, 'GiftAvatar', { x: 70, y: 250, w: 140, h: 140 });
  await ensureTextOverlay(client, 'GiftUsernameText', 'Username', { size: 40, x: 230, y: 300, width: 760 });
  await ensureTextOverlay(client, 'GiftDetailText', 'sent a gift', { size: 28, x: 230, y: 380, width: 760 });

  // Welcome VIP card (native 1000x600, not stretched)
  await ensureImageOverlay(client, 'WelcomeCardImage', 'welcome_card.png', {
    boundsType: 'OBS_BOUNDS_NONE', alignment: 5, positionX: 40, positionY: 460, boundsAlignment: 0,
  });
  await ensureAvatarOverlay(client, 'WelcomeAvatar', { x: (1080 - 260) / 2, y: 520, w: 260, h: 260 });
  await ensureTextOverlay(client, 'WelcomeUsernameText', 'Username', { size: 46, x: 40, y: 810, width: 1000 });

  // Manually-controlled music (no auto-advance; see musicController.js)
  const { inputs } = await client.call('GetInputList');
  if (!inputs.some((i) => i.inputName === 'MusicPlayer')) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName: 'MusicPlayer',
      inputKind: 'ffmpeg_source',
      inputSettings: { is_local_file: true, local_file: '', looping: false, restart_on_activate: false, close_when_inactive: false },
    });
  } else {
    await addExistingSourceToScene(client, 'MAIN', 'MusicPlayer');
  }

  // One-shot alert sound effects - independent of MusicPlayer so triggering
  // a gift/MVP/welcome sound never disturbs manually-controlled music.
  if (!inputs.some((i) => i.inputName === 'SfxPlayer')) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName: 'SfxPlayer',
      inputKind: 'ffmpeg_source',
      inputSettings: { is_local_file: true, local_file: '', looping: false, restart_on_activate: true, close_when_inactive: false },
    });
  } else {
    await addExistingSourceToScene(client, 'MAIN', 'SfxPlayer');
  }
}

/**
 * Creates a browser_source pointed at one of the pages in overlays-web/,
 * served by the overlay web server (src/overlays/overlayServer.js). These
 * are the black-gold animated HTML/CSS overlays - transparent, driven live
 * over WebSocket by overlayDispatcher.js. Positions are laid out on the
 * 1080x1920 vertical canvas to avoid the gift-alert card and each other.
 */
async function ensureWebOverlaySource(client, inputName, page, { x, y, w, h }) {
  const url = `http://${config.overlay.host}:${config.overlay.port}/${page}`;
  const { inputs } = await client.call('GetInputList');
  const names = inputs.map((i) => i.inputName);

  if (!names.includes(inputName)) {
    await client.call('CreateInput', {
      sceneName: 'MAIN',
      inputName,
      inputKind: 'browser_source',
      inputSettings: { url, width: w, height: h, fps: 30, reroute_audio: false },
    });
  } else {
    await addExistingSourceToScene(client, 'MAIN', inputName);
    await client.call('SetInputSettings', { inputName, inputSettings: { url, width: w, height: h } });
  }

  const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: inputName });
  await client.call('SetSceneItemTransform', {
    sceneName: 'MAIN',
    sceneItemId,
    sceneItemTransform: { boundsType: 'OBS_BOUNDS_NONE', alignment: 5, positionX: x, positionY: y },
  });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: true });
}

async function ensureWebOverlaySources(client) {
  await ensureWebOverlaySource(client, 'JoinOverlay', 'join.html', { x: 0, y: 0, w: 520, h: 180 });
  await ensureWebOverlaySource(client, 'FollowOverlay', 'follow.html', { x: 560, y: 0, w: 520, h: 180 });
  await ensureWebOverlaySource(client, 'MilestoneOverlay', 'milestone.html', { x: 90, y: 650, w: 900, h: 300 });
  // Box/Guest Battle winner and the big-gift tier are both full-takeover
  // moments (not small corner badges), so they get the full 1080x1920 canvas.
  await ensureWebOverlaySource(client, 'BoxBattleOverlay', 'boxbattle.html', { x: 0, y: 0, w: 1080, h: 1920 });
  await ensureWebOverlaySource(client, 'BigGiftOverlay', 'biggift.html', { x: 0, y: 0, w: 1080, h: 1920 });
  await ensureWebOverlaySource(client, 'ShareOverlay', 'share.html', { x: 180, y: 1360, w: 720, h: 160 });
  await ensureWebOverlaySource(client, 'LeaderboardOverlay', 'leaderboard.html', { x: 20, y: 1560, w: 380, h: 320 });
  await ensureWebOverlaySource(client, 'GoalBarOverlay', 'goalbar.html', { x: 680, y: 1680, w: 380, h: 200 });
  // The MVP luxury animation is the single most important, most rare
  // moment (whale gifts) - full-screen and must render above everything
  // else, including BigGift/BoxBattle, so it is added (and layered) last.
  await ensureWebOverlaySource(client, 'MVPOverlay', 'mvp.html', { x: 0, y: 0, w: 1080, h: 1920 });
  await ensureWebOverlaySource(client, 'CountdownOverlay', 'countdown.html', { x: 0, y: 0, w: 1080, h: 1920 });
  await ensureWebOverlaySource(client, 'BattleDropOverlay', 'battledrop.html', { x: 0, y: 0, w: 1080, h: 1920 });
}

async function ensureLayerOrder(client, backgrounds) {
  const desired = buildLayerOrder(backgrounds.map((b) => b.inputName));
  const { sceneItems } = await client.call('GetSceneItemList', { sceneName: 'MAIN' });
  const present = new Set(sceneItems.map((i) => i.sourceName));

  // Walk the desired order assigning sequential indices 0,1,2,... - each
  // SetSceneItemIndex call inserts the item at that position, shifting the
  // rest, so processing in order converges on the exact target arrangement.
  let index = 0;
  for (const name of desired) {
    if (!present.has(name)) continue;
    const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: name });
    await client.call('SetSceneItemIndex', { sceneName: 'MAIN', sceneItemId, sceneItemIndex: index });
    index += 1;
  }
}

async function main() {
  const client = new ObsClient();
  const connected = await client.connect();
  if (!connected) {
    log.error('Could not connect to OBS. Is OBS running with WebSocket enabled?');
    process.exit(1);
  }

  try {
    await ensureProfile(client);
    await ensureSceneCollection(client);
    await ensureVideoSettings(client);
    await ensureEncoderSettings(client);
    await ensureScenes(client);
    await ensureAudioSources(client);
    await ensurePlaceholderVisuals(client);
    await ensurePlaylistSources(client);
    const backgrounds = await ensureBackgroundSources(client);
    await ensureCameraSource(client);
    await ensureOverlaySources(client);
    await ensureWebOverlaySources(client);
    await ensureStartingBrbEndingScreens(client);
    await ensureLayerOrder(client, backgrounds);
    await client.call('SetCurrentProgramScene', { sceneName: 'STARTING' });

    log.info('OBS provisioning complete.');
  } catch (err) {
    log.error('OBS provisioning failed', { error: err.message, stack: err.stack });
    process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main();
