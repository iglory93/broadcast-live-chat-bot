const MASTERS = [999846, 981141];

function isMaster(chat) {
  const clientId = Number(chat?.clientChannelId);
  return MASTERS.includes(clientId);
}

function isManager(chat, channelId) {
  const clientId = Number(chat?.clientChannelId);
  const chId = Number(channelId);

  if (MASTERS.includes(clientId)) return true;
  if (clientId === chId) return true;
  if (chat?.role === "M") return true;

  return false;
}

module.exports = {
  isManager,
  isMaster
};