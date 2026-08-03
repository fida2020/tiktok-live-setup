const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function int(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  return parsed;
}

function bool(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

const config = {
  obs: {
    host: process.env.OBS_WS_HOST || '127.0.0.1',
    port: int('OBS_WS_PORT', 4455),
    password: process.env.OBS_WS_PASSWORD || '',
    installDir: process.env.OBS_INSTALL_DIR || 'C:\\Program Files\\obs-studio',
    reconnectIntervalMs: int('OBS_RECONNECT_INTERVAL_MS', 5000),
    launchTimeoutMs: int('OBS_LAUNCH_TIMEOUT_MS', 30000),
    profileName: 'TikTokLive',
    sceneCollectionName: 'TikTokLive',
  },
  media: {
    dir: process.env.MEDIA_DIR || path.join(__dirname, '..', '..', 'media'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.join(__dirname, '..', '..', 'logs'),
  },
  health: {
    intervalMs: int('HEALTH_CHECK_INTERVAL_MS', 15000),
  },
  tikfinityBridge: {
    enabled: bool('TIKFINITY_BRIDGE_ENABLED', true),
    host: process.env.TIKFINITY_BRIDGE_HOST || '127.0.0.1',
    port: int('TIKFINITY_BRIDGE_PORT', 3939),
    token: process.env.TIKFINITY_BRIDGE_TOKEN || '',
  },
  dashboard: {
    host: process.env.DASHBOARD_HOST || '127.0.0.1',
    port: int('DASHBOARD_PORT', 4000),
  },
  state: {
    dir: path.join(__dirname, '..', '..', 'state'),
  },
};

module.exports = { config, required, int, bool };
