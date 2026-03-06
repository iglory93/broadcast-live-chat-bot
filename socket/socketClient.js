const io = require("socket.io-client");
const queue = require("../chat/queue");

function startSocket(channelId) {

  const socket = io("wss://io.flextv.co.kr", {
    path: "/socket.io",
    transports: ["websocket"]
  });

  socket.on("connect", () => {

    console.log("socket connected");

    socket.emit("joinChannel", {
      channelId: channelId
    });

  });

  socket.onAny((event, ...args) => {

    console.log("EVENT:", event, args);

    // 채팅 이벤트 찾기 전까지 디버깅용
    if (args && args[0]?.message) {

      queue.push({
        nickname: args[0].nickname,
        message: args[0].message,
        time: Date.now()
      });

    }

  });

}

module.exports = { startSocket };