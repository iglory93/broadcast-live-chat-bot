const viewers = {};

function set(channelId, list){
  viewers[channelId] = list;
}

function get(channelId){
  return viewers[channelId] || [];
}

module.exports = { set, get };