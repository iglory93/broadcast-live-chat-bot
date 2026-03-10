const youtubeConfig = require("../config/youtube");
const youtubeOAuthService = require("./youtubeOAuthService");
const youtubeService = require("./youtubeService");
const songRequestStore = require("../store/songRequestStore");
const youtubeTokenStore = require("../store/youtubeTokenStore");



function buildConnectUrl(channelId) {
  const base = youtubeConfig.publicBaseUrl;

  if (!base) {
    throw new Error("PUBLIC_BASE_URL is required");
  }

  return `${base}/youtube/auth/start?channelId=${encodeURIComponent(String(channelId))}`;
}

function parseRequestCommand(command) {
  const body = String(command || "").replace(/^신청\s*/, "").trim();
  const parts = body.split("-");

  if (parts.length < 2) {
    return null;
  }

  const artist = String(parts[0] || "").trim();
  const title = String(parts.slice(1).join("-") || "").trim();

  if (!artist || !title) {
    return null;
  }

  return { artist, title };
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
  const parsed = parseRequestCommand(command);

  if (!parsed) {
    return {
      ok: false,
      message: "사용법: !신청 가수-노래"
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
    query: found.query,
    videoId: found.videoId,
    videoTitle: found.title,
    playlistId: playlist.playlistId,
    playlistItemId: playlist.playlistItemId,
    durationSec: found.durationSec || 0
  });

  const queue = await songRequestStore.getQueue(channelId, 100);
  const position = queue.findIndex(row => row.requestId === requestId) + 1;

  return {
    ok: true,
    message: `🎵 신청 완료: ${parsed.artist} - ${parsed.title} (대기열 ${position}번)`
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
  isManager,
  getConnectMessage,
  connectChannel,
  addRequest,
  getQueueMessage,
  completeCurrent,
  cancelMine,
  clearAll
};