const axios = require("axios");

const { startCollector, stopCollector, getCookie } = require("../chat/collector");
// const { startSocket, stopSocket } = require("../socket/socketClient");
const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
const sendChat = require("../chat/sendChat");
const streamStore = require("../store/streamStore");
const auth = require("../chat/auth");
const danceManager = require("./danceManager");

/* 채널 상태 */
const channelState = {};

/* 감시 채널 목록 */
const channels = new Set();

/* 큐 인덱스 */
let index = 0;

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

  if (stream === undefined) {
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
    const streamId = stream?.stream?.id;
    const broadcastId = `${channelId}_${streamId}`;
    //streamStore.set(channelId, stream);
    streamStore.set(channelId, {
      raw: stream,
      streamId,
      broadcastId,
      startedAt: stream?.status?.startedAt || stream?.stream?.createdAt || null,
      title: stream?.status?.title || stream?.title || "",
      ownerNickname: stream?.owner?.nickname || ""
    });
    try {

      await startCollector(channelId, ownerNickname);

      // startSocket(channelId);

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

      // stopSocket(channelId);

      stopViewerWatcher(channelId);
      danceManager.stop(channelId, "live_end");

    } catch (e) {

      console.error(`[${channelId}] stop error:`, e);

    }

  }

}

/**
 * watcher 루프
 */
async function watcherLoop() {

  const list = [...channels];

  if (list.length === 0) {

    setTimeout(watcherLoop, 2000);
    return;

  }

  const channelId = list[index % list.length];

  index++;

  try {

    await checkChannel(channelId);

  } catch (e) {

    console.log(`[${channelId}] watcherLoop error:`, e.message);

  }

  setTimeout(watcherLoop, 1000);

}

/**
 * watcher 시작
 */
function startLiveWatcher(channelId) {

  channelId = String(channelId);

  if (channels.has(channelId)) {
    return;
  }

  console.log("liveWatcher 등록:", channelId);

  channels.add(channelId);

}

/**
 * watcher 종료
 */
function stopLiveWatcher(channelId) {

  channelId = String(channelId);

  if (!channels.has(channelId)) {
    return;
  }

  console.log("liveWatcher 제거:", channelId);

  channels.delete(channelId);

  delete channelState[channelId];

}

/* watcher 시작 */
watcherLoop();

module.exports = {
  startLiveWatcher,
  stopLiveWatcher
};