const sendChat = require("../chat/sendChat");
const danceStore = require("../store/danceStore");

const DEFAULT_DURATION_SEC = 30;
const DEFAULT_GAP_SEC = 1;
const MIN_DURATION_SEC = 1;
const MAX_DURATION_SEC = 600;
const MIN_GAP_SEC = 1;
const MAX_GAP_SEC = 60;
const COOLDOWN_MS = 30 * 1000;

const sessions = new Map();

function now() {
  return Date.now();
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return fallback;
  }

  const int = Math.floor(num);

  if (int < min) return min;
  if (int > max) return max;
  return int;
}

function getState(channelId) {
  channelId = String(channelId);

  if (!sessions.has(channelId)) {
    sessions.set(channelId, {
      running: false,
      timeout: null,
      cooldownUntil: 0,
      startedAt: 0,
      endsAt: 0,
      cursor: 0,
      routine: [],
      gapSec: DEFAULT_GAP_SEC,
      durationSec: DEFAULT_DURATION_SEC,
      lastErrorAt: 0
    });
  }

  return sessions.get(channelId);
}

function clearTimer(state) {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
}

function finish(channelId, reason = "done") {
  const state = getState(channelId);

  clearTimer(state);

  if (!state.running && reason !== "force") {
    return;
  }

  state.running = false;
  state.cursor = 0;
  state.routine = [];
  state.startedAt = 0;
  state.endsAt = 0;
  state.cooldownUntil = now() + COOLDOWN_MS;

  console.log(`[${channelId}] dance finished: ${reason}`);
}

async function tick(channelId) {
  const state = getState(channelId);

  if (!state.running) {
    return;
  }

  const current = now();

  if (current >= state.endsAt) {
    finish(channelId, "timeout");
    return;
  }

  const routineLength = state.routine.length;

  if (!routineLength) {
    finish(channelId, "empty_routine");
    return;
  }

  const item = state.routine[state.cursor % routineLength];
  state.cursor += 1;

  try {
    await sendChat(channelId, item.message);
  } catch (err) {
    const errorAt = now();
    if (errorAt - state.lastErrorAt > 5000) {
      console.log(`[${channelId}] dance send error:`, err.message);
      state.lastErrorAt = errorAt;
    }
  }

  const remainMs = state.endsAt - now();

  if (remainMs <= 0) {
    finish(channelId, "timeout_after_send");
    return;
  }

  const nextDelay = Math.min(state.gapSec * 1000, remainMs);

  state.timeout = setTimeout(() => {
    tick(channelId).catch(err => {
      console.log(`[${channelId}] dance tick error:`, err.message);
      finish(channelId, "tick_error");
    });
  }, nextDelay);
}

function getStatus(channelId) {
  const state = getState(channelId);
  const current = now();

  return {
    running: state.running,
    cooldownSec: Math.max(0, Math.ceil((state.cooldownUntil - current) / 1000)),
    remainSec: state.running ? Math.max(0, Math.ceil((state.endsAt - current) / 1000)) : 0,
    durationSec: state.durationSec,
    gapSec: state.gapSec
  };
}

function start(channelId, options = {}) {
  channelId = String(channelId);
  const state = getState(channelId);
  const current = now();

  if (state.running) {
    return {
      ok: false,
      reason: "already_running",
      remainSec: Math.max(0, Math.ceil((state.endsAt - current) / 1000))
    };
  }

  if (current < state.cooldownUntil) {
    return {
      ok: false,
      reason: "cooldown",
      cooldownSec: Math.max(0, Math.ceil((state.cooldownUntil - current) / 1000))
    };
  }

  const routine = danceStore.getMergedRoutine(channelId);

  if (!routine.length) {
    return {
      ok: false,
      reason: "no_routine"
    };
  }

  const durationSec = clampNumber(options.durationSec, MIN_DURATION_SEC, MAX_DURATION_SEC, DEFAULT_DURATION_SEC);
  const gapSec = clampNumber(options.gapSec, MIN_GAP_SEC, MAX_GAP_SEC, DEFAULT_GAP_SEC);

  state.running = true;
  state.routine = routine;
  state.cursor = 0;
  state.gapSec = gapSec;
  state.durationSec = durationSec;
  state.startedAt = current;
  state.endsAt = current + durationSec * 1000;
  state.lastErrorAt = 0;

  tick(channelId).catch(err => {
    console.log(`[${channelId}] dance start tick error:`, err.message);
    finish(channelId, "start_tick_error");
  });

  console.log(`[${channelId}] dance started: ${durationSec}s / ${gapSec}s / ${routine.length} messages`);

  return {
    ok: true,
    durationSec,
    gapSec,
    count: routine.length
  };
}

function stop(channelId, reason = "manual") {
  channelId = String(channelId);
  const state = getState(channelId);

  if (!state.running) {
    return { ok: false, reason: "not_running" };
  }

  finish(channelId, reason);
  return { ok: true };
}

module.exports = {
  start,
  stop,
  getStatus,
  COOLDOWN_MS
};