const db = require("../firebase");
const danceStore = require("../store/danceStore");
const cleanStore = require("../store/cleanStore");
const noticeStore = require("../store/noticeStore");
const channelConfigStore = require("../store/channelConfigStore");


/* 메모리 캐시 */
let channelCache = [];
let commandCache = {};
let joinCache = {};

const commandUnsubs = {};
const joinUnsubs = {};

/* =========================
   채널 감시
========================= */
async function watchChannels(onNewChannel, onRemoveChannel) {

  db.collection("channels").onSnapshot(snapshot => {

    const ids = [];

    snapshot.forEach(doc => {
      ids.push(String(doc.id));
    });
    //ids.push(2022)
    /* 새 채널 */
    const newChannels = ids.filter(id => !channelCache.includes(id));

    newChannels.forEach(channelId => {

      console.log("새 채널 감지:", channelId);

      danceStore.primeScope(channelId);
      cleanStore.primeScope(channelId);
      noticeStore.primeScope(channelId);
      channelConfigStore.primeScope(channelId);

      if (onNewChannel) {
        onNewChannel(channelId);
      }

    });

    /* 삭제된 채널 */
    const removedChannels = channelCache.filter(id => !ids.includes(id));

    removedChannels.forEach(channelId => {

      console.log("채널 제거 감지:", channelId);

      if (onRemoveChannel) {
        onRemoveChannel(channelId);
      }

    });

    channelCache = ids;

  });

}

/* =========================
   명령어 캐시
========================= */
async function watchCommands() {
  console.log("commands realtime start");

  db.collection("commands").onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      const channelId = String(change.doc.id);

      if (change.type === "removed") {
        if (commandUnsubs[channelId]) {
          commandUnsubs[channelId]();
          delete commandUnsubs[channelId];
        }

        delete commandCache[channelId];
        console.log("commands removed:", channelId);
        return;
      }

      if (commandUnsubs[channelId]) {
        return;
      }

      console.log("command channel detected:", channelId);

      commandUnsubs[channelId] = db
        .collection("commands")
        .doc(channelId)
        .collection("list")
        .onSnapshot(sub => {
          const map = {};

          sub.forEach(cmd => {
            const key = String(cmd.id).trim();
            map[key] = cmd.data().response;
          });

          commandCache[channelId] = map;
          console.log("commands updated:", channelId);
        });
    });
  });
}

/* =========================
   입장 메시지 캐시
========================= */
async function watchJoinMessages() {
  console.log("join messages preload start");

  const snap = await db.collection("joinMessages").get();

  for (const doc of snap.docs) {
    const channelId = String(doc.id);

    const sub = await db
      .collection("joinMessages")
      .doc(channelId)
      .collection("users")
      .get();

    const map = {};

    sub.forEach(user => {
      map[String(user.id)] = user.data().message;
    });

    joinCache[channelId] = map;
    console.log("join preload:", channelId);

    if (joinUnsubs[channelId]) {
      continue;
    }

    joinUnsubs[channelId] = db
      .collection("joinMessages")
      .doc(channelId)
      .collection("users")
      .onSnapshot(subSnap => {
        const nextMap = {};

        subSnap.forEach(user => {
          nextMap[String(user.id)] = user.data().message;
        });

        joinCache[channelId] = nextMap;
        console.log("join messages updated:", channelId);
      });
  }
}

/* =========================
   채널 목록 조회
========================= */
function getChannels() {
  return channelCache;
}

/* =========================
   명령어 조회
========================= */
function getCommand(channelId, cmd) {
  channelId = String(channelId);
  const key = String(cmd).trim();

  if (commandCache[channelId] && commandCache[channelId][key]) {
    return commandCache[channelId][key];
  }

  if (commandCache.global && commandCache.global[key]) {
    return commandCache.global[key];
  }

  return null;
}

function getCommandCache() {
  return commandCache;
}

/* =========================
   입장 메시지 조회
========================= */
function getJoinMessage(channelId, userId) {
  channelId = String(channelId);
  userId = String(userId);

  if (joinCache[channelId] && joinCache[channelId][userId]) {
    return joinCache[channelId][userId];
  }

  if (joinCache.global && joinCache.global[userId]) {
    return joinCache.global[userId];
  }

  return null;
}

/* =========================
   초기 시작
========================= */
async function startFirebaseService(onNewChannel, onRemoveChannel) {
  await watchChannels(onNewChannel, onRemoveChannel);
  await watchCommands();
  await watchJoinMessages();

  danceStore.primeScope("global");
  cleanStore.primeScope("global");
  noticeStore.primeScope("global");
  channelConfigStore.primeScope("global");

  channelCache.forEach(channelId => {
    danceStore.primeScope(channelId);
    cleanStore.primeScope(channelId);
    noticeStore.primeScope(channelId);
    channelConfigStore.primeScope(channelId);
  });

  console.log("Firebase 서비스 시작");
}

module.exports = {
  startFirebaseService,
  getChannels,
  getCommand,
  getCommandCache,
  getJoinMessage
};