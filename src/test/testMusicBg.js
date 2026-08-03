const { ObsClient } = require('../obs/obsClient');
const { MusicController } = require('../music/musicController');
const { BackgroundController } = require('../backgrounds/backgroundController');

(async () => {
  const client = new ObsClient();
  await client.connect();

  const music = new MusicController(client);
  console.log('TRACKS', JSON.stringify(music.listTracks().map((t) => t.id)));
  await music.selectAndPlay('track1_calm');
  await new Promise((r) => setTimeout(r, 1000));
  console.log('STATUS after play', JSON.stringify(await music.status()));
  await music.setVolume(40);
  await music.pause();
  await new Promise((r) => setTimeout(r, 300));
  console.log('STATUS after pause', JSON.stringify(await music.status()));
  await music.resume();
  await new Promise((r) => setTimeout(r, 300));
  await music.stop();
  await new Promise((r) => setTimeout(r, 500));
  console.log('STATUS after stop', JSON.stringify(await music.status()));

  const bg = new BackgroundController(client);
  console.log('BACKGROUNDS', JSON.stringify(bg.list().map((b) => b.themeId)));
  console.log('CURRENT before', await bg.current());
  await bg.select('lion');
  console.log('CURRENT after select lion', await bg.current());

  await client.disconnect();
  process.exit(0);
})();
