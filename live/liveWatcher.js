const axios = require("axios");

const { startCollector, stopCollector } = require("../chat/collector");
const { startSocket, stopSocket } = require("../socket/socketClient");
const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
const streamStore = require("../store/streamStore");

const channelState = {};

const LIVE_CHECK_INTERVAL = 3000;

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
        }
      }
    );

    return res.data; // 방송 정보 전체 반환

  } catch (e) {

    if (e.response && e.response.status === 400) {
      return null;
    }

    console.error(`[${channelId}] live check error:`, e.message);
    return null;

  }

}

/**
 * 채널 하나 상태 체크
 */
async function checkChannel(channelId) {
  const stream = await isLive(channelId);
  const live = !!stream;
  const prev = channelState[channelId] || false;
  const ownerNickname = stream?.owner?.nickname;

  // 방송 시작
  if (live && !prev) {

    console.log(`🔴 방송 시작: ${channelId}`);
    streamStore.set(channelId,stream);
    channelState[channelId] = true;

    startCollector(channelId, ownerNickname);
    startSocket(channelId);
    startViewerWatcher(channelId);

  }

  // 방송 종료
  if (!live && prev) {

    console.log(`⚫ 방송 종료: ${channelId}`);
    streamStore.remove(channelId);
    channelState[channelId] = false;
    
    stopCollector(channelId);
    stopSocket(channelId);
    stopViewerWatcher(channelId);

  }

}

/**
 * 라이브 감시 시작
 */
function startLiveWatcher(channelIds) {

  console.log("liveWatcher 시작");

  setInterval(async () => {

    try {

      await Promise.all(
        channelIds.map(channelId => checkChannel(channelId))
      );

    } catch (e) {

      console.error("liveWatcher error:", e.message);

    }

  }, LIVE_CHECK_INTERVAL);

}

module.exports = {
  startLiveWatcher
};