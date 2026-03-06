require("dotenv").config();
const fs = require("fs");
const path = require("path");

const configFile = path.join(__dirname, "config.json");

let jsonConfig = {};

if (fs.existsSync(configFile)) {
  jsonConfig = JSON.parse(fs.readFileSync(configFile));
}

/* 환경변수 우선 */
jsonConfig.openRouteAiKey = process.env.OPEN_ROUTE_AI_KEY;
jsonConfig.ttingId = process.env.TTING_ID;
jsonConfig.ttingPw = process.env.TTING_PWD;
console.log(jsonConfig);

module.exports = jsonConfig;