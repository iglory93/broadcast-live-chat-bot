const commandStore = require("../command/commandStore");

function buildCommandContext(channelId) {

  const list = commandStore.getAllCommands(channelId);

  return list;
}

module.exports = { buildCommandContext };