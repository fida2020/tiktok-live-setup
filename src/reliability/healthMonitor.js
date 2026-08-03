const { config } = require('../util/config');
const { childLogger } = require('../util/logger');
const obsProcessManager = require('./obsProcessManager');

const log = childLogger('health-monitor');

/**
 * Periodic watchdog: confirms the OBS process is alive, relaunches it if it
 * disappeared (crash/kill), and reports basic stats while connected. The
 * ObsClient handles the actual websocket reconnect loop on its own; this
 * layer's job is specifically noticing "the process itself is gone".
 */
function startHealthMonitor(obsClient, { onObsRelaunched } = {}) {
  let checking = false;

  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const running = await obsProcessManager.isRunning();
      if (!running) {
        log.error('OBS process not found - attempting relaunch');
        const ok = await obsProcessManager.ensureRunning();
        if (ok && onObsRelaunched) {
          await onObsRelaunched();
        }
        return;
      }

      if (obsClient.connected) {
        const stats = await obsClient.callSafe('GetStats');
        if (stats) {
          log.info('Health check OK', {
            cpu: stats.cpuUsage && stats.cpuUsage.toFixed ? stats.cpuUsage.toFixed(1) : stats.cpuUsage,
            fps: stats.activeFps,
            renderSkippedFrames: stats.renderSkippedFrames,
            outputSkippedFrames: stats.outputSkippedFrames,
          });
        }
      } else {
        log.warn('OBS process is running but WebSocket is not connected (reconnect should be in progress)');
      }
    } catch (err) {
      log.error('Health check iteration failed', { error: err.message });
    } finally {
      checking = false;
    }
  }, config.health.intervalMs);

  return () => clearInterval(timer);
}

module.exports = { startHealthMonitor };
