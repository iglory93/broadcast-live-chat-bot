const db = require("../firebase");
const { getJoinMessage } = require("../service/firebaseService.js");

/* 입장 메시지 조회 (캐시 사용) */
function get(channelId, userId) {

  return getJoinMessage(String(channelId), String(userId));

}

/* 입장 메시지 추가 */
// async function add(channelId, userId, message) {

//   console.log("add:", channelId, userId, message);

//   await db
//     .collection("joinMessages")
//     .doc(String(channelId))
//     .collection("users")
//     .doc(String(userId))
//     .set({
//       message: message
//     });

// }

async function add(channelId, userId, message) {

  channelId = String(channelId);
  userId = String(userId);

  console.log("add:", channelId, userId, message);

  const channelRef = db.collection("joinMessages").doc(channelId);

  /* 채널 document 보장 */
  await channelRef.set(
    {
      enabled: true,
      createdAt: new Date()
    },
    { merge: true }
  );

  /* 실제 입장 메시지 */
  await channelRef
    .collection("users")
    .doc(userId)
    .set({
      message
    });

}

/* 삭제 */
async function remove(channelId, userId) {

  await db
    .collection("joinMessages")
    .doc(String(channelId))
    .collection("users")
    .doc(String(userId))
    .delete();

}

module.exports = {
  add,
  remove,
  get
};