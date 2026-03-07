// const io = require("socket.io-client");
// const queue = require("../chat/queue");

// function startSocket(channelId) {

//   const socket = io("wss://io.flextv.co.kr", {
//     path: "/socket.io",
//     transports: ["websocket"]
//   });

//   socket.on("connect", () => {

//     console.log("socket connected");

//     socket.emit("joinChannel", {
//       channelId: channelId
//     });

//   });

//   socket.onAny((event, ...args) => {

//     console.log("EVENT:", event, args);

//     // 채팅 이벤트 찾기 전까지 디버깅용
//     if (args && args[0]?.message) {

//       queue.push({
//         nickname: args[0].nickname,
//         message: args[0].message,
//         time: Date.now()
//       });

//     }

//   });

// }

// module.exports = { startSocket };
const io = require("socket.io-client");
const queue = require("../chat/queue");

const sockets = {};

function startSocket(channelId) {

  if (sockets[channelId]) {
    console.log(`[${channelId}] socket already running`);
    return;
  }

  console.log(`[${channelId}] socket connecting...`);

  const socket = io("wss://io.flextv.co.kr", {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    timeout: 10000
  });

  sockets[channelId] = socket;

  socket.on("connect", () => {

    console.log(`[${channelId}] socket connected`);

    socket.emit("joinChannel", {
      channelId: channelId
    });

  });

  socket.on("disconnect", (reason) => {

    console.log(`[${channelId}] socket disconnected:`, reason);

  });

  socket.on("connect_error", (err) => {

    console.log(`[${channelId}] socket connect error:`, err.message);

  });

  socket.onAny((event, ...args) => {

    // 디버그 로그
    console.log(`[${channelId}] EVENT:`, event);

    const data = args?.[0];

    if (!data) return;

    // 채팅 감지
    if (data.message) {

      queue.push({
        channelId,
        nickname: data.nickname,
        message: data.message,
        time: Date.now()
      });

    }

  });

}

/**
 * 소켓 종료
 */
function stopSocket(channelId) {

  const socket = sockets[channelId];

  if (!socket) return;

  socket.disconnect();

  delete sockets[channelId];

  console.log(`[${channelId}] socket stopped`);

}

module.exports = {
  startSocket,
  stopSocket
};