const readline = require("readline");
const sendChat = require("./chat/sendChat");

function startConsole() {

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("line", async (input) => {

    const args = input.trim().split(" ");

    if (args[0] === "chat") {

      const channelId = args[1];
      const message = args.slice(2).join(" ");

      if (!channelId || !message) {
        console.log("사용법: chat {channelId} {message}");
        return;
      }

      await sendChat(channelId, message);

      console.log("메시지 전송:", message);
    }

  });
}

module.exports = startConsole;