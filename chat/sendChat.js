const axios = require("axios");
const config = require("../config/config");
const auth = require("./auth");

async function sendChat(channelId, message) {

  const cookie = auth.getCookie();

  if (!cookie) {
    console.log("cookie 없음");
    return;
  }

  await axios.post(
    `https://api.ttinglive.com/api/channels/${channelId}/stream/message`,
    {
      streamId: config.streamId,
      source: "web",
      message: message,
      messageType: 0
    },
    {
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "x-site-code": "ttinglive",
        "cookie": cookie
      }
    }
  );

}

module.exports = sendChat;