const { ObsClient } = require('../obs/obsClient');

(async () => {
  const client = new ObsClient();
  await client.connect();
  const kinds = await client.call('GetInputKindList');
  console.log('INPUT_KINDS', JSON.stringify(kinds));
  const special = await client.call('GetSpecialInputs');
  console.log('SPECIAL_INPUTS', JSON.stringify(special));
  const profiles = await client.call('GetProfileList');
  console.log('PROFILES', JSON.stringify(profiles));
  const collections = await client.call('GetSceneCollectionList');
  console.log('COLLECTIONS', JSON.stringify(collections));
  await client.disconnect();
  process.exit(0);
})();
