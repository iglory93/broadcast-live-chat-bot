const axios = require("axios");

const { startCollector, stopCollector } = require("../chat/collector");
const { startSocket, stopSocket } = require("../socket/socketClient");
const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
const sendChat = require("../chat/sendChat");
const streamStore = require("../store/streamStore");

/* 감시 채널 목록 */
let channels = [];

/* 채널 방송 상태 */
const channelState = {};

/* 큐 인덱스 */
let index = 0;

/* watcher 상태 */
let running = false;

/**
 * 채널 목록 동기화
 * 실제로는 DB / Firebase에서 가져오면 됩니다.
 */
async function syncChannels() {

  try {

    // 예시
    // const list = await db.getChannels()

    const list = [
      "2022",
      "447761"
    ];

    channels = list.map(String);

    console.log("watch channels:", channels);

  } catch (e) {

    console.error("syncChannels error:", e);

  }

}

/**
 * 방송 상태 확인
 */
async function isLive(channelId) {

  try {

    const res = await axios.get(
      `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
      {
        headers: {
          "x-site-code": "ttinglive"
        },
        timeout: 5000
      }
    );

    return res.data;

  } catch (e) {

    /* 방송 안하는 경우 */
    if (e.response && e.response.status === 400) {
      return null;
    }

    console.error(`[${channelId}] live check error:`, e.message);

    /* API 오류 */
    return undefined;

  }

}

/**
 * 채널 상태 체크
 */
async function checkChannel(channelId) {

  const stream = await isLive(channelId);

  /* API 오류 skip */
  if (stream === undefined) {
    return;
  }

  const live = !!stream;
  const prev = channelState[channelId] || false;
  const ownerNickname = stream?.owner?.nickname;

  /* 방송 시작 */
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

  /* 방송 종료 */
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
 * 큐 방식 watcher
 */
async function watcherLoop() {

  if (!running) {
    return;
  }

  try {

    if (channels.length > 0) {

      const channelId = channels[index];

      await checkChannel(channelId);

      index++;

      if (index >= channels.length) {
        index = 0;
      }

    }

  } catch (e) {

    console.error("watcherLoop error:", e);

  }

  setTimeout(watcherLoop, 2000);

}

/**
 * watcher 시작
 */
async function startLiveWatcher() {

  if (running) {
    return;
  }

  console.log("liveWatcher 시작");

  running = true;

  await syncChannels();

  /* 채널 목록 1분마다 동기화 */
  setInterval(syncChannels, 60000);

  watcherLoop();

}

/**
 * watcher 중지
 */
function stopLiveWatcher() {

  running = false;

  console.log("liveWatcher 중지");

}

module.exports = {
  startLiveWatcher,
  stopLiveWatcher
};