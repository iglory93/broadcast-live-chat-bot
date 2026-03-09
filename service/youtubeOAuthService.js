const crypto = require("crypto");
const { google } = require("googleapis");
const youtubeConfig = require("../config/youtube");
const youtubeTokenStore = require("../store/youtubeTokenStore");
const youtubeService = require("./youtubeService");
const { encryptText } = require("../utils/cryptoHelper");

function signState(channelId, ts) {
  return crypto
    .createHmac("sha256", String(youtubeConfig.stateSecret || "state-secret"))
    .update(`${channelId}:${ts}`)
    .digest("hex");
}

function encodeState(channelId) {
  const ts = Date.now();
  const payload = {
    channelId: String(channelId),
    ts,
    sig: signState(channelId, ts)
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeState(state) {
  if (!state) {
    throw new Error("Missing OAuth state");
  }

  const payload = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
  const expected = signState(payload.channelId, payload.ts);

  if (expected !== payload.sig) {
    throw new Error("Invalid OAuth state");
  }

  return payload;
}

function getAuthUrl(channelId) {
  const oauth2Client = youtubeService.createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: youtubeConfig.scopes,
    state: encodeState(channelId)
  });
}

async function handleOAuthCallback(code, state) {
  const oauth2Client = youtubeService.createOAuthClient();
  const parsed = decodeState(state);
  const channelId = String(parsed.channelId);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens?.refresh_token) {
    throw new Error("Google refresh token not issued. Retry with prompt=consent.");
  }

  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  let googleEmail = "";

  try {
    const me = await oauth2.userinfo.get();
    googleEmail = me.data?.email || "";
  } catch (err) {
    console.log("userinfo read failed:", err.message);
  }

  await youtubeTokenStore.saveToken(channelId, {
    enabled: true,
    googleEmail,
    refreshTokenEnc: encryptText(tokens.refresh_token),
    accessToken: tokens.access_token || "",
    tokenType: tokens.token_type || "",
    scope: tokens.scope || youtubeConfig.scopes.join(" "),
    expiryDate: tokens.expiry_date || null,
    playlistTitle: youtubeConfig.requestPlaylistTitle
  });

  const playlist = await youtubeService.ensureRequestPlaylist(channelId);

  return {
    channelId,
    googleEmail,
    playlistId: playlist.playlistId,
    playlistTitle: playlist.playlistTitle
  };
}

async function disconnect(channelId) {
  await youtubeTokenStore.removeToken(channelId);
}

module.exports = {
  getAuthUrl,
  handleOAuthCallback,
  disconnect
};