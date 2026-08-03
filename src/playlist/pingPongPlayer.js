const path = require('path');
const { childLogger } = require('../util/logger');
const { probeDurationSeconds } = require('./durationProbe');
const { StateStore } = require('../reliability/stateStore');

const log = childLogger('playlist');

const SCENE_NAME = 'MAIN';
const SLOT_SOURCE = { A: 'PlaylistA', B: 'PlaylistB' };
const ON_CANVAS_X = 0;
const OFF_CANVAS_X = 6000; // fully outside the 1080x1920 canvas -> invisible but still active/decoding
const HEAD_START_MS = 1500; // give the next clip a moment to stabilize before it's cut to visible
const PRELOAD_LEAD_S = 2; // start preloading this many seconds before the active clip ends
const MIN_LEAD_MS = 300;
const FALLBACK_ADVANCE_MS = 8000; // if we have no duration at all, poll this often as a last resort
const RESCAN_EVERY_N_ADVANCES = 1; // pick up newly-dropped media files every loop step

const BASE_TRANSFORM = {
  boundsType: 'OBS_BOUNDS_SCALE_INNER',
  boundsAlignment: 0,
  boundsWidth: 1080,
  boundsHeight: 1920,
  alignment: 5,
  positionY: 0,
};

/**
 * Gapless local-video playlist for the MAIN scene.
 *
 * Two ffmpeg_source inputs (PlaylistA/PlaylistB) are BOTH kept enabled
 * (visible=true) at all times - one on-canvas, one parked off-canvas at
 * x=6000. A source only decodes while OBS considers it "active", which
 * requires it to remain enabled/visible somewhere; hiding it via the
 * eye-icon (SetSceneItemEnabled=false) would stop decoding and reintroduce
 * the exact startup latency we're trying to avoid. Parking it off-canvas
 * keeps it decoding (and thus pre-buffered) while staying invisible in the
 * composited output. Advancing to the next file is then just an instant
 * position swap - no decoder restart in the visible path, so no black frame.
 */
class PingPongPlayer {
  constructor(obsClient, mediaLibrary) {
    this.obs = obsClient;
    this.library = mediaLibrary;
    this.state = new StateStore('playlist-state.json');

    this.activeSlot = 'A';
    this.currentIndex = 0;
    this.running = false;
    this._advanceTimer = null;
    this._safetyTimer = null;
    this._advanceCount = 0;
    this._transitioning = false;
    this._activeSince = 0;
    this._onPlaybackEnded = this._onPlaybackEnded.bind(this);
  }

  async start() {
    if (this.library.isEmpty()) {
      log.warn('Media library is empty - drop video files into the media folder. Playlist idle until files appear.');
      this._scheduleEmptyRetry();
      return;
    }

    const saved = this.state.load({ index: 0 });
    this.currentIndex = Number.isInteger(saved.index) ? saved.index : 0;
    this.activeSlot = 'A';

    this.obs.obs.on('MediaInputPlaybackEnded', this._onPlaybackEnded);

    await this._positionSlot('A', true);
    await this._positionSlot('B', false);

    this.running = true;
    const loaded = await this._loadWithSkip(this.activeSlot, this.currentIndex);
    if (!loaded) {
      log.error('No playable media file found after skipping the whole library - stopping playlist');
      this.running = false;
      return;
    }
    this.currentIndex = loaded.index;
    this._activeSince = Date.now();
    await this._armAdvanceTimer();
  }

  /**
   * Tries to load `startIndex` into `slot`; on failure (corrupt/unreadable
   * file) logs it and tries the next index, up to one full lap of the
   * library, so a single bad file can never take the whole controller down.
   */
  async _loadWithSkip(slot, startIndex) {
    const total = this.library.count();
    for (let attempt = 0; attempt < total; attempt += 1) {
      const index = (startIndex + attempt) % total;
      const filePath = this.library.fileAt(index);
      try {
        await this._playIntoSlot(slot, filePath);
        return { index };
      } catch (err) {
        log.error(`Skipping unplayable file: ${filePath}`, { error: err.message });
      }
    }
    return null;
  }

  async stop() {
    this.running = false;
    this._clearTimers();
    this.obs.obs.off('MediaInputPlaybackEnded', this._onPlaybackEnded);
  }

  _scheduleEmptyRetry() {
    this._advanceTimer = setTimeout(async () => {
      this.library.rescan();
      if (!this.library.isEmpty()) {
        log.info('Media files detected, starting playlist');
        await this.start();
      } else {
        this._scheduleEmptyRetry();
      }
    }, 10000);
  }

  _clearTimers() {
    if (this._advanceTimer) clearTimeout(this._advanceTimer);
    if (this._safetyTimer) clearTimeout(this._safetyTimer);
    this._advanceTimer = null;
    this._safetyTimer = null;
  }

  _otherSlot(slot) {
    return slot === 'A' ? 'B' : 'A';
  }

  async _positionSlot(slot, onCanvas) {
    const sourceName = SLOT_SOURCE[slot];
    const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName: SCENE_NAME, sourceName });
    // Both slots must stay "enabled" (visible) at all times - only position
    // determines what's on-screen. A disabled scene item deactivates its
    // source entirely (stops decoding), which silently breaks the off-canvas
    // pre-buffering trick, so we assert this on every position change rather
    // than trusting it was set correctly once at setup time.
    await this.obs.call('SetSceneItemEnabled', { sceneName: SCENE_NAME, sceneItemId, sceneItemEnabled: true });
    await this.obs.call('SetSceneItemTransform', {
      sceneName: SCENE_NAME,
      sceneItemId,
      sceneItemTransform: {
        ...BASE_TRANSFORM,
        positionX: onCanvas ? ON_CANVAS_X : OFF_CANVAS_X,
      },
    });
  }

  async _playIntoSlot(slot, filePath) {
    const sourceName = SLOT_SOURCE[slot];
    log.info(`Loading "${path.basename(filePath)}" into ${sourceName}`);
    await this.obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: { local_file: filePath, is_local_file: true },
      overlay: true,
    });
    await this.obs.call('TriggerMediaInputAction', {
      inputName: sourceName,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
  }

  async _armAdvanceTimer() {
    this._clearTimers();
    const filePath = this.library.fileAt(this.currentIndex);
    const duration = await probeDurationSeconds(filePath);

    if (duration) {
      // Never let (lead time + head start) exceed the clip's own length -
      // for very short clips, shrink the head start instead of overrunning.
      this._headStartMs = Math.max(150, Math.min(HEAD_START_MS, duration * 1000 * 0.25));
      const leadMs = Math.max(MIN_LEAD_MS, duration * 1000 - PRELOAD_LEAD_S * 1000);
      this._advanceTimer = setTimeout(() => this._preloadAndCut().catch((err) => log.error('Preload/cut failed', { error: err.message })), leadMs);
      // Safety net in case the timer-based cut silently fails for some reason.
      this._safetyTimer = setTimeout(
        () => this._forceAdvanceIfStuck().catch((err) => log.error('Safety advance failed', { error: err.message })),
        (duration + 5) * 1000,
      );
    } else {
      // No duration available (corrupt/odd file) - fall back to periodic
      // polling; MediaInputPlaybackEnded below is the real trigger here.
      this._advanceTimer = setTimeout(() => this._armAdvanceTimer(), FALLBACK_ADVANCE_MS);
    }
  }

  async _preloadAndCut() {
    if (!this.running) return;
    if (this.library.count() === 0) return;
    if (this._transitioning) {
      log.debug('Transition already in progress, ignoring duplicate trigger');
      return;
    }
    this._transitioning = true;

    try {
      const hiddenSlot = this._otherSlot(this.activeSlot);
      const loaded = await this._loadWithSkip(hiddenSlot, this._nextIndex());
      if (!loaded) {
        log.error('No playable media file found after skipping the whole library - pausing advance');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, this._headStartMs || HEAD_START_MS));
      if (!this.running) return;

      await this._cutTo(hiddenSlot, loaded.index);
    } finally {
      this._transitioning = false;
    }
  }

  async _cutTo(newActiveSlot, newIndex) {
    const oldSlot = this.activeSlot;
    await this._positionSlot(newActiveSlot, true);
    await this._positionSlot(oldSlot, false);

    this.activeSlot = newActiveSlot;
    this.currentIndex = newIndex;
    this._activeSince = Date.now();
    this.state.save({ index: this.currentIndex, updatedAt: new Date().toISOString() });

    this._advanceCount += 1;
    if (this._advanceCount % RESCAN_EVERY_N_ADVANCES === 0) {
      this.library.rescan();
    }

    log.info(`Now playing index ${this.currentIndex}: ${path.basename(this.library.fileAt(this.currentIndex))}`);
    await this._armAdvanceTimer();
  }

  _nextIndex() {
    if (this.library.count() === 0) return this.currentIndex;
    return (this.currentIndex + 1) % this.library.count();
  }

  async _forceAdvanceIfStuck() {
    if (!this.running) return;
    log.warn('Advance safety timer fired - timer-based cut did not happen in time, forcing advance now');
    await this._preloadAndCut();
  }

  async _onPlaybackEnded(event) {
    if (!this.running) return;
    if (this._transitioning) return; // a real cut is already in flight; this is a stale/duplicate event
    const activeSourceName = SLOT_SOURCE[this.activeSlot];
    if (event.inputName !== activeSourceName) return;

    // OBS-websocket can deliver a "playback ended" event for a source's
    // PREVIOUS session slightly late (it's the same input name every cycle
    // in the ping-pong scheme). Anything that arrives implausibly soon after
    // we cut this source in is almost certainly one of those stale events,
    // not a genuine early end - ignore it rather than yanking the playlist
    // forward mid-clip.
    const elapsedSinceCutIn = Date.now() - this._activeSince;
    if (elapsedSinceCutIn < 1000) {
      log.debug(`Ignoring MediaInputPlaybackEnded for ${activeSourceName} (only ${elapsedSinceCutIn}ms since cut-in, likely stale)`);
      return;
    }

    // The active clip ended before our lead-time timer fired (e.g. a very
    // short file). Treat this as the authoritative "must advance now" signal.
    log.warn(`${activeSourceName} reported playback ended before scheduled cut - advancing immediately`);
    await this._preloadAndCut();
  }
}

module.exports = { PingPongPlayer };
