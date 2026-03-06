const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../config/specialJoin.json");

let data = {};

function load() {

  if (!fs.existsSync(file)) {
    data = {};
    return;
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    data = JSON.parse(raw);
  } catch {
    data = {};
  }

}

function save() {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function add(channelId, userId, message) {

  load(); // 🔥 항상 최신 파일 읽기

  console.log("add:", channelId, userId, message);

  if (!data[channelId]) {
    data[channelId] = {};
  }

  data[channelId][userId] = message;

  save();

}

function remove(channelId, userId) {

  load(); // 🔥 최신 데이터

  if (!data[channelId]) return;

  delete data[channelId][userId];

  save();

}

function get(channelId, userId) {

  load(); // 🔥 매번 reload

 // console.log("lookup:", channelId, userId, data[channelId]);

  // 1. 채널 우선
  if (data[channelId] && data[channelId][userId]) {
    return data[channelId][userId];
  }

  // 2. 글로벌
  if (data.global && data.global[userId]) {
    return data.global[userId];
  }

  return null;

}

module.exports = {
  add,
  remove,
  get
};