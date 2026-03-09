const db = require("../firebase");

function ref(channelId) {
  return db.collection("youtubeAuth").doc(String(channelId));
}

async function saveToken(channelId, data) {
  await ref(channelId).set(
    {
      channelId: String(channelId),
      updatedAt: new Date(),
      ...data
    },
    { merge: true }
  );
}

async function getToken(channelId) {
  const snap = await ref(channelId).get();

  if (!snap.exists) {
    return null;
  }

  return snap.data();
}

async function removeToken(channelId) {
  await ref(channelId).delete();
}

async function isConnected(channelId) {
  const data = await getToken(channelId);
  return !!(data && data.enabled && data.refreshTokenEnc);
}

module.exports = {
  saveToken,
  getToken,
  removeToken,
  isConnected
};