const { startConsumer } = require("./chat/consumer");
const { startLiveWatcher } = require("./live/liveWatcher");
const firebaseService = require("./service/firebaseService.js");
const config = require("./config/config");

require("./api/server");
const startConsole = require("./console");

async function start() {

  try {

    startConsumer();

    console.log("config :", JSON.stringify(config));

    /* Firebase 서비스 시작 */
    await firebaseService.startFirebaseService((channelId) => {

      console.log("채널 자동 연결:", channelId);

      startLiveWatcher(channelId);

    });

    startConsole();

  } catch (e) {

    console.error("start error:", e);

  }

}

start();


/* Render sleep 방지 */
setInterval(async () => {

  try {
    await fetch("https://broadcast-live-chat-bot.onrender.com");
  } catch (e) {}

}, 300000);


/* 프로세스 crash 방지 */
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});