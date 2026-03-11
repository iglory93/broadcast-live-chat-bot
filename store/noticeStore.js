const db = require("../firebase");
const sendChat = require("../chat/sendChat");
const streamStore = require("./streamStore");

const noticeCache = {};
const watching = new Set();
const noticeTimers = new Map();

function normalizeScope(scope) {
  return String(scope || "global");
}

function normalizeSlot(slot) {
  const num = Number(slot);

  if (!Number.isInteger(num) || num < 1 || num > 3) {
    return null;
  }

  return String(num);
}

function normalizeMinute(minute) {
  const num = Number(minute);

  if (!Number.isInteger(num) || num < 1 || num > 180) {
    return null;
  }

  return num;
}

function buildNoticeText(item) {
  const title = String(item?.title || "").trim();
  const message = String(item?.message || "").trim();

//   if (title && message) {
//     return `📢 [${title}] ${message}`;
//   }

//   if (title) {
//     return `📢 [${title}]`;
//   }

  return `📢 ${message}`;
}

function clearChannelTimers(scope) {
  const prefix = `${scope}:`;

  for (const [key, timer] of noticeTimers.entries()) {
    if (!key.startsWith(prefix)) continue;
    clearInterval(timer);
    noticeTimers.delete(key);
  }
}

function rebuildTimers(scope) {
  scope = normalizeScope(scope);
  clearChannelTimers(scope);

  const map = noticeCache[scope] || {};

  Object.entries(map).forEach(([slot, item]) => {
    const minute = normalizeMinute(item?.minute);
    const text = buildNoticeText(item);

    if (!minute || !text) {
      return;
    }

    const timerKey = `${scope}:${slot}`;
    const intervalMs = minute * 60 * 1000;

    const timer = setInterval(async () => {
      try {
        if (!streamStore.isLive(scope)) {
          return;
        }

        await sendChat(scope, text);
      } catch (err) {
        console.log("notice send error:", scope, slot, err.message);
      }
    }, intervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }

    noticeTimers.set(timerKey, timer);
  });
}

function ensureWatcher(scope) {
  scope = normalizeScope(scope);

  if (watching.has(scope)) {
    return;
  }

  watching.add(scope);

  db.collection("announcements")
    .doc(scope)
    .collection("list")
    .onSnapshot(
      (sub) => {
        const map = {};

        sub.forEach((doc) => {
          const key = normalizeSlot(doc.id);
          const data = doc.data() || {};
          const minute = normalizeMinute(data.minute);
          const title = String(data.title || "").trim();
          const message = String(data.message || "").trim();

          if (key && minute && title && message) {
            map[key] = {
              minute,
              title,
              message,
              updatedAt: data.updatedAt || null
            };
          }
        });

        noticeCache[scope] = map;
        rebuildTimers(scope);
        console.log("announcements updated:", scope, Object.keys(map));
      },
      (err) => {
        console.log("announcement watcher error:", scope, err.message);
      }
    );
}

function primeScope(scope) {
  ensureWatcher(scope);
}

async function setNotice(scope, slot, minute, title, message) {
  scope = normalizeScope(scope);
  const key = normalizeSlot(slot);
  const normalizedMinute = normalizeMinute(minute);
  const safeTitle = String(title || "").trim();
  const safeMessage = String(message || "").trim();

  if (!key) throw new Error("invalid_slot");
  if (!normalizedMinute) throw new Error("invalid_minute");
  if (!safeTitle) throw new Error("empty_title");
  if (!safeMessage) throw new Error("empty_message");

  const ref = db.collection("announcements").doc(scope);

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
      minute: normalizedMinute,
      title: safeTitle,
      message: safeMessage,
      updatedAt: new Date()
    });
}

async function removeNotice(scope, slot) {
  scope = normalizeScope(scope);
  const key = normalizeSlot(slot);

  if (!key) throw new Error("invalid_slot");

  await db
    .collection("announcements")
    .doc(scope)
    .collection("list")
    .doc(key)
    .delete();
}

function listNotices(scope) {
  scope = normalizeScope(scope);
  const map = noticeCache[scope] || {};
  const rows = [];

  for (let i = 1; i <= 3; i += 1) {
    const item = map[String(i)];
    if (!item) continue;

    rows.push({
      slot: i,
      minute: item.minute,
      title: item.title,
      message: item.message
    });
  }

  return rows;
}

module.exports = {
  primeScope,
  setNotice,
  removeNotice,
  listNotices
};