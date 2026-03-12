const { google } = require("googleapis");
const youtubeConfig = require("../config/youtube");
const youtubeTokenStore = require("../store/youtubeTokenStore");
const { decryptText, encryptText } = require("../utils/cryptoHelper");
const artistAliasStore = require("../store/artistAliasStore");

console.log("youtube clientId =", youtubeConfig.clientId);
console.log("youtube redirectUri =", youtubeConfig.redirectUri);
function createOAuthClient() {
    //console.log('YOUTUBE'+youtubeConfig)
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’‚‛“”„‟"'`´]/g, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[&/\\|,+.!?:;~]/g, " ")
    .replace(/[‐-‒–—―_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function countIncludedTokens(text, tokens) {
  const normalized = normalizeText(text);
  let count = 0;

  for (const token of tokens) {
    if (token && normalized.includes(token)) {
      count += 1;
    }
  }

  return count;
}

function hasAny(text, words) {
  const normalized = normalizeText(text);
  return words.some(word => normalized.includes(normalizeText(word)));
}

function detectRelevanceLanguage(artist, title) {
  const text = `${artist} ${title}`;
  return /[가-힣]/.test(text) ? "ko" : "en";
}

function buildSearchQuery(artist, title) {
  const a = String(artist || "").trim();
  const t = String(title || "").trim();

  return `${a} ${t} official audio -cover -live -shorts -reaction -직캠 -fancam`;
}

// function scoreCandidate(item, videoMap, artist, title) {
//   const video = videoMap.get(item.id.videoId);
//   if (!video) return -999;

//   const rawTitle = String(item.snippet?.title || "").toLowerCase();
//   const normalizedArtist = String(artist || "").toLowerCase();
//   const normalizedTitle = String(title || "").toLowerCase();

//   let score = 0;

//   if (rawTitle.includes(normalizedArtist)) score += 8;
//   if (rawTitle.includes(normalizedTitle)) score += 12;
//   if (rawTitle.includes("official")) score += 3;
//   if (rawTitle.includes("audio")) score += 3;
//   if (rawTitle.includes("topic")) score += 2;
//   if (rawTitle.includes("live")) score -= 8;
//   if (rawTitle.includes("cover")) score -= 8;
//   if (rawTitle.includes("직캠")) score -= 6;

//   const seconds = parseDuration(video.contentDetails?.duration);
//   if (seconds >= 90 && seconds <= 480) score += 5;
//   else score -= 5;

//   return score;
// }
// function scoreCandidate(item, videoMap, artist, title) {
//   const video = videoMap.get(item.id.videoId);
//   if (!video) return -999;

//   const videoTitle = String(item.snippet?.title || "");
//   const channelTitle = String(item.snippet?.channelTitle || "");
//   const tagsText = Array.isArray(video.snippet?.tags) ? video.snippet.tags.join(" ") : "";
//   const description = String(video.snippet?.description || "");

//   const combinedText = `${videoTitle} ${channelTitle} ${tagsText} ${description}`;

//   const artistNorm = normalizeText(artist);
//   const titleNorm = normalizeText(title);
//   const requestNorm = normalizeText(`${artist} ${title}`);
//   const requestDashNorm = normalizeText(`${artist} - ${title}`);
//   const videoTitleNorm = normalizeText(videoTitle);
//   const channelTitleNorm = normalizeText(channelTitle);

//   const artistTokens = tokenize(artist);
//   const titleTokens = tokenize(title);

//   let score = 0;

//   if (videoTitleNorm.includes(artistNorm)) score += 20;
//   if (videoTitleNorm.includes(titleNorm)) score += 30;

//   score += countIncludedTokens(combinedText, artistTokens) * 8;
//   score += countIncludedTokens(combinedText, titleTokens) * 10;

//   if (videoTitleNorm === requestNorm) score += 30;
//   if (videoTitleNorm === requestDashNorm) score += 30;

//   if (channelTitleNorm.includes(artistNorm)) score += 12;

//   if (hasAny(videoTitle, ["official mv", "official video", "official audio", "music video", "audio", "lyric video"])) {
//     score += 10;
//   }

//   if (hasAny(videoTitle, ["cover", "live", "shorts", "reaction", "직캠", "fancam", "concert", "karaoke", "sped up", "slowed", "teaser", "trailer", "1 hour", "1hour"])) {
//     score -= 30;
//   }

//   const seconds = parseDuration(video.contentDetails?.duration);
//   if (seconds >= 100 && seconds <= 420) {
//     score += 8;
//   } else if (seconds < 60 || seconds > 900) {
//     score -= 20;
//   }

//   if (String(video.snippet?.categoryId || "") === "10") {
//     score += 6;
//   }

//   return score;
// }

// function scoreCandidate(item, videoMap, artistAliases, title){

  
//   const video = videoMap.get(item.id.videoId);
//   if (!video) {
//     return { score: -999, debug: { reason: "video_missing" } };
//   }

//   const videoTitle = String(item.snippet?.title || "");
//   const channelTitle = String(item.snippet?.channelTitle || "");
//   const tagsText = Array.isArray(video.snippet?.tags) ? video.snippet.tags.join(" ") : "";
//   const description = String(video.snippet?.description || "");
//   const combinedText = `${videoTitle} ${channelTitle} ${tagsText} ${description}`;

//   const artistNorm = normalizeText(artist);
//   const titleNorm = normalizeText(title);
//   const requestNorm = normalizeText(`${artist} ${title}`);
//   const requestDashNorm = normalizeText(`${artist} - ${title}`);
//   const videoTitleNorm = normalizeText(videoTitle);
//   const channelTitleNorm = normalizeText(channelTitle);

//   const artistTokens = tokenize(artist);
//   const titleTokens = tokenize(title);

//   const artistHit = countIncludedTokens(combinedText, artistTokens);
//   const titleHit = countIncludedTokens(combinedText, titleTokens);

//   const debug = {
//     artistHit,
//     titleHit,
//     videoTitle,
//     channelTitle
//   };

//   if (titleTokens.length > 0 && titleHit === 0) {
//     debug.rejected = "no_title_token_match";
//     return { score: -999, debug };
//   }

//   let score = 0;

//   if (videoTitleNorm.includes(artistNorm)) {
//     score += 20;
//     debug.artistExactBonus = 20;
//   }

//   if (videoTitleNorm.includes(titleNorm)) {
//     score += 30;
//     debug.titleExactBonus = 30;
//   }

//   score += artistHit * 8;
//   debug.artistTokenScore = artistHit * 8;

//   score += titleHit * 10;
//   debug.titleTokenScore = titleHit * 10;

//   if (videoTitleNorm === requestNorm) {
//     score += 30;
//     debug.requestExactBonus = 30;
//   }

//   if (videoTitleNorm === requestDashNorm) {
//     score += 30;
//     debug.requestDashExactBonus = 30;
//   }

//   if (channelTitleNorm.includes(artistNorm)) {
//     score += 12;
//     debug.channelArtistBonus = 12;
//   }

//   if (hasAny(videoTitle, ["official mv", "official video", "official audio", "music video", "audio", "lyric video"])) {
//     score += 10;
//     debug.officialBonus = 10;
//   }

//   if (hasAny(videoTitle, ["cover", "live", "shorts", "reaction", "직캠", "fancam", "concert", "karaoke", "sped up", "slowed", "teaser", "trailer", "1 hour", "1hour"])) {
//     score -= 30;
//     debug.badKeywordPenalty = -30;
//   }

//   const seconds = parseDuration(video.contentDetails?.duration);
//   debug.durationSec = seconds;

//   if (seconds >= 100 && seconds <= 420) {
//     score += 8;
//     debug.durationBonus = 8;
//   } else if (seconds < 60 || seconds > 900) {
//     score -= 20;
//     debug.durationPenalty = -20;
//   }

//   if (String(video.snippet?.categoryId || "") === "10") {
//     score += 6;
//     debug.musicCategoryBonus = 6;
//   }

//   debug.finalScore = score;
//   return { score, debug };
// }

function scoreCandidate(item, videoMap, artistAliases, title) {
  const video = videoMap.get(item.id.videoId);
  if (!video) {
    return { score: -999, debug: { reason: "video_missing" } };
  }

  const videoTitle = String(item.snippet?.title || "");
  const channelTitle = String(item.snippet?.channelTitle || "");
  const tagsText = Array.isArray(video.snippet?.tags) ? video.snippet.tags.join(" ") : "";
  const description = String(video.snippet?.description || "");
  const combinedText = `${videoTitle} ${channelTitle} ${tagsText} ${description}`;

  const artistNorms = artistAliases.map(v => normalizeText(v));
  const artistTokens = [...new Set(artistAliases.flatMap(v => tokenize(v)))];

  const titleNorm = normalizeText(title);
  const requestNorms = artistAliases.map(v => normalizeText(`${v} ${title}`));
  const requestDashNorms = artistAliases.map(v => normalizeText(`${v} - ${title}`));
  const videoTitleNorm = normalizeText(videoTitle);
  const channelTitleNorm = normalizeText(channelTitle);
  const titleTokens = tokenize(title);

  const artistHit = countIncludedTokens(combinedText, artistTokens);
  const titleHit = countIncludedTokens(combinedText, titleTokens);

  const debug = {
    artistAliases,
    artistHit,
    titleHit,
    videoTitle,
    channelTitle
  };

  if (titleTokens.length > 0 && titleHit === 0) {
    debug.rejected = "no_title_token_match";
    return { score: -999, debug };
  }

  let score = 0;

  if (artistNorms.some(v => v && videoTitleNorm.includes(v))) {
    score += 20;
    debug.artistExactBonus = 20;
  }

  if (videoTitleNorm.includes(titleNorm)) {
    score += 30;
    debug.titleExactBonus = 30;
  }

  score += artistHit * 8;
  debug.artistTokenScore = artistHit * 8;

  score += titleHit * 10;
  debug.titleTokenScore = titleHit * 10;

  if (requestNorms.some(v => v === videoTitleNorm)) {
    score += 30;
    debug.requestExactBonus = 30;
  }

  if (requestDashNorms.some(v => v === videoTitleNorm)) {
    score += 30;
    debug.requestDashExactBonus = 30;
  }

  if (artistNorms.some(v => v && channelTitleNorm.includes(v))) {
    score += 12;
    debug.channelArtistBonus = 12;
  }

  if (hasAny(videoTitle, ["official mv", "official video", "official audio", "music video", "audio", "lyric video"])) {
    score += 10;
    debug.officialBonus = 10;
  }

  if (hasAny(videoTitle, ["cover", "live", "shorts", "reaction", "직캠", "fancam", "concert", "karaoke", "sped up", "slowed", "teaser", "trailer", "1 hour", "1hour"])) {
    score -= 30;
    debug.badKeywordPenalty = -30;
  }

  const seconds = parseDuration(video.contentDetails?.duration);
  debug.durationSec = seconds;

  if (seconds >= 100 && seconds <= 420) {
    score += 8;
    debug.durationBonus = 8;
  } else if (seconds < 60 || seconds > 900) {
    score -= 20;
    debug.durationPenalty = -20;
  }

  if (String(video.snippet?.categoryId || "") === "10") {
    score += 6;
    debug.musicCategoryBonus = 6;
  }

  debug.finalScore = score;
  return { score, debug };
}
// async function searchSong(channelId, artist, title) {
//   const youtube = await getYoutubeClient(channelId);
//   const query = `${artist} ${title} official audio`;

//   const searchRes = await youtube.search.list({
//     part: ["snippet"],
//     q: query,
//     type: ["video"],
//     maxResults: 8,
//     videoCategoryId: "10"
//   });

//   const items = searchRes.data.items || [];
//   if (!items.length) {
//     return null;
//   }

//   const ids = items.map(item => item.id.videoId).filter(Boolean);
//   const videoRes = await youtube.videos.list({
//     part: ["contentDetails", "snippet"],
//     id: ids
//   });

//   const videoMap = new Map();
//   for (const video of videoRes.data.items || []) {
//     videoMap.set(video.id, video);
//   }

//   const ranked = items
//     .map(item => ({
//       item,
//       score: scoreCandidate(item, videoMap, artist, title)
//     }))
//     .sort((a, b) => b.score - a.score);

//   const best = ranked[0]?.item;
//   if (!best) {
//     return null;
//   }

//   const video = videoMap.get(best.id.videoId);

//   return {
//     query,
//     videoId: best.id.videoId,
//     title: best.snippet?.title || `${artist} - ${title}`,
//     channelTitle: best.snippet?.channelTitle || "",
//     durationSec: parseDuration(video?.contentDetails?.duration)
//   };
// }
// async function searchSong(channelId, artist, title) {
//   const youtube = await getYoutubeClient(channelId);
//   const query = buildSearchQuery(artist, title);

//   const searchRes = await youtube.search.list({
//     part: ["snippet"],
//     q: query,
//     type: ["video"],
//     maxResults: 12,
//     order: "relevance",
//     videoCategoryId: "10",
//     relevanceLanguage: detectRelevanceLanguage(artist, title),
//     regionCode: "KR",
//     videoEmbeddable: "true",
//     videoSyndicated: "true"
//   });

//   const items = searchRes.data.items || [];
//   if (!items.length) {
//     return null;
//   }

//   const ids = items.map(item => item.id.videoId).filter(Boolean);
//   if (!ids.length) {
//     return null;
//   }

//   const videoRes = await youtube.videos.list({
//     part: ["snippet", "contentDetails"],
//     id: ids
//   });

//   const videoMap = new Map();
//   for (const video of videoRes.data.items || []) {
//     videoMap.set(video.id, video);
//   }

// //   const ranked = items
// //   .map(item => {
// //     const score = scoreCandidate(item, videoMap, artist, title);
// //     return {
// //       item,
// //       score
// //     };
// //   })
// //   .sort((a, b) => b.score - a.score);

// // console.log(
// //   "[yt-search] ranked candidates =",
// //   ranked.slice(0, 5).map(row => ({
// //     score: row.score,
// //     videoId: row.item?.id?.videoId,
// //     title: row.item?.snippet?.title,
// //     channelTitle: row.item?.snippet?.channelTitle
// //   }))
// // );
//     const ranked = items
//       .map(item => {
//         const scored = scoreCandidate(item, videoMap, artist, title);
//         return {
//           item,
//           score: scored.score,
//           debug: scored.debug
//         };
//       })
//       .sort((a, b) => b.score - a.score);

//     // console.log(
//     //   "[yt-search] ranked candidates =",
//     //   ranked.slice(0, 5).map(row => ({
//     //     score: row.score,
//     //     debug: row.debug,
//     //     videoId: row.item?.id?.videoId,
//     //     title: row.item?.snippet?.title,
//     //     channelTitle: row.item?.snippet?.channelTitle
//     //   }))
//     // );
//   // const best = ranked[0];
//   // if (!best?.item) {
//   //   return null;
//   // }

//   // if (best.score < 20) {
//   //   return null;
//   // }


//   const best = ranked[0];
//   if (!best?.item) {
//     return null;
//   }

//   if (best.score < 20) {
//     console.log("[yt-search] rejected best by low score =", best);
//     return null;
//   }

//   const picked = best.item;
//   const video = videoMap.get(picked.id.videoId);
//   // console.log("[yt-search] picked =", {
//   //   score: best.score,
//   //   videoId: picked.id.videoId,
//   //   title: picked.snippet?.title,
//   //   channelTitle: picked.snippet?.channelTitle
//   // });
//   return {
//     query,
//     score: best.score,
//     videoId: picked.id.videoId,
//     title: picked.snippet?.title || `${artist} - ${title}`,
//     channelTitle: picked.snippet?.channelTitle || "",
//     durationSec: parseDuration(video?.contentDetails?.duration)
//   };
// }
async function searchSong(channelId, artist, title) {
  const youtube = await getYoutubeClient(channelId);
  const artistAliases = await artistAliasStore.getAliases(artist);
  const query = buildSearchQuery(artist, title);

 // console.log("[yt-search] request =", { artist, artistAliases, title, query });

  const searchRes = await youtube.search.list({
    part: ["snippet"],
    q: query,
    type: ["video"],
    maxResults: 12,
    order: "relevance",
    videoCategoryId: "10",
    relevanceLanguage: detectRelevanceLanguage(artist, title),
    regionCode: "KR",
    videoEmbeddable: "true",
    videoSyndicated: "true"
  });

  const items = searchRes.data.items || [];
  if (!items.length) {
    return null;
  }

  const ids = items.map(item => item.id.videoId).filter(Boolean);
  if (!ids.length) {
    return null;
  }

  const videoRes = await youtube.videos.list({
    part: ["snippet", "contentDetails"],
    id: ids
  });

  const videoMap = new Map();
  for (const video of videoRes.data.items || []) {
    videoMap.set(video.id, video);
  }

  const ranked = items
    .map(item => {
      const scored = scoreCandidate(item, videoMap, artistAliases, title);
      return {
        item,
        score: scored.score,
        debug: scored.debug
      };
    })
    .sort((a, b) => b.score - a.score);

  // console.log(
  //   "[yt-search] ranked candidates =",
  //   ranked.slice(0, 5).map(row => ({
  //     score: row.score,
  //     debug: row.debug,
  //     videoId: row.item?.id?.videoId,
  //     title: row.item?.snippet?.title,
  //     channelTitle: row.item?.snippet?.channelTitle
  //   }))
  // );

  const best = ranked[0];
  if (!best?.item) {
    return null;
  }

  if (best.score < 20) {
    console.log("[yt-search] rejected best by low score =", best);
    return null;
  }

  const picked = best.item;
  const video = videoMap.get(picked.id.videoId);

  // console.log("[yt-search] picked =", {
  //   score: best.score,
  //   debug: best.debug,
  //   videoId: picked.id.videoId,
  //   title: picked.snippet?.title,
  //   channelTitle: picked.snippet?.channelTitle
  // });

  return {
    query,
    score: best.score,
    videoId: picked.id.videoId,
    title: picked.snippet?.title || `${artist} - ${title}`,
    channelTitle: picked.snippet?.channelTitle || "",
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