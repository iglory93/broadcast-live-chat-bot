// const db = require("../firebase");
// const admin = require("firebase-admin");

// const EVENT_COLLECTION = "roulette_events";
// const RUNTIME_COLLECTION = "roulette_runtime";
// const CURRENT_DOC_ID = "current";

// async function createEvent(data) {
//   const ref = db.collection(EVENT_COLLECTION).doc();

//   const doc = {
//     id: ref.id,
//     title: String(data.title || "이벤트 룰렛"),
//     sponsorName: String(data.sponsorName || ""),
//     prizeText: String(data.prizeText || ""),
//     shareToken: String(data.shareToken || ""),
//     status: String(data.status || "ready"),
//     candidates: Array.isArray(data.candidates) ? data.candidates : [],
//     candidateCount: Array.isArray(data.candidates) ? data.candidates.length : 0,
//     startedAtMs: 0,
//     stopRequestedAtMs: 0,
//     stopDurationMs: 6500,
//     targetIndex: -1,
//     winnerChannelId: "",
//     winnerNickname: "",
//     finalRotationTurns: 10,
//     createdBy: String(data.createdBy || ""),
//     createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     createdAtMs: Date.now(),
//     updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//     updatedAtMs: Date.now(),
//     closedAtMs: 0
//   };

//   await ref.set(doc);
//   return doc;
// }

// async function getEventById(eventId) {
//   const snap = await db.collection(EVENT_COLLECTION).doc(String(eventId)).get();
//   return snap.exists ? snap.data() : null;
// }

// async function setCurrentEventId(eventId) {
//   await db.collection(RUNTIME_COLLECTION).doc(CURRENT_DOC_ID).set({
//     eventId: String(eventId || ""),
//     updatedAtMs: Date.now()
//   }, { merge: true });
// }

// async function getCurrentEvent() {
//   const runtimeSnap = await db.collection(RUNTIME_COLLECTION).doc(CURRENT_DOC_ID).get();
//   const eventId = runtimeSnap.exists ? String(runtimeSnap.data()?.eventId || "") : "";

//   if (!eventId) {
//     return null;
//   }

//   return getEventById(eventId);
// }

// async function clearCurrentEventId(eventId) {
//   const runtimeRef = db.collection(RUNTIME_COLLECTION).doc(CURRENT_DOC_ID);
//   const runtimeSnap = await runtimeRef.get();
//   const currentId = runtimeSnap.exists ? String(runtimeSnap.data()?.eventId || "") : "";

//   if (currentId && currentId === String(eventId)) {
//     await runtimeRef.set({
//       eventId: "",
//       updatedAtMs: Date.now()
//     }, { merge: true });
//   }
// }

// async function patchEvent(eventId, patch) {
//   const ref = db.collection(EVENT_COLLECTION).doc(String(eventId));
//   await ref.set({
//     ...patch,
//     updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//     updatedAtMs: Date.now()
//   }, { merge: true });

//   return getEventById(eventId);
// }

// module.exports = {
//   createEvent,
//   getEventById,
//   getCurrentEvent,
//   setCurrentEventId,
//   clearCurrentEventId,
//   patchEvent
// };

const db = require("../firebase");
const admin = require("firebase-admin");

const EVENT_COLLECTION = "roulette_events";
const RUNTIME_COLLECTION = "roulette_runtime";
const CURRENT_DOC_ID = "current";

function sanitizeStoredCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const channelId = String(candidate?.channelId || "").trim();

      if (!channelId) {
        return null;
      }

      return {
        channelId,
        streamId: String(candidate?.streamId || ""),
        title: String(candidate?.title || ""),
        startedAtMs: Number(candidate?.startedAtMs || 0),
        isLive: !!candidate?.isLive,
        manual: !!candidate?.manual
      };
    })
    .filter(Boolean);
}

async function createEvent(data) {
  const ref = db.collection(EVENT_COLLECTION).doc();
  const candidates = sanitizeStoredCandidates(data.candidates);

  const doc = {
    id: ref.id,
    title: String(data.title || "이벤트 룰렛"),
    sponsorName: String(data.sponsorName || ""),
    prizeText: String(data.prizeText || ""),
    shareToken: String(data.shareToken || ""),
    status: String(data.status || "ready"),
    liveOnly: !!data.liveOnly,
    candidates,
    candidateCount: candidates.length,
    startedAtMs: 0,
    stopRequestedAtMs: 0,
    stopDurationMs: 6500,
    targetIndex: -1,
    winnerChannelId: "",
    finalRotationTurns: 10,
    createdBy: String(data.createdBy || ""),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: Date.now(),
    closedAtMs: 0
  };

  await ref.set(doc);
  return doc;
}

async function getEventById(eventId) {
  const snap = await db.collection(EVENT_COLLECTION).doc(String(eventId)).get();
  return snap.exists ? snap.data() : null;
}

async function setCurrentEventId(eventId) {
  await db.collection(RUNTIME_COLLECTION).doc(CURRENT_DOC_ID).set({
    eventId: String(eventId || ""),
    updatedAtMs: Date.now()
  }, { merge: true });
}

async function getCurrentEvent() {
  const runtimeSnap = await db.collection(RUNTIME_COLLECTION).doc(CURRENT_DOC_ID).get();
  const eventId = runtimeSnap.exists ? String(runtimeSnap.data()?.eventId || "") : "";

  if (!eventId) {
    return null;
  }

  return getEventById(eventId);
}

async function clearCurrentEventId(eventId) {
  const runtimeRef = db.collection(RUNTIME_COLLECTION).doc(CURRENT_DOC_ID);
  const runtimeSnap = await runtimeRef.get();
  const currentId = runtimeSnap.exists ? String(runtimeSnap.data()?.eventId || "") : "";

  if (currentId && currentId === String(eventId)) {
    await runtimeRef.set({
      eventId: "",
      updatedAtMs: Date.now()
    }, { merge: true });
  }
}

async function patchEvent(eventId, patch) {
  const normalizedPatch = {
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: Date.now()
  };

  if (Object.prototype.hasOwnProperty.call(normalizedPatch, "candidates")) {
    const candidates = sanitizeStoredCandidates(normalizedPatch.candidates);
    normalizedPatch.candidates = candidates;
    normalizedPatch.candidateCount = candidates.length;
  }

  const ref = db.collection(EVENT_COLLECTION).doc(String(eventId));
  await ref.set(normalizedPatch, { merge: true });

  return getEventById(eventId);
}

module.exports = {
  createEvent,
  getEventById,
  getCurrentEvent,
  setCurrentEventId,
  clearCurrentEventId,
  patchEvent
};