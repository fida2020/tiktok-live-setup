const fs = require('fs');
const path = require('path');
const { ObsClient } = require('../obs/obsClient');

async function shot(client, name) {
  const { imageData } = await client.call('GetSourceScreenshot', { sourceName: 'MAIN', imageFormat: 'png', imageWidth: 270, imageHeight: 480 });
  fs.writeFileSync(path.join(__dirname, '..', '..', 'logs', `${name}.png`), Buffer.from(imageData.split(',')[1], 'base64'));
}

async function setEnabled(client, sourceName, enabled) {
  const { sceneItemId } = await client.call('GetSceneItemId', { sceneName: 'MAIN', sourceName });
  await client.call('SetSceneItemEnabled', { sceneName: 'MAIN', sceneItemId, sceneItemEnabled: enabled });
}

(async () => {
  const client = new ObsClient();
  await client.connect();
  await client.call('SetCurrentProgramScene', { sceneName: 'MAIN' });
  await new Promise((r) => setTimeout(r, 1500));

  await shot(client, 'layer_bg_only');

  await setEnabled(client, 'GiftCardImage', true);
  await setEnabled(client, 'GiftUsernameText', true);
  await new Promise((r) => setTimeout(r, 500));
  await shot(client, 'layer_bg_plus_gift');

  // cleanup
  await setEnabled(client, 'GiftCardImage', false);
  await setEnabled(client, 'GiftUsernameText', false);

  console.log('done');
  await client.disconnect();
  process.exit(0);
})();
