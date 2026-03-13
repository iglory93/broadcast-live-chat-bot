const db = require("../firebase");

const configCache = {};
const watching = new Set();

const DEFAULT_FEATURES = {
  ai: {
    enabled: true
  },
  lexNotice: {
    enabled: false
  }
};

function normalizeScope(scope) {
  return String(scope || "global");
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_FEATURES));
}

function mergeFeatureConfig(base, incoming) {
  return {
    ...base,
    ...(incoming || {}),
    ai: {
      ...base.ai,
      ...(incoming?.ai || {})
    },
    lexNotice: {
      ...base.lexNotice,
      ...(incoming?.lexNotice || {})
    }
  };
}

function buildScopeConfig(data) {
  const defaults = cloneDefaults();
  const features = mergeFeatureConfig(defaults, data?.features || {});

  return {
    features,
    updatedAt: data?.updatedAt || null
  };
}

function ensureWatcher(scope) {
  scope = normalizeScope(scope);

  if (watching.has(scope)) {
    return;
  }

  watching.add(scope);

  db.collection("channelConfigs")
    .doc(scope)
    .onSnapshot(
      (snap) => {
        const data = snap.exists ? snap.data() : {};
        configCache[scope] = buildScopeConfig(data);
        console.log("channel config updated:", scope, configCache[scope]);
      },
      (err) => {
        console.log("channel config watcher error:", scope, err.message);
      }
    );
}

function primeScope(scope) {
  ensureWatcher(scope);
}

function getScopeConfig(scope) {
  scope = normalizeScope(scope);

  const localConfig = configCache[scope];
  const globalConfig = configCache.global;

  const defaults = cloneDefaults();

  if (scope === "global") {
    return mergeFeatureConfig(defaults, localConfig?.features || {});
  }

  return mergeFeatureConfig(
    mergeFeatureConfig(defaults, globalConfig?.features || {}),
    localConfig?.features || {}
  );
}

function getStatus(scope) {
  const features = getScopeConfig(scope);

  return {
    aiEnabled: features.ai.enabled === true,
    lexNoticeEnabled: features.lexNotice.enabled === true,
    features
  };
}

function isAiEnabled(scope) {
  return getScopeConfig(scope).ai.enabled === true;
}

function isLexNoticeEnabled(scope) {
  return getScopeConfig(scope).lexNotice.enabled === true;
}

async function setFeatureEnabled(scope, featureKey, enabled) {
  scope = normalizeScope(scope);

  const nextEnabled = !!enabled;
  const prevConfig = configCache[scope]
    ? JSON.parse(JSON.stringify(configCache[scope]))
    : null;

  const current = configCache[scope] || buildScopeConfig({});
  const next = {
    ...current,
    features: mergeFeatureConfig(current.features, {
      [featureKey]: {
        enabled: nextEnabled
      }
    }),
    updatedAt: new Date()
  };

  configCache[scope] = next;

  try {
    await db.collection("channelConfigs").doc(scope).set(
      {
        features: {
          [featureKey]: {
            enabled: nextEnabled
          }
        },
        updatedAt: new Date()
      },
      { merge: true }
    );
  } catch (err) {
    if (prevConfig) {
      configCache[scope] = prevConfig;
    } else {
      delete configCache[scope];
    }
    throw err;
  }
}

async function setAiEnabled(scope, enabled) {
  await setFeatureEnabled(scope, "ai", enabled);
}

async function setLexNoticeEnabled(scope, enabled) {
  await setFeatureEnabled(scope, "lexNotice", enabled);
}

module.exports = {
  primeScope,
  getStatus,
  isAiEnabled,
  isLexNoticeEnabled,
  setAiEnabled,
  setLexNoticeEnabled
};