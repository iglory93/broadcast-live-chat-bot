const admin = require("firebase-admin");
const db = require("../firebase");
const { calcScore, getLevel, getNextLevelScore } = require("../utils/level");

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function rootDoc(name) {
  return db.collection("chatRank").doc(name);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function updateCounterDoc(docRef, payload, saveLevel) {
  const snap = await docRef.get();
  const prev = snap.exists ? snap.data() : {};

  const nextChatCount = toNumber(prev.chatCount) + toNumber(payload.chatCount);
  const nextScore = toNumber(prev.score) + toNumber(payload.score);

  const now = admin.firestore.FieldValue.serverTimestamp();

  const data = {
    userId: toNumber(payload.userId),
    channelId: toNumber(payload.channelId),
    chatCount: nextChatCount,
    score: nextScore,
    updatedAt: now,
    lastMessageAt: now
  };

  let prevLevel = 0;
  let nextLevel = 0;
  let levelUp = false;

  if (saveLevel) {
    prevLevel = toNumber(prev.level || getLevel(toNumber(prev.score)));
    nextLevel = getLevel(nextScore);
    levelUp = nextLevel > prevLevel;

    data.level = nextLevel;
    data.nextLevelScore = getNextLevelScore(nextLevel);

    if (levelUp) {
      data.lastLevelUpAt = now;
    } else if (prev.lastLevelUpAt) {
      data.lastLevelUpAt = prev.lastLevelUpAt;
    }
  }

  await docRef.set(data, { merge: true });

  return {
    prevLevel,
    nextLevel,
    levelUp,
    score: nextScore,
    nextLevelScore: data.nextLevelScore || 0
  };
}

async function addChat(chat) {
  const channelId = toNumber(chat.channelId);
  const userId = toNumber(chat.clientChannelId || chat.userId || chat.memberId);
  const message = String(chat.message || "").trim();

  if (!channelId || !userId || !message) {
    return { levelUp: false };
  }

  const score = calcScore(message);
  const today = getTodayKey();
  const month = getMonthKey();

  const payload = {
    userId,
    channelId,
    chatCount: 1,
    score
  };

  await updateCounterDoc(
    rootDoc(`channelDaily_${today}_${channelId}`).collection("users").doc(String(userId)),
    payload,
    false
  );

  await updateCounterDoc(
    rootDoc(`channelMonthly_${month}_${channelId}`).collection("users").doc(String(userId)),
    payload,
    false
  );

  const channelTotalResult = await updateCounterDoc(
    rootDoc(`channelTotal_${channelId}`).collection("users").doc(String(userId)),
    payload,
    true
  );

  await updateCounterDoc(
    rootDoc(`globalDaily_${today}`).collection("users").doc(String(userId)),
    payload,
    false
  );

  await updateCounterDoc(
    rootDoc(`globalMonthly_${month}`).collection("users").doc(String(userId)),
    payload,
    false
  );

  await updateCounterDoc(
    rootDoc(`globalTotal`).collection("users").doc(String(userId)),
    payload,
    true
  );

  return channelTotalResult;
}

function getRankRef({ channelId, scope = "channel", period = "daily" }) {
  const today = getTodayKey();
  const month = getMonthKey();

  if (scope === "global") {
    if (period === "daily") {
      return rootDoc(`globalDaily_${today}`).collection("users");
    }
    if (period === "monthly") {
      return rootDoc(`globalMonthly_${month}`).collection("users");
    }
    if (period === "total") {
      return rootDoc(`globalTotal`).collection("users");
    }
  }

  const cid = toNumber(channelId);

  if (period === "daily") {
    return rootDoc(`channelDaily_${today}_${cid}`).collection("users");
  }
  if (period === "monthly") {
    return rootDoc(`channelMonthly_${month}_${cid}`).collection("users");
  }
  if (period === "total") {
    return rootDoc(`channelTotal_${cid}`).collection("users");
  }

  return rootDoc(`channelDaily_${today}_${cid}`).collection("users");
}

async function getRanking({ channelId, scope = "channel", period = "daily", limit = 5 }) {
  const ref = getRankRef({ channelId, scope, period });

  const snap = await ref
    .orderBy("chatCount", "desc")
    .orderBy("score", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc, index) => ({
    rank: index + 1,
    ...doc.data()
  }));
}

async function getLevelRanking(channelId, limit = 5) {
  const snap = await rootDoc(`channelTotal_${toNumber(channelId)}`)
    .collection("users")
    .orderBy("level", "desc")
    .orderBy("score", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc, index) => ({
    rank: index + 1,
    ...doc.data()
  }));
}

async function getUserLevel(channelId, userId) {
  const ref = rootDoc(`channelTotal_${toNumber(channelId)}`)
    .collection("users")
    .doc(String(toNumber(userId)));

  const snap = await ref.get();
  if (!snap.exists) return null;

  return snap.data();
}

async function getDocData(docRef) {
  const snap = await docRef.get();
  return snap.exists ? snap.data() : null;
}

async function getUserChatSummary(channelId, userId) {
  const cid = toNumber(channelId);
  const uid = toNumber(userId);
  const today = getTodayKey();
  const month = getMonthKey();

  const [
    channelDaily,
    channelMonthly,
    channelTotal,
    globalDaily,
    globalMonthly,
    globalTotal
  ] = await Promise.all([
    getDocData(rootDoc(`channelDaily_${today}_${cid}`).collection("users").doc(String(uid))),
    getDocData(rootDoc(`channelMonthly_${month}_${cid}`).collection("users").doc(String(uid))),
    getDocData(rootDoc(`channelTotal_${cid}`).collection("users").doc(String(uid))),
    getDocData(rootDoc(`globalDaily_${today}`).collection("users").doc(String(uid))),
    getDocData(rootDoc(`globalMonthly_${month}`).collection("users").doc(String(uid))),
    getDocData(rootDoc(`globalTotal`).collection("users").doc(String(uid)))
  ]);

  return {
    userId: uid,
    channelId: cid,
    channelDaily,
    channelMonthly,
    channelTotal,
    globalDaily,
    globalMonthly,
    globalTotal
  };
}

module.exports = {
  addChat,
  getRanking,
  getLevelRanking,
  getUserLevel,
  getUserChatSummary
};