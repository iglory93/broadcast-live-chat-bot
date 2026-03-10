const admin = require("firebase-admin");
const db = require("../firebase");
const { calcScore, getLevel, getNextLevelScore } = require("../utils/level");

const AI_CHANNEL_ID = "999846";
const FLUSH_INTERVAL_MS = 10 * 60 * 1000;
//const FLUSH_INTERVAL_MS = 10 * 600;
const liveLevelState = new Map();
const pendingCounters = new Map();
const liveChannelChatState = new Map();

let flushTimer = null;
let flushing = false;
let shuttingDown = false;

const queryCache = require("./queryCache");

const RANK_CACHE_TTL_MS = 5000;
const SUMMARY_CACHE_TTL_MS = 5000;

function getKstDate(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);
  return kst;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function getTodayKey(offsetDays = 0) {
  const d = getKstDate(offsetDays);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function getMonthKey(offsetMonths = 0) {
  const d = getKstDate(0);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function rootDoc(name) {
  return db.collection("chatRank").doc(name);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ensureFlushScheduler() {
  if (flushTimer) return;

  flushTimer = setInterval(() => {
    flushPendingChats().catch((err) => {
      console.error("rankStore flush error:", err);
    });
  }, FLUSH_INTERVAL_MS);

  if (typeof flushTimer.unref === "function") {
    flushTimer.unref();
  }
}

function stopFlushScheduler() {
  if (!flushTimer) return;
  clearInterval(flushTimer);
  flushTimer = null;
}

function makePendingKey(name, userId) {
  return `${name}::${userId}`;
}

function queueCounterUpdate(name, userId, payload, options = {}) {
  const key = makePendingKey(name, userId);
  const existing = pendingCounters.get(key);

  if (existing) {
    existing.chatCount += toNumber(payload.chatCount);
    existing.score += toNumber(payload.score);
    existing.saveLevel = existing.saveLevel || !!options.saveLevel;
    existing.channelId = toNumber(payload.channelId) || existing.channelId;
    return;
  }

  pendingCounters.set(key, {
    key,
    docName: name,
    userId: toNumber(payload.userId),
    channelId: toNumber(payload.channelId),
    chatCount: toNumber(payload.chatCount),
    score: toNumber(payload.score),
    saveLevel: !!options.saveLevel,
    docRef: rootDoc(name).collection("users").doc(String(userId))
  });
}

function getPendingEntry(docName, userId) {
  return pendingCounters.get(makePendingKey(docName, userId)) || null;
}

function getPendingEntriesByDocName(docName) {
  const rows = [];

  for (const entry of pendingCounters.values()) {
    if (entry.docName === docName) {
      rows.push(entry);
    }
  }

  return rows;
}

function mergeBaseWithPending(base, pending, options = {}) {
  const current = base ? { ...base } : null;

  if (!pending) {
    if (!current) return null;

    if (options.saveLevel) {
      const score = toNumber(current.score);
      const level = toNumber(current.level || getLevel(score));
      return {
        ...current,
        score,
        chatCount: toNumber(current.chatCount),
        level,
        nextLevelScore: toNumber(current.nextLevelScore || getNextLevelScore(level))
      };
    }

    return {
      ...current,
      score: toNumber(current.score),
      chatCount: toNumber(current.chatCount)
    };
  }

  const nextUserId = toNumber(current?.userId || pending.userId);
  const nextChannelId = toNumber(current?.channelId || pending.channelId);
  const nextChatCount = toNumber(current?.chatCount) + toNumber(pending.chatCount);
  const nextScore = toNumber(current?.score) + toNumber(pending.score);

  const merged = {
    ...(current || {}),
    userId: nextUserId,
    channelId: nextChannelId,
    chatCount: nextChatCount,
    score: nextScore,
    _pending: true
  };

  if (options.saveLevel) {
    const nextLevel = getLevel(nextScore);
    merged.level = nextLevel;
    merged.nextLevelScore = getNextLevelScore(nextLevel);
  } else if (current?.level != null) {
    merged.level = current.level;
    merged.nextLevelScore = current.nextLevelScore;
  }

  return merged;
}

async function flushPendingChats() {
  if (flushing || pendingCounters.size === 0) {
    return { flushed: 0 };
  }

  flushing = true;

  const entries = Array.from(pendingCounters.values());
  pendingCounters.clear();

  try {
    const writer = db.bulkWriter();
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const entry of entries) {
      let data = {
        userId: entry.userId,
        channelId: entry.channelId,
        chatCount: admin.firestore.FieldValue.increment(entry.chatCount),
        score: admin.firestore.FieldValue.increment(entry.score),
        updatedAt: now,
        lastMessageAt: now
      };

      if (entry.saveLevel) {
        const snap = await entry.docRef.get();
        const prev = snap.exists ? snap.data() : {};

        const nextScore = toNumber(prev.score) + toNumber(entry.score);
        const prevLevel = toNumber(prev.level || getLevel(toNumber(prev.score)));
        const nextLevel = getLevel(nextScore);

        data.level = nextLevel;
        data.nextLevelScore = getNextLevelScore(nextLevel);

        if (nextLevel > prevLevel) {
          data.lastLevelUpAt = now;
        } else if (prev.lastLevelUpAt) {
          data.lastLevelUpAt = prev.lastLevelUpAt;
        }
      }

      writer.set(entry.docRef, data, { merge: true });
    }

    await writer.close();
    /* 여기서 메모리 상태 정리 */
    for (const entry of entries) {
      if (entry.saveLevel) {
        syncLevelStateAfterFlush(entry);
      }
    }
    
    //queryCache.clear();
    queryCache.clearPrefix("rank");
    queryCache.clearPrefix("levelRank");
    queryCache.clearPrefix("broadcastRank");
    queryCache.clearPrefix("chatSummary");

    console.log(`rankStore flush complete: ${entries.length} docs`);
    return { flushed: entries.length };
  } catch (err) {
    for (const entry of entries) {
      const existing = pendingCounters.get(entry.key);

      if (existing) {
        existing.chatCount += entry.chatCount;
        existing.score += entry.score;
        existing.saveLevel = existing.saveLevel || entry.saveLevel;
      } else {
        pendingCounters.set(entry.key, entry);
      }
    }

    throw err;
  } finally {
    flushing = false;
  }
}

async function shutdown() {
  if (shuttingDown) return;

  shuttingDown = true;
  stopFlushScheduler();

  try {
    if (pendingCounters.size > 0) {
      console.log("rankStore shutdown flush start...");
      await flushPendingChats();
      console.log("rankStore shutdown flush done");
    }
  } catch (err) {
    console.error("rankStore shutdown flush error:", err);
  }
}

async function addChat(chat) {
  ensureFlushScheduler();

  const channelId = toNumber(chat.channelId);
  const clientChannelId = toNumber(chat.clientChannelId);
  const userId = toNumber(chat.clientChannelId || chat.userId || chat.memberId);
  const message = String(chat.message || "").trim();

  if (String(clientChannelId) === AI_CHANNEL_ID) {
    return { levelUp: false, queued: false };
  }

  if (!channelId || !userId || !message) {
    return { levelUp: false, queued: false };
  }

  const score = calcScore(message);
  const today = getTodayKey();
  const month = getMonthKey();

  const levelState = await getOrCreateLevelState(userId, channelId);

  const prevScore = toNumber(levelState.baseScore) + toNumber(levelState.pendingScore);
  const prevLevel = getLevel(prevScore);

  levelState.pendingScore += score;
  levelState.pendingChatCount += 1;
  levelState.channelId = channelId;

  const nextScore = toNumber(levelState.baseScore) + toNumber(levelState.pendingScore);
  const nextLevel = getLevel(nextScore);

  let levelUpResult = {
    levelUp: false,
    queued: true
  };

  if (nextLevel > prevLevel && nextLevel > toNumber(levelState.announcedLevel)) {
    levelState.announcedLevel = nextLevel;

    levelUpResult = {
      levelUp: true,
      prevLevel,
      nextLevel,
      score: nextScore,
      queued: true
    };
  }

  const payload = {
    userId,
    channelId,
    chatCount: 1,
    score
  };
  //console.log("broadcast save:", chat.broadcastId, userId);
  if (chat.broadcastId) {
    
    queueCounterUpdate(`broadcast_${chat.broadcastId}`, userId, payload, { saveLevel: false });
  }

  queueCounterUpdate(`channelDaily_${today}_${channelId}`, userId, payload, { saveLevel: false });
  queueCounterUpdate(`channelMonthly_${month}_${channelId}`, userId, payload, { saveLevel: false });
  queueCounterUpdate(`channelTotal_${channelId}`, userId, payload, { saveLevel: false });
  queueCounterUpdate(`globalDaily_${today}`, userId, payload, { saveLevel: false });
  queueCounterUpdate(`globalMonthly_${month}`, userId, payload, { saveLevel: false });
  queueCounterUpdate(`globalTotal`, userId, payload, { saveLevel: true });

  return levelUpResult;
}

function makeChannelChatStateKey(channelId, userId) {
  return `${toNumber(channelId)}::${toNumber(userId)}`;
}

async function getOrCreateChannelChatState(channelId, userId) {
  const key = makeChannelChatStateKey(channelId, userId);
  const cached = liveChannelChatState.get(key);

  if (cached) {
    return cached;
  }

  const docName = `channelTotal_${toNumber(channelId)}`;
  const docRef = rootDoc(docName).collection("users").doc(String(toNumber(userId)));
  const snap = await docRef.get();
  const base = snap.exists ? snap.data() : null;
  const pending = getPendingEntry(docName, String(toNumber(userId)));
  const merged = mergeBaseWithPending(base, pending, { saveLevel: false });

  const state = {
    totalChatCount: toNumber(merged?.chatCount)
  };

  liveChannelChatState.set(key, state);
  return state;
}

function buildChatMilestoneMessage(nickname, milestone) {
  const name = nickname || "익명";

  if (milestone >= 1000) {
    return `🏆🔥 ${name}님이 무려 ${milestone}채팅을 달성했습니다! 채팅력 거의 전설급입니다!`;
  }

  return `🎉 ${name}님이 ${milestone}채팅 달성! 존재감이 아주 미쳤습니다 👏`;
}

function syncLevelStateAfterFlush(entry) {
  const key = String(entry.userId);
  const state = liveLevelState.get(key);
  if (!state) return;

  state.baseScore += toNumber(entry.score);
  state.pendingScore = Math.max(0, toNumber(state.pendingScore) - toNumber(entry.score));
  state.pendingChatCount = Math.max(0, toNumber(state.pendingChatCount) - toNumber(entry.chatCount));
  state.announcedLevel = getLevel(state.baseScore);
}
function getRankDocName({ channelId, scope = "channel", period = "daily", dayKey, monthKey }) {
  const today = dayKey || getTodayKey(0);
  const month = monthKey || getMonthKey(0);

  if (scope === "global") {
    if (period === "daily") return `globalDaily_${today}`;
    if (period === "monthly") return `globalMonthly_${month}`;
    if (period === "total") return `globalTotal`;
  }

  const cid = toNumber(channelId);

  if (period === "daily") return `channelDaily_${today}_${cid}`;
  if (period === "monthly") return `channelMonthly_${month}_${cid}`;
  if (period === "total") return `channelTotal_${cid}`;

  return `channelDaily_${today}_${cid}`;
}

function getRankRef({ channelId, scope = "channel", period = "daily", dayKey, monthKey }) {
  const docName = getRankDocName({ channelId, scope, period, dayKey, monthKey });
  return rootDoc(docName).collection("users");
}

function sortRankingRows(rows) {
  rows.sort((a, b) => {
    const chatDiff = toNumber(b.chatCount) - toNumber(a.chatCount);
    if (chatDiff !== 0) return chatDiff;

    const scoreDiff = toNumber(b.score) - toNumber(a.score);
    if (scoreDiff !== 0) return scoreDiff;

    return toNumber(a.userId) - toNumber(b.userId);
  });

  return rows;
}

// async function getRanking({
//   channelId,
//   scope = "channel",
//   period = "daily",
//   limit = 5,
//   dayKey,
//   monthKey
// }) {
//   const cacheKey = [
//     "rank",
//     channelId,
//     scope,
//     period,
//     limit,
//     dayKey || "",
//     monthKey || ""
//   ];

//   const cached = queryCache.get(cacheKey);
//   if (cached) return cached;

//   const docName = getRankDocName({ channelId, scope, period, dayKey, monthKey });
//   const ref = rootDoc(docName).collection("users");
//   const fetchSize = Math.max(limit * 5, 50);

//   const snap = await ref
//     .orderBy("chatCount", "desc")
//     .orderBy("score", "desc")
//     .limit(fetchSize)
//     .get();

//   const mergedMap = new Map();

//   for (const doc of snap.docs) {
//     const base = doc.data();
//     const uid = String(toNumber(base.userId || doc.id));
//     const pending = getPendingEntry(docName, uid);

//     mergedMap.set(uid, mergeBaseWithPending(base, pending, { saveLevel: false }));
//   }

//   const pendingEntries = getPendingEntriesByDocName(docName);

//   for (const entry of pendingEntries) {
//     const uid = String(entry.userId);
//     if (!mergedMap.has(uid)) {
//       mergedMap.set(uid, mergeBaseWithPending(null, entry, { saveLevel: false }));
//     }
//   }

//   const rows = sortRankingRows(Array.from(mergedMap.values()))
//     .slice(0, limit)
//     .map((row, index) => ({
//       rank: index + 1,
//       ...row
//     }));

//   queryCache.set(cacheKey, rows, RANK_CACHE_TTL_MS);
//   return rows;
// }

async function getRanking({
  channelId,
  scope = "channel",
  period = "daily",
  limit = 5,
  dayKey,
  monthKey
}) {

  const cacheKey = [
    "rank",
    channelId,
    scope,
    period,
    limit,
    dayKey || "",
    monthKey || ""
  ];

  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  const docName = getRankDocName({ channelId, scope, period, dayKey, monthKey });
  const ref = rootDoc(docName).collection("users");

  const fetchSize = Math.max(limit * 5, 50);

  const snap = await ref
    .orderBy("chatCount", "desc")
    .orderBy("score", "desc")
    .limit(fetchSize)
    .get();

  const mergedMap = new Map();

  /* Firestore 데이터 */
  for (const doc of snap.docs) {

    const base = doc.data();
    const uid = String(toNumber(base.userId || doc.id));

    const pending = getPendingEntry(docName, uid);

    mergedMap.set(
      uid,
      mergeBaseWithPending(base, pending, { saveLevel: false })
    );
  }

  /* pending 데이터 */
  const pendingEntries = getPendingEntriesByDocName(docName);

  for (const entry of pendingEntries) {

    const uid = String(entry.userId);

    if (!mergedMap.has(uid)) {
      mergedMap.set(
        uid,
        mergeBaseWithPending(null, entry, { saveLevel: false })
      );
    }
  }

  /* 🔥 Firestore 데이터가 하나도 없을 때도 pending으로 ranking 생성 */
  if (mergedMap.size === 0 && pendingEntries.length > 0) {

    const rows = sortRankingRows(
      pendingEntries.map(e => ({
        userId: e.userId,
        chatCount: e.chatCount,
        score: e.score
      }))
    )
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));

    queryCache.set(cacheKey, rows, RANK_CACHE_TTL_MS);
    return rows;
  }

  const rows = sortRankingRows(Array.from(mergedMap.values()))
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));

  queryCache.set(cacheKey, rows, RANK_CACHE_TTL_MS);

  return rows;
}

function sortLevelRows(rows) {
  rows.sort((a, b) => {
    const levelDiff = toNumber(b.level) - toNumber(a.level);
    if (levelDiff !== 0) return levelDiff;

    const scoreDiff = toNumber(b.score) - toNumber(a.score);
    if (scoreDiff !== 0) return scoreDiff;

    const chatDiff = toNumber(b.chatCount) - toNumber(a.chatCount);
    if (chatDiff !== 0) return chatDiff;

    return toNumber(a.userId) - toNumber(b.userId);
  });

  return rows;
}

async function getLevelRanking(limit = 5) {
  const cacheKey = ["levelRank", limit];
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  const docName = "globalTotal";
  const ref = rootDoc(docName).collection("users");
  const fetchSize = Math.max(limit * 5, 50);

  const snap = await ref
    .orderBy("level", "desc")
    .orderBy("score", "desc")
    .limit(fetchSize)
    .get();

  const mergedMap = new Map();

  for (const doc of snap.docs) {
    const base = doc.data();
    const uid = String(toNumber(base.userId || doc.id));
    const pending = getPendingEntry(docName, uid);

    mergedMap.set(uid, mergeBaseWithPending(base, pending, { saveLevel: true }));
  }

  const pendingEntries = getPendingEntriesByDocName(docName);

  for (const entry of pendingEntries) {
    const uid = String(entry.userId);
    if (!mergedMap.has(uid)) {
      mergedMap.set(uid, mergeBaseWithPending(null, entry, { saveLevel: true }));
    }
  }

  const rows = sortLevelRows(Array.from(mergedMap.values()))
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));

  queryCache.set(cacheKey, rows, RANK_CACHE_TTL_MS);
  return rows;
}

async function getUserLevel(userId) {
  const uid = String(toNumber(userId));
  const docName = "globalTotal";
  const ref = rootDoc(docName).collection("users").doc(uid);

  const snap = await ref.get();
  const base = snap.exists ? snap.data() : null;
  const pending = getPendingEntry(docName, uid);
  const merged = mergeBaseWithPending(base, pending, { saveLevel: true });

  return merged || null;
}

async function getDocData(docRef, docName, userId, options = {}) {
  const snap = await docRef.get();
  const base = snap.exists ? snap.data() : null;
  const pending = getPendingEntry(docName, String(toNumber(userId)));

  return mergeBaseWithPending(base, pending, options);
}

async function getUserChatSummary(channelId, userId) {
  const cid = toNumber(channelId);
  const uid = toNumber(userId);

  const cacheKey = ["chatSummary", cid, uid];
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  const today = getTodayKey();
  const month = getMonthKey();

  const channelDailyName = `channelDaily_${today}_${cid}`;
  const channelMonthlyName = `channelMonthly_${month}_${cid}`;
  const channelTotalName = `channelTotal_${cid}`;
  const globalDailyName = `globalDaily_${today}`;
  const globalMonthlyName = `globalMonthly_${month}`;
  const globalTotalName = `globalTotal`;

  const [
    channelDaily,
    channelMonthly,
    channelTotal,
    globalDaily,
    globalMonthly,
    globalTotal
  ] = await Promise.all([
    getDocData(rootDoc(channelDailyName).collection("users").doc(String(uid)), channelDailyName, uid),
    getDocData(rootDoc(channelMonthlyName).collection("users").doc(String(uid)), channelMonthlyName, uid),
    getDocData(rootDoc(channelTotalName).collection("users").doc(String(uid)), channelTotalName, uid),
    getDocData(rootDoc(globalDailyName).collection("users").doc(String(uid)), globalDailyName, uid),
    getDocData(rootDoc(globalMonthlyName).collection("users").doc(String(uid)), globalMonthlyName, uid),
    getDocData(rootDoc(globalTotalName).collection("users").doc(String(uid)), globalTotalName, uid, { saveLevel: true })
  ]);

  const result = {
    userId: uid,
    channelId: cid,
    channelDaily,
    channelMonthly,
    channelTotal,
    globalDaily,
    globalMonthly,
    globalTotal
  };

  queryCache.set(cacheKey, result, SUMMARY_CACHE_TTL_MS);
  return result;
}

async function getOrCreateLevelState(userId, channelId) {
  const key = String(userId);
  const cached = liveLevelState.get(key);
  if (cached) return cached;

  const ref = rootDoc("globalTotal").collection("users").doc(key);
  const snap = await ref.get();
  const base = snap.exists ? snap.data() : {};

  const state = {
    userId: Number(userId),
    channelId: Number(channelId),
    baseScore: toNumber(base.score),
    pendingScore: 0,
    pendingChatCount: 0,
    announcedLevel: toNumber(base.level || getLevel(toNumber(base.score)))
  };

  liveLevelState.set(key, state);
  return state;
}

async function getBroadcastRanking(broadcastId, limit = 5) {
  const cacheKey = ["broadcastRank", broadcastId, limit];
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;

  const docName = `broadcast_${broadcastId}`;
  const ref = rootDoc(docName).collection("users");
  const fetchSize = Math.max(limit * 5, 50);

  const snap = await ref
    .orderBy("chatCount", "desc")
    .orderBy("score", "desc")
    .limit(fetchSize)
    .get();

  const mergedMap = new Map();

  for (const doc of snap.docs) {
    const base = doc.data();
    const uid = String(toNumber(base.userId || doc.id));
    const pending = getPendingEntry(docName, uid);

    mergedMap.set(uid, mergeBaseWithPending(base, pending, { saveLevel: false }));
  }

  const pendingEntries = getPendingEntriesByDocName(docName);

  for (const entry of pendingEntries) {
    const uid = String(entry.userId);
    if (!mergedMap.has(uid)) {
      mergedMap.set(uid, mergeBaseWithPending(null, entry, { saveLevel: false }));
    }
  }

  const rows = sortRankingRows(Array.from(mergedMap.values()))
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));

  queryCache.set(cacheKey, rows, RANK_CACHE_TTL_MS);
  return rows;
}

module.exports = {
  addChat,
  flushPendingChats,
  shutdown,
  getRanking,
  getLevelRanking,
  getUserLevel,
  getUserChatSummary,
  getBroadcastRanking
};