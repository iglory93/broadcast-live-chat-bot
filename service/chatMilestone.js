const sendChat = require("../chat/sendChat");

const milestoneCache = new Map();

function checkChatMilestone(channelId, nickname, count) {

  const key = `${channelId}:${nickname}`;

  const last = milestoneCache.get(key) || 0;

  if (count - last < 100) return;

  milestoneCache.set(key, count);

  let message;

  if (count >= 1000) {

    message =
      `🔥 ${nickname}님 채팅 ${count}회 돌파!!\n` +
      `채팅계의 레전드 등장 👑`;

  } else {

    message =
      `🎉 ${nickname}님 채팅 ${count}회 달성!\n` +
      `채팅 요정 인정합니다 👏`;

  }

  sendChat(channelId, message);
}

module.exports = {
  checkChatMilestone
};