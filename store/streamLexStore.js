const totals = {};

function normalizeAmount(amount) {
  const num = Number(amount);

  if (!Number.isFinite(num) || num < 0) {
    return null;
  }

  return Math.floor(num);
}

function set(channelId, amount) {
  channelId = String(channelId || "");

  const value = normalizeAmount(amount);

  if (!channelId || value === null) {
    return;
  }

  totals[channelId] = value;
}

function get(channelId) {
  channelId = String(channelId || "");

  if (!channelId) {
    return null;
  }

  return typeof totals[channelId] === "number" ? totals[channelId] : null;
}

function remove(channelId) {
  channelId = String(channelId || "");

  if (!channelId) {
    return;
  }

  delete totals[channelId];
}

module.exports = {
  set,
  get,
  remove
};