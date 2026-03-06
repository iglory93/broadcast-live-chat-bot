const io = require("socket.io-client");

const socket = io("wss://io.flextv.co.kr", {
  path: "/socket.io",
  transports: ["websocket"]
});

socket.on("connect", () => {
  console.log("socket connected");
});

socket.onAny((event, ...args) => {
  console.log("EVENT:", event, args);
});