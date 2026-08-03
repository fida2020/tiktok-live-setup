const { execFile } = require('child_process');
const { childLogger } = require('../util/logger');

const log = childLogger('duration-probe');

const cache = new Map();

function probeDurationSeconds(filePath) {
  if (cache.has(filePath)) return Promise.resolve(cache.get(filePath));

  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) {
          log.warn(`ffprobe failed for ${filePath}, will rely on playback-ended event only`, { error: err.message });
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const duration = parseFloat(parsed.format && parsed.format.duration);
          if (!Number.isFinite(duration) || duration <= 0) {
            resolve(null);
            return;
          }
          cache.set(filePath, duration);
          resolve(duration);
        } catch (parseErr) {
          log.warn(`Could not parse ffprobe output for ${filePath}`, { error: parseErr.message });
          resolve(null);
        }
      },
    );
  });
}

module.exports = { probeDurationSeconds };
