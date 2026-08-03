const { ObsClient } = require('../obs/obsClient');

(async () => {
  const client = new ObsClient();
  const ok = await client.connect();
  if (!ok) {
    console.error('SMOKE TEST FAIL: could not connect');
    process.exit(1);
  }
  const version = await client.call('GetVersion');
  console.log('SMOKE TEST OK', JSON.stringify(version, null, 2));
  await client.disconnect();
  process.exit(0);
})();
