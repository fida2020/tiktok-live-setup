const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('overlay-server');

const OVERLAYS_WEB_DIR = path.join(__dirname, '..', '..', 'overlays-web');
const AVATARS_DIR = path.join(__dirname, '..', '..', 'assets', 'avatars');
const OVERLAY_VIDEO_DIR = path.join(__dirname, '..', '..', 'assets', 'overlays', 'video');

// Message types that browser sources need replayed immediately on connect
// (persistent panels), rather than one-shot animations that only make sense
// at the moment they're broadcast.
const REPLAYABLE_TYPES = new Set(['leaderboard', 'goal-config', 'goal-progress']);

/**
 * Hosts the black-gold HTML/CSS/JS overlay pages (served as static files,
 * added into OBS as Browser Sources) and a WebSocket endpoint those pages
 * connect to for real-time events (join/follow/share/milestone/leaderboard/
 * goal/boxBattle). Kept on its own port, independent of the control
 * dashboard, so OBS Browser Sources never compete with dashboard traffic.
 */
function startOverlayServer() {
  const app = express();
  app.use(express.static(OVERLAYS_WEB_DIR));
  // Placeholder avatars served over HTTP (not file://) so they can be used
  // as <img src> inside these http-served overlay pages - Chromium blocks
  // http pages from loading file:// resources, which OBS's own browser_source
  // inputs don't run into since those navigate straight to a file:// URL.
  app.use('/avatars', express.static(AVATARS_DIR));
  // Background video clips (jet/club/fireworks/confetti) for the MVP,
  // Big Gift, and Battle Winner overlays - same http-not-file:// reasoning.
  app.use('/video', express.static(OVERLAY_VIDEO_DIR));

  const server = app.listen(config.overlay.port, config.overlay.host, () => {
    log.info(`Overlay web server listening on http://${config.overlay.host}:${config.overlay.port}`);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();
  const lastState = new Map();

  wss.on('connection', (ws) => {
    clients.add(ws);
    log.info(`Overlay browser source connected (${clients.size} total)`);
    for (const [type, message] of lastState) {
      ws.send(message);
    }
    ws.on('close', () => {
      clients.delete(ws);
      log.info(`Overlay browser source disconnected (${clients.size} total)`);
    });
    ws.on('error', (err) => log.warn('Overlay client socket error', { error: err.message }));
  });

  function broadcast(type, payload = {}) {
    const message = JSON.stringify({ type, ...payload, ts: Date.now() });
    if (REPLAYABLE_TYPES.has(type)) {
      lastState.set(type, message);
    }
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    }
  }

  return { server, broadcast };
}

module.exports = { startOverlayServer };
