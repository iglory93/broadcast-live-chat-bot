// const axios = require("axios");

// const { startCollector, stopCollector, getCookie } = require("../chat/collector");
// // const { startSocket, stopSocket } = require("../socket/socketClient");
// const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
// const sendChat = require("../chat/sendChat");
// const streamStore = require("../store/streamStore");
// const auth = require("../chat/auth");
// const danceManager = require("./danceManager");

// /* 채널 상태 */
// const channelState = {};

// /* 감시 채널 목록 */
// const channels = new Set();

// /* 큐 인덱스 */
// let index = 0;

// /**
//  * 방송 상태 확인
//  */
// // async function isLive(channelId) {

// //   try {

// //     let cookie = auth.getCookie();

// //     if (!cookie) {
// //       cookie = await getCookie();
// //     }

// //     const res = await axios.get(
// //       `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
// //       {
// //         headers: {
// //           "x-site-code": "ttinglive",
// //           cookie: cookie,
// //           "user-agent":
// //             "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
// //           accept: "application/json, text/plain, */*",
// //           origin: "https://www.ttinglive.com",
// //           referer: "https://www.ttinglive.com/"
// //         },
// //         timeout: 5000
// //       }
// //     );

// //     return res.data;

// //   } catch (e) {

// //     if (e.response && e.response.status === 400) {
// //       return null;
// //     }

// //     console.log(`[${channelId}] isLive error:`, e.message);

// //     return undefined;

// //   }

// // }
// async function isLive(channelId) {

//   try {

//     let cookie = auth.getCookie();

//     if (!cookie) {
//       cookie = await getCookie();
//     }
// //console.log("cookie:", cookie);   
//     const res = await axios.get(
//       `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
//       {
//         headers: {
//           "x-site-code": "ttinglive",
//           cookie: cookie,
//           "user-agent":
//             "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
//           accept: "application/json, text/plain, */*",
//           origin: "https://www.ttinglive.com",
//           referer: "https://www.ttinglive.com/"
//         },
//         timeout: 5000
//       }
//     );

//     return res.data;

//   } catch (e) {

//     if (e.response?.status === 400) {
//       return null;
//     }

//     /* 🔥 401이면 쿠키 재로그인 */
//     if (e.response?.status === 401) {

//       console.log(`[${channelId}] cookie expired → relogin`);
//       //console.log("cookie:", cookie);   
//       //const newCookie = await getCookie();
//       const newCookie = await getCookie(true);
//       if (!newCookie) return undefined;

//       try {

//         const res = await axios.get(
//           `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
//           {
//             headers: {
//               "x-site-code": "ttinglive",
//               cookie: newCookie,
//               "user-agent":
//                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
//               accept: "application/json, text/plain, */*",
//               origin: "https://www.ttinglive.com",
//               referer: "https://www.ttinglive.com/"
//             },
//             timeout: 5000
//           }
//         );

//         return res.data;

//       } catch (err) {

//         console.log(`[${channelId}] relogin failed`, err.message);
//         return undefined;

//       }

//     }

//     console.log(`[${channelId}] isLive error:`, e.message);

//     return undefined;

//   }

// }

// /**
//  * 채널 상태 체크
//  */
// async function checkChannel(channelId) {

//   const stream = await isLive(channelId);

//   if (stream === undefined) {
//     return;
//   }

//   const live = !!stream;
//   const prev = channelState[channelId] || false;
//   const ownerNickname = stream?.owner?.nickname;

//   /**
//    * 방송 시작
//    */
//   if (live && !prev) {

//     console.log(`🔴 방송 시작: ${channelId}`);

//     channelState[channelId] = true;
//     const streamId = stream?.stream?.id;

//     if (!streamId) {
//       console.log(`[${channelId}] streamId 없음`);
//       return;
//     }
//     const broadcastId = `${channelId}_${streamId}`;
//     //streamStore.set(channelId, stream);
//     streamStore.set(channelId, {
//       raw: stream,
//       streamId,
//       broadcastId,
//       startedAt: stream?.status?.startedAt || stream?.stream?.createdAt || null,
//       title: stream?.status?.title || stream?.title || "",
//       ownerNickname: stream?.owner?.nickname || ""
//     });
//     try {

//       await startCollector(channelId, ownerNickname);

//       // startSocket(channelId);

//       startViewerWatcher(channelId);

//       await sendChat(channelId, "✨ HARIBO AI 출근했습니다. 🧸");

//     } catch (e) {

//       console.error(`[${channelId}] start error:`, e);

//     }

//   }

//   /**
//    * 방송 종료
//    */
//   if (!live && prev) {

//     console.log(`⚫ 방송 종료: ${channelId}`);

//     channelState[channelId] = false;

//     streamStore.remove(channelId);

//     try {

//       stopCollector(channelId);

//       // stopSocket(channelId);

//       stopViewerWatcher(channelId);
//       danceManager.stop(channelId, "live_end");

//     } catch (e) {

//       console.error(`[${channelId}] stop error:`, e);

//     }

//   }

// }

// /**
//  * watcher 루프
//  */
// async function watcherLoop() {

//   const list = [...channels];

//   if (list.length === 0) {

//     setTimeout(watcherLoop, 2000);
//     return;

//   }

//   const channelId = list[index % list.length];

//   index++;

//   try {

//     await checkChannel(channelId);

//   } catch (e) {

//     console.log(`[${channelId}] watcherLoop error:`, e.message);

//   }

//   setTimeout(watcherLoop, 2000);

// }

// /**
//  * watcher 시작
//  */
// async function startLiveWatcher(channelId) {

//   channelId = String(channelId);

//   if (channels.has(channelId)) {
//     return;
//   }

//   console.log("liveWatcher 등록:", channelId);

//   channels.add(channelId);

// }

// /**
//  * watcher 종료
//  */
// // function stopLiveWatcher(channelId) {

// //   channelId = String(channelId);

// //   if (!channels.has(channelId)) {
// //     return;
// //   }

// //   console.log("liveWatcher 제거:", channelId);

// //   channels.delete(channelId);

// //   delete channelState[channelId];

// // }
// async function stopLiveWatcher(channelId) {

//   channelId = String(channelId);

//   if (!channels.has(channelId)) {
//     return;
//   }

//   console.log("liveWatcher 제거:", channelId);

//   channels.delete(channelId);
//   const wasLive = streamStore.isLive(channelId);

//   try {

//     if (wasLive) {
//       await sendChat(channelId, "🫡 하리보 AI 퇴근합니다 충성!");
//     }

//   } catch (e) {

//     console.log(`[${channelId}] farewell send error:`, e.message);

//   }

//   delete channelState[channelId];


//   try {

//     /* 방송 강제 종료 */
//     stopCollector(channelId);

//     stopViewerWatcher(channelId);

//     danceManager.stop(channelId, "channel_removed");

//     streamStore.remove(channelId);
    
//   } catch (e) {

//     console.log(`[${channelId}] force stop error:`, e.message);

//   }

// }

// /* watcher 시작 */
// watcherLoop();

// module.exports = {
//   startLiveWatcher,
//   stopLiveWatcher
// };

const axios = require("axios");

const { startCollector, stopCollector, getCookie } = require("../chat/collector");
const { startViewerWatcher, stopViewerWatcher } = require("./viewerWatcher");
const sendChat = require("../chat/sendChat");
const streamStore = require("../store/streamStore");
const auth = require("../chat/auth");
const danceManager = require("./danceManager");
const { fetchSubscriptionList, ensureSubscribed } = require("../service/subscriptionService");

const channelState = {};
const channels = new Set();

const WATCH_INTERVAL_MS = 10000;
const SUBSCRIPTION_LIMIT = 1000;
const REPAIR_SUBSCRIBE_INTERVAL_MS = 60000;

let loopStarted = false;
let lastRepairAt = 0;

async function fetchStreamDetail(channelId) {
  const request = async (cookie) => {
    const res = await axios.get(
      `https://api.ttinglive.com/api/channels/${channelId}/stream?option=all`,
      {
        headers: {
          "x-site-code": "ttinglive",
          cookie,
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          accept: "application/json, text/plain, */*",
          origin: "https://www.ttinglive.com",
          referer: "https://www.ttinglive.com/"
        },
        timeout: 5000
      }
    );

    return res.data;
  };

  try {
    let cookie = auth.getCookie();

    if (!cookie) {
      cookie = await getCookie();
    }

    return await request(cookie);
  } catch (e) {
    if (e.response?.status === 400) {
      return null;
    }

    if (e.response?.status === 401) {
      console.log(`[${channelId}] cookie expired → relogin`);

      try {
        const newCookie = await getCookie(true);

        if (!newCookie) {
          return undefined;
        }

        return await request(newCookie);
      } catch (err) {
        console.log(`[${channelId}] relogin failed`, err.message);
        return undefined;
      }
    }

    console.log(`[${channelId}] fetchStreamDetail error:`, e.message);
    return undefined;
  }
}

// async function startLiveChannel(channelId, listItem) {
//   const stream = await fetchStreamDetail(channelId);

//   if (!stream) {
//     if (stream === null) {
//       console.log(`[${channelId}] subscription-list 에서는 live 이지만 stream 상세는 없음`);
//     }
//     return;
//   }

//   const streamId = stream?.stream?.id;

//   if (!streamId) {
//     console.log(`[${channelId}] streamId 없음`);
//     return;
//   }

//   channelState[channelId] = true;

//   streamStore.set(channelId, {
//     raw: stream,
//     streamId,
//     broadcastId: `${channelId}_${streamId}`,
//     startedAt: stream?.status?.startedAt || stream?.stream?.createdAt || null,
//     title: stream?.status?.title || listItem?.title || stream?.title || "",
//     ownerNickname: stream?.owner?.nickname || listItem?.user?.nickname || ""
//   });

//   console.log(`🔴 방송 시작: ${channelId}`);

//   try {
//     await startCollector(channelId, stream?.owner?.nickname || listItem?.user?.nickname || "");
//     startViewerWatcher(channelId);
//     await sendChat(channelId, "✨ HARIBO AI 출근했습니다. 🧸");
//   } catch (e) {
//     console.error(`[${channelId}] start error:`, e);
//   }
// }
async function startLiveChannel(channelId, listItem) {
  const stream = await fetchStreamDetail(channelId);

  if (!stream) {
    if (stream === null) {
      console.log(`[${channelId}] subscription-list 에서는 live 이지만 stream 상세는 없음`);
    }
    return;
  }

  const streamId = stream?.stream?.id;

  if (!streamId) {
    console.log(`[${channelId}] streamId 없음`);
    return;
  }

  streamStore.set(channelId, {
    raw: stream,
    streamId,
    broadcastId: `${channelId}_${streamId}`,
    startedAt: stream?.status?.startedAt || stream?.stream?.createdAt || null,
    title: stream?.status?.title || listItem?.title || stream?.title || "",
    ownerNickname: stream?.owner?.nickname || listItem?.user?.nickname || ""
  });

  console.log(`🔴 방송 시작: ${channelId}`);

  try {
    await startCollector(channelId, stream?.owner?.nickname || listItem?.user?.nickname || "");
    startViewerWatcher(channelId);
    await sendChat(channelId, "✨ HARIBO AI 출근했습니다. 🧸");

    channelState[channelId] = true;
  } catch (e) {
    console.error(`[${channelId}] start error:`, e);
    streamStore.remove(channelId);
    stopCollector(channelId);
    stopViewerWatcher(channelId);
    delete channelState[channelId];
  }
}

// async function stopLiveChannel(channelId) {
//   channelState[channelId] = false;

//   console.log(`⚫ 방송 종료: ${channelId}`);

//   streamStore.remove(channelId);

//   try {
//     stopCollector(channelId);
//     stopViewerWatcher(channelId);
//     danceManager.stop(channelId, "live_end");
//   } catch (e) {
//     console.error(`[${channelId}] stop error:`, e);
//   }
// }
async function stopLiveChannel(channelId) {
  console.log(`⚫ 방송 종료: ${channelId}`);

  try {
    stopCollector(channelId);
    stopViewerWatcher(channelId);
    danceManager.stop(channelId, "live_end");
  } catch (e) {
    console.error(`[${channelId}] stop error:`, e);
  } finally {
    streamStore.remove(channelId);
    channelState[channelId] = false;
  }
}

async function repairSubscriptions(subscriptionRows) {
  const now = Date.now();

  if (now - lastRepairAt < REPAIR_SUBSCRIBE_INTERVAL_MS) {
    return;
  }

  lastRepairAt = now;

  const subscribedSet = new Set(
    (subscriptionRows || []).map((row) => String(row.channelId))
  );

  for (const channelId of channels) {
    if (subscribedSet.has(String(channelId))) {
      continue;
    }

    try {
      const ok = await ensureSubscribed(channelId);

      if (ok) {
        console.log(`[${channelId}] channels 기준으로 즐겨찾기 동기화 완료`);
      } else {
        console.log(`[${channelId}] 즐겨찾기 동기화 실패`);
      }
    } catch (e) {
      console.log(`[${channelId}] 즐겨찾기 동기화 error:`, e.message);
    }
  }
}

async function watcherLoop() {
  try {
    const list = [...channels];

    if (list.length > 0) {
      const subscriptionRows = await fetchSubscriptionList(SUBSCRIPTION_LIMIT);
      const liveMap = new Map(subscriptionRows.map((row) => [String(row.channelId), row]));

      if (subscriptionRows.length >= SUBSCRIPTION_LIMIT) {
        console.log(`[liveWatcher] subscription-list limit(${SUBSCRIPTION_LIMIT}) 도달 - 페이지 처리 필요 여부 확인 필요`);
      }

      await repairSubscriptions(subscriptionRows);

      // for (const channelId of list) {
      //   const row = liveMap.get(String(channelId));
      //   const live = !!row?.isInLive;
      //   const prev = !!channelState[channelId];

      //   if (live && !prev) {
      //     await startLiveChannel(channelId, row);
      //     continue;
      //   }

      //   if (!live && prev) {
      //     await stopLiveChannel(channelId);
      //   }
      // }
      for (const channelId of list) {
        const row = liveMap.get(String(channelId));
        const prev = !!channelState[channelId];

        /* 목록에 없으면 즉시 종료 판단하지 않음 */
        // if (!row) {
        //   console.log(`[${channelId}] subscription-list 에 없음 -> 이번 주기는 상태 판단 보류`);
        //   continue;
        // }

        if (!row) {
          if (prev) {
            console.log(`[${channelId}] 목록 누락 -> 상세 API로 재확인`);
            const stream = await fetchStreamDetail(channelId);

            if (stream === null) {
              await stopLiveChannel(channelId);
            }
          }
          continue;
        }
        const live = !!row.isInLive;

        if (live && !prev) {
          await startLiveChannel(channelId, row);
          continue;
        }

        if (!live && prev) {
          await stopLiveChannel(channelId);
        }
      }
    }
  } catch (e) {
    console.log("watcherLoop error:", e.message);
  } finally {
    setTimeout(watcherLoop, WATCH_INTERVAL_MS);
  }
}

function ensureLoopStarted() {
  if (loopStarted) {
    return;
  }

  loopStarted = true;
  watcherLoop();
}

async function startLiveWatcher(channelId) {
  channelId = String(channelId);

  if (channels.has(channelId)) {
    return;
  }

  console.log("liveWatcher 등록:", channelId);
  channels.add(channelId);

  try {
    const subscribed = await ensureSubscribed(channelId);

    if (!subscribed) {
      console.log(`[${channelId}] 즐겨찾기 등록 실패 - 다음 동기화 루프에서 재시도`);
    }
  } catch (e) {
    console.log(`[${channelId}] ensureSubscribed error:`, e.message);
  }
}

async function stopLiveWatcher(channelId) {
  channelId = String(channelId);

  if (!channels.has(channelId)) {
    return;
  }

  console.log("liveWatcher 제거:", channelId);

  channels.delete(channelId);
  const wasLive = streamStore.isLive(channelId);

  try {
    if (wasLive) {
      await sendChat(channelId, "🫡 하리보 AI 퇴근합니다 충성!");
    }
  } catch (e) {
    console.log(`[${channelId}] farewell send error:`, e.message);
  }

  delete channelState[channelId];

  try {
    stopCollector(channelId);
    stopViewerWatcher(channelId);
    danceManager.stop(channelId, "channel_removed");
    streamStore.remove(channelId);
  } catch (e) {
    console.log(`[${channelId}] force stop error:`, e.message);
  }
}

ensureLoopStarted();

module.exports = {
  startLiveWatcher,
  stopLiveWatcher
};