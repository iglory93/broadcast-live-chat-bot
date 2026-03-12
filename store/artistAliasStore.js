const db = require("../firebase");

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function normalizeAliasKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’‚‛“”„‟"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collection() {
  return db.collection("artistAliases");
}

function getCache(key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function setCache(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

async function getAliases(artist) {
  const key = normalizeAliasKey(artist);
  if (!key) {
    return [];
  }

  const cached = getCache(key);
  if (cached) {
    return cached;
  }

  const snap = await collection().doc(key).get();
  if (!snap.exists) {
    const fallback = [String(artist || "").trim()].filter(Boolean);
    setCache(key, fallback);
    return fallback;
  }

  const data = snap.data() || {};
  const aliases = Array.isArray(data.aliases)
    ? data.aliases.map(v => String(v || "").trim()).filter(Boolean)
    : [];

  const canonical = String(data.canonical || "").trim();

  const merged = [...new Set([String(artist || "").trim(), canonical, ...aliases].filter(Boolean))];

  setCache(key, merged);
  return merged;
}

async function saveAliasGroup(values, canonicalInput = "") {
  const cleaned = [...new Set(
    (Array.isArray(values) ? values : [])
      .map(v => String(v || "").trim())
      .filter(Boolean)
  )];

  if (!cleaned.length) {
    throw new Error("ALIAS_VALUES_REQUIRED");
  }

  const canonical = String(canonicalInput || cleaned[0]).trim();
  const batch = db.batch();
  const now = new Date();

  for (const value of cleaned) {
    const key = normalizeAliasKey(value);
    batch.set(
      collection().doc(key),
      {
        aliasKey: key,
        canonical,
        aliases: cleaned,
        updatedAt: now
      },
      { merge: true }
    );

    cache.delete(key);
  }

  await batch.commit();
  return {
    canonical,
    aliases: cleaned
  };
}

module.exports = {
  normalizeAliasKey,
  getAliases,
  saveAliasGroup
};