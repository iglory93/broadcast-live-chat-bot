const queue = require("./queue");
const commandService = require("../service/commandService");
const chatMemory = require("../store/chatMemoryStore");
const rankStore = require("../store/rankStore");
const sendChat = require("./sendChat");
const profileCache = require("../store/profileCache");

function startConsumer() {
  console.log("chat consumer 시작");

  setInterval(() => {
    let processed = 0;

    while (queue.size() > 0 && processed < 50) {
      const chat = queue.pop();
      if (!chat) break;

      processed++;

      if (chat.type === "chat") {
        chatMemory.add(chat.channelId, chat.nickname, chat.message);

        if (chat.clientChannelId && chat.nickname) {
          profileCache.warmNickname(chat.clientChannelId, chat.nickname);
        }

        rankStore.addChat(chat)
          .then(levelResult => {
            if (levelResult?.levelUp) {
              return sendChat(
                chat.channelId,
                `🎉 ${chat.nickname}님 레벨업! Lv.${levelResult.prevLevel} → Lv.${levelResult.nextLevel}`
              );
            }
          })
          .catch(err => {
            console.log("rankStore addChat error:", err.message);
          });
      }

      commandService.handleCommand(chat).catch(err => {
        console.log("commandService error:", err.message);
      });
    }
  }, 20);
}

module.exports = { startConsumer };