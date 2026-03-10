const sendChat = require("../chat/sendChat");

const timers = new Map();

let ticker = null;
let ticking = false;

function ensureTicker() {
  if (ticker) return;

  ticker = setInterval(() => {
    tick().catch((err) => {
      console.error("timerStore tick error:", err);
    });
  }, 1000);

  if (typeof ticker.unref === "function") {
    ticker.unref();
  }
}

function stopTickerIfIdle() {
  if (timers.size > 0) return;
  if (!ticker) return;

  clearInterval(ticker);
  ticker = null;
}

function clampSeconds(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(600, Math.floor(n)));
}

function parseDurationSeconds(input) {
  const raw = String(input || "").trim().replace(/\s+/g, "");

  if (!raw) return 0;

  // 숫자만 있으면 초
  if (/^\d+$/.test(raw)) {
    return clampSeconds(Number(raw));
  }

  let total = 0;

  const hourMatch = raw.match(/(\d+)시간/);
  const minMatch = raw.match(/(\d+)분/);
  const secMatch = raw.match(/(\d+)초/);

  if (hourMatch) total += Number(hourMatch[1]) * 3600;
  if (minMatch) total += Number(minMatch[1]) * 60;
  if (secMatch) total += Number(secMatch[1]);

  return clampSeconds(total);
}

function formatRemain(sec) {
  const remain = Math.max(0, Number(sec) || 0);

  if (remain >= 60) {
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    if (s === 0) return `${m}분`;
    return `${m}분 ${s}초`;
  }

  return `${remain}초`;
}

function getStatus(channelId) {
  const key = String(channelId);
  const item = timers.get(key);

  if (!item) {
    return {
      running: false,
      remainSec: 0
    };
  }

  const remainSec = Math.max(0, Math.ceil((item.endAt - Date.now()) / 1000));

  return {
    running: true,
    remainSec,
    startedBy: item.startedBy || ""
  };
}

function start(channelId, seconds, startedBy = "") {
  const key = String(channelId);
  const durationSec = clampSeconds(seconds);

  if (!durationSec) {
    return {
      ok: false,
      reason: "invalid_duration"
    };
  }

  const existing = getStatus(key);
  if (existing.running) {
    return {
      ok: false,
      reason: "already_running",
      remainSec: existing.remainSec
    };
  }

  timers.set(key, {
    channelId: key,
    startedBy,
    durationSec,
    endAt: Date.now() + durationSec * 1000,
    lastRemainSec: durationSec,
    lastAnnouncedSec: null
  });

  ensureTicker();

  return {
    ok: true,
    durationSec
  };
}

function stop(channelId) {
  const key = String(channelId);
  const item = timers.get(key);

  if (!item) {
    return {
      ok: false,
      reason: "not_running"
    };
  }

  timers.delete(key);
  stopTickerIfIdle();

  return {
    ok: true
  };
}

async function tick() {
  if (ticking) return;
  if (timers.size === 0) {
    stopTickerIfIdle();
    return;
  }

  ticking = true;

  try {
    const now = Date.now();
    const jobs = [];

    for (const [channelId, item] of timers.entries()) {
      const remainSec = Math.max(0, Math.ceil((item.endAt - now) / 1000));

      // 종료
      if (remainSec <= 0) {
        timers.delete(channelId);
        jobs.push(
          sendChat(channelId, "⏰ 타이머가 종료되었습니다.")
        );
        continue;
      }

      if (remainSec === item.lastRemainSec) {
        continue;
      }

      item.lastRemainSec = remainSec;

      // 5초 단위만 안내
      if (remainSec % 5 === 0 && item.lastAnnouncedSec !== remainSec) {
        item.lastAnnouncedSec = remainSec;
        jobs.push(
          sendChat(channelId, `⏳ 타이머가 ${formatRemain(remainSec)} 남았습니다.`)
        );
      }
    }

    if (jobs.length > 0) {
      await Promise.allSettled(jobs);
    }
  } finally {
    ticking = false;
    stopTickerIfIdle();
  }
}

module.exports = {
  parseDurationSeconds,
  formatRemain,
  getStatus,
  start,
  stop
};