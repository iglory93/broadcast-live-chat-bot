const clientsByEventId = new Map();

function addClient(eventId, res) {
  const key = String(eventId);

  if (!clientsByEventId.has(key)) {
    clientsByEventId.set(key, new Set());
  }

  clientsByEventId.get(key).add(res);
}

function removeClient(eventId, res) {
  const key = String(eventId);
  const set = clientsByEventId.get(key);

  if (!set) {
    return;
  }

  set.delete(res);

  if (!set.size) {
    clientsByEventId.delete(key);
  }
}

function publish(eventId, payload) {
  const key = String(eventId);
  const set = clientsByEventId.get(key);

  if (!set || !set.size) {
    return;
  }

  const message = `event: state\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of set) {
    try {
      res.write(message);
    } catch (err) {}
  }
}

module.exports = {
  addClient,
  removeClient,
  publish
};