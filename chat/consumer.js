// const queue = require("./queue");
// const commandService = require("../service/commandService");
// const chatMemory = require("../store/chatMemoryStore");
// const rankStore = require("../store/rankStore");
// const sendChat = require("./sendChat");
// const profileCache = require("../store/profileCache");

// function startConsumer() {
//   console.log("chat consumer 시작");

//   setInterval(() => {
//     let processed = 0;

//     while (queue.size() > 0 && processed < 50) {
//       const chat = queue.pop();
//       if (!chat) break;

//       processed++;

//       if (chat.type === "chat") {
//         chatMemory.add(chat.channelId, chat.nickname, chat.message);

//         if (chat.clientChannelId && chat.nickname) {
//           profileCache.warmNickname(chat.clientChannelId, chat.nickname);
//         }

//         rankStore.addChat(chat)
//           .then(levelResult => {
//             if (levelResult?.levelUp) {
//               return sendChat(
//                 chat.channelId,
//                 `🎉 ${chat.nickname}님 레벨업! Lv.${levelResult.prevLevel} → Lv.${levelResult.nextLevel}`
//               );
//             }
//           })
//           .catch(err => {
//             console.log("rankStore addChat error:", err.message);
//           });
//       }

//       commandService.handleCommand(chat).catch(err => {
//         console.log("commandService error:", err.message);
//       });
//     }
//   }, 20);
// }

// module.exports = { startConsumer };
const queue = require("./queue");
const commandService = require("../service/commandService");
const chatMemory = require("../store/chatMemoryStore");
const rankStore = require("../store/rankStore");
const sendChat = require("./sendChat");
const profileCache = require("../store/profileCache");
const attendanceStore = require("../store/attendanceStore"); // 추가

function startConsumer() {
  console.log("chat consumer 시작");

  setInterval(() => {
    let processed = 0;

    while (queue.size() > 0 && processed < 50) {
      const chat = queue.pop();
      if (!chat) break;

      processed++;

      if (chat.type === "chat") {
        chatMemory.add(chat.channelId, chat.nickname, chat.message);

        if (chat.clientChannelId && chat.nickname) {
          profileCache.warmNickname(chat.clientChannelId, chat.nickname);
        }

        const rawMessage = Array.isArray(chat.message)
          ? chat.message.map(m => m?.msg || "").join(" ").trim()
          : String(chat.message || "").trim();

        const isManualAttendCommand =
          rawMessage === "!출석" || rawMessage === "#출석";

        // !출석 / #출석이면 commandService에서 처리하게 넘기고
        // 그 외 첫 채팅이면 자동 출석
        if (!isManualAttendCommand) {
          attendanceStore.autoAttend(chat)
            .then(async (result) => {
              if (result?.ok) {
                await sendChat(
                  chat.channelId,
                  `📅 ${chat.nickname}님 출석 완료! 오늘 ${result.rank}등 / 연속 ${result.streak}일 / 이번달 ${result.monthlyCount}일`
                );
              }
            })
            .catch(err => {
              console.log("attendance autoAttend error:", err.message);
            });
        }

        rankStore.addChat(chat)
          .then(levelResult => {
            if (levelResult?.levelUp) {
              return sendChat(
                chat.channelId,
                `🎉 ${chat.nickname}님 레벨업! Lv.${levelResult.prevLevel} → Lv.${levelResult.nextLevel}`
              );
            }
          })
          .catch(err => {
            console.log("rankStore addChat error:", err.message);
          });
      }

      commandService.handleCommand(chat).catch(err => {
        console.log("commandService error:", err.message);
      });
    }
  }, 20);
}

module.exports = { startConsumer };