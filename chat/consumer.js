const queue = require("./queue");
const commandService = require("../service/commandService");
const chatMemory = require("../store/chatMemoryStore");
const rankStore = require("../store/rankStore");
const sendChat = require("./sendChat");
const profileCache = require("../store/profileCache");

function startConsumer() {
  console.log("chat consumer 시작");

  setInterval(async () => {
    while (queue.size() > 0) {
      const chat = queue.pop();

      console.log(`[${chat.channelId}] ${chat.nickname}: ${chat.message}`);

      if (chat.type === "chat") {
        chatMemory.add(chat.channelId, chat.nickname, chat.message);

        // 메모리 워밍업만 수행 (DB 저장 X)
        if (chat.clientChannelId && chat.nickname) {
          profileCache.warmNickname(chat.clientChannelId, chat.nickname);
        }

        try {
          //if( chat.channelId != 999846 ) {
          const levelResult = await rankStore.addChat(chat);

          if (levelResult.levelUp) {
            await sendChat(
              chat.channelId,
              `🎉 ${chat.nickname}님 레벨업! Lv.${levelResult.prevLevel} → Lv.${levelResult.nextLevel}`
            );
          }
          //} 
        } catch (err) {
          console.log("rankStore addChat error:", err.message);
        }
      }

      await commandService.handleCommand(chat);
    }
  }, 50);
}

module.exports = { startConsumer };