const { ObsClient } = require('../obs/obsClient');

(async () => {
  const client = new ObsClient();
  await client.connect();

  const before = await client.call('GetMediaInputStatus', { inputName: 'BG_tiger' });
  console.log('BG cursor before gift trigger:', before.mediaCursor);

  // Fire a gift trigger via the same path the dashboard uses.
  const { OverlayQueue } = require('../overlays/overlayQueue');
  const { showGiftAlert } = require('../overlays/overlayController');
  const queue = new OverlayQueue();
  queue.enqueue({ type: 'gift', priority: 'normal', run: () => showGiftAlert(client, { user: 'persist_test', giftName: 'Rose' }) });

  await new Promise((r) => setTimeout(r, 1200));
  const during = await client.call('GetMediaInputStatus', { inputName: 'BG_tiger' });
  console.log('BG cursor ~1.2s into gift alert:', during.mediaCursor);

  await new Promise((r) => setTimeout(r, 4500));
  const after = await client.call('GetMediaInputStatus', { inputName: 'BG_tiger' });
  console.log('BG cursor after gift alert ended:', after.mediaCursor);

  // The background loops every 12s, so a wrap-around is expected and is
  // NOT evidence of a restart. Check the math instead: if playback never
  // stopped/restarted, cursor(after) == (cursor(before) + elapsedMs) % loopMs.
  const loopMs = before.mediaDuration;
  const elapsedMs = 1200 + 4500;
  const expected = (before.mediaCursor + elapsedMs) % loopMs;
  const withinTolerance = Math.abs(expected - after.mediaCursor) < 400; // scheduling jitter
  console.log(`Expected cursor (continuous playback, accounting for loop wrap): ~${expected}, actual: ${after.mediaCursor}`);
  console.log(withinTolerance ? 'PASS: background played continuously through its own natural loop, never restarted' : 'FAIL: cursor does not match continuous-playback math - background may have restarted');

  await client.disconnect();
  process.exit(0);
})();
