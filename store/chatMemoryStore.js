const history = {};
const MAX = 20;

function add(channelId, nickname, message) {

  if (!history[channelId]) {
    history[channelId] = [];
  }

  history[channelId].push(`${nickname}: ${message}`);

  if (history[channelId].length > MAX) {
    history[channelId].shift();
  }

}

function get(channelId) {
  return history[channelId] || [];
}

module.exports = {
  add,
  get
};