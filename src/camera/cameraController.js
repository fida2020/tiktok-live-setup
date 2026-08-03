const { childLogger } = require('../util/logger');
const { StateStore } = require('../reliability/stateStore');

const log = childLogger('camera');

const CAMERA_SOURCE = 'Camera';

/**
 * Toggles the webcam layer on/off in the MAIN scene. Default is OFF (see
 * requirement: streamer may run background-only with no camera). Like
 * BackgroundController, this only ever flips SceneItemEnabled on the one
 * Camera scene item - it never touches the BG_* layer beneath it or the
 * alert/MVP layers above it, so camera on/off can never interrupt the
 * animated background.
 */
class CameraController {
  constructor(obsClient) {
    this.obs = obsClient;
    this.state = new StateStore('camera-state.json');
  }

  async isEnabled() {
    try {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: CAMERA_SOURCE });
      const { sceneItemEnabled } = await this.obs.call('GetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId });
      return sceneItemEnabled;
    } catch (err) {
      log.warn('Could not read Camera scene item state (has setup:obs been run?)', { error: err.message });
      return false;
    }
  }

  async setEnabled(enabled) {
    let sceneItemId;
    try {
      ({ sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: 'MAIN', sourceName: CAMERA_SOURCE }));
    } catch (err) {
      log.warn('No Camera source in MAIN scene - skipping (expected for no-camera streams)', { error: err.message });
      return;
    }
    await this.obs.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: !!enabled });
    this.state.save({ enabled: !!enabled, updatedAt: new Date().toISOString() });
    log.info(`Camera turned ${enabled ? 'ON' : 'OFF'}`);
  }

  /** Re-applied after every (re)connect, same as background theme - defaults OFF on first run. */
  async reassertSavedState() {
    const saved = this.state.load({ enabled: false });
    await this.setEnabled(saved.enabled);
  }
}

module.exports = { CameraController, CAMERA_SOURCE };
