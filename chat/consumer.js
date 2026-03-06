const queue = require("./queue");
const commandService = require("../service/commandService");
const chatMemory = require("../store/chatMemoryStore");

function startConsumer() {

  console.log("chat consumer 시작");

  setInterval(async () => {

    while (queue.size() > 0) {

      const chat = queue.pop();

      console.log(
        `[${chat.channelId}] ${chat.nickname}: ${chat.message}`
      );

      if (chat.type === "chat") {
        chatMemory.add(chat.channelId, chat.nickname, chat.message);
      }
      //console.log("consume:", chat.message);

      await commandService.handleCommand(chat);

    }

  }, 50);

}

module.exports = { startConsumer };