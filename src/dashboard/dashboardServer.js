const fs = require('fs');
const path = require('path');
const express = require('express');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');
const { showGiftAlert, showWelcome, showMVP } = require('../overlays/overlayController');
const { EVENT_TYPES } = require('../tikfinity/eventBridge');
const simulator = require('../testmode/simulator');

const log = childLogger('dashboard');

const SCENES = ['STARTING', 'MAIN', 'BRB', 'ENDING'];
const LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'controller.log');

function startDashboardServer({ obsClient, sceneController, backgroundController, musicController, cameraController, overlayQueue, eventBridge, obsProcessManager }) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));

  app.get('/api/status', async (req, res) => {
    const obsRunning = await obsProcessManager.isRunning();
    let obsStats = null;
    let currentScene = null;
    if (obsClient.connected) {
      obsStats = await obsClient.callSafe('GetStats');
      const scene = await obsClient.callSafe('GetCurrentProgramScene');
      currentScene = scene && scene.currentProgramSceneName;
    }
    const cameraEnabled = obsClient.connected ? await cameraController.isEnabled() : null;
    res.json({
      obs: {
        processRunning: obsRunning,
        websocketConnected: obsClient.connected,
        stats: obsStats,
        currentScene,
      },
      tikfinityBridge: {
        enabled: config.tikfinityBridge.enabled,
        port: config.tikfinityBridge.port,
        eventsReceived: eventBridge.eventCount,
        lastEventAt: eventBridge.lastEventAt,
      },
      camera: { enabled: cameraEnabled },
      overlayQueueLength: overlayQueue.length,
    });
  });

  app.get('/api/scenes', (req, res) => res.json({ scenes: SCENES }));

  app.post('/api/scene', async (req, res) => {
    try {
      await sceneController.goTo(req.body.sceneName);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/backgrounds', async (req, res) => {
    const list = backgroundController.list();
    const current = await backgroundController.current();
    res.json({ backgrounds: list.map((b) => b.themeId), current });
  });

  app.post('/api/backgrounds/select', async (req, res) => {
    try {
      await backgroundController.select(req.body.themeId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/music/tracks', (req, res) => {
    res.json({ tracks: musicController.listTracks().map((t) => t.id) });
  });

  app.get('/api/music/status', async (req, res) => {
    res.json(await musicController.status());
  });

  app.post('/api/music/play', async (req, res) => {
    try {
      await musicController.selectAndPlay(req.body.trackId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/camera/status', async (req, res) => {
    res.json({ enabled: await cameraController.isEnabled() });
  });
  app.post('/api/camera/toggle', async (req, res) => {
    try {
      await cameraController.setEnabled(!!req.body.enabled);
      res.json({ ok: true, enabled: !!req.body.enabled });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/logs', (req, res) => {
    const lines = Math.min(Number(req.query.lines) || 200, 2000);
    try {
      const raw = fs.readFileSync(LOG_FILE, 'utf8');
      const all = raw.split('\n').filter(Boolean);
      res.json({ lines: all.slice(-lines) });
    } catch (err) {
      res.json({ lines: [], error: err.message });
    }
  });

  app.post('/api/music/pause', async (req, res) => { await musicController.pause(); res.json({ ok: true }); });
  app.post('/api/music/resume', async (req, res) => { await musicController.resume(); res.json({ ok: true }); });
  app.post('/api/music/stop', async (req, res) => { await musicController.stop(); res.json({ ok: true }); });
  app.post('/api/music/volume', async (req, res) => {
    try {
      await musicController.setVolume(req.body.percent);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Direct manual triggers - always show, regardless of MVP/level thresholds.
  // This is for visually testing/QA'ing the templates themselves.
  app.post('/api/trigger/gift', (req, res) => {
    overlayQueue.enqueue({ type: 'gift', priority: 'normal', run: () => showGiftAlert(obsClient, { ...simulator.randomFakeUser(), ...req.body }) });
    res.json({ ok: true, queued: true });
  });
  app.post('/api/trigger/mvp', (req, res) => {
    overlayQueue.enqueue({ type: 'mvp', priority: 'high', run: () => showMVP(obsClient, { ...simulator.mvpGiftPayload(), ...req.body }) });
    res.json({ ok: true, queued: true });
  });
  app.post('/api/trigger/welcome', (req, res) => {
    overlayQueue.enqueue({ type: 'welcome', priority: 'normal', run: () => showWelcome(obsClient, { ...simulator.vipJoinPayload(), ...req.body }) });
    res.json({ ok: true, queued: true });
  });

  // TEST MODE - publishes through the real EventBridge -> dispatcher path,
  // so it also exercises the MVP-value / welcome-level qualification logic.
  app.post('/api/testmode/normal-gift', (req, res) => {
    eventBridge.publish(EVENT_TYPES.GIFT, simulator.normalGiftPayload());
    res.json({ ok: true });
  });
  app.post('/api/testmode/mvp-gift', (req, res) => {
    eventBridge.publish(EVENT_TYPES.GIFT, simulator.mvpGiftPayload());
    res.json({ ok: true });
  });
  app.post('/api/testmode/vip-join', (req, res) => {
    eventBridge.publish(EVENT_TYPES.JOIN, simulator.vipJoinPayload());
    res.json({ ok: true });
  });
  app.post('/api/testmode/non-qualifying-join', (req, res) => {
    eventBridge.publish(EVENT_TYPES.JOIN, simulator.nonQualifyingJoinPayload());
    res.json({ ok: true });
  });

  const server = app.listen(config.dashboard.port, config.dashboard.host, () => {
    log.info(`Control dashboard listening on http://${config.dashboard.host}:${config.dashboard.port}`);
  });

  return server;
}

module.exports = { startDashboardServer };
