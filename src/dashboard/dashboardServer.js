const fs = require('fs');
const path = require('path');
const express = require('express');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');
const { showGiftAlert, showWelcome, getVipConfig } = require('../overlays/overlayController');
const { EVENT_TYPES } = require('../tikfinity/eventBridge');
const simulator = require('../testmode/simulator');
const goalState = require('../overlays/goalState');
const { addVip } = require('../overlays/vipList');

const log = childLogger('dashboard');

const SCENES = ['STARTING', 'MAIN', 'BRB', 'ENDING'];
const LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'controller.log');

function startDashboardServer({ obsClient, sceneController, backgroundController, musicController, cameraController, overlayQueue, eventBridge, obsProcessManager, overlayServer }) {
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
      overlayServer: { host: config.overlay.host, port: config.overlay.port },
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
  app.post('/api/trigger/biggift', (req, res) => {
    const payload = { ...simulator.bigGiftPayload(), ...req.body };
    overlayServer.broadcast('biggift', { ...payload, durationMs: getVipConfig().bigGift.durationMs });
    res.json({ ok: true });
  });
  app.post('/api/trigger/mvp', (req, res) => {
    const payload = { ...simulator.mvpGiftPayload(), ...req.body };
    overlayServer.broadcast('mvp', { ...payload, durationMs: getVipConfig().mvp.durationMs });
    res.json({ ok: true });
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
  app.post('/api/testmode/big-gift', (req, res) => {
    eventBridge.publish(EVENT_TYPES.GIFT, simulator.bigGiftPayload());
    res.json({ ok: true });
  });
  app.post('/api/testmode/mvp-gift', (req, res) => {
    eventBridge.publish(EVENT_TYPES.GIFT, simulator.mvpGiftPayload());
    res.json({ ok: true });
  });
  app.post('/api/testmode/battle-winner', (req, res) => {
    eventBridge.publish(EVENT_TYPES.BOX_BATTLE, simulator.battleWinnerPayload());
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
  app.post('/api/testmode/follow', (req, res) => {
    eventBridge.publish(EVENT_TYPES.FOLLOW, simulator.randomFakeUser());
    res.json({ ok: true });
  });
  app.post('/api/testmode/share', (req, res) => {
    eventBridge.publish(EVENT_TYPES.SHARE, simulator.randomFakeUser());
    res.json({ ok: true });
  });
  app.post('/api/testmode/milestone', (req, res) => {
    eventBridge.publish(EVENT_TYPES.MILESTONE, { kind: req.body.kind || 'like', value: req.body.value || 1000 });
    res.json({ ok: true });
  });
  app.post('/api/testmode/leaderboard', (req, res) => {
    eventBridge.publish(EVENT_TYPES.LEADERBOARD, {
      top: req.body.top || [
        { user: 'fake_user_alex', total: 3200 },
        { user: 'fake_user_jordan', total: 1800 },
        { user: 'fake_user_sam', total: 900 },
      ],
    });
    res.json({ ok: true });
  });

  // Box Battle results aren't reliably exposed by any TikTok LIVE event
  // source today - trigger it yourself the moment you see the result on
  // your own screen. Real (not test-only): this is the actual production
  // path for this overlay.
  app.post('/api/trigger/boxbattle', (req, res) => {
    const { winner, avatarUrl, winnerScore, loserScore } = req.body || {};
    if (!winner) {
      res.status(400).json({ error: 'winner is required' });
      return;
    }
    eventBridge.publish(EVENT_TYPES.BOX_BATTLE, { winner, avatarUrl, winnerScore, loserScore });
    addVip(winner);
    res.json({ ok: true });
  });

  // Battle Final Countdown - two modes:
  //  - "allatonce": every guest counted together, highest points wins outright.
  //  - "elimination": lowest-points guest is dropped each round. With exactly
  //    2 guests left, dropping one IS the final result, so the survivor gets
  //    the full winner celebration too. With >2, only the drop plays - the
  //    dashboard removes that guest and starts the next round itself.
  app.post('/api/trigger/battle-countdown', (req, res) => {
    const { mode, guests, label } = req.body || {};
    if (!Array.isArray(guests) || guests.length < 2) {
      res.status(400).json({ error: 'At least 2 guests are required' });
      return;
    }
    const normalized = guests.map((g) => ({
      name: String(g.name || '').trim(),
      avatarUrl: g.avatarUrl,
      points: Number(g.points) || 0,
    })).filter((g) => g.name);
    if (normalized.length < 2) {
      res.status(400).json({ error: 'At least 2 named guests are required' });
      return;
    }

    // Ticks slower than real-time 1/sec (was too fast) - each number holds
    // for COUNTDOWN_TICK_MS instead of 1000ms. The server timer below must
    // add up to the exact same total or the drop/winner reveal fires while
    // the overlay is still mid-count.
    const COUNTDOWN_SECONDS = 10;
    const COUNTDOWN_TICK_MS = 3000;
    const durationMs = (COUNTDOWN_SECONDS + 1) * COUNTDOWN_TICK_MS;
    overlayServer.broadcast('battle-countdown', {
      label: label || (mode === 'elimination' ? 'Elimination Round' : 'Final Countdown'),
      guests: normalized,
      seconds: COUNTDOWN_SECONDS,
      tickMs: COUNTDOWN_TICK_MS,
    });

    setTimeout(() => {
      const sorted = [...normalized].sort((a, b) => b.points - a.points);
      const winner = sorted[0];
      const loser = sorted[sorted.length - 1];

      const announceWinner = () => {
        eventBridge.publish(EVENT_TYPES.BOX_BATTLE, {
          winner: winner.name, avatarUrl: winner.avatarUrl, winnerScore: winner.points, loserScore: loser.points,
        });
        addVip(winner.name);
      };

      if (mode === 'elimination') {
        overlayServer.broadcast('battle-drop', { name: loser.name, avatarUrl: loser.avatarUrl, points: loser.points, durationMs: 4000 });
        if (normalized.length === 2) {
          setTimeout(announceWinner, 3500);
        }
      } else {
        announceWinner();
      }
    }, durationMs);

    res.json({ ok: true });
  });

  app.get('/api/goal', (req, res) => {
    res.json(goalState.getGoal());
  });
  app.post('/api/goal', (req, res) => {
    try {
      const goal = goalState.setGoal(req.body || {});
      overlayServer.broadcast('goal-config', goal);
      res.json({ ok: true, goal });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const server = app.listen(config.dashboard.port, config.dashboard.host, () => {
    log.info(`Control dashboard listening on http://${config.dashboard.host}:${config.dashboard.port}`);
  });

  return server;
}

module.exports = { startDashboardServer };
