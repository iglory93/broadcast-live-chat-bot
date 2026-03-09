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
    .where("status", "in", ["queued", "playing"])
    .orderBy("createdAt", "asc")
    .limit(Math.max(Number(limit) || 20, 1))
    .get();

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));
  return rows;
}

async function findActiveByVideoId(channelId, videoId) {
  const snap = await queueCollection(channelId)
    .where("videoId", "==", String(videoId))
    .where("status", "in", ["queued", "playing"])
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  return snap.docs[0].data();
}

async function getFirstActive(channelId) {
  const snap = await queueCollection(channelId)
    .where("status", "in", ["queued", "playing"])
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  return snap.docs[0].data();
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
    .where("status", "in", ["queued", "playing"])
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  const target = snap.docs[0].data();
  await markCancelled(channelId, target.requestId);
  return target;
}

async function clearActiveQueue(channelId) {
  const snap = await queueCollection(channelId)
    .where("status", "in", ["queued", "playing"])
    .get();

  const batch = db.batch();

  snap.forEach(doc => {
    batch.set(
      doc.ref,
      {
        status: "cancelled",
        updatedAt: new Date(),
        cancelledAt: new Date()
      },
      { merge: true }
    );
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