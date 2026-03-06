// const { startCollector } = require("./chat/collector");
// const { startConsumer } = require("./chat/consumer");
// const { startSocket } = require("./socket/socketClient");
// const config = require("./config/config");

// require("./api/server");
// const startConsole = require("./console");


// async function start(){

//   startConsumer();
//   console.log('config : '+JSON.stringify(config))
//   //await startCollector(config.channelId);
//   //startSocket(config.channelId);
//   console.log('config : ' + JSON.stringify(config));

//   for (const channelId of config.channelIds) {
//     startCollector(channelId);
//   }

//   startConsole();

// }

// start();

const { startConsumer } = require("./chat/consumer");
const { startLiveWatcher } = require("./live/liveWatcher");
const config = require("./config/config");

require("./api/server");
const startConsole = require("./console");

async function start(){

  startConsumer();

  console.log('config : ' + JSON.stringify(config));

  startLiveWatcher(config.channelIds);

  startConsole();

}

start();