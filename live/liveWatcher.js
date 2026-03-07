const axios = require("axios");

const { startCollector, stopCollector, getCookie } = require("../chat/collector");
const { startSocket, stopSocket } = require("../socket/socketClient");
const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
const sendChat = require("../chat/sendChat");
const streamStore = require("../store/streamStore");
const auth = require("../chat/auth");

/* 채널 상태 */
const channelState = {};

/* watcher 목록 */
const runningChannels = new Set();

/**
 * 방송 상태 확인
 */
async function isLive(channelId) {

  try {

    let cookie = auth.getCookie();

    if (!cookie) {
      cookie = await getCookie();
    }

    const res = await axios.get(
      `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
      {
        headers: {
          "x-site-code": "ttinglive",
          cookie: cookie,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          accept: "application/json, text/plain, */*",
          origin: "https://www.ttinglive.com",
          referer: "https://www.ttinglive.com/"
        },
        timeout: 5000
      }
    );

    return res.data;

  } catch (e) {

    if (e.response && e.response.status === 400) {
      return null;
    }

    console.log(`[${channelId}] isLive error:`, e.message);

    return undefined;

  }

}

/**
 * 채널 상태 체크
 */
async function checkChannel(channelId) {

  const stream = await isLive(channelId);

  if (stream === undefined || stream === null) {
    //console.log("viewer polling skip", channelId);
    return;
  }

  const live = !!stream;
  const prev = channelState[channelId] || false;
  const ownerNickname = stream?.owner?.nickname;

  /**
   * 방송 시작
   */
  if (live && !prev) {

    console.log(`🔴 방송 시작: ${channelId}`);

    channelState[channelId] = true;

    streamStore.set(channelId, stream);

    try {

      await startCollector(channelId, ownerNickname);

      startSocket(channelId);

      startViewerWatcher(channelId);

      await sendChat(channelId, "✨ HARIBO AI 출근했습니다. 🧸");

    } catch (e) {

      console.error(`[${channelId}] start error:`, e);

    }

  }

  /**
   * 방송 종료
   */
  if (!live && prev) {

    console.log(`⚫ 방송 종료: ${channelId}`);

    channelState[channelId] = false;

    streamStore.remove(channelId);

    try {

      stopCollector(channelId);

      stopSocket(channelId);

      stopViewerWatcher(channelId);

    } catch (e) {

      console.error(`[${channelId}] stop error:`, e);

    }

  }

}

/**
 * 채널 watcher 루프
 */
async function watcherLoop(channelId) {

  if (!runningChannels.has(channelId)) return;

  try {

    await checkChannel(channelId);

  } catch (e) {

    console.log(`[${channelId}] watcherLoop error:`, e.message);

  }

  setTimeout(() => watcherLoop(channelId), 2000);

}

/**
 * watcher 시작
 */
function startLiveWatcher(channelId) {

  channelId = String(channelId);

  if (runningChannels.has(channelId)) {
    return;
  }

  console.log("liveWatcher 시작:", channelId);

  runningChannels.add(channelId);

  watcherLoop(channelId);

}

/**
 * watcher 종료
 */
function stopLiveWatcher(channelId) {

  channelId = String(channelId);

  if (!runningChannels.has(channelId)) return;

  console.log("liveWatcher 종료:", channelId);

  runningChannels.delete(channelId);

  delete channelState[channelId];

}

module.exports = {
  startLiveWatcher,
  stopLiveWatcher
};