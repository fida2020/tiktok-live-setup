const { config } = require('../util/config');

// http (not file://): served by overlayServer's /avatars static route so it
// also works as an <img src> inside the http-served overlays-web pages.
const localAvatar = (n) => `http://${config.overlay.host}:${config.overlay.port}/avatars/avatar_placeholder_${n}.png`;

const FAKE_USERS = ['fake_user_alex', 'fake_user_jordan', 'fake_user_sam', 'fake_user_taylor'];

function randomFakeUser(seedIndex = Math.floor(Math.random() * FAKE_USERS.length)) {
  return {
    user: FAKE_USERS[seedIndex % FAKE_USERS.length],
    avatarUrl: localAvatar((seedIndex % 4) + 1),
  };
}

/**
 * Synthetic event payloads for TEST MODE - exercises the exact same
 * EventBridge -> overlayDispatcher -> overlayController path a real
 * TikFinity event would, without any TikTok LIVE connection.
 */
function normalGiftPayload() {
  return { ...randomFakeUser(0), giftName: 'Rose', diamondCount: 1, repeatCount: 1 };
}

function bigGiftPayload() {
  return { ...randomFakeUser(1), giftName: 'Lion', diamondCount: 3500, repeatCount: 1 };
}

function mvpGiftPayload() {
  return { ...randomFakeUser(2), giftName: 'Universe', diamondCount: 12000, repeatCount: 1 };
}

function battleWinnerPayload() {
  return { winner: 'fake_champion', avatarUrl: localAvatar(4), winnerScore: 3, loserScore: 1 };
}

// Fixed (not random) username so it can be added to config/vipList.json for
// a real end-to-end test of the VIP welcome qualification path.
const VIP_TEST_USER = { user: 'fake_vip_test', avatarUrl: localAvatar(3) };

function vipJoinPayload() {
  return { ...VIP_TEST_USER };
}

function nonQualifyingJoinPayload() {
  return { ...randomFakeUser(1) };
}

module.exports = {
  randomFakeUser, normalGiftPayload, bigGiftPayload, mvpGiftPayload, battleWinnerPayload,
  vipJoinPayload, nonQualifyingJoinPayload, VIP_TEST_USER,
};
