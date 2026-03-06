const { startConsumer } = require("./chat/consumer");
const { startLiveWatcher } = require("./live/liveWatcher");
const config = require("./config/config");

require("./api/server");
const startConsole = require("./console");

async function start() {

  try {

    startConsumer();

    console.log("config :", JSON.stringify(config));

    startLiveWatcher(config.channelIds);

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