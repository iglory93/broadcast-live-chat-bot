const db = require("../firebase");

const aiConfigCache = {};
const watching = new Set();

function normalizeScope(scope) {
  return String(scope || "global");
}

function ensureWatcher(scope) {
  scope = normalizeScope(scope);

  if (watching.has(scope)) {
    return;
  }

  watching.add(scope);

  db.collection("aiConfigs")
    .doc(scope)
    .onSnapshot(
      (snap) => {
        const data = snap.exists ? snap.data() : {};

        aiConfigCache[scope] = {
          enabled: data?.enabled !== false,
          updatedAt: data?.updatedAt || null
        };

        console.log("ai config updated:", scope, aiConfigCache[scope]);
      },
      (err) => {
        console.log("ai config watcher error:", scope, err.message);
      }
    );
}

function primeScope(scope) {
  ensureWatcher(scope);
}

// async function setEnabled(scope, enabled) {
//   scope = normalizeScope(scope);

//   await db.collection("aiConfigs").doc(scope).set(
//     {
//       enabled: !!enabled,
//       updatedAt: new Date()
//     },
//     { merge: true }
//   );
// }

async function setEnabled(scope, enabled) {
  scope = normalizeScope(scope);

  aiConfigCache[scope] = {
    ...(aiConfigCache[scope] || {}),
    enabled: !!enabled,
    updatedAt: new Date()
  };

  await db.collection("aiConfigs").doc(scope).set(
    {
      enabled: !!enabled,
      updatedAt: new Date()
    },
    { merge: true }
  );
}

function isEnabled(channelId) {
  const channelKey = normalizeScope(channelId);

  if (aiConfigCache[channelKey] && typeof aiConfigCache[channelKey].enabled === "boolean") {
    return aiConfigCache[channelKey].enabled;
  }

  if (aiConfigCache.global && typeof aiConfigCache.global.enabled === "boolean") {
    return aiConfigCache.global.enabled;
  }

  return true;
}

function getStatus(channelId) {
  return {
    enabled: isEnabled(channelId)
  };
}

module.exports = {
  primeScope,
  setEnabled,
  isEnabled,
  getStatus
};