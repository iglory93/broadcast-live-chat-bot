// const axios = require("axios");
// const config = require("../config/config");
// const auth = require("./auth");

// async function sendChat(channelId, message, options = {}) {

//   let cookie = auth.getCookie();

//   if (!cookie) {
//     console.log("cookie 없음 → 재로그인");
//     cookie = await auth.login();
//     if (!cookie) return;
//   }

//   const payload = {
//     streamId: config.streamId,
//     source: "web",
//     message: message,
//     messageType: 0
//   };

//   if (options.code) {
//     payload.code = options.code;
//   }

//   try {

//     await axios.post(
//       `https://api.ttinglive.com/api/channels/${channelId}/stream/message`,
//       payload,
//       {
//         headers: {
//           "content-type": "application/json;charset=UTF-8",
//           "x-site-code": "ttinglive",
//           cookie: cookie
//         }
//       }
//     );

//   } catch (err) {

//     const status = err?.response?.status;

//     if (status === 401) {

//       console.log("cookie expired → relogin");

//       try {

//         const newCookie = await auth.login();

//         await axios.post(
//           `https://api.ttinglive.com/api/channels/${channelId}/stream/message`,
//           payload,
//           {
//             headers: {
//               "content-type": "application/json;charset=UTF-8",
//               "x-site-code": "ttinglive",
//               cookie: newCookie
//             }
//           }
//         );

//       } catch (e) {
//         console.log("sendChat retry error:", e?.response?.data || e.message);
//       }

//     } else {

//       console.log("sendChat error:", err?.response?.data || err.message);

//     }

//   }

// }

// module.exports = sendChat;

const axios = require("axios");
const auth = require("./auth");
const { getCookie } = require("./collector");
const streamStore = require("../store/streamStore");

async function doSend(channelId, cookie, payload) {
  return axios.post(
    `https://api.ttinglive.com/api/channels/${channelId}/stream/message`,
    payload,
    {
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "x-site-code": "ttinglive",
        cookie
      },
      timeout: 5000
    }
  );
}

async function sendChat(channelId, message, options = {}) {
  channelId = String(channelId);

  const streamInfo = streamStore.get(channelId);

  if (!streamInfo?.streamId) {
    console.log("sendChat skip: streamId 없음", channelId);
    return false;
  }

  let cookie = auth.getCookie();

  if (!cookie) {
    cookie = await getCookie();
  }

  if (!cookie) {
    console.log("sendChat skip: cookie 없음");
    return false;
  }

  const payload = {
    streamId: streamInfo.streamId,
    source: "web",
    message: message,
    messageType: 0
  };

  if (options.code) {
    payload.code = options.code;
  }

  try {
    await doSend(channelId, cookie, payload);
    return true;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    if (status === 401) {
      console.log("sendChat 401 → 강제 재로그인 후 재시도");

      try {
        const newCookie = await getCookie(true);
        await doSend(channelId, newCookie, payload);
        return true;
      } catch (retryErr) {
        console.log("sendChat retry error:", retryErr?.response?.data || retryErr.message);
        return false;
      }
    }

    console.log("sendChat error:", data || err.message);
    return false;
  }
}

module.exports = sendChat;