const cache = new Map();

function makeKey(parts) {
  return parts.map(v => String(v)).join("::");
}

function get(parts) {
  const key = makeKey(parts);
  const item = cache.get(key);

  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function set(parts, value, ttlMs) {
  const key = makeKey(parts);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function del(parts) {
  cache.delete(makeKey(parts));
}

function clearPrefix(prefix) {
  const start = `${prefix}::`;

  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(start)) {
      cache.delete(key);
    }
  }
}

module.exports = {
  get,
  set,
  del,
  clearPrefix
};