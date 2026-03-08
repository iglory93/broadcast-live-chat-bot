const streams = {};

function set(channelId, data) {
  streams[channelId] = data;
}

function get(channelId) {
  return streams[channelId] || null;
}

function remove(channelId) {
  delete streams[channelId];
}

function isLive(channelId) {
  return !!streams[channelId];
}

function getBroadcastId(channelId) {
  return streams[channelId]?.broadcastId || null;
}


module.exports = {
  set,
  get,
  remove,
  isLive,
  getBroadcastId
};