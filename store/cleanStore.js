const db = require("../firebase");

const cleanCache = {};
const watching = new Set();
const DEFAULT_LINES = 50;
const MIN_LINES = 1;
const MAX_LINES = 100;

function normalizeScope(scope) {
  return String(scope || "global");
}

function normalizeLines(lines) {
  const num = Number(lines);

  if (!Number.isInteger(num) || num < MIN_LINES || num > MAX_LINES) {
    return null;
  }

  return num;
}

function ensureWatcher(scope) {
  scope = normalizeScope(scope);

  if (watching.has(scope)) {
    return;
  }

  watching.add(scope);

  db.collection("cleanSettings")
    .doc(scope)
    .onSnapshot(doc => {
      const data = doc.data() || {};
      const lines = normalizeLines(data.lines);

      if (lines) {
        cleanCache[scope] = { lines };
      } else {
        delete cleanCache[scope];
      }

      console.log("clean settings updated:", scope, cleanCache[scope] || null);
    }, err => {
      console.log("clean watcher error:", scope, err.message);
    });
}

function primeScope(scope) {
  ensureWatcher(scope);
}

async function setLines(scope, lines) {
  scope = normalizeScope(scope);
  const value = normalizeLines(lines);

  if (!value) {
    throw new Error("invalid_lines");
  }

  await db.collection("cleanSettings").doc(scope).set(
    {
      lines: value,
      updatedAt: new Date()
    },
    { merge: true }
  );
}

function getResolvedConfig(channelId) {
  channelId = String(channelId || "");

  if (cleanCache[channelId]?.lines) {
    return {
      lines: cleanCache[channelId].lines,
      source: "channel"
    };
  }

  if (cleanCache.global?.lines) {
    return {
      lines: cleanCache.global.lines,
      source: "global"
    };
  }

  return {
    lines: DEFAULT_LINES,
    source: "default"
  };
}

function getLines(channelId) {
  return getResolvedConfig(channelId).lines;
}

function buildCleanMessage(lines) {
  const value = normalizeLines(lines) || DEFAULT_LINES;
  return "ㅤ" + "\n".repeat(Math.max(0, value - 1));
}

module.exports = {
  DEFAULT_LINES,
  MIN_LINES,
  MAX_LINES,
  primeScope,
  setLines,
  getLines,
  getResolvedConfig,
  buildCleanMessage
};