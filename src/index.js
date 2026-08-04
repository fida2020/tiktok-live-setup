const { config } = require('./util/config');
const { logger, childLogger } = require('./util/logger');
const singleInstanceLock = require('./reliability/singleInstanceLock');
const obsProcessManager = require('./reliability/obsProcessManager');
const { startHealthMonitor } = require('./reliability/healthMonitor');
const { ObsClient } = require('./obs/obsClient');
const { SceneController } = require('./obs/sceneController');
const { EventBridge } = require('./tikfinity/eventBridge');
const { startWebhookAdapter } = require('./tikfinity/adapters/webhookAdapter');
const { attachActionMapper } = require('./tikfinity/actionMapper');
const { attachOverlayDispatcher } = require('./overlays/overlayDispatcher');
const { startOverlayServer } = require('./overlays/overlayServer');
const goalState = require('./overlays/goalState');
const { BackgroundController } = require('./backgrounds/backgroundController');
const { MusicController } = require('./music/musicController');
const { CameraController } = require('./camera/cameraController');
const { startDashboardServer } = require('./dashboard/dashboardServer');

const log = childLogger('controller');

async function connectWithRetry(obsClient) {
  const deadline = Date.now() + config.obs.launchTimeoutMs;
  while (Date.now() < deadline) {
    const ok = await obsClient.connect();
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function main() {
  log.info('TikTok LIVE automation controller starting', { pid: process.pid });

  const releaseLock = await singleInstanceLock.acquire();
  if (!releaseLock) {
    process.exit(1);
  }

  const shutdownHooks = [];
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}, shutting down controller (OBS keeps running)`);
    for (const hook of shutdownHooks.reverse()) {
      try {
        await hook();
      } catch (err) {
        log.error('Error during shutdown hook', { error: err.message });
      }
    }
    await releaseLock();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const obsReady = await obsProcessManager.ensureRunning();
  if (!obsReady) {
    log.error('Could not start OBS. Aborting.');
    await releaseLock();
    process.exit(1);
  }

  const obsClient = new ObsClient();
  shutdownHooks.push(() => obsClient.disconnect());

  const scenes = new SceneController(obsClient);
  const backgroundController = new BackgroundController(obsClient);
  const musicController = new MusicController(obsClient);
  const cameraController = new CameraController(obsClient);

  // Re-applied on every successful (re)connect - initial startup AND any
  // reconnect after the health monitor relaunches a crashed OBS - so a
  // crash-recovery can never silently leave the stream on the wrong scene.
  obsClient.onConnected(async () => {
    try {
      await scenes.goTo('MAIN');
      const savedBg = backgroundController.state.load({ themeId: null });
      if (savedBg.themeId) await backgroundController.select(savedBg.themeId);
      await cameraController.reassertSavedState();
    } catch (err) {
      log.error('Failed to re-assert scene/background/camera state after (re)connect', { error: err.message });
    }
  });

  const connected = await connectWithRetry(obsClient);
  if (!connected) {
    log.error('Could not connect to OBS WebSocket within timeout. Aborting.');
    await releaseLock();
    process.exit(1);
  }

  const stopHealthMonitor = startHealthMonitor(obsClient, {
    onObsRelaunched: async () => {
      log.warn('OBS was relaunched by the health monitor after disappearing - scene/background will be re-asserted once the WebSocket reconnects');
    },
  });
  shutdownHooks.push(async () => stopHealthMonitor());

  const overlayServer = startOverlayServer();
  shutdownHooks.push(() => new Promise((resolve) => overlayServer.server.close(resolve)));
  // Prime the replay cache so a browser source that connects before any
  // events fire still shows the goal bar's target/label immediately.
  overlayServer.broadcast('goal-config', goalState.getGoal());

  const eventBridge = new EventBridge();
  attachActionMapper(eventBridge, obsClient);
  const overlayQueue = attachOverlayDispatcher(eventBridge, obsClient, overlayServer);

  const webhookServer = startWebhookAdapter(eventBridge);
  if (webhookServer) {
    shutdownHooks.push(() => new Promise((resolve) => webhookServer.close(resolve)));
  }

  const dashboardServer = startDashboardServer({
    obsClient,
    sceneController: scenes,
    backgroundController,
    musicController,
    cameraController,
    overlayQueue,
    eventBridge,
    obsProcessManager,
    overlayServer,
  });
  shutdownHooks.push(() => new Promise((resolve) => dashboardServer.close(resolve)));

  if (!backgroundController.list().length) {
    log.warn('No background videos found in backgrounds/ - add one and run "npm run setup:obs" to register it');
  }

  log.info('Controller is up and running.', {
    dashboard: `http://${config.dashboard.host}:${config.dashboard.port}`,
  });
}

main().catch((err) => {
  logger.error('Fatal error during controller startup', { error: err.message, stack: err.stack });
  process.exit(1);
});
