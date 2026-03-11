// const queue = require("./queue");
// const commandService = require("../service/commandService");
// const chatMemory = require("../store/chatMemoryStore");
// const rankStore = require("../store/rankStore");
// const sendChat = require("./sendChat");
// const profileCache = require("../store/profileCache");
// const attendanceStore = require("../store/attendanceStore"); // 추가

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

//         const rawMessage = Array.isArray(chat.message)
//           ? chat.message.map(m => m?.msg || "").join(" ").trim()
//           : String(chat.message || "").trim();

//         const isManualAttendCommand =
//           rawMessage === "!출석" || rawMessage === "#출석";

//         // !출석 / #출석이면 commandService에서 처리하게 넘기고
//         // 그 외 첫 채팅이면 자동 출석
//         if (!isManualAttendCommand) {
//           attendanceStore.autoAttend(chat)
//             .then(async (result) => {
//               if (result?.ok) {
//                 await sendChat(
//                   chat.channelId,
//                   `📅 ${chat.nickname}님 출석 완료! 오늘 ${result.rank}등 / 연속 ${result.streak}일 / 이번달 ${result.monthlyCount}일`
//                 );
//               }
//             })
//             .catch(err => {
//               console.log("attendance autoAttend error:", err.message);
//             });
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
const attendanceStore = require("../store/attendanceStore");
const { askMilestoneComment } = require("../ai/aiService");

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
        //console.log(chat)
        rankStore.addChat(chat)
          .then(async (result) => {
            if (result?.levelUp) {
              await sendChat(
                chat.channelId,
                `🎉 ${chat.nickname}님 레벨업! Lv.${result.prevLevel} → Lv.${result.nextLevel}`
              );
            }

            if (result?.chatMilestone) {
              let milestoneMessage = null;

              const useAiComment = Math.random() < 0.5;

              if (useAiComment) {
                milestoneMessage = await askMilestoneComment(
                  chat.nickname,
                  result.milestoneCount,
                  chat.channelId
                );
              }

              if (!milestoneMessage) {
                milestoneMessage =
                  result.message ||
                  buildLocalMilestoneMessage(chat.nickname, result.milestoneCount);
              }

              await sendChat(chat.channelId, milestoneMessage);
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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildLocalMilestoneMessage(name, milestone) {
  const normalMessages = [
    `🎉 ${name}님 ${milestone}채팅 달성! 오늘 키보드 폼 좋습니다 👏`,
    `🥳 ${name}님 ${milestone}채팅 돌파! 존재감 확실하네요`,
    `🔥 ${name}님 ${milestone}채팅 완료! 오늘 텐션 좋습니다`,
    `💬 ${name}님 ${milestone}채팅 달성! 채팅창 고정멤버 인정`,
    `✨ ${name}님 ${milestone}채팅 축하! 분위기 살리는 중입니다`,
    `🎊 ${name}님 ${milestone}채팅 성공! 오늘 감 좋네요`,
    `👏 ${name}님 ${milestone}채팅 달성! 손이 아주 바쁩니다`,
    `🚀 ${name}님 ${milestone}채팅 돌파! 이 기세 좋습니다`,
    `💖 ${name}님 ${milestone}채팅 감사합니다! 존재감 만점`,
    `😎 ${name}님 ${milestone}채팅 완료! 오늘 활약이 좋습니다`
  ];

  const highMessages = [
    `👑 ${name}님 ${milestone}채팅 달성! 오늘 채팅왕 분위기입니다`,
    `🏆 ${name}님 ${milestone}채팅 돌파! 존재감이 레전드네요`,
    `🔥 ${name}님 ${milestone}채팅! 채팅창 지분율이 미쳤습니다`,
    `🎖 ${name}님 ${milestone}채팅 달성! 박수 크게 갑시다 👏`,
    `💎 ${name}님 ${milestone}채팅 돌파! 오늘 진짜 폼 좋네요`
  ];

  if (milestone >= 1000) {
    return pickRandom(highMessages);
  }

  return pickRandom(normalMessages);
}

module.exports = { startConsumer };