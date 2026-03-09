const axios = require("axios");
const config = require("../config/config");
const auth = require("./auth");

async function sendChat(channelId, message, options = {}) {

  const cookie = auth.getCookie();

  if (!cookie) {
    console.log("cookie 없음");
    return;
  }

  const payload = {
    streamId: config.streamId,
    source: "web",
    message: message,
    messageType: 0
  };

  // code 옵션 추가
  if (options.code) {
    payload.code = options.code;
  }

  try {

    await axios.post(
      `https://api.ttinglive.com/api/channels/${channelId}/stream/message`,
      payload,
      {
        headers: {
          "content-type": "application/json;charset=UTF-8",
          "x-site-code": "ttinglive",
          "cookie": cookie
        }
      }
    );

  } catch (err) {

    console.log("sendChat error:", err?.response?.data || err.message);

  }

}

module.exports = sendChat;