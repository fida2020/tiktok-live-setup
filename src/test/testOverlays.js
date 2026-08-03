const { ObsClient } = require('../obs/obsClient');
const { showGiftAlert, showWelcome, showMVP } = require('../overlays/overlayController');

(async () => {
  const client = new ObsClient();
  await client.connect();
  await client.call('SetCurrentProgramScene', { sceneName: 'MAIN' });

  console.log('--- gift alert ---');
  await showGiftAlert(client, { user: 'test_gifter', giftName: 'Rose', diamondCount: 1 });
  console.log('gift alert done');

  console.log('--- welcome ---');
  await showWelcome(client, { user: 'vip_viewer', level: 42 });
  console.log('welcome done');

  console.log('--- mvp ---');
  await showMVP(client, { user: 'big_spender', giftName: 'Lion', diamondCount: 5000 });
  console.log('mvp done');

  await client.disconnect();
  process.exit(0);
})();
