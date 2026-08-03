const fs = require('fs');
const path = require('path');
const { config } = require('../util/config');
const { childLogger } = require('../util/logger');

const log = childLogger('media-library');

const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi', '.flv']);

/**
 * Watches C:\TikTokLiveAutomation\media (non-recursive) for playable video
 * files. New files just need to be dropped into the folder - no code or
 * config change required for them to join the rotation.
 */
class MediaLibrary {
  constructor(dir = config.media.dir) {
    this.dir = dir;
    this.files = [];
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    this.rescan();
  }

  rescan() {
    let entries = [];
    try {
      entries = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch (err) {
      log.error(`Could not read media directory ${this.dir}`, { error: err.message });
      this.files = [];
      return this.files;
    }

    const found = entries
      .filter((e) => e.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(this.dir, e.name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' }));

    const changed = JSON.stringify(found) !== JSON.stringify(this.files);
    this.files = found;
    if (changed) {
      log.info(`Media library rescanned: ${found.length} file(s) found`, { files: found.map((f) => path.basename(f)) });
    }
    return this.files;
  }

  isEmpty() {
    return this.files.length === 0;
  }

  count() {
    return this.files.length;
  }

  fileAt(index) {
    if (this.files.length === 0) return null;
    const normalized = ((index % this.files.length) + this.files.length) % this.files.length;
    return this.files[normalized];
  }
}

module.exports = { MediaLibrary, SUPPORTED_EXTENSIONS };
