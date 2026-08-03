const fs = require('fs');
const path = require('path');

const BACKGROUNDS_DIR = path.join(__dirname, '..', '..', 'backgrounds');
const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

function inputNameFor(fileName) {
  const base = path.basename(fileName, path.extname(fileName)).replace(/_bg$/i, '');
  return `BG_${base}`;
}

/**
 * Lists background theme video files in C:\TikTokLiveAutomation\backgrounds.
 * Adding a new theme is just: drop a new looping vertical video in this
 * folder, named e.g. "panther_bg.mp4", then rerun `npm run setup:obs` once
 * so OBS registers it as a source - after that it's selectable everywhere
 * (dashboard, API) without further code changes.
 */
function listBackgrounds() {
  if (!fs.existsSync(BACKGROUNDS_DIR)) {
    fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
  }
  return fs
    .readdirSync(BACKGROUNDS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => {
      const themeId = path.basename(e.name, path.extname(e.name)).replace(/_bg$/i, '');
      return {
        themeId,
        fileName: e.name,
        filePath: path.join(BACKGROUNDS_DIR, e.name),
        inputName: inputNameFor(e.name),
      };
    })
    .sort((a, b) => a.themeId.localeCompare(b.themeId));
}

module.exports = { listBackgrounds, BACKGROUNDS_DIR, inputNameFor };
