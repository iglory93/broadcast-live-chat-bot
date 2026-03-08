const db = require("../firebase");

/* 메모리 캐시 */
let channelCache = [];
let commandCache = {};
let joinCache = {};


/* =========================
   채널 감시
========================= */

async function watchChannels(onNewChannel) {

  db.collection("channels").onSnapshot(snapshot => {

    const ids = [];

    // snapshot.forEach(doc => {
    //   ids.push(doc.id);
    // });

    ids.push(2022)

    const newChannels = ids.filter(id => !channelCache.includes(id));

    newChannels.forEach(channelId => {

      console.log("새 채널 감지:", channelId);

      if (onNewChannel) {
        onNewChannel(channelId);
      }

    });
    console.log(ids)

    channelCache = ids;

  });

}


/* =========================
   명령어 캐시
========================= */

// async function watchCommands() {

//   console.log("commands preload start");

//   const snap = await db.collection("commands").get();
//  console.log("commands 문서 수:", snap.size);   // ⭐ 추가
//   for (const doc of snap.docs) {

//     const channelId = doc.id;

//     const sub = await db
//       .collection("commands")
//       .doc(channelId)
//       .collection("list")
//       .get();

//     const map = {};

//     sub.forEach(cmd => {
//       const key = String(cmd.id).trim();
//       map[key] = cmd.data().response;
//     });

//     commandCache[channelId] = map;

//     console.log("commands preload:", channelId, map);

//     /* realtime listener */

//     db.collection("commands")
//       .doc(channelId)
//       .collection("list")
//       .onSnapshot(sub => {

//         const map = {};

//         sub.forEach(cmd => {
//           const key = String(cmd.id).trim();
//           map[key] = cmd.data().response;
//         });

//         commandCache[channelId] = map;

//         console.log("commands updated:", channelId, map);

//       });

//   }

// }
async function watchCommands() {

  console.log("commands realtime start");

  db.collection("commands").onSnapshot(snapshot => {

    snapshot.docChanges().forEach(change => {

      const channelId = change.doc.id;

      console.log("command channel detected:", channelId);

      db.collection("commands")
        .doc(channelId)
        .collection("list")
        .onSnapshot(sub => {

          const map = {};

          sub.forEach(cmd => {
            const key = String(cmd.id).trim();
            map[key] = cmd.data().response;
          });

          commandCache[channelId] = map;

          console.log("commands updated:", channelId, map);

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

    const channelId = doc.id;

    const sub = await db
      .collection("joinMessages")
      .doc(channelId)
      .collection("users")
      .get();

    const map = {};

    sub.forEach(user => {
      map[user.id] = user.data().message;
    });

    joinCache[channelId] = map;

    console.log("join preload:", channelId);

    db.collection("joinMessages")
      .doc(channelId)
      .collection("users")
      .onSnapshot(sub => {

        const map = {};

        sub.forEach(user => {
          map[user.id] = user.data().message;
        });

        joinCache[channelId] = map;

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

// function getCommand(channelId, cmd) {

//   const key = String(cmd).trim();

//   if (commandCache[channelId] && commandCache[channelId][key]) {
//     return commandCache[channelId][key];
//   }

//   if (commandCache.global && commandCache.global[key]) {
//     return commandCache.global[key];
//   }

//   return null;

// }

function getCommand(channelId, cmd) {

  channelId = String(channelId);   // ⭐ 추가
  const key = String(cmd).trim();
console.log("cache:", commandCache);
console.log("find:", channelId, key);
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

async function startFirebaseService(onNewChannel) {
  console.log('1')
  await watchChannels(onNewChannel);
console.log('2')
  await watchCommands();
console.log('3')
  await watchJoinMessages();

  console.log("Firebase 서비스 시작");

}


module.exports = {
  startFirebaseService,
  getChannels,
  getCommand,
  getCommandCache,
  getJoinMessage
};