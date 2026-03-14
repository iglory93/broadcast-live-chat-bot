const crypto = require("crypto");
const db = require("../firebase");
const streamStore = require("../store/streamStore");
const rouletteEventStore = require("../store/rouletteEventStore");

async function buildLiveCandidates() {
  const snapshot = await db.collection("channels").get();
  const registeredIds = new Set(snapshot.docs.map((doc) => String(doc.id)));
  const players = streamStore.getAll();
  const allowAllLiveForTest = process.env.ROULETTE_ALLOW_ALL_LIVE === "true";

  console.log("[roulette] allowAllLiveForTest =", allowAllLiveForTest);
  console.log("[roulette] registeredIds =", [...registeredIds]);
  console.log(
    "[roulette] livePlayers =",
    players.map((p) => ({
      channelId: String(p.channelId),
      ownerNickname: p.ownerNickname || "",
      title: p.title || ""
    }))
  );

  const candidates = players
    .filter((player) => {
      if (allowAllLiveForTest) {
        return true;
      }

      return registeredIds.has(String(player.channelId));
    })
    .map((player) => ({
      channelId: String(player.channelId || ""),
      ownerNickname: String(player.ownerNickname || ""),
      title: String(player.title || ""),
      streamId: String(player.streamId || ""),
      startedAt: Number(player.startedAt || 0)
    }));

  console.log("[roulette] candidates =", candidates);
  return candidates;
}

function getStopFinishAtMs(event) {
  const stopAt = Number(event?.stopRequestedAtMs || 0);
  const duration = Number(event?.stopDurationMs || 0);

  if (!stopAt || !duration) {
    return 0;
  }

  return stopAt + duration;
}

function shouldFinalizeEvent(event) {
  if (!event || event.status !== "stopping") {
    return false;
  }

  if (event.manualStopRequested !== true) {
    return false;
  }

  const finishAtMs = getStopFinishAtMs(event);
  return finishAtMs > 0 && Date.now() >= finishAtMs;
}

async function finalizeEventIfNeeded(event) {
  if (!shouldFinalizeEvent(event)) {
    return event;
  }

  return rouletteEventStore.patchEvent(event.id, {
    status: "finished",
    finishedAtMs: Date.now()
  });
}

async function getNormalizedEvent(eventId) {
  const event = await rouletteEventStore.getEventById(eventId);
  return finalizeEventIfNeeded(event);
}

async function ensureReadyCandidates(eventId, existingCandidates) {
  let candidates = Array.isArray(existingCandidates) ? existingCandidates : [];

  if (candidates.length) {
    return candidates;
  }

  candidates = await buildLiveCandidates();

  if (!candidates.length) {
    throw new Error("candidate_empty");
  }

  await rouletteEventStore.patchEvent(eventId, {
    candidates,
    candidateCount: candidates.length
  });

  return candidates;
}

function chooseWinnerPatch(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error("candidate_empty");
  }

  const targetIndex = crypto.randomInt(candidates.length);
  const winner = candidates[targetIndex];

  return {
    status: "stopping",
    manualStopRequested: true,
    stopRequestedAtMs: Date.now(),
    stopDurationMs: 6500,
    finalRotationTurns: 8 + crypto.randomInt(4),
    targetIndex,
    winnerChannelId: String(winner.channelId || ""),
    winnerNickname: String(winner.ownerNickname || winner.channelId || ""),
    drawCandidateCount: candidates.length,
    finishedAtMs: 0
  };
}

async function createRouletteEvent({ title, sponsorName, prizeText, createdBy }) {
  const candidates = await buildLiveCandidates();

  if (!candidates.length) {
    throw new Error("candidate_empty");
  }

  const shareToken = crypto.randomBytes(16).toString("hex");

  const event = await rouletteEventStore.createEvent({
    title,
    sponsorName,
    prizeText,
    createdBy,
    shareToken,
    status: "ready",
    candidates
  });

  await rouletteEventStore.setCurrentEventId(event.id);
  return event;
}

async function refreshCandidates(eventId) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    throw new Error("event_not_found");
  }

  if (event.status !== "ready") {
    throw new Error("event_not_refreshable");
  }

  const candidates = await buildLiveCandidates();

  return rouletteEventStore.patchEvent(eventId, {
    candidates,
    candidateCount: candidates.length,
    winnerChannelId: "",
    winnerNickname: "",
    targetIndex: -1,
    stopRequestedAtMs: 0,
    stopDurationMs: 6500,
    finalRotationTurns: 0,
    manualStopRequested: false,
    finishedAtMs: 0,
    drawCandidateCount: 0
  });
}

async function startEvent(eventId) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    throw new Error("event_not_found");
  }

  if (event.status !== "ready") {
    throw new Error("event_not_startable");
  }

  const candidates = await ensureReadyCandidates(eventId, event.candidates);

  console.log("[roulette] startEvent requested:", {
    eventId,
    prevStatus: event.status,
    candidateCount: candidates.length
  });

  return rouletteEventStore.patchEvent(eventId, {
    status: "spinning",
    startedAtMs: Date.now(),
    stopRequestedAtMs: 0,
    stopDurationMs: 6500,
    finalRotationTurns: 0,
    targetIndex: -1,
    winnerChannelId: "",
    winnerNickname: "",
    manualStopRequested: false,
    candidates,
    candidateCount: candidates.length,
    drawCandidateCount: candidates.length,
    finishedAtMs: 0
  });
}

async function stopEvent(eventId) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    throw new Error("event_not_found");
  }

  if (event.status !== "spinning") {
    throw new Error("event_not_spinning");
  }

  console.log("[roulette] stopEvent requested:", {
    eventId,
    prevStatus: event.status,
    candidateCount: Array.isArray(event.candidates) ? event.candidates.length : 0
  });

  const candidates = Array.isArray(event.candidates) ? event.candidates : [];
  return rouletteEventStore.patchEvent(eventId, chooseWinnerPatch(candidates));
}

async function redrawEvent(eventId) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    throw new Error("event_not_found");
  }

  if (event.status !== "finished") {
    throw new Error("event_not_redrawable");
  }

  console.log("[roulette] stopEvent requested:", {
    eventId,
    prevStatus: event.status,
    candidateCount: Array.isArray(event.candidates) ? event.candidates.length : 0
  });

  const candidates = Array.isArray(event.candidates) ? event.candidates : [];
  return rouletteEventStore.patchEvent(eventId, chooseWinnerPatch(candidates));
}

async function closeEvent(eventId) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    throw new Error("event_not_found");
  }

  if (event.status !== "ready" && event.status !== "finished") {
    throw new Error("event_not_closable");
  }

  const updated = await rouletteEventStore.patchEvent(eventId, {
    status: "closed",
    manualStopRequested: false,
    closedAtMs: Date.now()
  });

  await rouletteEventStore.clearCurrentEventId(eventId);
  return updated;
}

function getDisplayStatus(event) {
  if (!event) {
    return "closed";
  }

  if (shouldFinalizeEvent(event)) {
    return "finished";
  }

  return String(event.status || "ready");
}

async function getPublicState(eventId) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    return null;
  }

  return {
    ...event,
    displayStatus: getDisplayStatus(event)
  };
}

async function validateViewerToken(eventId, token) {
  const event = await getNormalizedEvent(eventId);

  if (!event) {
    return null;
  }

  if (String(event.shareToken || "") !== String(token || "")) {
    return null;
  }

  return event;
}

module.exports = {
  buildLiveCandidates,
  createRouletteEvent,
  refreshCandidates,
  startEvent,
  stopEvent,
  redrawEvent,
  closeEvent,
  getPublicState,
  validateViewerToken
};