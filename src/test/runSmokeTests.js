/**
 * Automated smoke tests: catch broken requires/JSON/syntax before you find
 * out live. Deliberately does NOT touch OBS, the TikTok listener, or any
 * network I/O - those need a running OBS/TikFinity and are covered by the
 * manual scripts in this same folder (wsSmoke.js, verifyObsSetup.js, etc.)
 * and by the dashboard's Test Mode buttons instead.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;

function fail(label, err) {
  failures += 1;
  console.error(`FAIL: ${label}`);
  console.error(`  ${err.message}`);
}

function ok(label) {
  console.log(`OK: ${label}`);
}

// 1. JSON config files must parse.
const jsonFiles = ['config/eventActions.json', 'config/vipConfig.json', 'config/vipList.json'];
for (const rel of jsonFiles) {
  const full = path.join(ROOT, rel);
  try {
    JSON.parse(fs.readFileSync(full, 'utf8'));
    ok(`parse ${rel}`);
  } catch (err) {
    fail(`parse ${rel}`, err);
  }
}

// 2. Entry-point / manual-verification scripts run OBS/network I/O as soon as
// they're required, so only syntax-check them (no execution) rather than
// requiring them.
const syntaxOnly = [
  'src/index.js',
  'src/tiktokDirect/tiktokListener.js',
  'src/setup/configureObs.js',
  'src/test/checkStreamSettings.js',
  'src/test/inspectObs.js',
  'src/test/testMusicBg.js',
  'src/test/verifyBgPersistence.js',
  'src/test/verifyObsSetup.js',
  'src/test/wsSmoke.js',
  'src/test/testOverlays.js',
  'src/test/verifyLayers.js',
];
for (const rel of syntaxOnly) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)]);
    ok(`syntax check ${rel}`);
  } catch (err) {
    fail(`syntax check ${rel}`, err);
  }
}

// 3. Everything else in src/ is side-effect-free to require (no top-level
// server.listen/connect/main()) - actually load it, which also exercises
// every module it requires transitively.
const requireable = [
  'src/backgrounds/backgroundController',
  'src/backgrounds/backgroundLibrary',
  'src/camera/cameraController',
  'src/music/musicController',
  'src/music/musicLibrary',
  'src/obs/obsClient',
  'src/obs/sceneController',
  'src/overlays/overlayQueue',
  'src/overlays/overlayController',
  'src/overlays/overlayDispatcher',
  'src/overlays/overlayServer',
  'src/overlays/goalState',
  'src/overlays/vipList',
  'src/playlist/durationProbe',
  'src/playlist/mediaLibrary',
  'src/playlist/pingPongPlayer',
  'src/reliability/healthMonitor',
  'src/reliability/obsProcessManager',
  'src/reliability/singleInstanceLock',
  'src/reliability/stateStore',
  'src/tikfinity/actionMapper',
  'src/tikfinity/adapters/simulatedAdapter',
  'src/tikfinity/adapters/webhookAdapter',
  'src/tikfinity/eventBridge',
  'src/testmode/simulator',
  'src/dashboard/dashboardServer',
  'src/util/logger',
  'src/util/config',
];
for (const rel of requireable) {
  try {
    require(path.join(ROOT, rel));
    ok(`require ${rel}`);
  } catch (err) {
    fail(`require ${rel}`, err);
  }
}

// 4. Config sanity - the values the checklist/README promise as defaults.
const { config } = require(path.join(ROOT, 'src/util/config'));
for (const [label, value] of [
  ['config.dashboard.port', config.dashboard.port],
  ['config.overlay.port', config.overlay.port],
  ['config.tikfinityBridge.port', config.tikfinityBridge.port],
]) {
  if (Number.isInteger(value)) {
    ok(`${label} is an integer (${value})`);
  } else {
    fail(label, new Error(`expected an integer, got ${JSON.stringify(value)}`));
  }
}

console.log('');
if (failures > 0) {
  console.error(`SMOKE TESTS FAILED (${failures} failure${failures === 1 ? '' : 's'})`);
  process.exit(1);
} else {
  console.log('SMOKE TESTS OK');
  process.exit(0);
}
