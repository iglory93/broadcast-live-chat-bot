// const youtubeConfig = require("../config/youtube");
// const youtubeOAuthService = require("./youtubeOAuthService");
// const youtubeService = require("./youtubeService");
// const songRequestStore = require("../store/songRequestStore");
// const youtubeTokenStore = require("../store/youtubeTokenStore");



// function buildConnectUrl(channelId) {
//   const base = youtubeConfig.publicBaseUrl;

//   if (!base) {
//     throw new Error("PUBLIC_BASE_URL is required");
//   }

//   return `${base}/youtube/auth/start?channelId=${encodeURIComponent(String(channelId))}`;
// }

// function parseRequestCommand(command) {
//   const body = String(command || "").replace(/^신청\s*/, "").trim();
//   const parts = body.split("-");

//   if (parts.length < 2) {
//     return null;
//   }

//   const artist = String(parts[0] || "").trim();
//   const title = String(parts.slice(1).join("-") || "").trim();

//   if (!artist || !title) {
//     return null;
//   }

//   return { artist, title };
// }

// async function getConnectMessage(channelId) {
//   const url = buildConnectUrl(channelId);
//   return `🎵 유튜브 연결: ${url}`;
// }

// async function connectChannel(channelId) {
//   return youtubeOAuthService.getAuthUrl(channelId);
// }

// async function addRequest(chat, command) {
//   const channelId = String(chat?.channelId);
//   const parsed = parseRequestCommand(command);

//   if (!parsed) {
//     return {
//       ok: false,
//       message: "사용법: !신청 가수-노래"
//     };
//   }

//   const connected = await youtubeTokenStore.isConnected(channelId);
//   if (!connected) {
//     return {
//       ok: false,
//       message: "이 채널은 아직 유튜브 연결이 안 되어 있어요. 방송자에게 !유튜브연결을 요청해주세요."
//     };
//   }

//   const found = await youtubeService.searchSong(channelId, parsed.artist, parsed.title);
//   if (!found) {
//     return {
//       ok: false,
//       message: `검색 실패: ${parsed.artist} - ${parsed.title}`
//     };
//   }

//   const duplicate = await songRequestStore.findActiveByVideoId(channelId, found.videoId);
//   if (duplicate) {
//     return {
//       ok: false,
//       message: `이미 신청된 곡입니다: ${duplicate.artist} - ${duplicate.title}`
//     };
//   }

//   const playlist = await youtubeService.addVideoToRequestPlaylist(channelId, found.videoId);

//   const requestId = await songRequestStore.enqueue(channelId, {
//     requesterId: String(chat?.clientChannelId || chat?.userId || chat?.memberId || ""),
//     artist: parsed.artist,
//     title: parsed.title,
//     query: found.query,
//     videoId: found.videoId,
//     videoTitle: found.title,
//     playlistId: playlist.playlistId,
//     playlistItemId: playlist.playlistItemId,
//     durationSec: found.durationSec || 0
//   });

//   const queue = await songRequestStore.getQueue(channelId, 100);
//   const position = queue.findIndex(row => row.requestId === requestId) + 1;

//   return {
//     ok: true,
//     message: `🎵 신청 완료: ${parsed.artist} - ${parsed.title} (대기열 ${position}번)`
//   };
// }

// async function getQueueMessage(channelId) {
//   const queue = await songRequestStore.getQueue(channelId, 10);

//   if (!queue.length) {
//     return "📭 신청곡이 없습니다.";
//   }

//   const lines = ["📃 신청곡 목록"];

//   queue.forEach((row, index) => {
//     lines.push(`${index + 1}. ${row.artist} - ${row.title}`);
//   });

//   return lines.join("\n");
// }

// async function completeCurrent(channelId) {
//   const current = await songRequestStore.getFirstActive(channelId);

//   if (!current) {
//     return {
//       ok: false,
//       message: "처리할 신청곡이 없습니다."
//     };
//   }

//   if (current.playlistItemId) {
//     try {
//       await youtubeService.removePlaylistItem(channelId, current.playlistItemId);
//     } catch (err) {
//       console.log("playlist item remove failed:", err.message);
//     }
//   }

//   await songRequestStore.markDone(channelId, current.requestId);

//   const next = await songRequestStore.getFirstActive(channelId);

//   if (!next) {
//     return {
//       ok: true,
//       message: `⏭ 처리 완료: ${current.artist} - ${current.title}\n남은 신청곡이 없습니다.`
//     };
//   }

//   return {
//     ok: true,
//     message: `⏭ 처리 완료: ${current.artist} - ${current.title}\n다음 곡: ${next.artist} - ${next.title}`
//   };
// }

// async function cancelMine(chat) {
//   const channelId = String(chat?.channelId);
//   const requesterId = String(chat?.clientChannelId || chat?.userId || chat?.memberId || "");
//   const cancelled = await songRequestStore.cancelLatestByRequester(channelId, requesterId);

//   if (!cancelled) {
//     return {
//       ok: false,
//       message: "취소할 본인 신청곡이 없습니다."
//     };
//   }

//   if (cancelled.playlistItemId) {
//     try {
//       await youtubeService.removePlaylistItem(channelId, cancelled.playlistItemId);
//     } catch (err) {
//       console.log("playlist item remove failed:", err.message);
//     }
//   }

//   return {
//     ok: true,
//     message: `🗑 신청 취소: ${cancelled.artist} - ${cancelled.title}`
//   };
// }

// async function clearAll(channelId) {
//   await youtubeService.clearRequestPlaylist(channelId);
//   await songRequestStore.clearActiveQueue(channelId);

//   return {
//     ok: true,
//     message: "🧹 신청곡 목록을 초기화했습니다."
//   };
// }

// module.exports = {
//   getConnectMessage,
//   connectChannel,
//   addRequest,
//   getQueueMessage,
//   completeCurrent,
//   cancelMine,
//   clearAll
// };

const youtubeConfig = require("../config/youtube");
const youtubeOAuthService = require("./youtubeOAuthService");
const youtubeService = require("./youtubeService");
const songRequestStore = require("../store/songRequestStore");
const youtubeTokenStore = require("../store/youtubeTokenStore");
const config = require("../config/config");

function buildConnectUrl(channelId) {
  const base = youtubeConfig.publicBaseUrl;

  if (!base) {
    throw new Error("PUBLIC_BASE_URL is required");
  }

  return `${base}/youtube/auth/start?channelId=${encodeURIComponent(String(channelId))}`;
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripRequestPrefix(command) {
  return normalizeSpaces(
    String(command || "").replace(/^[!#]?\s*신청\s*/, "")
  );
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : raw;
}

function parseHyphenFormat(body) {
  const normalized = normalizeSpaces(String(body || "").replace(/[‐-‒–—―]/g, "-"));
  const parts = normalized.split("-").map(v => v.trim()).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const artist = normalizeSpaces(parts[0]);
  const title = normalizeSpaces(parts.slice(1).join(" - "));

  if (!artist || !title) {
    return null;
  }

  return {
    artist,
    title,
    normalized: `${artist}-${title}`,
    confidence: 0.99,
    source: "rule"
  };
}

async function parseRequestCommandWithAI(command) {
  const body = stripRequestPrefix(command);

  if (!body) {
    return null;
  }

  const parsedByRule = parseHyphenFormat(body);
  if (parsedByRule) {
    return parsedByRule;
  }

  if (!config.openRouteAiKey) {
    return null;
  }

  console.log("[song-parse] raw command =", command);
console.log("[song-parse] body =", body);

  const systemPrompt = `
너는 방송 채팅의 신청곡 명령어를 정제하는 파서다.

목표:
사용자가 입력한 신청곡 문장에서 가수명(artist)과 노래 제목(title)을 최대한 정확하게 분리한다.

규칙:
1. 반드시 JSON만 출력한다. 설명, 인사, 코드블록, 마크다운 금지.
2. 출력 형식은 아래 중 하나만 허용한다.

성공:
{"ok":true,"artist":"가수명","title":"노래제목","normalized":"가수명-노래제목","confidence":0.92}

실패:
{"ok":false,"artist":"","title":"","normalized":"","confidence":0.0,"reason":"ambiguous"}

3. 입력에는 '!신청', '#신청', '신청' 같은 접두어가 포함될 수 있다. 이는 제거하고 해석한다.
4. 사용자가 이미 '가수-노래제목' 형태로 썼다면 그대로 분리한다.
5. 하이픈이 없어도 문맥상 매우 자연스러우면 가수와 제목을 분리한다.
6. '제목 가수' 순서로 보이면 순서를 바로잡는다.
7. 제목/가수에 공백이 포함될 수 있다.
8. 매우 유명한 조합이라 확신이 높을 때만 추론한다.
9. 확신이 낮거나 여러 해석이 가능하면 절대 지어내지 말고 실패를 반환한다.
10. feat., 피처링, OST, remix, ver., live 같은 표기는 제목에 포함될 수 있으니 보존한다.
11. 괄호, 따옴표, 불필요한 앞뒤 공백은 정리하되 원문 의미는 바꾸지 않는다.
12. 노래명과 가수명을 한국어/영어 원문 그대로 유지한다.
13. confidence는 0.0~1.0 사이 숫자다.
14. 아래 경우는 실패 처리 우선:
   - 단어가 1개뿐이라 가수/제목 분리가 불가능한 경우
   - 흔한 일반명사 조합이라 확신이 낮은 경우
   - 둘 다 제목처럼도, 가수처럼도 보이는 경우
`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openRouteAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `입력: "${body}"` }
        ]
      })
    });

    if (!res.ok) {
      console.log("song parser ai http error:", res.status);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    //console.log("[song-parse] ai raw content =", content);
    const parsed = JSON.parse(extractJson(content));
//console.log("[song-parse] ai parsed =", parsed);
    if (!parsed?.ok) {
      return null;
    }

    const artist = normalizeSpaces(parsed.artist);
    const title = normalizeSpaces(parsed.title);
    const confidence = Number(parsed.confidence || 0);

    if (!artist || !title) {
      return null;
    }

    if (!Number.isFinite(confidence) || confidence < 0.8) {
      return null;
    }

    console.log("[song-parse] accepted =", {
      artist,
      title,
      normalized: `${artist}-${title}`,
      confidence
    });

    return {
      artist,
      title,
      normalized: `${artist}-${title}`,
      confidence,
      source: "ai"
    };
  } catch (err) {
    console.log("song parser ai error:", err.message);
    return null;
  }
}

async function parseRequestCommand(command) {
  return parseRequestCommandWithAI(command);
}

async function getConnectMessage(channelId) {
  const url = buildConnectUrl(channelId);
  return `🎵 유튜브 연결: ${url}`;
}

async function connectChannel(channelId) {
  return youtubeOAuthService.getAuthUrl(channelId);
}

async function addRequest(chat, command) {
  const channelId = String(chat?.channelId);
  const rawBody = stripRequestPrefix(command);
  const parsed = await parseRequestCommand(command);

  if (!parsed) {
    return {
      ok: false,
      message:
        "사용법: !신청 가수-노래\n예시: !신청 아이유-좋은날\n하이픈 없이 써도 자동 정제하지만, 정확도를 위해 가수-노래 형식을 추천합니다."
    };
  }

  const connected = await youtubeTokenStore.isConnected(channelId);
  if (!connected) {
    return {
      ok: false,
      message: "이 채널은 아직 유튜브 연결이 안 되어 있어요. 방송자에게 !유튜브연결을 요청해주세요."
    };
  }

  const found = await youtubeService.searchSong(channelId, parsed.artist, parsed.title);
  if (!found) {
    return {
      ok: false,
      message: `검색 실패: ${parsed.artist} - ${parsed.title}`
    };
  }

  const duplicate = await songRequestStore.findActiveByVideoId(channelId, found.videoId);
  if (duplicate) {
    return {
      ok: false,
      message: `이미 신청된 곡입니다: ${duplicate.artist} - ${duplicate.title}`
    };
  }

  const playlist = await youtubeService.addVideoToRequestPlaylist(channelId, found.videoId);

  const requestId = await songRequestStore.enqueue(channelId, {
    requesterId: String(chat?.clientChannelId || chat?.userId || chat?.memberId || ""),
    artist: parsed.artist,
    title: parsed.title,
    rawInput: rawBody,
    parserSource: parsed.source,
    parserConfidence: parsed.confidence,
    query: found.query,
    videoId: found.videoId,
    videoTitle: found.title,
    matchedChannelTitle: found.channelTitle,
    matchScore: found.score || 0,
    playlistId: playlist.playlistId,
    playlistItemId: playlist.playlistItemId,
    durationSec: found.durationSec || 0
  });

  const queue = await songRequestStore.getQueue(channelId, 100);
  const position = queue.findIndex(row => row.requestId === requestId) + 1;

  let message = `🎵 신청 완료: ${parsed.artist} - ${parsed.title} (대기열 ${position}번)`;

  if (parsed.source === "ai" && rawBody && rawBody !== parsed.normalized) {
    message += `\n🪄 자동 정제: ${rawBody} → ${parsed.normalized}`;
  }

  return {
    ok: true,
    message
  };
}

async function getQueueMessage(channelId) {
  const queue = await songRequestStore.getQueue(channelId, 10);

  if (!queue.length) {
    return "📭 신청곡이 없습니다.";
  }

  const lines = ["📃 신청곡 목록"];

  queue.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.artist} - ${row.title}`);
  });

  return lines.join("\n");
}

async function completeCurrent(channelId) {
  const current = await songRequestStore.getFirstActive(channelId);

  if (!current) {
    return {
      ok: false,
      message: "처리할 신청곡이 없습니다."
    };
  }

  if (current.playlistItemId) {
    try {
      await youtubeService.removePlaylistItem(channelId, current.playlistItemId);
    } catch (err) {
      console.log("playlist item remove failed:", err.message);
    }
  }

  await songRequestStore.markDone(channelId, current.requestId);

  const next = await songRequestStore.getFirstActive(channelId);

  if (!next) {
    return {
      ok: true,
      message: `⏭ 처리 완료: ${current.artist} - ${current.title}\n남은 신청곡이 없습니다.`
    };
  }

  return {
    ok: true,
    message: `⏭ 처리 완료: ${current.artist} - ${current.title}\n다음 곡: ${next.artist} - ${next.title}`
    };
}

async function cancelMine(chat) {
  const channelId = String(chat?.channelId);
  const requesterId = String(chat?.clientChannelId || chat?.userId || chat?.memberId || "");
  const cancelled = await songRequestStore.cancelLatestByRequester(channelId, requesterId);

  if (!cancelled) {
    return {
      ok: false,
      message: "취소할 본인 신청곡이 없습니다."
    };
  }

  if (cancelled.playlistItemId) {
    try {
      await youtubeService.removePlaylistItem(channelId, cancelled.playlistItemId);
    } catch (err) {
      console.log("playlist item remove failed:", err.message);
    }
  }

  return {
    ok: true,
    message: `🗑 신청 취소: ${cancelled.artist} - ${cancelled.title}`
  };
}

async function clearAll(channelId) {
  await youtubeService.clearRequestPlaylist(channelId);
  await songRequestStore.clearActiveQueue(channelId);

  return {
    ok: true,
    message: "🧹 신청곡 목록을 초기화했습니다."
  };
}

module.exports = {
  getConnectMessage,
  connectChannel,
  addRequest,
  getQueueMessage,
  completeCurrent,
  cancelMine,
  clearAll
};