const admin = require("firebase-admin");
const db = require("../firebase");
const streamStore = require("./streamStore");
const BLOCKED_ATTENDANCE_USER_IDS = new Set(["999846"]);
const sessionSeen = new Map();
const queryCache = require("./queryCache");
const ATTENDANCE_CACHE_TTL_MS = 5000;

function getKstDate(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  return kst;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function getTodayKey(offsetDays = 0) {
  return formatDateKey(getKstDate(offsetDays));
}

function getMonthKey(offsetMonths = 0) {
  const d = getKstDate(0);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function getYesterdayKey() {
  return getTodayKey(-1);
}

function getDailyRootDoc(channelId, dayKey = getTodayKey()) {
  return db.collection("attendance_daily").doc(`${dayKey}_${channelId}`);
}

function getMonthlyUserDoc(channelId, userId, monthKey = getMonthKey()) {
  return db.collection("attendance_monthly").doc(`${monthKey}_${channelId}_${userId}`);
}

function getSessionKey(channelId, broadcastId) {
  return `${channelId}:${broadcastId || "no_broadcast"}`;
}

function hasSeenInSession(channelId, userId, broadcastId) {
  const key = getSessionKey(channelId, broadcastId);
  const set = sessionSeen.get(key);
  return !!set && set.has(String(userId));
}

function markSeenInSession(channelId, userId, broadcastId) {
  const key = getSessionKey(channelId, broadcastId);
  if (!sessionSeen.has(key)) {
    sessionSeen.set(key, new Set());
  }
  sessionSeen.get(key).add(String(userId));
}

async function attend({ channelId, userId, broadcastId, source = "manual" }) {
  channelId = String(channelId);
  userId = String(userId);

  if (!channelId || !userId) {
    return { ok: false, reason: "invalid" };
  }

  if (BLOCKED_ATTENDANCE_USER_IDS.has(userId)) {
    return { ok: false, reason: "blocked_user" };
  }


  const dayKey = getTodayKey();
  const yesterdayKey = getYesterdayKey();
  const monthKey = getMonthKey();

  const dailyRootRef = getDailyRootDoc(channelId, dayKey);
  const dailyUserRef = dailyRootRef.collection("users").doc(userId);
  const monthlyUserRef = getMonthlyUserDoc(channelId, userId, monthKey);

  const result = await db.runTransaction(async (tx) => {
    const [dailyRootSnap, dailyUserSnap, monthlyUserSnap] = await Promise.all([
      tx.get(dailyRootRef),
      tx.get(dailyUserRef),
      tx.get(monthlyUserRef)
    ]);

    if (dailyUserSnap.exists) {
      const dailyData = dailyUserSnap.data() || {};
      const monthlyData = monthlyUserSnap.exists ? monthlyUserSnap.data() || {} : {};

      return {
        ok: false,
        already: true,
        rank: dailyData.rank || null,
        streak: monthlyData.streak || 0,
        monthlyCount: monthlyData.monthlyCount || 0
      };
    }

    const prevCount = Number(dailyRootSnap.exists ? dailyRootSnap.data()?.count || 0 : 0);
    const nextRank = prevCount + 1;
    const now = admin.firestore.FieldValue.serverTimestamp();

    let streak = 1;
    let monthlyCount = 1;

    if (monthlyUserSnap.exists) {
      const prev = monthlyUserSnap.data() || {};
      monthlyCount = Number(prev.monthlyCount || 0) + 1;

      if (prev.lastAttendDayKey === yesterdayKey) {
        streak = Number(prev.streak || 0) + 1;
      } else if (prev.lastAttendDayKey === dayKey) {
        streak = Number(prev.streak || 1);
      } else {
        streak = 1;
      }
    }

    tx.set(
      dailyRootRef,
      {
        channelId,
        dayKey,
        count: nextRank,
        updatedAt: now
      },
      { merge: true }
    );

    tx.set(
      dailyUserRef,
      {
        userId,
        channelId,
        rank: nextRank,
        source,
        broadcastId: broadcastId || null,
        attendedAt: now,
        dayKey
      },
      { merge: true }
    );

    tx.set(
      monthlyUserRef,
      {
        userId,
        channelId,
        monthKey,
        monthlyCount,
        streak,
        lastAttendDayKey: dayKey,
        updatedAt: now
      },
      { merge: true }
    );

    return {
      ok: true,
      already: false,
      rank: nextRank,
      streak,
      monthlyCount
    };
  });

  markSeenInSession(channelId, userId, broadcastId);

  if (result.ok && !result.already) {
    queryCache.clearPrefix(`attendanceDaily::${channelId}::${dayKey}`);
    queryCache.clearPrefix(`attendanceMonthly::${channelId}::${monthKey}`);
  }

  return result;
}

async function autoAttend(chat) {
  if (chat?.type !== "chat") {
    return { ok: false, reason: "not_chat" };
  }

  const channelId = String(chat.channelId || "");
  const userId = String(chat.clientChannelId || "");

  if (!channelId || !userId) {
    return { ok: false, reason: "invalid" };
  }

    if (BLOCKED_ATTENDANCE_USER_IDS.has(userId)) {
    return { ok: false, reason: "blocked_user" };
  }


  const streamInfo = streamStore.get(channelId);
  const broadcastId = streamInfo?.broadcastId || null;

  if (hasSeenInSession(channelId, userId, broadcastId)) {
    return { ok: false, reason: "already_seen_in_session" };
  }

  return attend({
    channelId,
    userId,
    broadcastId,
    source: "auto"
  });
}

async function manualAttend(chat) {
  const channelId = String(chat?.channelId || "");
  const userId = String(chat?.clientChannelId || "");

  if (!channelId || !userId) {
    return { ok: false, reason: "invalid" };
  }

  if (BLOCKED_ATTENDANCE_USER_IDS.has(userId)) {
    return { ok: false, reason: "blocked_user" };
  }

  const streamInfo = streamStore.get(channelId);
  const broadcastId = streamInfo?.broadcastId || null;

  return attend({
    channelId,
    userId,
    broadcastId,
    source: "manual"
  });
}

// async function getDailyRanking(channelId, limit = 10, offsetDays = 0) {
//   const dayKey = getTodayKey(offsetDays);

//   const snap = await getDailyRootDoc(String(channelId), dayKey)
//     .collection("users")
//     .orderBy("rank", "asc")
//     .limit(limit)
//     .get();

//   const rows = [];
//   snap.forEach(doc => rows.push(doc.data()));
//   return rows;
// }
async function getDailyRanking(channelId, limit = 10, offsetDays = 0) {
  const dayKey = getTodayKey(offsetDays);
  const cacheKey = ["attendanceDaily", channelId, dayKey, limit];

  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  const snap = await getDailyRootDoc(String(channelId), dayKey)
    .collection("users")
    .orderBy("rank", "asc")
    .limit(limit)
    .get();

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));

  queryCache.set(cacheKey, rows, ATTENDANCE_CACHE_TTL_MS);
  return rows;
}

// async function getMonthlyRanking(channelId, limit = 10) {
//   const monthKey = getMonthKey();

//   const snap = await db.collection("attendance_monthly")
//     .where("channelId", "==", String(channelId))
//     .where("monthKey", "==", monthKey)
//     .orderBy("monthlyCount", "desc")
//     .orderBy("updatedAt", "asc")
//     .limit(limit)
//     .get();

//   const rows = [];
//   snap.forEach(doc => rows.push(doc.data()));
//   return rows;
// }
async function getMonthlyRanking(channelId, limit = 10) {
  const monthKey = getMonthKey();
  const cacheKey = ["attendanceMonthly", channelId, monthKey, limit];

  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  const snap = await db.collection("attendance_monthly")
    .where("channelId", "==", String(channelId))
    .where("monthKey", "==", monthKey)
    .orderBy("monthlyCount", "desc")
    .orderBy("updatedAt", "asc")
    .limit(limit)
    .get();

  const rows = [];
  snap.forEach(doc => rows.push(doc.data()));

  queryCache.set(cacheKey, rows, ATTENDANCE_CACHE_TTL_MS);
  return rows;
}


async function getMyTodayAttendance(channelId, userId) {
  const dayKey = getTodayKey();

  const dailySnap = await getDailyRootDoc(String(channelId), dayKey)
    .collection("users")
    .doc(String(userId))
    .get();

  if (!dailySnap.exists) return null;
  return dailySnap.data();
}

async function getMyMonthlyAttendance(channelId, userId) {
  const monthKey = getMonthKey();
  const snap = await getMonthlyUserDoc(String(channelId), String(userId), monthKey).get();

  if (!snap.exists) return null;
  return snap.data();
}

async function getMyAttendanceSummary(channelId, userId) {
  const [daily, monthly] = await Promise.all([
    getMyTodayAttendance(channelId, userId),
    getMyMonthlyAttendance(channelId, userId)
  ]);

  return {
    today: daily,
    monthly
  };
}

async function getAttendanceCheckByUserId(channelId, userId) {
  const [today, monthly] = await Promise.all([
    getMyTodayAttendance(channelId, userId),
    getMyMonthlyAttendance(channelId, userId)
  ]);

  return {
    today,
    monthly
  };
}

module.exports = {
  getTodayKey,
  getMonthKey,
  autoAttend,
  manualAttend,
  getDailyRanking,
  getMonthlyRanking,
  getMyTodayAttendance,
  getMyMonthlyAttendance,
  getMyAttendanceSummary,
  getAttendanceCheckByUserId
};