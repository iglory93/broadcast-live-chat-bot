const { startConsumer } = require("./chat/consumer");
const { startLiveWatcher, stopLiveWatcher } = require("./live/liveWatcher");
const firebaseService = require("./service/firebaseService.js");
const config = require("./config/config");
const rankStore = require("./store/rankStore");

require("./api/server");
const startConsole = require("./console");

let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`graceful shutdown start: ${signal}`);

  try {
    await rankStore.shutdown();
  } catch (e) {
    console.error("rankStore shutdown error:", e);
  } finally {
    process.exit(0);
  }
}

async function start() {
  try {
    startConsumer();

    console.log("config :", JSON.stringify(config));

    // await firebaseService.startFirebaseService((channelId) => {
    //   console.log("채널 자동 연결:", channelId);
    //   startLiveWatcher(channelId);
    // });

    await firebaseService.startFirebaseService(
      async (channelId) => {
        console.log("채널 자동 연결:", channelId);
        await startLiveWatcher(channelId);
      },
      async (channelId) => {
        console.log("채널 자동 제거:", channelId);
        await stopLiveWatcher(channelId);
      }
    );
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

/* 종료 처리 */
process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

/* 프로세스 crash 방지 */
process.on("uncaughtException", async (err) => {
  console.error("uncaughtException:", err);
  await gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", async (err) => {
  console.error("unhandledRejection:", err);
  await gracefulShutdown("unhandledRejection");
});