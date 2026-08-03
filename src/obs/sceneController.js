const { childLogger } = require('../util/logger');

const log = childLogger('scene-controller');

const SCENES = ['STARTING', 'MAIN', 'BRB', 'ENDING'];

class SceneController {
  constructor(obsClient) {
    this.obs = obsClient;
  }

  async goTo(sceneName) {
    if (!SCENES.includes(sceneName)) {
      throw new Error(`Unknown scene: ${sceneName}`);
    }
    log.info(`Switching to scene: ${sceneName}`);
    await this.obs.call('SetCurrentProgramScene', { sceneName });
  }

  async current() {
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    return currentProgramSceneName;
  }
}

module.exports = { SceneController, SCENES };
