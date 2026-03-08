const axios = require("axios");
const sendChat = require("../chat/sendChat");
const specialJoin = require("../store/specialJoinStore");
const viewerStore = require("../store/viewerStore");
const auth = require("../chat/auth");
const { getCookie } = require("../chat/collector");

const viewersState = {};
const timers = {};

const POLL_INTERVAL = 3000;
const LEAVE_TIMEOUT = 4000;

/**
 * 시청자 목록 조회
 */
async function fetchViewers(channelId) {

  let cookie = auth.getCookie();

  if (!cookie) {
    cookie = await getCookie();
  }

  let offset = 0;
  const limit = 20;
  const viewers = [];

  while (true) {

    const res = await axios.get(
      `https://api.ttinglive.com/api/channels/${channelId}/stream/players`,
      {
        params: {
          offset,
          limit
        },
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

    const list = res.data?.list || [];

    viewers.push(...list);

    if (list.length < limit) break;

    offset += limit;

  }

  return viewers;

}

/**
 * 시청자 감시 시작
 */
function startViewerWatcher(channelId) {

  if (timers[channelId]) return;

  console.log("viewerWatcher 시작:", channelId);

  viewersState[channelId] = {};

  timers[channelId] = setInterval(async () => {

    try {

      const viewers = await fetchViewers(channelId);

      viewerStore.set(channelId, viewers);

      //console.log("viewer list:", channelId, viewers.length);

      const now = Date.now();
      const current = new Set();

      for (const v of viewers) {

        const userId = String(v.memberId || v.channelId || v.id);
        const nickname = v.nickname || "unknown";

        current.add(userId);

        let user = viewersState[channelId][userId];

        /**
         * 최초 입장
         */
        if (!user) {

          viewersState[channelId][userId] = {
            nickname,
            lastSeen: now,
            state: "joined",
            leaveCandidateAt: null
          };

          const joinMsg = specialJoin.get(channelId, userId);

          if (joinMsg) {
            await sendChat(
              channelId,
              `✨ ${joinMsg} [${nickname}]`
            );
          }

          continue;

        }

        user.lastSeen = now;

        /**
         * 재입장
         */
        if (user.state === "left") {

          console.log(`[${channelId}] 재입장: ${nickname}`);

          user.state = "joined";
          user.leaveCandidateAt = null;

          const joinMsg = specialJoin.get(channelId, userId);

          if (joinMsg) {
            await sendChat(
              channelId,
              `✨ ${joinMsg} [${nickname}]`
            );
          }

        }

      }

      /**
       * 퇴장 감지
       */
      for (const userId in viewersState[channelId]) {

        const user = viewersState[channelId][userId];

        if (!current.has(userId)) {

          if (!user.leaveCandidateAt) {
            user.leaveCandidateAt = now;
          }

          if (now - user.leaveCandidateAt > LEAVE_TIMEOUT) {

            if (user.state !== "left") {

              console.log(
                `[${channelId}] 퇴장 확정: ${user.nickname}`
              );

              user.state = "left";

            }

          }

        } else {

          user.leaveCandidateAt = null;

        }

      }

    } catch (e) {

      console.log(
        "viewerWatcher error:",
        e.message
      );

    }

  }, POLL_INTERVAL);

}

/**
 * 시청자 감시 종료
 */
function stopViewerWatcher(channelId) {

  if (!timers[channelId]) return;

  console.log("viewerWatcher 종료:", channelId);

  clearInterval(timers[channelId]);

  delete timers[channelId];
  delete viewersState[channelId];

}

module.exports = {
  startViewerWatcher,
  stopViewerWatcher
};