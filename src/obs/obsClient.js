const OBSWebSocket = require('obs-websocket-js').default;
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('obs-client');

class ObsClient {
  constructor() {
    this.obs = new OBSWebSocket();
    this.connected = false;
    this._reconnectTimer = null;
    this._manuallyClosed = false;
    this._onConnectedCallbacks = [];
    this._onDisconnectedCallbacks = [];

    this.obs.on('ConnectionClosed', (err) => {
      this.connected = false;
      log.warn('OBS WebSocket connection closed', { reason: err && err.message });
      this._onDisconnectedCallbacks.forEach((cb) => cb(err));
      if (!this._manuallyClosed) this._scheduleReconnect();
    });

    this.obs.on('ConnectionError', (err) => {
      log.error('OBS WebSocket connection error', { error: err && err.message });
    });
  }

  onConnected(cb) {
    this._onConnectedCallbacks.push(cb);
  }

  onDisconnected(cb) {
    this._onDisconnectedCallbacks.push(cb);
  }

  async connect() {
    this._manuallyClosed = false;
    const url = `ws://${config.obs.host}:${config.obs.port}`;
    try {
      await this.obs.connect(url, config.obs.password || undefined, {
        rpcVersion: 1,
      });
      this.connected = true;
      log.info('Connected to OBS WebSocket', { url });
      this._onConnectedCallbacks.forEach((cb) => cb());
      return true;
    } catch (err) {
      this.connected = false;
      log.error('Failed to connect to OBS WebSocket', { url, error: err.message });
      this._scheduleReconnect();
      return false;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      if (this._manuallyClosed) return;
      log.info('Attempting OBS WebSocket reconnect...');
      await this.connect();
    }, config.obs.reconnectIntervalMs);
  }

  async disconnect() {
    this._manuallyClosed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    try {
      await this.obs.disconnect();
    } catch (err) {
      log.warn('Error during OBS disconnect', { error: err.message });
    }
    this.connected = false;
  }

  async call(request, args = {}) {
    if (!this.connected) {
      throw new Error(`Cannot call ${request}: not connected to OBS`);
    }
    try {
      return await this.obs.call(request, args);
    } catch (err) {
      log.error(`OBS request failed: ${request}`, { args, error: err.message });
      throw err;
    }
  }

  async callSafe(request, args = {}, fallback = null) {
    try {
      return await this.call(request, args);
    } catch (err) {
      return fallback;
    }
  }
}

module.exports = { ObsClient };
