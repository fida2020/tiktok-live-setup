const { childLogger } = require('../util/logger');
const { listTracks } = require('./musicLibrary');
const { StateStore } = require('../reliability/stateStore');

const log = childLogger('music');

/**
 * Manual-only music control (no auto-advance). A track only ever plays
 * because the dashboard (or API) explicitly selected + pressed play - see
 * requirement: "Only the track I manually select should play."
 */
class MusicController {
  constructor(obsClient) {
    this.obs = obsClient;
    this.state = new StateStore('music-state.json');
    const saved = this.state.load({ trackId: null, volumePercent: 70 });
    this.currentTrackId = saved.trackId;
    this.volumePercent = saved.volumePercent;
  }

  listTracks() {
    return listTracks();
  }

  _persist() {
    this.state.save({ trackId: this.currentTrackId, volumePercent: this.volumePercent });
  }

  async selectAndPlay(trackId) {
    const track = listTracks().find((t) => t.id === trackId);
    if (!track) throw new Error(`Unknown track: ${trackId}`);

    log.info(`Playing track: ${track.fileName}`);
    await this.obs.call('SetInputSettings', {
      inputName: 'MusicPlayer',
      inputSettings: { local_file: track.filePath, is_local_file: true },
    });
    await this.obs.call('TriggerMediaInputAction', {
      inputName: 'MusicPlayer',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
    await this.setVolume(this.volumePercent);
    this.currentTrackId = trackId;
    this._persist();
  }

  async pause() {
    await this.obs.call('TriggerMediaInputAction', { inputName: 'MusicPlayer', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' });
  }

  async resume() {
    await this.obs.call('TriggerMediaInputAction', { inputName: 'MusicPlayer', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' });
  }

  async stop() {
    await this.obs.call('TriggerMediaInputAction', { inputName: 'MusicPlayer', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP' });
    this.currentTrackId = null;
    this._persist();
  }

  async setVolume(percent) {
    const clamped = Math.max(0, Math.min(100, Number(percent)));
    await this.obs.call('SetInputVolume', { inputName: 'MusicPlayer', inputVolumeMul: clamped / 100 });
    this.volumePercent = clamped;
    this._persist();
  }

  async status() {
    const media = await this.obs.callSafe('GetMediaInputStatus', { inputName: 'MusicPlayer' });
    return {
      currentTrackId: this.currentTrackId,
      volumePercent: this.volumePercent,
      mediaState: media && media.mediaState,
      mediaCursor: media && media.mediaCursor,
      mediaDuration: media && media.mediaDuration,
    };
  }
}

module.exports = { MusicController };
