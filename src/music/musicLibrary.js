const fs = require('fs');
const path = require('path');

const MUSIC_DIR = path.join(__dirname, '..', '..', 'music');
const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac']);

/**
 * Lists tracks in C:\TikTokLiveAutomation\music. Drop a new file in and it
 * shows up in the dashboard's track list on next page load/API call - no
 * restart needed, since this scans on every call.
 */
function listTracks() {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }
  return fs
    .readdirSync(MUSIC_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({ id: path.basename(e.name, path.extname(e.name)), fileName: e.name, filePath: path.join(MUSIC_DIR, e.name) }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

module.exports = { listTracks, MUSIC_DIR };
