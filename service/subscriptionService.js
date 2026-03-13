const axios = require("axios");
const auth = require("../chat/auth");
const { getCookie } = require("../chat/collector");

const BASE_URL = "https://api.ttinglive.com";
const COMMON_HEADERS = {
  "x-site-code": "ttinglive",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  origin: "https://www.ttinglive.com",
  referer: "https://www.ttinglive.com/"
};

function buildHeaders(cookie, extra = {}) {
  return {
    ...COMMON_HEADERS,
    cookie,
    ...extra
  };
}

async function getAuthorizedCookie(force = false) {
  if (!force) {
    const cached = auth.getCookie();
    if (cached) {
      return cached;
    }
  }

  return getCookie(force);
}

async function requestWithRelogin(makeRequest) {
  let cookie = await getAuthorizedCookie(false);

  try {
    return await makeRequest(cookie);
  } catch (e) {
    if (e.response?.status !== 401) {
      throw e;
    }

    cookie = await getAuthorizedCookie(true);
    return makeRequest(cookie);
  }
}

async function fetchSubscriptionList(limit = 1000) {
  const res = await requestWithRelogin((cookie) =>
    axios.get(`${BASE_URL}/api/my/subscription-list`, {
      params: { limit },
      headers: buildHeaders(cookie),
      timeout: 5000,
      validateStatus: (status) => status >= 200 && status < 300
    })
  );

  return Array.isArray(res.data?.data) ? res.data.data : [];
}

async function checkSubscribed(channelId) {
  channelId = String(channelId);

  const res = await requestWithRelogin((cookie) =>
    axios.get(`${BASE_URL}/api/subscribes/${encodeURIComponent(channelId)}/check`, {
      headers: buildHeaders(cookie),
      timeout: 5000,
      validateStatus: (status) => status === 200 || status === 204
    })
  );

  return res.status === 200;
}

async function subscribe(channelId) {
  channelId = String(channelId);

  const res = await requestWithRelogin((cookie) =>
    axios.post(
      `${BASE_URL}/api/subscribes`,
      { targetId: Number(channelId) || channelId },
      {
        headers: buildHeaders(cookie, {
          "content-type": "application/json;charset=UTF-8"
        }),
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 300
      }
    )
  );

  return res.status >= 200 && res.status < 300;
}

async function ensureSubscribed(channelId) {
  const subscribed = await checkSubscribed(channelId);

  if (subscribed) {
    return true;
  }

  return subscribe(channelId);
}

module.exports = {
  fetchSubscriptionList,
  checkSubscribed,
  subscribe,
  ensureSubscribed
};