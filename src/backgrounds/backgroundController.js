const { childLogger } = require('../util/logger');
const { listBackgrounds } = require('./backgroundLibrary');
const { StateStore } = require('../reliability/stateStore');

const log = childLogger('background');

/**
 * Switches which BG_* source is visible in the MAIN scene. Only one theme
 * is ever enabled at a time; switching never touches the overlay layers
 * above it (gift/welcome/MVP), which is what keeps the background running
 * uninterrupted underneath them (requirement: background "never restart[s]
 * when gift/welcome animations play").
 */
class BackgroundController {
  constructor(obsClient) {
    this.obs = obsClient;
    this.state = new StateStore('background-state.json');
  }

  list() {
    return listBackgrounds();
  }

  async current() {
    const backgrounds = this.list();
    for (const bg of backgrounds) {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: bg.inputName });
      const { sceneItemEnabled } = await this.obs.call('GetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId });
      if (sceneItemEnabled) return bg.themeId;
    }
    return null;
  }

  async select(themeId) {
    const backgrounds = this.list();
    const target = backgrounds.find((b) => b.themeId === themeId);
    if (!target) throw new Error(`Unknown background theme: ${themeId}`);

    log.info(`Switching background to: ${themeId}`);
    for (const bg of backgrounds) {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: bg.inputName });
      await this.obs.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: bg.themeId === themeId });
    }
    this.state.save({ themeId, updatedAt: new Date().toISOString() });
  }
}

module.exports = { BackgroundController };
