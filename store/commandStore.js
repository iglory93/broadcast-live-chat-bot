// const db = require("../firebase");
// const { getCommand, getCommandCache } = require("../service/firebaseService.js");

// /* 명령어 조회 (캐시 사용) */
// function findCommand(channelId, name) {
//   return getCommand(String(channelId), String(name).trim());
// }

// /* 글로벌 명령어 추가 */
// async function addGlobal(key, value) {

//   await db
//     .collection("commands")
//     .doc("global")
//     .collection("list")
//     .doc(key)
//     .set({
//       response: value
//     });

// }

// /* 채널 명령어 추가 */
// async function addChannel(channelId, key, value) {

//   channelId = String(channelId);
//   key = String(key).trim();

//   const ref = db.collection("commands").doc(channelId);

//   /* 채널 document 보장 */
//   await ref.set(
//     {
//       enabled: true,
//       createdAt: new Date()
//     },
//     { merge: true }
//   );

//   /* 실제 명령어 */
//   await ref
//     .collection("list")
//     .doc(key)
//     .set({
//       response: value
//     });

// }

// /* 글로벌 삭제 */
// async function removeGlobalCommand(key) {

//   await db
//     .collection("commands")
//     .doc("global")
//     .collection("list")
//     .doc(key)
//     .delete();

// }

// /* 채널 명령어 삭제 */
// async function removeChannelCommand(channelId, key) {

//   await db
//     .collection("commands")
//     .doc(String(channelId))
//     .collection("list")
//     .doc(key)
//     .delete();

// }

// /* 목록 조회 */
// async function listCommands(channelId) {

//   const channelIdStr = String(channelId);

//   const globalSnap = await db
//     .collection("commands")
//     .doc("global")
//     .collection("list")
//     .get();

//   const channelSnap = await db
//     .collection("commands")
//     .doc(channelIdStr)
//     .collection("list")
//     .get();

//   return {
//     global: globalSnap.docs.map(d => d.id),
//     channel: channelSnap.docs.map(d => d.id)
//   };

// }

// /* 전체 명령어 조회 (AI 컨텍스트용) */
// function getAllCommands(channelId) {

//   const cache = getCommandCache();

//   channelId = String(channelId);

//   return {
//     global: cache.global || {},
//     channel: cache[channelId] || {}
//   };

// }
// module.exports = {
//   findCommand,
//   getAllCommands,
//   addGlobal,
//   addChannel,
//   removeGlobalCommand,
//   removeChannelCommand,
//   listCommands
// };

const db = require("../firebase");
const { getCommand, getCommandCache } = require("../service/firebaseService.js");

/* 명령어 조회 (캐시 사용) */
function findCommand(channelId, name) {
  return getCommand(String(channelId), String(name).trim());
}

/* 글로벌 명령어 추가 */
async function addGlobal(key, value) {
  await db
    .collection("commands")
    .doc("global")
    .collection("list")
    .doc(key)
    .set({
      response: value
    });
}

/* 채널 명령어 추가 */
async function addChannel(channelId, key, value) {
  channelId = String(channelId);
  key = String(key).trim();

  const ref = db.collection("commands").doc(channelId);

  await ref.set(
    {
      enabled: true,
      createdAt: new Date()
    },
    { merge: true }
  );

  await ref
    .collection("list")
    .doc(key)
    .set({
      response: value
    });
}

/* 글로벌 삭제 */
async function removeGlobalCommand(key) {
  await db
    .collection("commands")
    .doc("global")
    .collection("list")
    .doc(key)
    .delete();
}

/* 채널 명령어 삭제 */
async function removeChannelCommand(channelId, key) {
  await db
    .collection("commands")
    .doc(String(channelId))
    .collection("list")
    .doc(key)
    .delete();
}

/* 목록 조회 - Firestore 대신 캐시 사용 */
async function listCommands(channelId) {
  const cache = getCommandCache();
  const channelIdStr = String(channelId);

  return {
    global: Object.keys(cache.global || {}),
    channel: Object.keys(cache[channelIdStr] || {})
  };
}

/* 전체 명령어 조회 (AI 컨텍스트용) */
function getAllCommands(channelId) {
  const cache = getCommandCache();

  channelId = String(channelId);

  return {
    global: cache.global || {},
    channel: cache[channelId] || {}
  };
}

module.exports = {
  findCommand,
  getAllCommands,
  addGlobal,
  addChannel,
  removeGlobalCommand,
  removeChannelCommand,
  listCommands
};