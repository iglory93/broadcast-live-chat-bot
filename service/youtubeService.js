const { google } = require("googleapis");
const youtubeConfig = require("../config/youtube");
const youtubeTokenStore = require("../store/youtubeTokenStore");
const { decryptText, encryptText } = require("../utils/cryptoHelper");
console.log("youtube clientId =", youtubeConfig.clientId);
console.log("youtube redirectUri =", youtubeConfig.redirectUri);
function createOAuthClient() {
    console.log('YOUTUBE'+youtubeConfig)
  return new google.auth.OAuth2(
    youtubeConfig.clientId,
    youtubeConfig.clientSecret,
    youtubeConfig.redirectUri
  );
}

async function getAuthorizedClient(channelId) {
  const saved = await youtubeTokenStore.getToken(channelId);

  if (!saved || !saved.refreshTokenEnc) {
    throw new Error("YOUTUBE_NOT_CONNECTED");
  }

  const refreshToken = decryptText(saved.refreshTokenEnc);
  const oauth2Client = createOAuthClient();

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (credentials?.refresh_token && credentials.refresh_token !== refreshToken) {
    await youtubeTokenStore.saveToken(channelId, {
      refreshTokenEnc: encryptText(credentials.refresh_token)
    });
  }

  return oauth2Client;
}

async function getYoutubeClient(channelId) {
  const auth = await getAuthorizedClient(channelId);
  return google.youtube({ version: "v3", auth });
}

function parseDuration(isoDuration) {
  const value = String(isoDuration || "");
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function scoreCandidate(item, videoMap, artist, title) {
  const video = videoMap.get(item.id.videoId);
  if (!video) return -999;

  const rawTitle = String(item.snippet?.title || "").toLowerCase();
  const normalizedArtist = String(artist || "").toLowerCase();
  const normalizedTitle = String(title || "").toLowerCase();

  let score = 0;

  if (rawTitle.includes(normalizedArtist)) score += 8;
  if (rawTitle.includes(normalizedTitle)) score += 12;
  if (rawTitle.includes("official")) score += 3;
  if (rawTitle.includes("audio")) score += 3;
  if (rawTitle.includes("topic")) score += 2;
  if (rawTitle.includes("live")) score -= 8;
  if (rawTitle.includes("cover")) score -= 8;
  if (rawTitle.includes("직캠")) score -= 6;

  const seconds = parseDuration(video.contentDetails?.duration);
  if (seconds >= 90 && seconds <= 480) score += 5;
  else score -= 5;

  return score;
}

async function searchSong(channelId, artist, title) {
  const youtube = await getYoutubeClient(channelId);
  const query = `${artist} ${title} official audio`;

  const searchRes = await youtube.search.list({
    part: ["snippet"],
    q: query,
    type: ["video"],
    maxResults: 8,
    videoCategoryId: "10"
  });

  const items = searchRes.data.items || [];
  if (!items.length) {
    return null;
  }

  const ids = items.map(item => item.id.videoId).filter(Boolean);
  const videoRes = await youtube.videos.list({
    part: ["contentDetails", "snippet"],
    id: ids
  });

  const videoMap = new Map();
  for (const video of videoRes.data.items || []) {
    videoMap.set(video.id, video);
  }

  const ranked = items
    .map(item => ({
      item,
      score: scoreCandidate(item, videoMap, artist, title)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.item;
  if (!best) {
    return null;
  }

  const video = videoMap.get(best.id.videoId);

  return {
    query,
    videoId: best.id.videoId,
    title: best.snippet?.title || `${artist} - ${title}`,
    channelTitle: best.snippet?.channelTitle || "",
    durationSec: parseDuration(video?.contentDetails?.duration)
  };
}

async function listMyPlaylists(channelId) {
  const youtube = await getYoutubeClient(channelId);
  const rows = [];
  let pageToken = undefined;

  do {
    const res = await youtube.playlists.list({
      part: ["snippet", "status"],
      mine: true,
      maxResults: 50,
      pageToken
    });

    rows.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return rows;
}

async function ensureRequestPlaylist(channelId) {
  const saved = await youtubeTokenStore.getToken(channelId);
  const expectedTitle = saved?.playlistTitle || youtubeConfig.requestPlaylistTitle;
  const youtube = await getYoutubeClient(channelId);

  if (saved?.playlistId) {
    try {
      const existing = await youtube.playlists.list({
        part: ["snippet", "status"],
        id: [saved.playlistId]
      });

      if (existing.data.items && existing.data.items.length > 0) {
        return {
          playlistId: saved.playlistId,
          playlistTitle: existing.data.items[0].snippet?.title || expectedTitle
        };
      }
    } catch (err) {
      console.log("playlist verify failed:", err.message);
    }
  }

  const playlists = await listMyPlaylists(channelId);
  const found = playlists.find(item => String(item.snippet?.title || "").trim() === expectedTitle);

  if (found) {
    await youtubeTokenStore.saveToken(channelId, {
      playlistId: found.id,
      playlistTitle: found.snippet?.title || expectedTitle,
      enabled: true
    });

    return {
      playlistId: found.id,
      playlistTitle: found.snippet?.title || expectedTitle
    };
  }

  const created = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: expectedTitle,
        description: "띵라이브 신청곡 플레이리스트"
      },
      status: {
        privacyStatus: youtubeConfig.requestPlaylistPrivacy
      }
    }
  });

  const playlistId = created.data.id;
  const playlistTitle = created.data.snippet?.title || expectedTitle;

  await youtubeTokenStore.saveToken(channelId, {
    playlistId,
    playlistTitle,
    enabled: true
  });

  return { playlistId, playlistTitle };
}

async function addVideoToRequestPlaylist(channelId, videoId) {
  const youtube = await getYoutubeClient(channelId);
  const { playlistId } = await ensureRequestPlaylist(channelId);

  const res = await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: "youtube#video",
          videoId: String(videoId)
        }
      }
    }
  });

  return {
    playlistId,
    playlistItemId: res.data.id
  };
}

async function removePlaylistItem(channelId, playlistItemId) {
  const youtube = await getYoutubeClient(channelId);
  await youtube.playlistItems.delete({ id: String(playlistItemId) });
}

async function clearRequestPlaylist(channelId) {
  const youtube = await getYoutubeClient(channelId);
  const { playlistId } = await ensureRequestPlaylist(channelId);
  let pageToken = undefined;

  do {
    const res = await youtube.playlistItems.list({
      part: ["snippet"],
      playlistId,
      maxResults: 50,
      pageToken
    });

    for (const item of res.data.items || []) {
      await youtube.playlistItems.delete({ id: item.id });
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
}

module.exports = {
  createOAuthClient,
  getAuthorizedClient,
  getYoutubeClient,
  searchSong,
  ensureRequestPlaylist,
  addVideoToRequestPlaylist,
  removePlaylistItem,
  clearRequestPlaylist
};