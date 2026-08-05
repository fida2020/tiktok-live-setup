const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('obs-process');

const OBS_EXE_NAME = 'obs64.exe';
const SENTINEL_PATH = path.join(process.env.APPDATA || '', 'obs-studio', '.sentinel');

/**
 * OBS drops a ".sentinel" marker on startup and clears it on clean exit.
 * If our health monitor is relaunching OBS after a real crash or a forced
 * kill (the scenarios this whole module exists for), that marker is still
 * present and OBS shows a BLOCKING "Crash Detected" dialog on next launch -
 * `--disable-shutdown-check` does not suppress this one. An unattended
 * 6-10 hour session can't have a modal dialog waiting on a click that never
 * comes, so we clear the marker ourselves before every launch.
 */
function clearCrashSentinel() {
  try {
    fs.rmSync(SENTINEL_PATH, { recursive: true, force: true });
  } catch (err) {
    log.warn('Could not clear OBS crash sentinel', { error: err.message });
  }
}

function isRunning() {
  return new Promise((resolve) => {
    exec(`tasklist /FI "IMAGENAME eq ${OBS_EXE_NAME}" /FO CSV /NH`, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(stdout.toLowerCase().includes(OBS_EXE_NAME.toLowerCase()));
    });
  });
}

/**
 * Launches OBS pinned to our managed profile/scene collection so a fresh
 * launch (e.g. after a crash) always comes back in the right configuration
 * without needing to replay the websocket setup calls.
 */
function launch() {
  const exePath = path.join(config.obs.installDir, 'bin', '64bit', OBS_EXE_NAME);
  const cwd = path.join(config.obs.installDir, 'bin', '64bit');

  log.info('Launching OBS', { exePath, profile: config.obs.profileName, collection: config.obs.sceneCollectionName });
  clearCrashSentinel();

  const child = spawn(
    exePath,
    [
      '--profile', config.obs.profileName,
      '--collection', config.obs.sceneCollectionName,
      '--disable-shutdown-check',
    ],
    { cwd, detached: true, stdio: 'ignore' },
  );
  // Without this handler, a failed spawn (e.g. OBS_INSTALL_DIR pointing at a
  // path where OBS isn't actually installed - very easy to hit on a fresh
  // VPS before OBS is set up) emits an unhandled 'error' event on `child`,
  // which crashes this ENTIRE process with no useful log line. That used to
  // silently kill the dashboard/overlay/webhook servers too. Log it via our
  // own logger instead and let ensureRunning()'s polling loop time out and
  // report failure normally.
  child.on('error', (err) => {
    log.error('Failed to launch OBS process', { exePath, error: err.message, code: err.code });
  });
  child.unref();
  return child;
}

async function ensureRunning() {
  if (await isRunning()) return true;
  launch();

  const deadline = Date.now() + config.obs.launchTimeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (await isRunning()) return true;
  }
  log.error('OBS process did not appear within launch timeout');
  return false;
}

module.exports = { isRunning, launch, ensureRunning };
