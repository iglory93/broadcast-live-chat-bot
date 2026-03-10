function isMaster(chat) {
  const master = Number(chat?.clientChannelId);
  return (
    master === "999846" ||
    master === "981141" 
  );
}

function isManager(chat, channelId) {
  const master = Number(chat?.clientChannelId);
  return (
    master === "999846" ||
    master === "981141" ||
    master === String(channelId) ||
    chat?.role === "M"
  );
}

module.exports = {
  isManager,
  isMaster
};