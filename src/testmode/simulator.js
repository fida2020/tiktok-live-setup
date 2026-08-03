const path = require('path');

const AVATARS_DIR = path.join(__dirname, '..', '..', 'assets', 'avatars');
const localAvatar = (n) => `file:///${path.join(AVATARS_DIR, `avatar_placeholder_${n}.png`).replace(/\\/g, '/')}`;

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

function mvpGiftPayload() {
  return { ...randomFakeUser(2), giftName: 'Lion', diamondCount: 5000, repeatCount: 1 };
}

function vipJoinPayload() {
  return { ...randomFakeUser(3), level: 50 };
}

function nonQualifyingJoinPayload() {
  return { ...randomFakeUser(1), level: 3 };
}

module.exports = { randomFakeUser, normalGiftPayload, mvpGiftPayload, vipJoinPayload, nonQualifyingJoinPayload };
