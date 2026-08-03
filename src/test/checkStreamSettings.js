const { ObsClient } = require('../obs/obsClient');

(async () => {
  const client = new ObsClient();
  await client.connect();
  const settings = await client.callSafe('GetStreamServiceSettings');
  console.log('STREAM_SERVICE_SETTINGS', JSON.stringify(settings));
  await client.disconnect();
  process.exit(0);
})();
