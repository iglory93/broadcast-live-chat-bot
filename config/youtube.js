const youtubeConfig = {
  clientId: process.env.YOUTUBE_CLIENT_ID || "",
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
  redirectUri: process.env.YOUTUBE_REDIRECT_URI || "",
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  tokenSecret: process.env.YOUTUBE_TOKEN_SECRET || "",
  stateSecret: process.env.YOUTUBE_STATE_SECRET || process.env.YOUTUBE_TOKEN_SECRET || "",
  requestPlaylistTitle: process.env.YOUTUBE_REQUEST_PLAYLIST_TITLE || "띵라이브 신청곡",
  requestPlaylistPrivacy: process.env.YOUTUBE_REQUEST_PLAYLIST_PRIVACY || "private",
  scopes: [
    "https://www.googleapis.com/auth/youtube"
  ]
};

module.exports = youtubeConfig;