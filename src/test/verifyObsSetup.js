const { ObsClient } = require('../obs/obsClient');

(async () => {
  const client = new ObsClient();
  await client.connect();

  const video = await client.call('GetVideoSettings');
  console.log('VIDEO_SETTINGS', JSON.stringify(video));

  const profiles = await client.call('GetProfileList');
  console.log('PROFILE', JSON.stringify(profiles));

  const collections = await client.call('GetSceneCollectionList');
  console.log('COLLECTION', JSON.stringify(collections));

  const scenes = await client.call('GetSceneList');
  console.log('SCENES', JSON.stringify(scenes));

  for (const category_name of [['Output', 'Mode'], ['SimpleOutput', 'StreamEncoder'], ['SimpleOutput', 'VBitrate'], ['SimpleOutput', 'ABitrate']]) {
    const [parameterCategory, parameterName] = category_name;
    const p = await client.call('GetProfileParameter', { parameterCategory, parameterName });
    console.log(`PARAM ${parameterCategory}.${parameterName}`, JSON.stringify(p));
  }

  const inputs = await client.call('GetInputList');
  console.log('INPUTS', JSON.stringify(inputs.inputs.map((i) => ({ name: i.inputName, kind: i.inputKind }))));

  for (const sceneName of ['STARTING', 'MAIN', 'BRB', 'ENDING']) {
    const items = await client.call('GetSceneItemList', { sceneName });
    console.log(`SCENE_ITEMS ${sceneName}`, JSON.stringify(items.sceneItems.map((i) => ({ name: i.sourceName, enabled: i.sceneItemEnabled }))));
  }

  const current = await client.call('GetCurrentProgramScene');
  console.log('CURRENT_PROGRAM_SCENE', JSON.stringify(current));

  await client.disconnect();
  process.exit(0);
})();
