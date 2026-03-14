const axios = require("axios");
const db = require("../firebase");
const auth = require("../chat/auth");
const { getCookie } = require("../chat/collector");
const express = require("express");
const registry = require("../command/registry");
const youtubeOAuthService = require("../service/youtubeOAuthService");
const youtubeTokenStore = require("../store/youtubeTokenStore");
const streamStore = require("../store/streamStore");
const sendChat = require("../chat/sendChat");
const channelConfigStore = require("../store/channelConfigStore");
const crypto = require("crypto");
const { unsubscribe } = require("../service/subscriptionService");
const rouletteEventStore = require("../store/rouletteEventStore");
const rouletteService = require("../service/rouletteService");
const rouletteSseHub = require("../service/rouletteSseHub");
const { renderRouletteDashboardPage, renderRouletteLivePage } = require("./roulettePageRenderer");

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const admin = require("firebase-admin");

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "ttingPwd";
const DASHBOARD_COOKIE_NAME = "haribo_dashboard_auth";
const SUBADMIN_PASSWORD = process.env.SUBADMIN_PASSWORD || "dbfla0704!@#";
const SUBADMIN_COOKIE_NAME = "haribo_sub_admin_auth";
const AUTH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8시간
const authSessions = new Map();

function getCookieNameByRole(role) {
  return role === "subAdmin" ? SUBADMIN_COOKIE_NAME : DASHBOARD_COOKIE_NAME;
}

function getLoginPathByRole(role) {
  return role === "subAdmin" ? "/sub-admin/login" : "/dashboard/login";
}

function getPasswordByRole(role) {
  return role === "subAdmin" ? SUBADMIN_PASSWORD : DASHBOARD_PASSWORD;
}

function normalizeOperatorName(value, fallback = "") {
  const text = String(value || "").trim().slice(0, 40);
  return text || fallback;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};

  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  });

  return out;
}

function createAuthSession({ role, operatorName = "", ip = "", userAgent = "" }) {
  const token = crypto.randomBytes(24).toString("hex");

  authSessions.set(token, {
    role,
    operatorName,
    ip,
    userAgent,
    createdAt: Date.now(),
    expiresAt: Date.now() + AUTH_COOKIE_MAX_AGE_MS
  });

  return token;
}

function getValidAuthSession(token, role) {
  if (!token) return null;

  const data = authSessions.get(token);

  if (!data) {
    return null;
  }

  if (Date.now() > data.expiresAt) {
    authSessions.delete(token);
    return null;
  }

  if (role && data.role !== role) {
    return null;
  }

  return data;
}

function cleanupAuthSessions() {
  const now = Date.now();

  for (const [token, data] of authSessions.entries()) {
    if (now > data.expiresAt) {
      authSessions.delete(token);
    }
  }
}

function getAuthSession(req, role) {
  cleanupAuthSessions();
  const cookies = parseCookies(req);
  const token = cookies[getCookieNameByRole(role)];
  return getValidAuthSession(token, role);
}

function setAuthCookie(res, role, token) {
  res.setHeader(
    "Set-Cookie",
    `${getCookieNameByRole(role)}=${encodeURIComponent(token)}; Max-Age=${Math.floor(
      AUTH_COOKIE_MAX_AGE_MS / 1000
    )}; HttpOnly; SameSite=Lax; Path=/`
  );
}

function clearAuthCookie(res, role) {
  res.setHeader(
    "Set-Cookie",
    `${getCookieNameByRole(role)}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/`
  );
}

function requireRoleAuth(role) {
  return (req, res, next) => {
    const session = getAuthSession(req, role);

    if (session) {
      req.authSession = session;
      next();
      return;
    }

    res.redirect(getLoginPathByRole(role));
  };
}

function requireRoleAuthApi(role) {
  return (req, res, next) => {
    const session = getAuthSession(req, role);

    if (session) {
      req.authSession = session;
      next();
      return;
    }

    res.status(401).send({
      ok: false,
      error: "unauthorized"
    });
  };
}

const requireDashboardAuth = requireRoleAuth("dashboard");
const requireDashboardAuthApi = requireRoleAuthApi("dashboard");
const requireSubAdminAuth = requireRoleAuth("subAdmin");
const requireSubAdminAuthApi = requireRoleAuthApi("subAdmin");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  let ip = "";

  if (typeof forwarded === "string" && forwarded.trim()) {
    ip = forwarded.split(",")[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length) {
    ip = String(forwarded[0]).split(",")[0].trim();
  } else {
    ip = req.ip || req.socket?.remoteAddress || "";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  return ip;
}

function getActorRoleLabel(role) {
  return role === "subAdmin" ? "subAdmin" : "dashboard";
}

function getAuditActionLabel(action) {
  switch (String(action || "")) {
    case "login":
      return "접속";
    case "login_failed":
      return "접속 실패";
    case "logout":
      return "로그아웃";
    case "register":
      return "채널 등록";
    case "register_skip":
      return "채널 등록(이미 등록됨)";
    case "unregister":
      return "채널 해제";
    case "unregister_warning":
      return "채널 해제(구독해지 경고)";
    case "roulette_create":
      return "룰렛 생성";
    case "roulette_refresh":
      return "룰렛 후보 새로고침";
    case "roulette_start":
      return "룰렛 시작";
    case "roulette_stop":
      return "룰렛 정지";
    case "roulette_redraw":
      return "룰렛 다시뽑기";
    case "roulette_close":
      return "룰렛 종료";
    default:
      return String(action || "-");
  }
}
function readForwardedHeader(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
}

function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/i.test(String(host || ""));
}

function getPublicBaseUrl(req) {
  const envBase = String(process.env.PUBLIC_BASE_URL || process.env.ROULETTE_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");

  if (envBase) {
    return envBase;
  }

  const forwardedProto = readForwardedHeader(req.get("x-forwarded-proto")) || req.protocol || "http";
  const forwardedHost = readForwardedHeader(req.get("x-forwarded-host"));
  const host = forwardedHost || String(req.get("host") || "").trim();

  if (!host) {
    throw new Error("public_base_url_required");
  }

  if (isLocalHost(host)) {
    throw new Error("public_base_url_required");
  }

  return `${forwardedProto}://${host}`;
}
async function publishRouletteState(eventId) {
  const state = await rouletteService.getPublicState(eventId);

  if (state) {
    rouletteSseHub.publish(eventId, state);
  }

  return state;
}

async function writeAdminAuditLog({
  req,
  actorRole,
  operatorName,
  action,
  channelId = "",
  note = "",
  result = "ok",
  metadata = null
}) {
  try {
    await db.collection("admin_audit_logs").add({
      actorRole: actorRole || "dashboard",
      operatorName: operatorName || "",
      action: String(action || ""),
      channelId: channelId ? String(channelId) : "",
      note: note ? String(note) : "",
      result: result ? String(result) : "ok",
      ip: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
      path: req.originalUrl || req.url || "",
      method: req.method || "",
      metadata: metadata || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });
  } catch (err) {
    console.error("admin audit log error:", err.message);
  }
}

// function parseEnabledValue(value) {
//   if (typeof value === "boolean") {
//     return value;
//   }

//   if (typeof value === "number") {
//     return value === 1;
//   }

//   const text = String(value || "").trim().toLowerCase();
//   return text === "true" || text === "1" || text === "on";
// }

// function hasOwn(obj, key) {
//   return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
// }

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseEnabledValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "on";
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function formatKstDateTime(dateLike) {
  if (!dateLike) return "-";

  const date = new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}
const TTING_API_BASE = "https://api.ttinglive.com";

function normalizeChannelId(value) {
  return String(value || "").trim();
}

function parseLimit(value, defaultValue = 10, maxValue = 20) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return defaultValue;
  }

  return Math.min(Math.floor(n), maxValue);
}

function buildTtingHeaders(cookie) {
  return {
    "x-site-code": "ttinglive",
    cookie,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    accept: "application/json, text/plain, */*",
    origin: "https://www.ttinglive.com",
    referer: "https://www.ttinglive.com/"
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
  } catch (err) {
    if (err.response?.status !== 401) {
      throw err;
    }

    cookie = await getAuthorizedCookie(true);
    return makeRequest(cookie);
  }
}

async function searchChannelsByName(keyword, limit = 10) {
  const res = await requestWithRelogin((cookie) =>
    axios.get(`${TTING_API_BASE}/api/channels/searchRankings`, {
      params: {
        name: keyword,
        limit,
        liveOption: "total"
      },
      headers: buildTtingHeaders(cookie),
      timeout: 5000,
      validateStatus: (status) => status >= 200 && status < 300
    })
  );

  return Array.isArray(res.data?.data) ? res.data.data : [];
}

function buildChannelSettings(channelId, overrides = {}) {
  const status = channelConfigStore.getStatus(channelId);

  const aiEnabled = hasOwn(overrides, "ai_enabled")
    ? !!overrides.ai_enabled
    : status.aiEnabled;

  const lexNoticeEnabled = hasOwn(overrides, "lex_notice_enabled")
    ? !!overrides.lex_notice_enabled
    : status.lexNoticeEnabled;

  return [
    {
      key: "ai_enabled",
      label: "AI 기능",
      description: "채널에서 AI 반응 기능을 켜거나 끕니다.",
      enabled: aiEnabled
    },
    {
      key: "lex_notice_enabled",
      label: "렉스후원메세지",
      description: "10개 이상 렉스 후원 시 50% 확률로 방송 누적 렉스 안내 메세지를 보냅니다. 기본값은 OFF입니다.",
      enabled: lexNoticeEnabled
    }
  ];
}

async function updateChannelSetting(channelId, key, enabled) {
  const nextEnabled = !!enabled;

  switch (String(key)) {
    case "ai_enabled":
      await channelConfigStore.setAiEnabled(channelId, nextEnabled);
      return {
        chatMessage: nextEnabled
          ? "🤖 AI 기능이 켜졌어요."
          : "🙈 AI 기능이 꺼졌어요."
      };

    case "lex_notice_enabled":
      await channelConfigStore.setLexNoticeEnabled(channelId, nextEnabled);
      return {
        chatMessage: nextEnabled
          ? "💰 렉스 누적 안내 기능이 켜졌어요."
          : "💰 렉스 누적 안내 기능이 꺼졌어요."
      };

    default:
      throw new Error("invalid_setting_key");
  }
}

async function handleChannelSearch(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const limit = parseLimit(req.query.limit, 10, 20);

    if (!q) {
      res.status(400).send({
        ok: false,
        error: "q required"
      });
      return;
    }

    const items = await searchChannelsByName(q, limit);

    const results = await Promise.all(
      items.map(async (item) => {
        const channelId = normalizeChannelId(item?.id);

        let registered = false;

        if (channelId) {
          const doc = await db.collection("channels").doc(channelId).get();
          registered = doc.exists;
        }

        return {
          channelId,
          channelName: item?.name || "",
          ownerNickname: item?.owner?.nickname || "",
          loginId: item?.owner?.loginId || "",
          isInLive: !!item?.isInLive,
          playerCount: Number(item?.playerCount || 0),
          registered
        };
      })
    );

    res.send({
      ok: true,
      q,
      count: results.length,
      items: results
    });
  } catch (err) {
    console.error("channel search error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
}

async function handleChannelRegister(req, res) {
  try {
    const channelId = normalizeChannelId(req.body.channelId);

    if (!channelId) {
      res.status(400).send({
        ok: false,
        error: "channelId required"
      });
      return;
    }

    const ref = db.collection("channels").doc(channelId);
    const doc = await ref.get();
    const alreadyRegistered = doc.exists;

    if (!alreadyRegistered) {
      await ref.set({});
      console.log("channel registered:", channelId, "by", req.authSession?.role || "unknown");
    }

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: alreadyRegistered ? "register_skip" : "register",
      channelId,
      note: alreadyRegistered ? "already_registered" : "registered"
    });

    res.send({
      ok: true,
      channelId,
      registered: true,
      message: alreadyRegistered ? "already_registered" : "registered"
    });
  } catch (err) {
    console.error("channel register error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
}

async function handleChannelUnregister(req, res) {
  try {
    const channelId = normalizeChannelId(req.params.channelId);

    if (!channelId) {
      res.status(400).send({
        ok: false,
        error: "channelId required"
      });
      return;
    }

    let unsubscribed = false;
    let unsubscribeError = null;

    try {
      unsubscribed = await unsubscribe(channelId);
    } catch (err) {
      unsubscribeError = err;
      console.error("channel unsubscribe error:", channelId, err.message);
    }

    await db.collection("channels").doc(channelId).delete();

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: unsubscribeError ? "unregister_warning" : "unregister",
      channelId,
      note: unsubscribeError
        ? `unsubscribe_failed:${unsubscribeError.message}`
        : unsubscribed
          ? "unregistered_and_unsubscribed"
          : "unregistered"
    });

    console.log(
      "channel unregistered:",
      channelId,
      "unsubscribed:",
      unsubscribed,
      "by",
      req.authSession?.role || "unknown"
    );

    res.send({
      ok: true,
      channelId,
      registered: false,
      unsubscribed,
      message: unsubscribed
        ? "unregistered_and_unsubscribed"
        : "unregistered_but_unsubscribe_failed",
      warning: unsubscribeError ? unsubscribeError.message : null
    });
  } catch (err) {
    console.error("channel unregister error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
}

async function handleChannelGet(req, res) {
  try {
    const channelId = normalizeChannelId(req.params.channelId);

    if (!channelId) {
      res.status(400).send({
        ok: false,
        error: "channelId required"
      });
      return;
    }

    const doc = await db.collection("channels").doc(channelId).get();

    res.send({
      ok: true,
      channelId,
      registered: doc.exists
    });
  } catch (err) {
    console.error("channel get error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
}

app.get("/dashboard/channel-search", requireDashboardAuthApi, handleChannelSearch);
app.post("/dashboard/channels/register", requireDashboardAuthApi, handleChannelRegister);
app.delete("/dashboard/channels/:channelId", requireDashboardAuthApi, handleChannelUnregister);
app.get("/dashboard/channels/:channelId", requireDashboardAuthApi, handleChannelGet);

app.get("/sub-admin/channel-search", requireSubAdminAuthApi, handleChannelSearch);
app.post("/sub-admin/channels/register", requireSubAdminAuthApi, handleChannelRegister);
app.delete("/sub-admin/channels/:channelId", requireSubAdminAuthApi, handleChannelUnregister);
app.get("/sub-admin/channels/:channelId", requireSubAdminAuthApi, handleChannelGet);

app.get("/dashboard/roulette", requireDashboardAuth, (req, res) => {
  res.send(renderRouletteDashboardPage({
    operatorName: req.authSession?.operatorName || "dashboard"
  }));
});

app.get("/dashboard/api/roulette/current", requireDashboardAuthApi, async (req, res) => {
  try {
    const event = await rouletteEventStore.getCurrentEvent();
    const data = event ? await rouletteService.getPublicState(event.id) : null;
    res.send({ ok: true, event: data });
  } catch (err) {
    console.error("roulette current error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});

app.post("/dashboard/api/roulette/create", requireDashboardAuthApi, async (req, res) => {
  try {
    const current = await rouletteEventStore.getCurrentEvent();

    if (current && current.status && current.status !== "closed") {
      res.status(409).send({
        ok: false,
        error: "active_event_exists",
        eventId: current.id
      });
      return;
    }

    const event = await rouletteService.createRouletteEvent({
      title: req.body.title,
      sponsorName: req.body.sponsorName,
      prizeText: req.body.prizeText,
      createdBy: req.authSession?.operatorName || req.authSession?.role || "dashboard"
    });

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: "roulette_create",
      note: `eventId=${event.id}, candidates=${Number(event.candidateCount || event.candidates?.length || 0)}`
    });

    const state = await publishRouletteState(event.id);

    res.send({
      ok: true,
      event: state || event
    });
  } catch (err) {
    console.error("roulette create error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});

app.post("/dashboard/api/roulette/:eventId/start", requireDashboardAuthApi, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      res.status(400).send({ ok: false, error: "eventId required" });
      return;
    }

    console.log("[roulette] POST /dashboard/api/roulette/:eventId/start", { eventId });
    const updated = await rouletteService.startEvent(eventId);

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: "roulette_start",
      note: `eventId=${eventId}`
    });

    const state = await publishRouletteState(eventId);

    res.send({
      ok: true,
      event: state || updated
    });
  } catch (err) {
    console.error("roulette start error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});
app.post("/dashboard/api/roulette/:eventId/stop", requireDashboardAuthApi, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      res.status(400).send({ ok: false, error: "eventId required" });
      return;
    }

    console.log("[roulette] POST /dashboard/api/roulette/:eventId/stop", { eventId });
    const updated = await rouletteService.stopEvent(eventId);

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: "roulette_stop",
      note: `eventId=${eventId}, winner=${updated?.winnerNickname || updated?.winnerChannelId || "-"}`
    });

    const state = await publishRouletteState(eventId);

    setTimeout(() => {
      publishRouletteState(eventId).catch((err) => {
        console.error("roulette finish publish error:", err);
      });
    }, Number(updated?.stopDurationMs || 6500) + 120);

    res.send({
      ok: true,
      event: state || updated
    });
  } catch (err) {
    console.error("roulette stop error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});
app.get("/dashboard/api/roulette/:eventId/share", requireDashboardAuthApi, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      res.status(400).send({ ok: false, error: "eventId required" });
      return;
    }

    const event = await rouletteEventStore.getEventById(eventId);

    if (!event) {
      res.status(404).send({ ok: false, error: "event_not_found" });
      return;
    }

    const baseUrl = getPublicBaseUrl(req);
    const token = String(event.shareToken || "");
    const url = `${baseUrl}/roulette/live/${encodeURIComponent(eventId)}?token=${encodeURIComponent(token)}`;

    res.send({
      ok: true,
      eventId,
      token,
      url
    });
  } catch (err) {
    console.error("roulette share error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});

app.post("/dashboard/api/roulette/:eventId/close", requireDashboardAuthApi, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      res.status(400).send({ ok: false, error: "eventId required" });
      return;
    }

    const updated = await rouletteService.closeEvent(eventId);

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: "roulette_close",
      note: `eventId=${eventId}`
    });

    const state = await publishRouletteState(eventId);

    res.send({
      ok: true,
      event: state || updated
    });
  } catch (err) {
    console.error("roulette close error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});

app.post("/dashboard/api/roulette/:eventId/redraw", requireDashboardAuthApi, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      res.status(400).send({ ok: false, error: "eventId required" });
      return;
    }

    const updated = await rouletteService.redrawEvent(eventId);

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: "roulette_redraw",
      note: `eventId=${eventId}, winner=${updated?.winnerNickname || updated?.winnerChannelId || "-"}`
    });

    const state = await publishRouletteState(eventId);

    res.send({
      ok: true,
      event: state || updated
    });
  } catch (err) {
    console.error("roulette redraw error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});

app.post("/dashboard/api/roulette/:eventId/refresh-candidates", requireDashboardAuthApi, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      res.status(400).send({ ok: false, error: "eventId required" });
      return;
    }

    const updated = await rouletteService.refreshCandidates(eventId);

    await writeAdminAuditLog({
      req,
      actorRole: req.authSession?.role,
      operatorName: req.authSession?.operatorName,
      action: "roulette_refresh",
      note: `eventId=${eventId}, candidates=${Number(updated?.candidateCount || 0)}`
    });

    const state = await publishRouletteState(eventId);

    res.send({
      ok: true,
      event: state || updated
    });
  } catch (err) {
    console.error("roulette refresh error:", err);
    res.status(500).send({ ok: false, error: err.message });
  }
});

app.get("/roulette/live/:eventId", async (req, res) => {
  const eventId = String(req.params.eventId || "");
  const token = String(req.query.token || "");

  const event = await rouletteService.validateViewerToken(eventId, token);

  if (!event) {
    res.status(403).send("invalid token");
    return;
  }

  res.send(renderRouletteLivePage({ eventId, token }));
});

app.get("/api/public/roulette/:eventId", async (req, res) => {
  const eventId = String(req.params.eventId || "");
  const token = String(req.query.token || "");

  const event = await rouletteService.validateViewerToken(eventId, token);

  if (!event) {
    res.status(403).send({ ok: false, error: "forbidden" });
    return;
  }

  const state = await rouletteService.getPublicState(eventId);

  res.send({
    ok: true,
    event: state
  });
});

app.get("/api/public/roulette/:eventId/stream", async (req, res) => {
  const eventId = String(req.params.eventId || "");
  const token = String(req.query.token || "");

  const event = await rouletteService.validateViewerToken(eventId, token);

  if (!event) {
    res.status(403).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  res.write("retry: 3000\n\n");

  const initialState = await rouletteService.getPublicState(eventId);
  if (initialState) {
    res.write(`event: state\ndata: ${JSON.stringify(initialState)}\n\n`);
  }

  rouletteSseHub.addClient(eventId, res);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (err) {}
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    rouletteSseHub.removeClient(eventId, res);
  });
});

app.get("/dashboard/audit-logs", requireDashboardAuthApi, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 50, 100);
    const cursor = String(req.query.cursor || "").trim();

    let query = db
      .collection("admin_audit_logs")
      .orderBy("createdAtMs", "desc");

    if (cursor) {
      const cursorDoc = await db.collection("admin_audit_logs").doc(cursor).get();

      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.limit(limit).get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data() || {};

      return {
        id: doc.id,
        actorRole: data.actorRole || "dashboard",
        actorRoleLabel: getActorRoleLabel(data.actorRole),
        operatorName: data.operatorName || "",
        actorLabel: data.ip || data.operatorName || getActorRoleLabel(data.actorRole),
        action: data.action || "",
        actionLabel: getAuditActionLabel(data.action),
        channelId: data.channelId || "",
        note: data.note || "",
        result: data.result || "ok",
        ip: data.ip || "",
        userAgent: data.userAgent || "",
        createdAtMs: Number(data.createdAtMs || 0)
      };
    });

    const lastDoc = snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null;

    res.send({
      ok: true,
      count: items.length,
      items,
      nextCursor: lastDoc ? lastDoc.id : "",
      hasMore: snapshot.docs.length === limit
    });
  } catch (err) {
    console.error("dashboard audit logs error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
});

app.get("/players", (req, res) => {
  try {
    const players = streamStore.getAll();

    res.send({
      count: players.length,
      players
    });
  } catch (err) {
    console.error("players error:", err);

    res.status(500).send({
      error: err.message
    });
  }
});

app.post("/command", (req, res) => {
  const { grep, output } = req.body;

  registry.register(new RegExp(grep), async () => {
    console.log("bot reply:", output);
  });

  res.send({ result: "ok" });
});

app.get("/youtube/auth/start", async (req, res) => {
  try {
    const channelId = String(req.query.channelId || "").trim();

    if (!channelId) {
      res.status(400).send("channelId is required");
      return;
    }

    const url = youtubeOAuthService.getAuthUrl(channelId);
    res.redirect(url);
  } catch (err) {
    console.error("youtube auth start error", err);
    res.status(500).send("youtube auth start error: " + err.message);
  }
});

app.get("/youtube/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const result = await youtubeOAuthService.handleOAuthCallback(code, state);

    res.send(`
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>YouTube 연결 완료</title>
        </head>
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>유튜브 연결 완료</h2>
          <p>채널: ${escapeHtml(result.channelId)}</p>
          <p>Google 계정: ${escapeHtml(result.googleEmail || "확인 불가")}</p>
          <p>신청곡 플레이리스트: ${escapeHtml(result.playlistTitle)}</p>
          <p>이제 채팅에서 !신청 가수-노래 를 사용할 수 있습니다.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("youtube auth callback error", err);
    res.status(500).send(`OAuth 처리 실패: ${err.message}`);
  }
});

app.get("/youtube/status/:channelId", async (req, res) => {
  try {
    const data = await youtubeTokenStore.getToken(req.params.channelId);

    res.send({
      connected: !!(data && data.enabled && data.refreshTokenEnc),
      playlistId: data?.playlistId || null,
      playlistTitle: data?.playlistTitle || null,
      googleEmail: data?.googleEmail || null
    });
  } catch (err) {
    console.error("youtube status error", err);
    res.status(500).send({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.send({ status: "ok" });
});

/* 채널 설정 조회 */
app.get("/dashboard/channel/:channelId/settings", requireDashboardAuthApi, async (req, res) => {
  try {
    const channelId = String(req.params.channelId || "").trim();

    if (!channelId) {
      res.status(400).send({
        ok: false,
        error: "channelId required"
      });
      return;
    }

    const player = streamStore.getAll().find((item) => String(item.channelId) === channelId);

    res.send({
      ok: true,
      channelId,
      channelName: player?.ownerNickname || null,
      settings: buildChannelSettings(channelId)
    });
  } catch (err) {
    console.error("dashboard channel settings error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
});

function renderLoginPage({ title, description, action, error = "", accentColor = "#ff4d6d" }) {
  return `
    <html lang="ko">
      <head>
        <meta charset="utf-8"/>
        <title>${escapeHtml(title)}</title>
        <style>
          body{
            margin:0;
            background:#0f0f0f;
            color:#fff;
            font-family:Arial,sans-serif;
            display:flex;
            align-items:center;
            justify-content:center;
            min-height:100vh;
          }
          .card{
            width:360px;
            background:#171717;
            border:1px solid #2a2a2a;
            border-radius:16px;
            padding:28px;
            box-shadow:0 10px 30px rgba(0,0,0,0.35);
          }
          h1{
            margin:0 0 10px 0;
            font-size:24px;
          }
          p{
            color:#bbb;
            font-size:14px;
            margin:0 0 18px 0;
            line-height:1.5;
          }
          input{
            width:100%;
            box-sizing:border-box;
            padding:12px 14px;
            border-radius:10px;
            border:1px solid #333;
            background:#111;
            color:#fff;
            font-size:15px;
            margin-bottom:12px;
          }
          button{
            width:100%;
            padding:12px 14px;
            border:none;
            border-radius:10px;
            background:${accentColor};
            color:#fff;
            font-weight:bold;
            cursor:pointer;
          }
          .hint{
            margin-top:-2px;
            margin-bottom:14px;
            color:#8f8f8f;
            font-size:12px;
            line-height:1.5;
          }
          .error{
            margin-top:12px;
            color:#ff8f8f;
            font-size:13px;
          }
        </style>
      </head>
      <body>
        <form class="card" method="post" action="${escapeHtml(action)}">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="hint">접속 및 작업 이력은 IP 기준으로 dashboard 로그에 기록됩니다.</div>
          <input type="text" name="operatorName" placeholder="작업자명" maxlength="40" required />
          <input type="password" name="password" placeholder="비밀번호 입력" autofocus required />
          <button type="submit">입장</button>
          ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        </form>
      </body>
    </html>
  `;
}
function renderSubAdminPage({ clientIp = "" }) {
  return `
    <html lang="ko">
      <head>
        <meta charset="utf-8"/>
        <title>HARIBO SubAdmin</title>
        <style>
          body{
            background:#0f0f0f;
            color:#fff;
            font-family:Arial, sans-serif;
            padding:30px;
          }
          .topbar{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:16px;
            margin-bottom:20px;
          }
          .sub{
            color:#aaa;
            font-size:13px;
            margin-top:6px;
            line-height:1.6;
          }
          .card{
            background:#171717;
            border:1px solid #2d2d2d;
            border-radius:12px;
            padding:20px;
            margin-bottom:24px;
            max-width:980px;
          }
          .label{
            display:block;
            margin-bottom:10px;
            font-weight:bold;
          }
          .logout-form{
            margin:0;
          }
          button{
            margin-top:12px;
            background:#6f5cff;
            color:#fff;
            border:none;
            border-radius:10px;
            padding:12px 18px;
            cursor:pointer;
            font-weight:bold;
          }
          button:disabled{
            opacity:0.6;
            cursor:not-allowed;
          }
          .logout-btn{
            background:#2a2a2a;
            margin-top:0;
          }
          .search-row{
            display:flex;
            gap:10px;
            align-items:center;
            flex-wrap:wrap;
          }
          .search-input{
            flex:1 1 320px;
            min-width:240px;
            padding:12px 14px;
            border-radius:10px;
            border:1px solid #333;
            background:#111;
            color:#fff;
            font-size:15px;
            box-sizing:border-box;
          }
          .search-btn{
            margin-top:0;
          }
          .search-result-list{
            margin-top:16px;
            display:flex;
            flex-direction:column;
            gap:12px;
          }
          .search-item{
            border:1px solid #2e2e2e;
            border-radius:12px;
            padding:14px;
            background:#111;
          }
          .search-item-title{
            font-size:17px;
            font-weight:bold;
            margin-bottom:6px;
          }
          .search-item-meta{
            color:#b5b5b5;
            font-size:13px;
            line-height:1.6;
          }
          .search-item-actions{
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin-top:12px;
          }
          .live-badge{
            display:inline-block;
            font-size:12px;
            border-radius:999px;
            padding:4px 8px;
            font-weight:bold;
            margin-left:8px;
          }
          .live-on{
            background:#2d7d46;
            color:#d9ffe4;
          }
          .live-off{
            background:#343434;
            color:#d6d6d6;
          }
          .btn-danger{
            background:#8f2d3d;
          }
          .search-empty{
            color:#aaa;
            font-size:14px;
            padding:8px 0;
          }
          .registered-text{
            color:#7ee787;
            font-size:12px;
            margin-top:6px;
          }
          .hint{
            font-size:13px;
            color:#aaa;
            margin-top:8px;
            line-height:1.6;
          }
        </style>
      </head>
      <body>
        <div class="topbar">
          <div>
            <h1>🛠️ HARIBO SubAdmin</h1>
            <div class="sub">접속 IP: ${escapeHtml(clientIp || "-")}<br/>이 페이지에서는 BJ 검색 후 등록 / 해지만 할 수 있습니다.</div>
          </div>
          <form class="logout-form" method="post" action="/sub-admin/logout">
            <button class="logout-btn" type="submit">로그아웃</button>
          </form>
        </div>

        <div class="card">
          <label class="label" for="channelSearchInput">채널 검색 / 등록 / 해지</label>
          <div class="search-row">
            <input
              id="channelSearchInput"
              class="search-input"
              type="text"
              placeholder="BJ명 또는 채널명을 입력하세요. 예) 퐁이"
            />
            <button id="channelSearchBtn" class="search-btn" type="button">검색</button>
          </div>
          <div class="hint">등록/해지 작업 내역은 모두 dashboard 작업 로그에 남습니다.</div>
          <div id="channelSearchResult" class="search-result-list">
            <div class="search-empty">검색어를 입력하고 검색 버튼을 눌러주세요.</div>
          </div>
        </div>

        <script>
          const channelSearchInput = document.getElementById("channelSearchInput");
          const channelSearchBtn = document.getElementById("channelSearchBtn");
          const channelSearchResult = document.getElementById("channelSearchResult");

          function escapeHtmlClient(value) {
            return String(value || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function buildSearchItemHtml(item) {
            const liveClass = item.isInLive ? "live-on" : "live-off";
            const liveText = item.isInLive ? "LIVE" : "OFF";
            const actionButton = item.registered
              ? '<button class="btn-danger" type="button" data-action="unregister" data-channel-id="' + escapeHtmlClient(item.channelId) + '">해제</button>'
              : '<button type="button" data-action="register" data-channel-id="' + escapeHtmlClient(item.channelId) + '">등록</button>';

            const registeredText = item.registered
              ? '<div class="registered-text">현재 channels 컬렉션에 등록됨</div>'
              : '';

            return [
              '<div class="search-item">',
                '<div class="search-item-title">' +
                  escapeHtmlClient(item.channelName || "-") +
                  ' <span class="live-badge ' + liveClass + '">' + liveText + '</span>' +
                '</div>',
                '<div class="search-item-meta">' +
                  '채널 ID: ' + escapeHtmlClient(item.channelId || "-") + '<br/>' +
                  'BJ: ' + escapeHtmlClient(item.ownerNickname || "-") + '<br/>' +
                  '로그인 ID: ' + escapeHtmlClient(item.loginId || "-") + '<br/>' +
                  '시청자 수: ' + Number(item.playerCount || 0) +
                '</div>',
                registeredText,
                '<div class="search-item-actions">' + actionButton + '</div>',
              '</div>'
            ].join('');
          }

          function bindSearchActionButtons() {
            const buttons = channelSearchResult.querySelectorAll("button[data-action][data-channel-id]");

            buttons.forEach((button) => {
              button.addEventListener("click", async () => {
                const action = button.dataset.action;
                const channelId = String(button.dataset.channelId || "");

                if (!channelId) {
                  return;
                }

                button.disabled = true;
                button.textContent = action === "register" ? "등록 중..." : "해제 중...";

                try {
                  let res;

                  if (action === "register") {
                    res = await fetch("/sub-admin/channels/register", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({ channelId })
                    });
                  } else {
                    res = await fetch("/sub-admin/channels/" + encodeURIComponent(channelId), {
                      method: "DELETE"
                    });
                  }

                  const data = await res.json();

                  if (res.status === 401) {
                    location.href = "/sub-admin/login";
                    return;
                  }

                  if (!res.ok || !data.ok) {
                    throw new Error(data.error || "request failed");
                  }

                  await performChannelSearch(false);
                } catch (err) {
                  alert((action === "register" ? "등록 실패: " : "해제 실패: ") + err.message);
                } finally {
                  button.disabled = false;
                }
              });
            });
          }

          async function performChannelSearch(focusKeep = true) {
            const q = channelSearchInput.value.trim();

            if (!q) {
              channelSearchResult.innerHTML = '<div class="search-empty">검색어를 입력해주세요.</div>';
              if (focusKeep) {
                channelSearchInput.focus();
              }
              return;
            }

            channelSearchBtn.disabled = true;
            channelSearchResult.innerHTML = '<div class="search-empty">검색 중...</div>';

            try {
              const res = await fetch("/sub-admin/channel-search?q=" + encodeURIComponent(q));
              const data = await res.json();

              if (res.status === 401) {
                location.href = "/sub-admin/login";
                return;
              }

              if (!res.ok || !data.ok) {
                throw new Error(data.error || "search failed");
              }

              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {
                channelSearchResult.innerHTML = '<div class="search-empty">검색 결과가 없습니다.</div>';
                return;
              }

              channelSearchResult.innerHTML = items.map(buildSearchItemHtml).join("");
              bindSearchActionButtons();
            } catch (err) {
              channelSearchResult.innerHTML = '<div class="search-empty">검색 실패: ' + escapeHtmlClient(err.message) + '</div>';
            } finally {
              channelSearchBtn.disabled = false;
            }
          }

          channelSearchBtn.addEventListener("click", () => {
            performChannelSearch();
          });

          channelSearchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              performChannelSearch();
            }
          });
        </script>
      </body>
    </html>
  `;
}
function handleRoleLogin(role) {
  return async (req, res) => {
    const password = String(req.body.password || "");
    const clientIp = getClientIp(req);
    const operatorName = normalizeOperatorName(
      req.body.operatorName,
      role === "subAdmin" ? "subAdmin" : "dashboard"
    );
    if (password !== getPasswordByRole(role)) {
      await writeAdminAuditLog({
        req,
        actorRole: role,
        operatorName: "",
        action: "login_failed",
        note: "invalid_password",
        result: "fail"
      });

      res.redirect(
        getLoginPathByRole(role) +
          "?error=" +
          encodeURIComponent("비밀번호가 올바르지 않습니다.")
      );
      return;
    }

    const token = createAuthSession({
      role,
      operatorName,
      ip: clientIp,
      userAgent: String(req.headers["user-agent"] || "")
    });

    setAuthCookie(res, role, token);

    await writeAdminAuditLog({
      req,
      actorRole: role,
      operatorName: "",
      action: "login"
    });

    res.redirect(role === "subAdmin" ? "/sub-admin" : "/dashboard");
  };
}

function handleRoleLogout(role) {
  return async (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[getCookieNameByRole(role)];
    const session = getValidAuthSession(token, role);

    if (session) {
      await writeAdminAuditLog({
        req,
        actorRole: session.role,
        operatorName: session.operatorName,
        action: "logout"
      });
      authSessions.delete(token);
    }

    clearAuthCookie(res, role);
    res.redirect(getLoginPathByRole(role));
  };
}

/* dashboard login page */
app.get("/dashboard/login", (req, res) => {
  if (getAuthSession(req, "dashboard")) {
    res.redirect("/dashboard");
    return;
  }

  const error = String(req.query.error || "").trim();

  res.send(
    renderLoginPage({
      title: "🔐 HARIBO Dashboard",
      description: "대시보드를 보려면 작업자명과 비밀번호를 입력하세요.",
      action: "/dashboard/login",
      error,
      accentColor: "#ff4d6d"
    })
  );
});

app.post("/dashboard/login", handleRoleLogin("dashboard"));
app.post("/dashboard/logout", handleRoleLogout("dashboard"));

app.get("/sub-admin/login", (req, res) => {
  if (getAuthSession(req, "subAdmin")) {
    res.redirect("/sub-admin");
    return;
  }

  const error = String(req.query.error || "").trim();

  res.send(
    renderLoginPage({
      title: "🔐 HARIBO SubAdmin",
      description: "SubAdmin 페이지에 들어가려면 작업자명과 비밀번호를 입력하세요.",
      action: "/sub-admin/login",
      error,
      accentColor: "#6f5cff"
    })
  );
});

app.post("/sub-admin/login", handleRoleLogin("subAdmin"));
app.post("/sub-admin/logout", handleRoleLogout("subAdmin"));

app.get("/sub-admin", requireSubAdminAuth, (req, res) => {
  res.send(
    renderSubAdminPage({
      clientIp: req.authSession?.ip || getClientIp(req)
    })
  );
});

/* 채널 설정 저장 */
app.post("/dashboard/channel/:channelId/settings", requireDashboardAuthApi, async (req, res) => {
  try {
    const channelId = String(req.params.channelId || "").trim();
    const key = String(req.body.key || "").trim();
    const enabled = parseEnabledValue(req.body.enabled);

    if (!channelId) {
      res.status(400).send({
        ok: false,
        error: "channelId required"
      });
      return;
    }

    if (!key) {
      res.status(400).send({
        ok: false,
        error: "key required"
      });
      return;
    }

    const result = await updateChannelSetting(channelId, key, enabled);

    // 설정 저장 성공 후, 채널 채팅으로도 안내
    if (result?.chatMessage) {
      try {
        await sendChat(channelId, result.chatMessage);
      } catch (err) {
        console.error("dashboard setting chat notify error:", err.message);
      }
    }

    res.send({
      ok: true,
      channelId,
      settings: buildChannelSettings(channelId, {
        [key]: enabled
      })
    });
  } catch (err) {
    console.error("dashboard channel settings update error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
});

/* 전체 공지 전송 */
app.post("/dashboard/announce", requireDashboardAuthApi, async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();

    if (!message) {
      res.status(400).send({ ok: false, error: "message required" });
      return;
    }

    const players = streamStore.getAll();

    if (!players.length) {
      res.send({
        ok: true,
        total: 0,
        success: 0,
        failed: 0,
        message: "현재 방송중인 채널이 없습니다."
      });
      return;
    }

    const finalMessage = `📢 [전체공지] ${message}`;

    const results = await Promise.allSettled(
      players.map(async (p) => {
        const ok = await sendChat(String(p.channelId), finalMessage);
        return {
          channelId: String(p.channelId),
          ok
        };
      })
    );

    let success = 0;
    let failed = 0;
    const detail = [];

    results.forEach((r, idx) => {
      const channelId = String(players[idx].channelId);

      if (r.status === "fulfilled" && r.value?.ok) {
        success += 1;
        detail.push({ channelId, ok: true });
      } else {
        failed += 1;
        detail.push({ channelId, ok: false });
      }
    });

    res.send({
      ok: true,
      total: players.length,
      success,
      failed,
      detail
    });
  } catch (err) {
    console.error("dashboard announce error:", err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
});

/* dashboard page */
app.get("/dashboard", requireDashboardAuth, (req, res) => {
  try {
    const players = streamStore.getAll();

    const rows = players
      .map((p) => {
        const start = formatKstDateTime(p.startedAt);

        return `
          <tr class="channel-row" data-channel-id="${escapeHtml(p.channelId)}" data-owner-nickname="${escapeHtml(
          p.ownerNickname || "-"
        )}">
            <td>${escapeHtml(p.channelId)}</td>
            <td>${escapeHtml(p.ownerNickname || "-")}</td>
            <td>${escapeHtml(p.title || "-")}</td>
            <td>${escapeHtml(p.streamId || "-")}</td>
            <td>${escapeHtml(start)}</td>
          </tr>
        `;
      })
      .join("");

    res.send(`
      <html lang="ko">
      <head>
        <meta charset="utf-8"/>
        <title>HARIBO BOT Dashboard</title>

        <style>
          body{
            background:#0f0f0f;
            color:#fff;
            font-family:Arial, sans-serif;
            padding:30px;
          }

          h1{
            margin:0;
          }

          table{
            width:100%;
            border-collapse:collapse;
            margin-top:20px;
          }

          th,td{
            border:1px solid #333;
            padding:10px;
            text-align:left;
            vertical-align:top;
          }

          th{
            background:#222;
          }

          tr:nth-child(even){
            background:#181818;
          }

          .channel-row{
            cursor:pointer;
            transition:background 0.15s ease;
          }

          .channel-row:hover{
            background:#232323 !important;
          }

          .channel-row.active{
            outline:2px solid #ff4d6d;
            outline-offset:-2px;
          }

          .count{
            margin-bottom:20px;
            font-size:18px;
          }

          .card{
            background:#171717;
            border:1px solid #2d2d2d;
            border-radius:12px;
            padding:20px;
            margin-bottom:24px;
          }

          .label{
            display:block;
            margin-bottom:10px;
            font-weight:bold;
          }

          textarea{
            width:100%;
            min-height:100px;
            border-radius:10px;
            border:1px solid #333;
            background:#111;
            color:#fff;
            padding:12px;
            box-sizing:border-box;
            resize:vertical;
          }

          button{
            margin-top:12px;
            background:#ff4d6d;
            color:#fff;
            border:none;
            border-radius:10px;
            padding:12px 18px;
            cursor:pointer;
            font-weight:bold;
          }

          button:disabled{
            opacity:0.6;
            cursor:not-allowed;
          }

          .result{
            margin-top:12px;
            font-size:14px;
            color:#cfcfcf;
            white-space:pre-wrap;
          }

          .hint{
            font-size:13px;
            color:#aaa;
            margin-top:8px;
          }

          .topbar{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:16px;
            margin-bottom:20px;
          }

          .sub{
            color:#aaa;
            font-size:13px;
            margin-top:6px;
          }

          .logout-form{
            margin:0;
          }

          .logout-btn{
            background:#2a2a2a;
            margin-top:0;
          }

          .layout{
            display:grid;
            grid-template-columns:minmax(0, 1.6fr) minmax(320px, 0.9fr);
            gap:24px;
            align-items:start;
          }

          .settings-panel{
            position:sticky;
            top:20px;
          }

          .settings-empty{
            color:#aaa;
            font-size:14px;
            line-height:1.6;
          }

          .settings-title{
            font-size:20px;
            font-weight:bold;
            margin-bottom:6px;
          }

          .settings-sub{
            color:#aaa;
            font-size:13px;
            margin-bottom:18px;
          }

          .setting-item{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:16px;
            padding:14px 0;
            border-top:1px solid #2a2a2a;
          }

          .setting-item:first-child{
            border-top:none;
            padding-top:0;
          }

          .setting-name{
            font-weight:bold;
            margin-bottom:6px;
          }

          .setting-desc{
            color:#aaa;
            font-size:13px;
            line-height:1.5;
          }

          .switch{
            position:relative;
            width:52px;
            height:30px;
            flex:0 0 auto;
          }

          .switch input{
            opacity:0;
            width:0;
            height:0;
            position:absolute;
          }

          .slider{
            position:absolute;
            inset:0;
            border-radius:999px;
            background:#444;
            transition:0.2s ease;
            cursor:pointer;
          }

          .slider:before{
            content:"";
            position:absolute;
            width:22px;
            height:22px;
            left:4px;
            top:4px;
            background:#fff;
            border-radius:50%;
            transition:0.2s ease;
          }

          .switch input:checked + .slider{
            background:#ff4d6d;
          }

          .switch input:checked + .slider:before{
            transform:translateX(22px);
          }

          .setting-state{
            margin-top:8px;
            font-size:12px;
            color:#9f9f9f;
          }

          .search-row{
            display:flex;
            gap:10px;
            align-items:center;
            flex-wrap:wrap;
          }

          .search-input{
            flex:1 1 320px;
            min-width:240px;
            padding:12px 14px;
            border-radius:10px;
            border:1px solid #333;
            background:#111;
            color:#fff;
            font-size:15px;
            box-sizing:border-box;
          }

          .search-btn{
            margin-top:0;
          }

          .search-result-list{
            margin-top:16px;
            display:flex;
            flex-direction:column;
            gap:12px;
          }

          .search-item{
            border:1px solid #2e2e2e;
            border-radius:12px;
            padding:14px;
            background:#111;
          }

          .search-item-top{
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:16px;
          }

          .search-item-title{
            font-size:17px;
            font-weight:bold;
            margin-bottom:6px;
          }

          .search-item-meta{
            color:#b5b5b5;
            font-size:13px;
            line-height:1.6;
          }

          .live-badge{
            display:inline-block;
            font-size:12px;
            border-radius:999px;
            padding:4px 8px;
            font-weight:bold;
            margin-left:8px;
          }

          .live-on{
            background:#2d7d46;
            color:#d9ffe4;
          }

          .live-off{
            background:#343434;
            color:#d6d6d6;
          }

          .search-item-actions{
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin-top:12px;
          }

          .btn-secondary{
            background:#2a2a2a;
          }

          .btn-danger{
            background:#8f2d3d;
          }

          .search-empty{
            color:#aaa;
            font-size:14px;
            padding:8px 0;
          }

          .registered-text{
            color:#7ee787;
            font-size:12px;
            margin-top:6px;
          }

          .audit-log-list{
            margin-top:16px;
            display:flex;
            flex-direction:column;
            gap:10px;
          }

          .audit-log-item{
            border:1px solid #2e2e2e;
            border-radius:12px;
            padding:14px;
            background:#111;
          }

          .audit-log-top{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            flex-wrap:wrap;
            margin-bottom:8px;
          }

          .audit-log-title{
            font-size:15px;
            font-weight:bold;
          }

          .audit-log-meta{
            color:#b5b5b5;
            font-size:13px;
            line-height:1.6;
          }

          .role-badge{
            display:inline-block;
            font-size:11px;
            border-radius:999px;
            padding:4px 8px;
            font-weight:bold;
            margin-left:8px;
            background:#2a2a2a;
            color:#f0f0f0;
          }

          @media (max-width: 1100px){
            .layout{
              grid-template-columns:1fr;
            }

            .settings-panel{
              position:static;
            }
          }
        </style>

      </head>

      <body>

        <div class="topbar">
          <div>
            <h1>📡 HARIBO AI 방송 대시보드</h1>
            <div class="sub">방송 시작 일시는 한국시간(KST) 기준으로 표시됩니다. 현재 작업자: ${escapeHtml(req.authSession?.operatorName || "dashboard")}</div>
          </div>

          <form class="logout-form" method="post" action="/dashboard/logout">
            <button class="logout-btn" type="submit">로그아웃</button>
          </form>
        </div>

        <div class="count">
          현재 방송 수 : <b>${players.length}</b>
        </div>

        <div class="card">
          <label class="label" for="channelSearchInput">채널 검색 / 등록</label>

          <div class="search-row">
            <input
              id="channelSearchInput"
              class="search-input"
              type="text"
              placeholder="BJ명 또는 채널명을 입력하세요. 예) 퐁이"
            />
            <button id="channelSearchBtn" class="search-btn" type="button">검색</button>
          </div>

          <div class="hint">
            검색 결과에서 등록을 누르면 Firestore channels 컬렉션에 채널 ID만 저장됩니다.
          </div>

          <div id="channelSearchResult" class="search-result-list">
            <div class="search-empty">검색어를 입력하고 검색 버튼을 눌러주세요.</div>
          </div>
        </div>

        <div class="card">
          <label class="label" for="auditLogList">작업 로그</label>
          <div class="hint">dashboard / subAdmin 접속, 등록, 해제 작업 이력이 최근 순으로 표시됩니다.</div>
          <div id="auditLogList" class="audit-log-list">
            <div class="search-empty">로그를 불러오는 중...</div>
          </div>
          <button id="auditLogNextBtn" type="button" class="btn-secondary" style="display:none;">
            다음 페이지
          </button>
        </div>
        <div class="card">
          <label class="label">이벤트 룰렛</label>
          <div class="hint">룰렛 생성, 시작/정지, BJ 공유 링크 발급은 전용 컨트롤 페이지에서 진행합니다.</div>
          <button type="button" onclick="location.href='/dashboard/roulette'">룰렛 컨트롤 열기</button>
        </div>

        <div class="card">
          <label class="label" for="announceMessage">전체공지</label>
          <textarea id="announceMessage" placeholder="방송중인 모든 방에 보낼 공지 메세지를 입력하세요."></textarea>
          <div class="hint">보내기 누르면 현재 방송중인 모든 채널에 같은 공지가 채팅으로 전송됩니다.</div>
          <button id="announceBtn" type="button">공지 보내기</button>
          <div id="announceResult" class="result"></div>
        </div>

        <div class="layout">
          <div class="card">
            <div class="label">방송중 채널 목록</div>

            <table>
              <tr>
                <th>채널</th>
                <th>BJ</th>
                <th>방송 제목</th>
                <th>StreamId</th>
                <th>방송 시작 일시 (KST)</th>
              </tr>

              ${rows || `
                <tr>
                  <td colspan="5">현재 방송중인 채널이 없습니다.</td>
                </tr>
              `}
            </table>
          </div>

          <div class="card settings-panel">
            <div class="settings-title">채널 설정</div>
            <div class="settings-sub">채널을 클릭하면 설정 정보를 볼 수 있습니다.</div>
            <div id="channelSettingsBody" class="settings-empty">
              왼쪽 채널 목록에서 방송중인 채널을 선택해주세요.
            </div>
          </div>
        </div>

        <script>
          const btn = document.getElementById("announceBtn");
          const input = document.getElementById("announceMessage");
          const result = document.getElementById("announceResult");
          const settingsBody = document.getElementById("channelSettingsBody");
          const channelRows = Array.from(document.querySelectorAll(".channel-row"));

          const channelSearchInput = document.getElementById("channelSearchInput");
          const channelSearchBtn = document.getElementById("channelSearchBtn");
          const channelSearchResult = document.getElementById("channelSearchResult");
          const auditLogList = document.getElementById("auditLogList");

          function escapeHtmlClient(value) {
            return String(value || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function formatKstDateClient(ms) {
            if (!ms) {
              return "-";
            }

            const date = new Date(Number(ms));

            if (Number.isNaN(date.getTime())) {
              return "-";
            }

            return new Intl.DateTimeFormat("ko-KR", {
              timeZone: "Asia/Seoul",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false
            }).format(date);
          }

          function buildAuditLogItemHtml(item) {
            const actor = escapeHtmlClient(item.actorLabel || "-");
            const role = escapeHtmlClient(item.actorRoleLabel || item.actorRole || "-");
            const action = escapeHtmlClient(item.actionLabel || item.action || "-");
            const channelText = item.channelId
              ? \`채널 ID: \${escapeHtmlClient(item.channelId)}\`
              : "채널 ID: -";
            const noteText = item.note
              ? \`<br/>비고: \${escapeHtmlClient(item.note)}\`
              : "";

            return \`
              <div class="audit-log-item">
                <div class="audit-log-top">
                  <div class="audit-log-title">
                    \${actor}
                    <span class="role-badge">\${role}</span>
                  </div>
                  <div class="audit-log-meta">\${formatKstDateClient(item.createdAtMs)}</div>
                </div>
                <div class="audit-log-meta">
                  작업: \${action}<br/>
                  \${channelText}<br/>
                  IP: \${escapeHtmlClient(item.ip || "-")}
                  \${noteText}
                </div>
              </div>
            \`;
          }

          async function loadAuditLogs() {
            if (!auditLogList) {
              return;
            }

            auditLogList.innerHTML = '<div class="search-empty">로그를 불러오는 중...</div>';

            try {
              const res = await fetch("/dashboard/audit-logs?limit=" + encodeURIComponent(50));
              const data = await res.json();

              if (res.status === 401) {
                location.href = "/dashboard/login";
                return;
              }

              if (!res.ok || !data.ok) {
                throw new Error(data.error || "load failed");
              }

              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {
                auditLogList.innerHTML = '<div class="search-empty">표시할 로그가 없습니다.</div>';
                return;
              }

              auditLogList.innerHTML = items.map(buildAuditLogItemHtml).join("");
            } catch (err) {
              auditLogList.innerHTML = '<div class="search-empty">로그 불러오기 실패: ' + escapeHtmlClient(err.message) + '</div>';
            }
          }

          function setActiveRow(channelId) {
            channelRows.forEach((row) => {
              if (row.dataset.channelId === String(channelId)) {
                row.classList.add("active");
              } else {
                row.classList.remove("active");
              }
            });
          }

          function renderSettings(channelId, channelName, settings) {
            if (!settings || !settings.length) {
              settingsBody.innerHTML = \`
                <div class="settings-empty">표시할 설정이 없습니다.</div>
              \`;
              return;
            }

            const itemsHtml = settings.map((item) => {
              const checked = item.enabled ? "checked" : "";
              const stateText = item.enabled ? "현재 ON" : "현재 OFF";

              return \`
                <div class="setting-item">
                  <div>
                    <div class="setting-name">\${item.label}</div>
                    <div class="setting-desc">\${item.description || ""}</div>
                    <div class="setting-state" id="state-\${item.key}">\${stateText}</div>
                  </div>

                  <label class="switch">
                    <input
                      type="checkbox"
                      data-setting-key="\${item.key}"
                      \${checked}
                    />
                    <span class="slider"></span>
                  </label>
                </div>
              \`;
            }).join("");

            settingsBody.innerHTML = \`
              <div class="settings-title">\${channelName || channelId}</div>
              <div class="settings-sub">채널 ID: \${channelId}</div>
              <div id="settingItems">\${itemsHtml}</div>
              <div id="settingsResult" class="result"></div>
            \`;

            const checkboxes = settingsBody.querySelectorAll("input[type='checkbox'][data-setting-key]");

            checkboxes.forEach((checkbox) => {
              checkbox.addEventListener("change", async (e) => {
                const key = e.target.dataset.settingKey;
                const enabled = e.target.checked;
                const stateEl = document.getElementById("state-" + key);
                const resultEl = document.getElementById("settingsResult");

                e.target.disabled = true;
                resultEl.textContent = "저장 중...";

                try {
                  const res = await fetch("/dashboard/channel/" + encodeURIComponent(channelId) + "/settings", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      key,
                      enabled
                    })
                  });

                  const data = await res.json();

                  if (res.status === 401) {
                    location.href = "/dashboard/login";
                    return;
                  }

                  if (!res.ok || !data.ok) {
                    throw new Error(data.error || "save failed");
                  }

                  const saved = (data.settings || []).find((item) => item.key === key);
                  const finalEnabled = saved ? !!saved.enabled : enabled;

                  e.target.checked = finalEnabled;

                  if (stateEl) {
                    stateEl.textContent = finalEnabled ? "현재 ON" : "현재 OFF";
                  }

                  resultEl.textContent = "저장되었습니다.";
                } catch (err) {
                  e.target.checked = !enabled;

                  if (stateEl) {
                    stateEl.textContent = !enabled ? "현재 ON" : "현재 OFF";
                  }

                  resultEl.textContent = "저장 실패: " + err.message;
                } finally {
                  e.target.disabled = false;
                }
              });
            });
          }

          async function loadChannelSettings(channelId, ownerNickname) {
            setActiveRow(channelId);

            settingsBody.innerHTML = "불러오는 중...";

            try {
              const res = await fetch("/dashboard/channel/" + encodeURIComponent(channelId) + "/settings");
              const data = await res.json();

              if (res.status === 401) {
                location.href = "/dashboard/login";
                return;
              }

              if (!res.ok || !data.ok) {
                throw new Error(data.error || "load failed");
              }

              renderSettings(channelId, ownerNickname || data.channelName || channelId, data.settings || []);
            } catch (err) {
              settingsBody.innerHTML = '<div class="settings-empty">설정 불러오기 실패: ' + err.message + '</div>';
            }
          }

          channelRows.forEach((row) => {
            row.addEventListener("click", () => {
              loadChannelSettings(row.dataset.channelId, row.dataset.ownerNickname);
            });
          });

          function buildSearchItemHtml(item) {
            const liveClass = item.isInLive ? "live-on" : "live-off";
            const liveText = item.isInLive ? "LIVE" : "OFF";
            const actionButton = item.registered
              ? \`<button class="btn-danger" type="button" data-action="unregister" data-channel-id="\${escapeHtmlClient(item.channelId)}">해제</button>\`
              : \`<button type="button" data-action="register" data-channel-id="\${escapeHtmlClient(item.channelId)}">등록</button>\`;

            const registeredText = item.registered
              ? '<div class="registered-text">현재 channels 컬렉션에 등록됨</div>'
              : '';

            return \`
              <div class="search-item">
                <div class="search-item-top">
                  <div>
                    <div class="search-item-title">
                      \${escapeHtmlClient(item.channelName || "-")}
                      <span class="live-badge \${liveClass}">\${liveText}</span>
                    </div>
                    <div class="search-item-meta">
                      채널 ID: \${escapeHtmlClient(item.channelId || "-")}<br/>
                      BJ: \${escapeHtmlClient(item.ownerNickname || "-")}<br/>
                      로그인 ID: \${escapeHtmlClient(item.loginId || "-")}<br/>
                      시청자 수: \${Number(item.playerCount || 0)}
                    </div>
                    \${registeredText}
                  </div>
                </div>

                <div class="search-item-actions">
                  \${actionButton}
                </div>
              </div>
            \`;
          }

          function bindSearchActionButtons() {
            const buttons = channelSearchResult.querySelectorAll("button[data-action][data-channel-id]");

            buttons.forEach((button) => {
              button.addEventListener("click", async () => {
                const action = button.dataset.action;
                const channelId = String(button.dataset.channelId || "");

                if (!channelId) {
                  return;
                }

                button.disabled = true;
                button.textContent = action === "register" ? "등록 중..." : "해제 중...";

                try {
                  let res;

                  if (action === "register") {
                    res = await fetch("/dashboard/channels/register", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({ channelId })
                    });
                  } else {
                    res = await fetch("/dashboard/channels/" + encodeURIComponent(channelId), {
                      method: "DELETE"
                    });
                  }

                  const data = await res.json();

                  if (res.status === 401) {
                    location.href = "/dashboard/login";
                    return;
                  }

                  if (!res.ok || !data.ok) {
                    throw new Error(data.error || "request failed");
                  }

                  await performChannelSearch(false);
                  loadAuditLogs();
                } catch (err) {
                  alert((action === "register" ? "등록 실패: " : "해제 실패: ") + err.message);
                } finally {
                  button.disabled = false;
                }
              });
            });
          }

          async function performChannelSearch(focusKeep = true) {
            const q = channelSearchInput.value.trim();

            if (!q) {
              channelSearchResult.innerHTML = '<div class="search-empty">검색어를 입력해주세요.</div>';
              if (focusKeep) {
                channelSearchInput.focus();
              }
              return;
            }

            channelSearchBtn.disabled = true;
            channelSearchResult.innerHTML = '<div class="search-empty">검색 중...</div>';

            try {
              const res = await fetch("/dashboard/channel-search?q=" + encodeURIComponent(q));
              const data = await res.json();

              if (res.status === 401) {
                location.href = "/dashboard/login";
                return;
              }

              if (!res.ok || !data.ok) {
                throw new Error(data.error || "search failed");
              }

              const items = Array.isArray(data.items) ? data.items : [];

              if (!items.length) {
                channelSearchResult.innerHTML = '<div class="search-empty">검색 결과가 없습니다.</div>';
                return;
              }

              channelSearchResult.innerHTML = items.map(buildSearchItemHtml).join("");
              bindSearchActionButtons();
            } catch (err) {
              channelSearchResult.innerHTML = '<div class="search-empty">검색 실패: ' + escapeHtmlClient(err.message) + '</div>';
            } finally {
              channelSearchBtn.disabled = false;
            }
          }

          channelSearchBtn.addEventListener("click", () => {
            performChannelSearch();
          });

          channelSearchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              performChannelSearch();
            }
          });

          loadAuditLogs();

          btn.addEventListener("click", async () => {
            const message = input.value.trim();

            if (!message) {
              result.textContent = "메세지를 입력해주세요.";
              return;
            }

            btn.disabled = true;
            result.textContent = "전송 중...";

            try {
              const res = await fetch("/dashboard/announce", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ message })
              });

              const data = await res.json();

              if (res.status === 401) {
                location.href = "/dashboard/login";
                return;
              }

              if (!res.ok || !data.ok) {
                result.textContent = "전송 실패: " + (data.error || "unknown error");
                return;
              }

              result.textContent =
                "전송 완료\\n" +
                "- 전체 채널: " + data.total + "\\n" +
                "- 성공: " + data.success + "\\n" +
                "- 실패: " + data.failed;

              input.value = "";
            } catch (err) {
              result.textContent = "전송 실패: " + err.message;
            } finally {
              btn.disabled = false;
            }
          });
        </script>

      </body>
      </html>
    `);
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).send("dashboard error");
  }
});

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log("command api started :", PORT);
});