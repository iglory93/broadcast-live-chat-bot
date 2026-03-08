const axios = require("axios");
const auth = require("../chat/auth");
const { getCookie } = require("../chat/collector");

const cache = new Map();
const pending = new Map();

const TTL_MS = 1000 * 60 * 10;      // 10분
const FAIL_TTL_MS = 1000 * 60;      // 실패 시 1분

function getCached(userId) {
  const key = String(userId);
  const item = cache.get(key);

  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.nickname;
}

function setCached(userId, nickname, ttl = TTL_MS) {
  cache.set(String(userId), {
    nickname,
    expiresAt: Date.now() + ttl
  });
}

async function fetchProfileNickname(userId) {
  let cookie = auth.getCookie();

  if (!cookie) {
    cookie = await getCookie();
  }

  const res = await axios.get(
    `https://api.ttinglive.com/api/channels/${userId}/profile`,
    {
      headers: {
        "x-site-code": "ttinglive",
        cookie,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
        accept: "application/json, text/plain, */*",
        origin: "https://www.ttinglive.com",
        referer: "https://www.ttinglive.com/"
      },
      timeout: 5000
    }
  );

  const nickname =
    res?.data?.owner?.nickname ||
    res?.data?.name ||
    String(userId);

  return String(nickname);
}

async function getNickname(userId) {
  const key = String(userId);

  const cached = getCached(key);
  if (cached) return cached;

  if (pending.has(key)) {
    return pending.get(key);
  }

  const promise = (async () => {
    try {
      const nickname = await fetchProfileNickname(key);
      setCached(key, nickname, TTL_MS);
      return nickname;
    } catch (err) {
      setCached(key, key, FAIL_TTL_MS);
      return key;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

function warmNickname(userId, nickname) {
  if (!userId || !nickname) return;
  const key = String(userId);

  if (!getCached(key)) {
    setCached(key, String(nickname), TTL_MS);
  }
}

module.exports = {
  getNickname,
  warmNickname
};