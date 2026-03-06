const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../config/commands.json");

let commands = {};

function loadCommands() {

  if (!fs.existsSync(file)) {
    commands = {};
    return;
  }

  const data = fs.readFileSync(file, "utf8");

  // console.log("file raw:", data);   

  try {

    commands = JSON.parse(data);

    // console.log("commands loaded:", commands);   
  } catch (err) {

    console.error("commands.json parse error", err);
    commands = {};

  }

}

function getAllCommands(channelId) {

  loadCommands();

  const id = String(channelId);

  const globalCommands = commands.global || {};
  const channelCommands = commands.channels?.[id] || {};

  return {
    global: globalCommands,
    channel: channelCommands
  };

}

/* 글로벌 추가 */
function addGlobal(key, value) {

  loadCommands();

  commands.global[key] = value;

  saveCommands();

}


/* 채널 추가 */
function addChannel(channelId, key, value) {

  loadCommands();

  const id = String(channelId);

  if (!commands.channels[id]) {
    commands.channels[id] = {};
  }

  commands.channels[id][key] = value;

  saveCommands();

} 

function removeGlobalCommand(key) {

  loadCommands();

  delete commands.global[key];

  saveCommands();

}

function removeChannelCommand(channelId, key) {

  loadCommands();

  const id = String(channelId);

  if (commands.channels?.[id]) {
    delete commands.channels[id][key];
  }

  saveCommands();

}

function saveCommands() {

  fs.writeFileSync(
    file,
    JSON.stringify(commands, null, 2),
    "utf8"
  );

}

/* 목록 */
function listCommands(channelId) {

  loadCommands();

  const id = String(channelId);

  const channelCommands = commands.channels?.[id] || {};
  const globalCommands = commands.global || {};

  return {
    global: Object.keys(globalCommands),
    channel: Object.keys(channelCommands)
  };

}


/* 명령어 조회 */
function getCommand(channelId, name) {

  loadCommands();

  const id = String(channelId);
  const key = String(name).trim();

  const channelCommands = commands.channels?.[id] || {};
  const globalCommands = commands.global || {};

  console.log("lookup key:", key);
  console.log("channel match:", channelCommands[key]);
  console.log("global match:", globalCommands[key]);

  return channelCommands[key] || globalCommands[key];

}

module.exports = {
  getCommand,
  addGlobal,
  addChannel,
  getAllCommands,
  removeGlobalCommand,
  removeChannelCommand,
  listCommands
};