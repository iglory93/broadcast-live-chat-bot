const db = require("../firebase");

const danceCache = {};
const watching = new Set();

function normalizeScope(scope) {
  return String(scope || "global");
}

function normalizeSlot(slot) {
  const num = Number(slot);
  if (!Number.isInteger(num) || num < 1 || num > 10) {
    return null;
  }
  return String(num);
}

function ensureWatcher(scope) {
  scope = normalizeScope(scope);

  if (watching.has(scope)) {
    return;
  }

  watching.add(scope);

  db.collection("danceMessages")
    .doc(scope)
    .collection("list")
    .onSnapshot(sub => {
      const map = {};

      sub.forEach(doc => {
        const key = normalizeSlot(doc.id);
        const text = String(doc.data()?.message || "").trim();

        if (key && text) {
          map[key] = text;
        }
      });

      danceCache[scope] = map;
      console.log("dance messages updated:", scope, map);
    }, err => {
      console.log("dance watcher error:", scope, err.message);
    });
}

function primeScope(scope) {
  scope = normalizeScope(scope);
  ensureWatcher(scope);
}

async function setMessage(scope, slot, message) {
  scope = normalizeScope(scope);
  const key = normalizeSlot(slot);
  const text = String(message || "").trim();

  if (!key) {
    throw new Error("invalid_slot");
  }

  if (!text) {
    throw new Error("empty_message");
  }

  const ref = db.collection("danceMessages").doc(scope);

  await ref.set(
    {
      enabled: true,
      updatedAt: new Date()
    },
    { merge: true }
  );

  await ref
    .collection("list")
    .doc(key)
    .set({
      message: text,
      updatedAt: new Date()
    });
}

async function removeMessage(scope, slot) {
  scope = normalizeScope(scope);
  const key = normalizeSlot(slot);

  if (!key) {
    throw new Error("invalid_slot");
  }

  await db
    .collection("danceMessages")
    .doc(scope)
    .collection("list")
    .doc(key)
    .delete();
}

async function listMessages(scope) {
  scope = normalizeScope(scope);

  const snap = await db
    .collection("danceMessages")
    .doc(scope)
    .collection("list")
    .get();

  const rows = [];

  snap.forEach(doc => {
    const key = normalizeSlot(doc.id);
    const text = String(doc.data()?.message || "").trim();

    if (key && text) {
      rows.push({
        slot: Number(key),
        message: text
      });
    }
  });

  rows.sort((a, b) => a.slot - b.slot);
  return rows;
}

function getMergedRoutine(channelId) {
  channelId = String(channelId || "");

  const globalMap = danceCache.global || {};
  const channelMap = danceCache[channelId] || {};

  const routine = [];

  for (let i = 1; i <= 10; i += 1) {
    const key = String(i);
    const text = channelMap[key] || globalMap[key];

    if (text) {
      routine.push({ slot: i, message: text });
    }
  }

  return routine;
}

module.exports = {
  primeScope,
  setMessage,
  removeMessage,
  listMessages,
  getMergedRoutine
};