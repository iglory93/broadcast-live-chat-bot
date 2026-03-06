const commandStore = require("../store/commandStore");
const getWeather = require("../command/weather");
const sendChat = require("../chat/sendChat");
const crypto = require("crypto");
const specialJoin = require("../store/specialJoinStore");
const { askAI } = require("../ai/aiService");

async function handleCommand(chat) {

  //const channelId = chat?.channelId;
  const channelId = String(chat?.channelId);
  console.log("channelId:", channelId);

  /* 후원 이벤트 */
  if (chat.type === "gift") {

    const nickname = chat.nickname;
    const amount = chat.amount;
    let productName = chat.productName || "";

    if (!nickname || !amount) return;

    const amountText = amount + "렉스";

    if (productName) {
      productName = productName.replace(amountText, "");
      productName = `, [${productName}]`;
    }

    const AI_CHANCE = 0.5;

    if (Math.random() < AI_CHANCE) {

      try {

        const aiMessage = `
  후원 이벤트 발생

  닉네임: ${nickname}
  후원금액: ${amountText}
  아이템: ${productName || "없음"}

  방송 채팅처럼 짧게 드립으로 반응해라
  `;

        const ai = await askAI(aiMessage, "", channelId, null, "gift");

        if (ai) {
          await sendChat(channelId, ai);
          return;
        }

      } catch (err) {
        console.log("gift ai error", err);
      }

    }

    // AI 실패 또는 확률 실패 시 기본 메시지
    await sendChat(
      channelId,
      `🎁 ${nickname}님께서 ${amountText}${productName} 선물을 했습니다! 감사합니다 💖`
    );

    return;
  }

  /* 📢 전광판 이벤트 */
  if (chat.type === "announcement") {
    const ownerNickname = normalizeName(chat.ownerNickname);
    const nickname = chat.nickname;
    const target = chat.target;
    console.log( ownerNickname )
    if (!nickname || !target) return;

    if (ownerNickname && ownerNickname.includes(target)) {
      await sendChat(
        channelId,
        `[${nickname}] 님이 [${target}] 대상으로 전광판을 표출했습니다.`
      );

    }

    return;
  }

  /* 🐎 경마 이벤트 먼저 처리 */
  if (chat.type === "horse_racing") {

    const nickname = chat.nickname;
    const amount = chat.amount;

    if (!nickname || !amount) return;

    console.log("경마 베팅:", nickname, amount);

    await sendChat(
      channelId,
      `🐎 ${nickname}님이 경마에 ${amount}꿀 베팅했습니다! 건승🫡`
    );

    return;
  }

  /* 채팅 처리 */

  let message = chat?.message;

  if (Array.isArray(message)) {
    message = message.map(m => m?.msg || "").join(" ");
  }

  if (typeof message !== "string") return;

  message = message.trim();

  // 하리보 AI!@
  if (message.startsWith("@")) {
    const nickname = chat?.nickname;
    console.log(nickname)
    const question = message.substring(1).trim();

    if(!question) return;

    console.log("AI 질문:", question);
    const userId = chat?.clientChannelId;
    const answer = await askAI(question, nickname, channelId, userId);

    if(answer){
      await sendChat(channelId, answer);
    }

    return;
  }

  if (!message.startsWith("#")) return;

  const command = message.substring(1).trim();

  console.log("command:", command);

  if (chat.type === "chat") {

    try {

      /* 계산 명령어 */
      if (typeof command === "string" && command.startsWith("계산")) {

        const expr = command.replace("계산", "").trim();

        if (!expr) {
          await sendChat(channelId, "사용법: !계산 1+2*3");
          return;
        }

        try {

          // 숫자 + - * / ( ) 만 허용 (보안)
          if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
            await sendChat(channelId, "❌ 잘못된 계산식입니다.");
            return;
          }

          const result = Function(`"use strict"; return (${expr})`)();

          await sendChat(
            channelId,
            `🧮 계산 결과: ${expr} = ${result}`
          );

        } catch {
          await sendChat(channelId, "❌ 계산 실패");
        }

        return;
      }

      if (command === "랜덤") {

        const num = Math.floor(Math.random() * 101);

        await sendChat(
          channelId,
          `🎲 ${chat.nickname || "유저"}님의 숫자: ${num}`
        );

      }

      else if (command.startsWith("궁합")) {

        const parts = command.split(" ");

        if (parts.length < 3) {

          await sendChat(channelId, "사용법: #궁합 닉1 닉2");

          return;

        }

        const nick1 = parts[1];
        const nick2 = parts[2];

        const percent = getCompatibility(nick1, nick2);

        let msg = `💘 ${nick1} ❤️ ${nick2}\n궁합: ${percent}%`;

        if (percent >= 90) msg += "\n🔥 천생연분!";
        else if (percent >= 70) msg += "\n😊 잘 맞는 편!";
        else if (percent >= 40) msg += "\n🙂 무난한 궁합";
        else msg += "\n💀 위험한 관계";

        await sendChat(channelId, msg);

      }

      else if (command.includes("날씨")) {

        const tokens = command.split(" ");

        let city = "서울";

        if (tokens.length > 1) {

          city = tokens[0];

        }

        const weatherMsg = await getWeather(city);

        await sendChat(channelId, weatherMsg);

      }

      else if (command === "운세") {

        const data = getFortune(chat.nickname || "익명");

        await sendChat(
          channelId,
          `${chat.nickname || "익명"}님의 오늘 운세는? ${data}`
        );

      }
 
    else if (command.startsWith("채널입장 ")) {
      const parts = command.split(" ");
      const master = chat?.clientChannelId;
      if( master === 999846 || master === 981141 || master === channelId ) {
        if (parts.length < 3) {
          await sendChat(channelId, "사용법: #채널입장 유저아이디 입장멘트");
          return;
        }

        const userId = parts[1];
        const message = parts.slice(2).join(" ");

        specialJoin.add(channelId, userId, message);

        await sendChat(channelId, `✨ 채널 입장멘트 등록: ${userId}`);
      } else {
        await sendChat(channelId, `✅ 명령어 추가 권한 없음`);
      } 
    }

    else if (command.startsWith("채널입장삭제 ")) {
      const parts = command.split(" ");
      const master = chat?.clientChannelId;
      if( master === 999846 || master === 981141 || master === channelId ) {
        if (parts.length < 2) {
          await sendChat(channelId, "사용법: #채널입장삭제 유저아이디");
          return;
        }

        const userId = parts[1];

        specialJoin.remove(channelId, userId);

        await sendChat(channelId, `🗑 채널 입장멘트 삭제: ${userId}`);
      } else {
        await sendChat(channelId, `✅ 명령어 추가 권한 없음`);
      } 
    }

    else if (command.startsWith("입장 ")) {

      const parts = command.split(" ");
      const master = chat?.clientChannelId;
      if( master === 999846 || master === 981141 ) {
        if (parts.length < 3) {
          await sendChat(channelId, "사용법: #입장 유저아이디 입장멘트");
          return;
        }

        const userId = parts[1];
        const message = parts.slice(2).join(" ");

        specialJoin.add("global", userId, message);

        await sendChat(channelId, `🌍 글로벌 입장멘트 등록: ${userId}`);
      } else {
        await sendChat(channelId, `✅ 명령어 추가 권한 없음`);
      } 
    }

    else if (command.startsWith("입장삭제 ")) {

      const parts = command.split(" ");
      const master = chat?.clientChannelId;
      if( master === 999846 || master === 981141 ) {
        if (parts.length < 2) {
          await sendChat(channelId, "사용법: #입장삭제 유저아이디");
          return;
        }

        const userId = parts[1];

        specialJoin.remove("global", userId);

        await sendChat(channelId, `🗑 글로벌 입장멘트 삭제: ${userId}`);
      } else {
        await sendChat(channelId, `✅ 명령어 추가 권한 없음`);
      } 
    }

      /* 명령어 추가 */
    else if (command.startsWith("추가 ")) {
        const master = chat?.clientChannelId;
        // console.log( master + ' ' + (master === 999846 || master === 981141) )
       // if( master === 999846 || master === 981141 ) {
        const parts = command.split(" ");

        if (parts.length < 3) {
            await sendChat(channelId, "사용법: #추가 명령어 대답");
            return;
        }

        const key = parts[1];
        const value = parts.slice(2).join(" ");

        await commandStore.addGlobal(key, value);

        await sendChat(channelId, `명령어 추가됨: ${key}`);
        // } else {
        //    await sendChat(channelId, `✅ 명령어 추가 권한 없음`);
        // }
    }

    /* 채널 명령어 추가 */
    else if (command.startsWith("채널추가 ")) {
        const master = String(chat?.clientChannelId);
        console.log( channelId + ' ' + master )
        if (master === "999846" || master === "981141" || master === channelId) {
            const parts = command.split(" ");
            if (parts.length < 3) {
                await sendChat(channelId, "사용법: #채널추가 명령어 대답");
                return;
            }

            const key = parts[1];
            const value = parts.slice(2).join(" ");

            await commandStore.addChannel(channelId, key, value);

            await sendChat(channelId, `✅ 채널 명령어 추가: ${key}`);
           
        } else {
           await sendChat(channelId, `명령어 추가 권한 없음`);

        }
        
    }

    /* 삭제 */
    else if (command.startsWith("삭제 ")) { 
        const parts = command.split(" ");
        const master = String(chat?.clientChannelId);
        console.log( channelId + ' ' + master )
        if (master === "999846" || master === "981141" ) {
            if (parts.length < 2) {
                await sendChat(channelId, "사용법: #삭제 키");
                return;
            }

            const key = parts[1];

            await commandStore.removeGlobalCommand(key);

            await sendChat(channelId, `🗑 명령어 삭제: ${key}`);
        }else {
           await sendChat(channelId, `명령어 추가 권한 없음`);
        }

    }

    else if (command.startsWith("채널삭제 ")) { 
        const parts = command.split(" ");
        const master = String(chat?.clientChannelId);
        console.log( channelId + ' ' + master )
        if (master === "999846" || master === "981141" || master === channelId) {
            if (parts.length < 2) {
                await sendChat(channelId, "사용법: #채널삭제 키");
                return;
            }

            const key = parts[1];

            await commandStore.removeChannelCommand(channelId, key);

            await sendChat(channelId, `🗑 명령어 삭제: ${key}`);
        }else {
           await sendChat(channelId, `명령어 추가 권한 없음`);
        }

    }


    /* 명령어 */
    else if (command === "명령어") {

    const list = await commandStore.listCommands(channelId);

    const msg =
        `♣️ 공통 명령어: ${list.global?.join(", ") || "없음"}\n\n` +
        `🐝 방송 고유 명령어: ${list.channel?.join(", ") || ""}`;

    await sendChat(channelId, msg);

    }
      /* config 명령어 */
      else {

        const reply = await commandStore.findCommand(channelId, command);
        console.log("reply:", reply);
        if (!reply) return;

        await sendChat(channelId, reply);

      }

    } catch (err) {

      console.error("command error", err);

    }

  }

}

function getFortune(nickname) {

  try {

    const today = new Date();

    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");

    const seed = nickname + dateStr;

    const hash = crypto.createHash("sha256").update(seed).digest("hex");

    const digitMatch = hash.match(/[0-9]/);

    const index = digitMatch ? parseInt(digitMatch[0]) : 0;

    const fortunes = [
      "💀 오늘은 조용히 있는 게 좋습니다. 괜히 나섰다가 물폭탄 맞을 수도 있습니다.",
      "🙂 평범한 하루입니다. 큰 일은 없지만 채팅으로 존재감은 남길 수 있습니다.",
      "🍀 작은 행운이 찾아옵니다. 오늘 채팅 하나가 방송을 바꿀 수도 있습니다.",
      "🎁 예상치 못한 선물이 있을지도 모릅니다. 하지만 기대하면 안 옵니다.",
      "💬 채팅 운 상승! 오늘 채팅 치면 BJ가 읽어줄 확률이 높습니다.",
      "🔥 오늘 드립력 폭발! 채팅창을 웃겨버릴 수도 있습니다.",
      "💰 소소한 재물운이 있습니다. 커피 한 잔 얻어먹을 수도?",
      "🎯 원하는 일이 은근히 잘 풀립니다. 시도해볼 가치 있는 하루입니다.",
      "👑 오늘의 주인공 기운! 채팅창에서 존재감이 강해집니다.",
      "🌟 대박 운세! 오늘은 뭐든 해봐도 되는 날입니다."
    ];

    return fortunes[index % fortunes.length];

  } catch {

    return "🙂 평범한 하루입니다.";

  }

}

function getCompatibility(nick1, nick2) {

  const today = new Date();

  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");

  const pair = [nick1, nick2].sort().join("");

  const seed = pair + dateStr;

  const hash = crypto.createHash("sha256").update(seed).digest("hex");

  const num = parseInt(hash.substring(0, 4), 16);

  const percent = num % 101;

  return percent;

}
function normalizeName(name) {

  if (!name) return "";

  return name.replace(/[^\p{L}\p{N}]/gu, "");

}
module.exports = {
  handleCommand
};