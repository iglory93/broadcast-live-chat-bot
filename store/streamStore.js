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

function getAll() {

  return Object.entries(streams).map(([channelId, data]) => ({
    channelId,
    streamId: data.streamId,
    broadcastId: data.broadcastId,
    title: data.title,
    ownerNickname: data.ownerNickname,
    startedAt: data.startedAt
  }));

}

module.exports = {
  set,
  get,
  remove,
  isLive,
  getBroadcastId,
  getAll
};