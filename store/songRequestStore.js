const crypto = require("crypto");
const db = require("../firebase");

function queueCollection(channelId) {
  return db.collection("songRequests").doc(String(channelId)).collection("queue");
}

async function enqueue(channelId, row) {
  const requestId = crypto.randomUUID();

  await queueCollection(channelId).doc(requestId).set({
    requestId,
    channelId: String(channelId),
    status: "queued",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...row
  });

  return requestId;
}

async function getQueue(channelId, limit = 20) {
  const snap = await queueCollection(channelId)
    .orderBy("createdAt", "asc")
    .limit(Math.max(Number(limit) || 20, 1))
    .get();

  const rows = [];

  snap.forEach(doc => {
    const data = doc.data();

    if (["queued", "playing"].includes(data.status)) {
      rows.push(data);
    }
  });

  return rows;
}

async function findActiveByVideoId(channelId, videoId) {
  const snap = await queueCollection(channelId)
    .where("videoId", "==", String(videoId))
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (["queued", "playing"].includes(data.status)) {
      return data;
    }
  }

  return null;
}

async function getFirstActive(channelId) {
  const rows = await getQueue(channelId, 100);
  return rows[0] || null;
}

async function markDone(channelId, requestId) {
  await queueCollection(channelId).doc(String(requestId)).set(
    {
      status: "done",
      updatedAt: new Date(),
      doneAt: new Date()
    },
    { merge: true }
  );
}

async function markCancelled(channelId, requestId) {
  await queueCollection(channelId).doc(String(requestId)).set(
    {
      status: "cancelled",
      updatedAt: new Date(),
      cancelledAt: new Date()
    },
    { merge: true }
  );
}

async function cancelLatestByRequester(channelId, requesterId) {
  const snap = await queueCollection(channelId)
    .where("requesterId", "==", String(requesterId))
    .get();

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));

  rows.sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
    return bt - at;
  });

  const target = rows.find(row => ["queued", "playing"].includes(row.status));

  if (!target) {
    return null;
  }

  await markCancelled(channelId, target.requestId);
  return target;
}

async function clearActiveQueue(channelId) {
  const snap = await queueCollection(channelId).get();
  const batch = db.batch();

  snap.forEach(doc => {
    const data = doc.data();
    if (["queued", "playing"].includes(data.status)) {
      batch.set(doc.ref, {
        status: "cancelled",
        updatedAt: new Date(),
        cancelledAt: new Date()
      }, { merge: true });
    }
  });

  await batch.commit();
}

module.exports = {
  enqueue,
  getQueue,
  findActiveByVideoId,
  getFirstActive,
  markDone,
  markCancelled,
  cancelLatestByRequester,
  clearActiveQueue
};