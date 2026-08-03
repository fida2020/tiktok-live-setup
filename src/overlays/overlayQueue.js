const { childLogger } = require('../util/logger');

const log = childLogger('overlay-queue');

/**
 * Serializes overlay jobs (gift alert / welcome / MVP) so simultaneous
 * TikFinity events can never corrupt each other's on-screen animation by
 * overlapping. MVP jobs jump the queue ahead of already-queued normal jobs
 * (but never interrupt a job already mid-animation, to avoid leaving OBS
 * sources in a half-shown state) - see requirement: "priority handling so
 * important MVP alerts can be handled correctly".
 */
class OverlayQueue {
  constructor() {
    this._queue = [];
    this._processing = false;
  }

  enqueue(job) {
    const entry = { ...job, enqueuedAt: Date.now() };
    if (job.priority === 'high') {
      const firstNormalIndex = this._queue.findIndex((j) => j.priority !== 'high');
      if (firstNormalIndex === -1) this._queue.push(entry);
      else this._queue.splice(firstNormalIndex, 0, entry);
    } else {
      this._queue.push(entry);
    }
    log.info(`Enqueued overlay job: ${job.type}`, { queueLength: this._queue.length, priority: job.priority || 'normal' });
    this._processNext();
  }

  get length() {
    return this._queue.length + (this._processing ? 1 : 0);
  }

  async _processNext() {
    if (this._processing) return;
    const job = this._queue.shift();
    if (!job) return;

    this._processing = true;
    try {
      await job.run();
    } catch (err) {
      log.error(`Overlay job failed: ${job.type}`, { error: err.message, stack: err.stack });
    } finally {
      this._processing = false;
    }
    if (this._queue.length > 0) {
      setImmediate(() => this._processNext());
    }
  }
}

module.exports = { OverlayQueue };
