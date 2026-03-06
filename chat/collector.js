// const puppeteer = require("puppeteer");
// const queue = require("./queue");
// const config = require("../config/config");
// const io = require("socket.io-client");
// const auth = require("./auth");

// const sockets = {};
// const announcementCache = new Set();

// let cookieCache = null;

// async function getCookie() {

//   if (cookieCache) {
//     return cookieCache;
//   }

//   console.log("로그인 시작...");

//   // const browser = await puppeteer.launch({
//   //   headless: "new",
//   //   args: [
//   //     "--no-sandbox",
//   //     "--disable-setuid-sandbox",
//   //     "--disable-dev-shm-usage",
//   //     "--disable-gpu"
//   //   ]
//   // });
//   const browser = await puppeteer.launch({
//     headless: "new",
//     executablePath: "/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome",
//     args: [
//       "--no-sandbox",
//       "--disable-setuid-sandbox",
//       "--disable-dev-shm-usage",
//       "--disable-gpu"
//     ]
//   });

//   const page = await browser.newPage();

//   await page.goto("https://www.ttinglive.com/", {
//     waitUntil: "networkidle2"
//   });

//   await page.evaluate(async (id, pw) => {

//     await fetch("https://api.ttinglive.com/v2/api/auth/signin", {
//       method: "POST",
//       headers: {
//         "content-type": "application/json;charset=UTF-8",
//         "x-site-code": "ttinglive",
//         "origin": "https://www.ttinglive.com",
//         "referer": "https://www.ttinglive.com/",
//         "accept": "application/json"
//       },
//       credentials: "include",
//       body: JSON.stringify({
//         loginId: id,
//         password: pw,
//         device: "PCWEB"
//       })
//     });

//   }, config.ttingId, config.ttingPw);

//   const cookies = await page.cookies();

//   const cookieString = cookies
//     .map(c => `${c.name}=${c.value}`)
//     .join("; ");

//   await browser.close();

//   console.log("쿠키 수집 완료");

//   cookieCache = cookieString;

//   auth.setCookie(cookieString);

//   return cookieString;

// }

// async function startCollector(channelId, ownerNickname) {

//   if (sockets[channelId]) {
//     console.log("collector already running:", channelId);
//     return;
//   }

//   const cookieString = await getCookie();

//   console.log("socket 연결 시작:", channelId);

//   const socket = io("wss://io.flextv.co.kr", {
//     path: "/socket.io",
//     transports: ["websocket"],
//     extraHeaders: {
//       origin: "https://www.ttinglive.com",
//       cookie: cookieString
//     }
//   });

//   sockets[channelId] = socket;

//   socket.on("connect", () => {

//     console.log("socket connected:", channelId);

//     socket.emit("join", {
//       room: channelId,
//       streamId: config.streamId,
//       source: "web"
//     });

//   });

//   socket.on("event", (payload) => {

//     if (payload?.event === "STREAMS_CHANGE") {

//       const isLive = payload?.data?.isStreams;
//       const reason = payload?.data?.isStop;

//       if (isLive) {
//         console.log(`🔴 방송 시작: ${channelId}`);
//       } else {
//         console.log(`⚫ 방송 종료: ${channelId}`, reason);
//       }

//     }

//     if (payload?.event === "ANNOUNCEMENT") {

//       const nickname = payload?.data?.member?.nickname;
//       const target = payload?.data?.target;
//       const message = payload?.data?.message;

//       if (!nickname) return;

//       const key = `${nickname}-${target}-${message}`;

//       if (announcementCache.has(key)) return;

//       announcementCache.add(key);

//       setTimeout(() => {
//         announcementCache.delete(key);
//       }, 5000);

//       queue.push({
//         type: "announcement",
//         channelId,
//         ownerNickname,
//         nickname,
//         target,
//         message,
//         time: Date.now()
//       });

//     }

//   });

//   socket.on("message", (data) => {

//     if (typeof data?.message === "string" && data.message.startsWith("FX_GIFT")) {

//       const nickname = data.member?.nickname;
//       const clientChannelId = data.member?.channelId;
//       const amount = data.args?.amount;
//       const productName = data.args?.productName;

//       if (!nickname || !amount) return;

//       queue.push({
//         type: "gift",
//         channelId,
//         clientChannelId,
//         nickname,
//         amount,
//         productName,
//         time: Date.now()
//       });

//       return;
//     }

//     if (data?.message === "FX_LOTTERY_GAME_BET") {

//       const nickname = data.args.nickname;
//       const amount = data.args.amount;
//       const game = data.args.gameTypeKey;

//       if (game === "horse-racing") {

//         queue.push({
//           type: "horse_racing",
//           channelId,
//           nickname,
//           amount,
//           time: Date.now()
//         });

//       }

//       return;
//     }

//     if (data?.member) {

//       const clientChannelId = data.member?.channelId;

//       let message = data.message;

//       if (Array.isArray(message)) {
//         message = message.map(m => m?.msg || "").join(" ");
//       }

//       queue.push({
//         type: "chat",
//         channelId,
//         clientChannelId,
//         nickname: data.member.nickname,
//         message,
//         time: Date.now()
//       });

//     }

//   });

//   socket.on("disconnect", () => {
//     console.log("socket disconnected:", channelId);
//     delete sockets[channelId];
//   });

//   socket.on("connect_error", (err) => {
//     console.log("socket error:", err.message);
//   });

// }

// function stopCollector(channelId) {

//   const socket = sockets[channelId];

//   if (!socket) return;

//   console.log("collector 종료:", channelId);

//   socket.disconnect();

//   delete sockets[channelId];

// }

// module.exports = {
//   startCollector,
//   stopCollector
// };

const axios = require("axios");
const queue = require("./queue");
const config = require("../config/config");
const io = require("socket.io-client");
const auth = require("./auth");

const sockets = {};
const announcementCache = new Map();

let cookieCache = null;
let cookieExpire = 0;


if (queue.size && queue.size() > 10000) {
  console.log("queue overflow reset");
  queue.clear();  
}

/*
로그인 → 쿠키 획득
*/
async function getCookie() {

  const now = Date.now();

  if (cookieCache && now < cookieExpire) {
    return cookieCache;
  }

  console.log("팅라이브 로그인 시작");

  const client = axios.create({
    baseURL: "https://api.ttinglive.com",
    withCredentials: true,
    headers: {
      "x-site-code": "ttinglive",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36",
      "content-type": "application/json;charset=UTF-8",
      origin: "https://www.ttinglive.com",
      referer: "https://www.ttinglive.com/",
      accept: "application/json"
    }
  });

  const init = await axios.get("https://www.ttinglive.com", {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36"
    }
  });

  const initCookies = init.headers["set-cookie"] || [];
  const cookieJar = initCookies.map(c => c.split(";")[0]).join("; ");

  const res = await client.post(
    "/v2/api/auth/signin",
    {
      loginId: config.ttingId,
      password: config.ttingPw,
      device: "PCWEB"
    },
    {
      headers: {
        cookie: cookieJar
      }
    }
  );

  const loginCookies = res.headers["set-cookie"] || [];

  const cookieString = [...initCookies, ...loginCookies]
    .map(c => c.split(";")[0])
    .join("; ");

  console.log("쿠키 획득 완료");

  cookieCache = cookieString;
  cookieExpire = now + (1000 * 60 * 60);

  auth.setCookie(cookieString);

  return cookieString;
}

/*
collector 시작
*/
async function startCollector(channelId, ownerNickname) {

  if (sockets[channelId]) {
    console.log("collector already running:", channelId);
    return;
  }

  const cookieString = await getCookie();

  console.log("socket 연결 시작:", channelId);

  const socket = io("wss://io.flextv.co.kr", {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    extraHeaders: {
      origin: "https://www.ttinglive.com",
      cookie: cookieString
    }
  });

  sockets[channelId] = socket;

  socket.on("connect", () => {

    console.log("socket connected:", channelId);

    socket.emit("join", {
      room: channelId,
      streamId: config.streamId || null,
      source: "web"
    });

  });

  /*
  이벤트
  */
  socket.on("event", (payload) => {

    if (payload?.event === "STREAMS_CHANGE") {

      const isLive = payload?.data?.isStreams;
      if (payload?.data?.streamId) {
          config.streamId = payload.data.streamId;
          console.log("streamId 업데이트:", config.streamId);
      }

      if (isLive) {
        console.log(`🔴 방송 시작: ${channelId}`);
      } else {
        console.log(`⚫ 방송 종료: ${channelId}`);
      }

    }

    /*
    전광판
    */
    if (payload?.event === "ANNOUNCEMENT") {

      const nickname = payload?.data?.member?.nickname;
      const target = payload?.data?.target;
      const message = payload?.data?.message;

      if (!nickname) return;

      const key = `${nickname}-${target}-${message}`;
      const now = Date.now();

      const cached = announcementCache.get(key);

      if (cached && now - cached < 5000) return;

      announcementCache.set(key, now);

      if (announcementCache.size > 1000) {
        announcementCache.clear();
      }

      queue.push({
        type: "announcement",
        channelId,
        ownerNickname,
        nickname,
        target,
        message,
        time: now
      });

    }

  });

  /*
  채팅 이벤트
  */
  socket.on("message", (data) => {

    const now = Date.now();

    /*
    후원
    */
    if (typeof data?.message === "string" && data.message.startsWith("FX_GIFT")) {

      const nickname = data.member?.nickname;
      const clientChannelId = data.member?.channelId;
      const amount = data.args?.amount;
      const productName = data.args?.productName;

      if (!nickname || !amount) return;

      queue.push({
        type: "gift",
        channelId,
        clientChannelId,
        nickname,
        amount,
        productName,
        time: now
      });

      return;
    }

    /*
    경마
    */
    if (data?.message === "FX_LOTTERY_GAME_BET") {

      const nickname = data.args.nickname;
      const amount = data.args.amount;
      const game = data.args.gameTypeKey;

      if (game === "horse-racing") {

        queue.push({
          type: "horse_racing",
          channelId,
          nickname,
          amount,
          time: now
        });

      }

      return;
    }

    /*
    일반 채팅
    */
    if (data?.member) {

      const clientChannelId = data.member?.channelId;

      let message = data.message;

      if (Array.isArray(message)) {
        message = message.map(m => m?.msg || "").join(" ");
      }

      if (!message) return;

      queue.push({
        type: "chat",
        channelId,
        clientChannelId,
        nickname: data.member.nickname,
        message,
        time: now
      });

    }

  });

  socket.on("disconnect", (reason) => {

    console.log("socket disconnected:", channelId, reason);

    delete sockets[channelId];

    setTimeout(() => {
      startCollector(channelId, ownerNickname);
    }, 3000);

  });

  socket.on("connect_error", (err) => {

    console.log("socket error:", err.message);

  });

}

/*
collector 종료
*/
function stopCollector(channelId) {

  const socket = sockets[channelId];

  if (!socket) return;

  console.log("collector 종료:", channelId);

  socket.disconnect();

  delete sockets[channelId];

}

module.exports = {
  startCollector,
  stopCollector
};