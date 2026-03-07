// const axios = require("axios");

// const { startCollector, stopCollector } = require("../chat/collector");
// const { startSocket, stopSocket } = require("../socket/socketClient");
// const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
// const sendChat = require("../chat/sendChat");
// const streamStore = require("../store/streamStore");

// const channelState = {};
// const watchers = {};

// const LIVE_CHECK_INTERVAL = 3000;

// /**
//  * 방송 상태 확인
//  */
// async function isLive(channelId) {

//   try {

//     const res = await axios.get(
//       `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
//       {
//         headers: {
//           "x-site-code": "ttinglive"
//         }
//       }
//     );

//     return res.data;

//   } catch (e) {

//     if (e.response && e.response.status === 400) {
//       return null;
//     }

//     console.error(`[${channelId}] live check error:`, e.message);
//     return null;

//   }

// }

// /**
//  * 채널 상태 체크
//  */
// async function checkChannel(channelId) {

//   const stream = await isLive(channelId);
//   const live = !!stream;
//   const prev = channelState[channelId] || false;
//   const ownerNickname = stream?.owner?.nickname;

//   // 방송 시작
//   if (live && !prev) {

//     console.log(`🔴 방송 시작: ${channelId}`);
  
//     streamStore.set(channelId, stream);
//     channelState[channelId] = true;

//     await startCollector(channelId, ownerNickname);
//     startSocket(channelId);
//     startViewerWatcher(channelId);
//     await sendChat(channelId, "✨ HARIBO AI 출근했습니다. 🧸");
//   }

//   // 방송 종료
//   if (!live && prev) {

//     console.log(`⚫ 방송 종료: ${channelId}`);

//     streamStore.remove(channelId);
//     channelState[channelId] = false;

//     stopCollector(channelId);
//     stopSocket(channelId);
//     stopViewerWatcher(channelId);

//   }

// }

// /**
//  * 채널 감시 시작 (단일 채널)
//  */
// function startLiveWatcher(channelId) {

//   if (watchers[channelId]) {
//     return;
//   }

//   console.log("liveWatcher 시작:", channelId);

//   watchers[channelId] = setInterval(async () => {

//     try {

//       await checkChannel(channelId);

//     } catch (e) {

//       console.error(`[${channelId}] liveWatcher error:`, e.message);

//     }

//   }, LIVE_CHECK_INTERVAL);

// }

// module.exports = {
//   startLiveWatcher
// };

const axios = require("axios");

const { startCollector, stopCollector } = require("../chat/collector");
const { startSocket, stopSocket } = require("../socket/socketClient");
const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
const sendChat = require("../chat/sendChat");
const streamStore = require("../store/streamStore");

const channelState = {};
const watchers = {};

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
        },
        timeout: 5000
      }
    );

    return res.data;

  } catch (e) {

    // 방송 안하는 경우
    if (e.response && e.response.status === 400) {
      return null;
    }

    // API 장애
    console.error(`[${channelId}] live check error:`, e.message);

    // undefined → 상태 변경하지 않음
    return undefined;

  }

}

/**
 * 채널 상태 체크
 */
async function checkChannel(channelId) {

  const stream = await isLive(channelId);

  // API 실패시 skip
  if (stream === undefined) {
    console.log(`[${channelId}] live check skip`);
    return;
  }

  const live = !!stream;
  const prev = channelState[channelId] || false;
  const ownerNickname = stream?.owner?.nickname;

  /* 방송 시작 */
  if (live && !prev) {

    console.log(`🔴 방송 시작: ${channelId}`);

    streamStore.set(channelId, stream);
    channelState[channelId] = true;

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

    streamStore.remove(channelId);
    channelState[channelId] = false;

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
 * 채널 감시 시작
 */
function startLiveWatcher(channelId) {

  if (watchers[channelId]) {
    return;
  }

  console.log("liveWatcher 시작:", channelId);

  watchers[channelId] = setInterval(async () => {

    try {

      console.log(`[${channelId}] watcher tick`);

      await checkChannel(channelId);

    } catch (e) {

      console.error(`[${channelId}] liveWatcher fatal:`, e);

    }

  }, LIVE_CHECK_INTERVAL);

}

/**
 * 채널 감시 중지
 */
function stopLiveWatcher(channelId) {

  if (!watchers[channelId]) return;

  clearInterval(watchers[channelId]);
  delete watchers[channelId];

  console.log("liveWatcher 중지:", channelId);

}

module.exports = {
  startLiveWatcher,
  stopLiveWatcher
};