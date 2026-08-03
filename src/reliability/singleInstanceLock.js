const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('instance-lock');

const LOCK_TARGET = path.join(config.state.dir, 'controller.lockfile');

async function acquire() {
  if (!fs.existsSync(config.state.dir)) fs.mkdirSync(config.state.dir, { recursive: true });
  if (!fs.existsSync(LOCK_TARGET)) fs.writeFileSync(LOCK_TARGET, '');

  try {
    const release = await lockfile.lock(LOCK_TARGET, { stale: 60000, retries: 0 });
    log.info('Acquired single-instance lock');
    return release;
  } catch (err) {
    log.error('Another controller instance is already running (lock held). Exiting.', { error: err.message });
    return null;
  }
}

module.exports = { acquire, LOCK_TARGET };
