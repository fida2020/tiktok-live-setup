const fs = require('fs');
const path = require('path');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('state-store');

/**
 * Minimal atomic JSON key-value store used for crash/restart recovery
 * (playlist position, controller mode, etc). Writes to a temp file and
 * renames over the target so a crash mid-write can never corrupt state.
 */
class StateStore {
  constructor(fileName) {
    this.filePath = path.join(config.state.dir, fileName);
    if (!fs.existsSync(config.state.dir)) {
      fs.mkdirSync(config.state.dir, { recursive: true });
    }
  }

  load(fallback = {}) {
    try {
      if (!fs.existsSync(this.filePath)) return { ...fallback };
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return { ...fallback, ...JSON.parse(raw) };
    } catch (err) {
      log.warn(`Failed to load state file ${this.filePath}, using fallback`, { error: err.message });
      return { ...fallback };
    }
  }

  save(data) {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      log.error(`Failed to persist state to ${this.filePath}`, { error: err.message });
    }
  }
}

module.exports = { StateStore };
