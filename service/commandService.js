// ===== service/commandService.js =====
const commandStore = require("../store/commandStore");
const getWeather = require("../command/weather");
const sendChat = require("../chat/sendChat");
const crypto = require("crypto");
const specialJoin = require("../store/specialJoinStore");
const { askAI } = require("../ai/aiService");
const rankStore = require("../store/rankStore");
const profileCache = require("../store/profileCache");
const streamStore = require("../store/streamStore");
const attendanceStore = require("../store/attendanceStore");
const danceStore = require("../store/danceStore");
const danceManager = require("../live/danceManager");
const songRequestService = require("./songRequestService");
const cleanStore = require("../store/cleanStore.js");
const utils = require("../utils/util");
const timerStore = require("../store/timerStore");
const { getFortune } = require("../command/fortune");
const aiConfigStore = require("../store/aiConfigStore");
const noticeStore = require("../store/noticeStore");

async function getNicknameMap(rows) {
  const ids = [...new Set(rows.map(row => String(row.userId)))];

  const pairs = await Promise.all(
    ids.map(async (userId) => {
      const nickname = await profileCache.getNickname(userId);
      return [userId, nickname || `유저${userId}`];
    })
  );

  return Object.fromEntries(pairs);
}

async function getNicknameOrDefault(userId) {
  return (await profileCache.getNickname(userId)) || `유저${userId}`;
}

async function handleCommand(chat) {
  const channelId = String(chat?.channelId);
  //console.log("channelId:", channelId);

  /* 후원 이벤트 */
  if (chat.type === "gift" || chat.type === "honey") {
    const nickname = chat.nickname;
    const amount = chat.amount;
    let productName = chat.productName || "";

    if (!nickname || !amount) return;
    
    const item = chat.type === "gift" ? "렉스" : "꿀";
    const amountText = amount + item;

    if (productName) {
      productName = productName.replace(amountText, "");
      if( productName != "" ){
        productName = `, [${productName}]`;
      }
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

    await sendChat(
      channelId,
      `🎁 ${nickname}님께서 ${amountText}${productName} 선물을 했습니다! 감사합니다 💖`
    );

    return;
  }

  /* 전광판 이벤트 */
  if (chat.type === "announcement") {
    const ownerNickname = normalizeName(chat.ownerNickname);
    const nickname = chat.nickname;
    const target = chat.target;

    if (!nickname || !target) return;

    if (ownerNickname && ownerNickname.includes(target)) {
      await sendChat(
        channelId,
        `[${nickname}] 님이 [${target}] 대상으로 전광판을 표출했습니다.`
      );
    }

    return;
  }

  /* 경마 이벤트 */
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

  let message = chat?.message;

  if (Array.isArray(message)) {
    message = message.map((m) => m?.msg || "").join(" ");
  }

  if (typeof message !== "string") return;

  message = message.trim();

  /* AI 질문 */
  if (message.startsWith("@")) {
    const nickname = chat?.nickname;
    const question = message.substring(1).trim();

    if (!question) return;

    console.log("AI 질문:", question);

    if (!aiConfigStore.isEnabled(channelId)) {
      await sendChat(channelId, "🤖 현재 이 방송의 AI 기능은 OFF 상태입니다.");
      return;
    }

    const userId = chat?.clientChannelId;
    const answer = await askAI(question, nickname, channelId, userId);

    if (answer) {
      await sendChat(channelId, answer);
    }

    return;
  }

  if (!message.startsWith("!") && !message.startsWith("#")) return;

  const startStr =  message.substring(0,1).trim();
  const command = message.substring(1).trim();
  console.log("command:", command);

  if (chat.type !== "chat") return;

  try {
    
    /* AI켜기 */
    if (command === "AI켜기") {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "명령어 추가 권한 없음");
        return;
      }

      await aiConfigStore.setEnabled(channelId, true);
      aiConfigStore.primeScope(channelId);
      await sendChat(channelId, "🤖 이 방송의 AI 기능을 ON으로 설정했습니다.");
      return;
    }

    /* AI끄기 */
    if (command === "AI끄기") {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "명령어 추가 권한 없음");
        return;
      }

      await aiConfigStore.setEnabled(channelId, false);
      aiConfigStore.primeScope(channelId);
      await sendChat(channelId, "🙈 이 방송의 AI 기능을 OFF로 설정했습니다.");
      return;
    }

    /* AI상태 */
    if (command === "AI상태") {
      const status = aiConfigStore.getStatus(channelId);
      await sendChat(channelId, `🤖 AI 기능 상태: ${status.enabled ? "ON" : "OFF"}`);
      return;
    }

    /* 공지추가 */
    if (command.startsWith("공지추가 ")) {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "명령어 추가 권한 없음");
        return;
      }

      const match = command.match(/^공지추가\s+(\d{1,3})\s+([^\s]+)\s+(.+)$/);

      if (!match) {
        await sendChat(channelId, `사용법: ${startStr}공지추가 5 점검안내 10분 후 재시작합니다`);
        return;
      }

      const minute = Number(match[1]);
      const title = String(match[2] || "").trim();
      const body = String(match[3] || "").trim();

      const current = noticeStore.listNotices(channelId);
      let slot = 1;
      while (slot <= 3 && current.find((item) => item.slot === slot)) {
        slot += 1;
      }

      if (slot > 3) {
        await sendChat(channelId, `공지 슬롯이 가득 찼습니다. ${startStr}공지삭제 1~3 후 다시 등록해주세요.`);
        return;
      }

      try {
        await noticeStore.setNotice(channelId, slot, minute, title, body);
        noticeStore.primeScope(channelId);
        await sendChat(channelId, `📢 공지 ${slot}번 등록 완료! ${minute}분마다 [${title}] 공지가 나갑니다.`);
      } catch (err) {
        if (err.message === "invalid_minute") {
          await sendChat(channelId, "공지 분은 1~180 사이 정수만 가능합니다.");
          return;
        }

        await sendChat(channelId, `공지 등록 실패: ${err.message}`);
      }

      return;
    }

    /* 공지삭제 */
    if (command.startsWith("공지삭제 ")) {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "명령어 추가 권한 없음");
        return;
      }

      const parts = command.split(/\s+/).filter(Boolean);
      const slot = Number(parts[1]);

      if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
        await sendChat(channelId, `사용법: ${startStr}공지삭제 1`);
        return;
      }

      await noticeStore.removeNotice(channelId, slot);
      await sendChat(channelId, `🗑 공지 ${slot}번을 삭제했습니다.`);
      return;
    }

    // /* 공지목록 */
    // if (command.startsWith("공지목록")) {
    //   const rows = noticeStore.listNotices(channelId);
    //   const parts = command.split(/\s+/).filter(Boolean);
    //   const slot = parts.length >= 2 ? Number(parts[1]) : null;

    //   if (!rows.length) {
    //     await sendChat(channelId, "등록된 공지가 없습니다.");
    //     return;
    //   }

    //   if (slot) {
    //     const item = rows.find((row) => row.slot === slot);

    //     if (!item) {
    //       await sendChat(channelId, `공지 ${slot}번은 비어 있습니다.`);
    //       return;
    //     }

    //     await sendChat(channelId, `📋 공지 ${item.slot}번: ${item.minute}분 / ${item.title} / ${item.message}`);
    //     return;
    //   }

    //   const text = rows
    //     .map((row) => `${row.slot}. ${row.minute}분 / ${row.title} / ${row.message}`)
    //     .join(" | ");

    //   await sendChat(channelId, `📋 공지목록: ${text}`);
    //   return;
    // }
    /* 공지목록 */
    else if (command.startsWith("공지목록")) {
      const parts = command.split(" ").filter(Boolean);
      const notices = noticeStore.listNotices(channelId) || [];

      const slotMap = {};
      notices.forEach((item) => {
        slotMap[Number(item.slot)] = item;
      });

      const emojiMap = {
        1: "1️⃣",
        2: "2️⃣",
        3: "3️⃣"
      };

      // #공지목록 1 ~ #공지목록 3 개별 조회
      if (parts.length >= 2) {
        const slot = Number(parts[1]);

        if (![1, 2, 3].includes(slot)) {
          await sendChat(channelId, `사용법: ${startStr}공지목록 또는 ${startStr}공지목록 1`);
          return;
        }

        const item = slotMap[slot];

        if (!item) {
          await sendChat(channelId, `📢 공지 ${slot}번은 비어있습니다.`);
          return;
        }

        const msg =
    `${emojiMap[slot]} 공지 ${slot}번
    ⏱ 주기: ${item.minute}분
    🏷 제목: ${item.title}
    📝 내용: ${item.message}`;

        await sendChat(channelId, msg);
        return;
      }

      // 전체 목록 조회
      const lines = ["📢 공지 목록"];

      for (let slot = 1; slot <= 3; slot += 1) {
        const item = slotMap[slot];

        if (!item) {
          lines.push(`${emojiMap[slot]} 비어있음`);
          continue;
        }

        lines.push(
          `${emojiMap[slot]} ${item.minute}분 | [${item.title}]`,
          `   ${item.message}`
        );
      }

      await sendChat(channelId, lines.join("\n"));
      return;
    }

    /* 댄스시작 */
    if (command.startsWith("댄스시작")) {
      const parts = command.split(/\s+/).filter(Boolean);
      const durationSec = parts.length >= 2 ? Number(parts[1]) : undefined;
      const gapSec = parts.length >= 3 ? Number(parts[2]) : undefined;

      const result = danceManager.start(channelId, {
        durationSec,
        gapSec
      });

      if (!result.ok) {
        if (result.reason === "already_running") {
          await sendChat(channelId, `💃 이미 댄스 진행 중입니다. 남은 시간 ${result.remainSec}초`);
          return;
        }

        if (result.reason === "cooldown") {
          await sendChat(channelId, `🕒 댄스 쿨타임입니다. ${result.cooldownSec}초 후 다시 시작할 수 있어요.`);
          return;
        }

        if (result.reason === "no_routine") {
          await sendChat(channelId, `댄스 루틴이 없습니다. ${startStr}댄스관리 1 💃 같은 식으로 먼저 등록해주세요.`);
          return;
        }
      }

      await sendChat(channelId, `💃 댄스 시작! 진행 ${result.durationSec}초 / 간격 ${result.gapSec}초 / 루틴 ${result.count}개`);
      return;
    }

    /* 댄스종료 */
    else if (command === "댄스종료") {
      if (utils.isManager(chat, channelId)) {
        const result = danceManager.stop(channelId, "manual");

        if (!result.ok) {
          await sendChat(channelId, "현재 진행 중인 댄스가 없습니다.");
          return;
        }

        await sendChat(channelId, "🛑 댄스를 종료했습니다. 종료 후 30초 쿨타임이 적용됩니다.");
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 댄스상태 */
    else if (command === "댄스상태") {
      const status = danceManager.getStatus(channelId);

      if (status.running) {
        await sendChat(channelId, `💃 댄스 진행 중 / 남은 시간 ${status.remainSec}초 / 간격 ${status.gapSec}초`);
        return;
      }

      if (status.cooldownSec > 0) {
        await sendChat(channelId, `🕒 현재 댄스 쿨타임 ${status.cooldownSec}초`);
        return;
      }

      await sendChat(channelId, "댄스는 현재 대기 상태입니다.");
      return;
    }

    /* 댄스관리 */
    else if (command.startsWith("댄스관리 ")) {
      if (utils.isManager(chat, channelId)) {
        const parts = command.split(/\s+/);

        if (parts.length < 3) {
          await sendChat(channelId, `사용법: ${startStr}댄스관리 1 💃`);
          return;
        }

        const slot = Number(parts[1]);
        const messageText = parts.slice(2).join(" ").trim();

        if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
          await sendChat(channelId, "댄스 슬롯은 1~10만 가능합니다.");
          return;
        }

        if (!messageText) {
          await sendChat(channelId, `사용법: ${startStr}댄스관리 1 💃`);
          return;
        }

        await danceStore.setMessage(channelId, slot, messageText);
        danceStore.primeScope(channelId);
        await sendChat(channelId, `✅ 채널 댄스 루틴 등록: ${slot}번`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 댄스관리삭제 */
    else if (command.startsWith("댄스관리삭제 ")) {
      const master = String(chat?.clientChannelId);

      if (utils.isManager(chat, channelId)) {
        const parts = command.split(/\s+/).filter(Boolean);
        const slot = Number(parts[1]);

        if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
          await sendChat(channelId, `사용법: ${startStr}댄스관리삭제 1`);
          return;
        }

        await danceStore.removeMessage(channelId, slot);
        await sendChat(channelId, `🗑 채널 댄스 루틴 삭제: ${slot}번`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 댄스공통 */
    else if (command.startsWith("댄스공통 ")) {
      if (utils.isMaster(chat)) {
        const parts = command.split(/\s+/);

        if (parts.length < 3) {
          await sendChat(channelId, `사용법: ${startStr}댄스공통 1 💃`);
          return;
        }

        const slot = Number(parts[1]);
        const messageText = parts.slice(2).join(" ").trim();

        if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
          await sendChat(channelId, "댄스 슬롯은 1~10만 가능합니다.");
          return;
        }

        if (!messageText) {
          await sendChat(channelId, `사용법: ${startStr}댄스공통 1 💃`);
          return;
        }

        await danceStore.setMessage("global", slot, messageText);
        danceStore.primeScope("global");
        await sendChat(channelId, `🌍 공통 댄스 루틴 등록: ${slot}번`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 댄스공통삭제 */
    else if (command.startsWith("댄스공통삭제 ")) {
      const master = String(chat?.clientChannelId);

      if (utils.isMaster(chat)) {
        const parts = command.split(/\s+/).filter(Boolean);
        const slot = Number(parts[1]);

        if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
          await sendChat(channelId, `사용법: ${startStr}댄스공통삭제 1`);
          return;
        }

        await danceStore.removeMessage("global", slot);
        await sendChat(channelId, `🗑 공통 댄스 루틴 삭제: ${slot}번`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 댄스목록 */
    else if (command === "댄스목록") {
      const routine = danceStore.getMergedRoutine(channelId);

      if (!routine.length) {
        await sendChat(channelId, "등록된 댄스 루틴이 없습니다.");
        return;
      }

      const msg = ["💃 현재 댄스 루틴"];

      routine.forEach(row => {
        msg.push(`${row.slot}. ${row.message}`);
      });

      await sendChat(channelId, msg.join("\n"));
      return;
    }

    /* 청소 */
    else if (command === "청소") {
      const lines = cleanStore.getLines(channelId);
      const cleanMessage = cleanStore.buildCleanMessage(lines);

      await sendChat(channelId, cleanMessage);
      return;
    }

    /* 청소관리 */
    else if (command.startsWith("청소관리 ")) {
      if (!songRequestService.isManager(chat, channelId)) {
        await sendChat(channelId, "청소관리 권한 없음");
        return;
      }

      const parts = command.split(/\s+/).filter(Boolean);
      const lines = Number(parts[1]);

      if (!Number.isInteger(lines) || lines < 1 || lines > 50) {
        await sendChat(channelId, `사용법: ${startStr}청소관리 10 (1~50)`);
        return;
      }

      await cleanStore.setLines(channelId, lines);
      cleanStore.primeScope(channelId);

      await sendChat(channelId, `🧹 채널 청소 줄 수 설정: ${lines}줄`);
      return;
    }

    /* 청소공통 */
    else if (command.startsWith("청소공통 ")) {
      const master = String(chat?.clientChannelId || "");

      if (master !== "999846" && master !== "981141") {
        await sendChat(channelId, "청소공통 설정 권한 없음");
        return;
      }

      const parts = command.split(/\s+/).filter(Boolean);
      const lines = Number(parts[1]);

      if (!Number.isInteger(lines) || lines < 1 || lines > 50) {
        await sendChat(channelId, `사용법: ${startStr}청소공통 10 (1~50)`);
        return;
      }

      await cleanStore.setLines("global", lines);
      cleanStore.primeScope("global");

      await sendChat(channelId, `🌍 글로벌 청소 줄 수 설정: ${lines}줄`);
      return;
    }

    /* 청소설정 */
    else if (command === "청소설정") {
      const resolved = cleanStore.getResolvedConfig(channelId);

      const sourceText =
        resolved.source === "channel"
          ? "채널 설정"
          : resolved.source === "global"
            ? "글로벌 설정"
            : "기본값";

      await sendChat(
        channelId,
        `🧹 현재 청소 설정: ${resolved.lines}줄 (${sourceText})`
      );
      return;
    }

    /* 계산 */
    if (typeof command === "string" && command.startsWith("계산")) {
      const expr = command.replace("계산", "").trim();

      if (!expr) {
        await sendChat(channelId, `사용법: ${startStr}계산 1+2*3`);
        return;
      }

      try {
        if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
          await sendChat(channelId, "❌ 잘못된 계산식입니다.");
          return;
        }

        const result = Function(`"use strict"; return (${expr})`)();

        await sendChat(channelId, `🧮 계산 결과: ${expr} = ${result}`);
      } catch {
        await sendChat(channelId, "❌ 계산 실패");
      }

      return;
    }

    /* 출석 */
    else if (command === "출석") {
      const result = await attendanceStore.manualAttend(chat);

      if (result?.reason === "blocked_user") {
        await sendChat(channelId, "출석 대상이 아닙니다.");
        return;
      }

      if (result?.ok) {
        await sendChat(
          channelId,
          `📅 ${chat.nickname}님 출석 완료! 오늘 ${result.rank}등 / 연속 출석 ${result.streak}일 / 이번달 누적 ${result.monthlyCount}일`
        );
      } else if (result?.already) {
        await sendChat(
          channelId,
          `✅ ${chat.nickname}님은 오늘 이미 출석했어요! (오늘 ${result.rank}등 / 연속 ${result.streak}일 / 이번달 누적 ${result.monthlyCount}일)`
        );
      } else {
        await sendChat(channelId, "출석 처리에 실패했습니다.");
      }

      return;
    }

    /* 내출석 */
    else if (command === "내출석") {
      const userId = String(chat?.clientChannelId || chat?.userId || chat?.memberId || "");
      const summary = await attendanceStore.getMyAttendanceSummary(channelId, userId);

      if (!summary?.today) {
        await sendChat(channelId, `${chat.nickname}님은 오늘 아직 출석하지 않았어요.`);
        return;
      }

      const rank = summary.today?.rank || "-";
      const streak = summary.monthly?.streak || 1;
      const monthlyCount = summary.monthly?.monthlyCount || 1;

      await sendChat(
        channelId,
        `📌 ${chat.nickname}님 오늘 출석 ${rank}등 / 연속 출석 ${streak}일 / 이번달 누적 ${monthlyCount}일`
      );
      return;
    }

    /* 출석체크 */
    else if (command.startsWith("출석체크")) {
      const targetUserId = command.replace("출석체크", "").trim();

      if (!targetUserId) {
        await sendChat(channelId, "사용법: !출석체크 유저아이디");
        return;
      }

      const info = await attendanceStore.getAttendanceCheckByUserId(channelId, targetUserId);

      if (!info?.today) {
        await sendChat(channelId, `해당 유저는 오늘 아직 출석하지 않았어요.`);
        return;
      }

      // const nickname =
      //   await profileCache.getNickname(targetUserId) || `유저${targetUserId}`;
      const nickname = await getNicknameOrDefault(targetUserId);
      const rank = info.today?.rank || "-";
      const streak = info.monthly?.streak || 1;
      const monthlyCount = info.monthly?.monthlyCount || 1;

      await sendChat(
        channelId,
        `🔎 ${nickname}님 오늘 출석 ${rank}등 / 연속 출석 ${streak}일 / 이번달 누적 ${monthlyCount}일`
      );
      return;
    }

    /* 출석순위 */
    // else if (command.startsWith("출석순위")) {
    //   const ranking = await attendanceStore.getDailyRanking(channelId, 10);

    //   if (!ranking.length) {
    //     await sendChat(channelId, "오늘 출석자가 없습니다.");
    //     return;
    //   }

    //   const lines = ["📅 오늘의 출석 순위"];

    //   for (const row of ranking) {
    //     const nickname =
    //       await profileCache.getNickname(row.userId) || `유저${row.userId}`;
    //     lines.push(`${row.rank}위 ${nickname}`);
    //   }

    //   await sendChat(channelId, lines.join("\n"));
    //   return;
    // }
    else if (command.startsWith("출석순위")) {
      const ranking = await attendanceStore.getDailyRanking(channelId, 10);

      if (!ranking.length) {
        await sendChat(channelId, "오늘 출석자가 없습니다.");
        return;
      }

      const nicknameMap = await getNicknameMap(ranking);
      const lines = ["📅 오늘의 출석 순위"];

      for (const row of ranking) {
        lines.push(`${row.rank}위 ${nicknameMap[String(row.userId)]}`);
      }

      await sendChat(channelId, lines.join("\n"));
      return;
    }

    /* 월출석순위 */
    // else if (command === "월출석순위") {
    //   const ranking = await attendanceStore.getMonthlyRanking(channelId, 10);

    //   if (!ranking.length) {
    //     await sendChat(channelId, "이번 달 출석자가 없습니다.");
    //     return;
    //   }

    //   const lines = ["🗓 이번달 출석 순위"];

    //   for (let i = 0; i < ranking.length; i++) {
    //     const row = ranking[i];
    //     const nickname =
    //       await profileCache.getNickname(row.userId) || `유저${row.userId}`;

    //     lines.push(
    //       `${i + 1}위 ${nickname} (${row.monthlyCount}일, 연속 ${row.streak}일)`
    //     );
    //   }

    //   await sendChat(channelId, lines.join("\n"));
    //   return;
    // }
    /* 월출석순위 */
    else if (command === "월출석순위") {
      const ranking = await attendanceStore.getMonthlyRanking(channelId, 10);

      if (!ranking.length) {
        await sendChat(channelId, "이번 달 출석자가 없습니다.");
        return;
      }

      const nicknameMap = await getNicknameMap(ranking);
      const lines = ["🗓 이번달 출석 순위"];

      for (let i = 0; i < ranking.length; i++) {
        const row = ranking[i];
        lines.push(
          `${i + 1}위 ${nicknameMap[String(row.userId)]} (${row.monthlyCount}일, 연속 ${row.streak}일)`
        );
      }

      await sendChat(channelId, lines.join("\n"));
      return;
    }

    /* 레벨 */
    // else if (command.startsWith("레벨순위")) {
    //   const ranking = await rankStore.getLevelRanking(10);

    //   if (!ranking.length) {
    //     await sendChat(channelId, "레벨 정보가 없습니다.");
    //     return;
    //   }

    //   const lines = ["👑 레벨 순위"];

    //   for (const row of ranking) {
    //     const nickname = await profileCache.getNickname(row.userId);
    //     lines.push(`${row.rank}위 ${nickname} Lv.${row.level} (${row.score}점)`);
    //   }

    //   await sendChat(channelId, lines.join("\n"));
    //   return;
    // }
    /* 레벨 */
    else if (command.startsWith("레벨순위")) {
      const ranking = await rankStore.getLevelRanking(10);

      if (!ranking.length) {
        await sendChat(channelId, "레벨 정보가 없습니다.");
        return;
      }

      const nicknameMap = await getNicknameMap(ranking);
      const lines = ["👑 레벨 순위"];

      for (const row of ranking) {
        lines.push(`${row.rank}위 ${nicknameMap[String(row.userId)]} Lv.${row.level} (${row.score}점)`);
      }

      await sendChat(channelId, lines.join("\n"));
      return;
    }

    else if (command.startsWith("레벨")) {
      const parts = command.split(" ").filter(Boolean);

      let targetUserId = chat?.clientChannelId;

      if (parts.length >= 2) {
        const parsed = Number(parts[1]);

        if (!parsed) {
          await sendChat(channelId, `사용법: ${startStr}레벨 또는 ${startStr}레벨 숫자아이디`);
          return;
        }

        targetUserId = parsed;
      }

      const data = await rankStore.getUserLevel(targetUserId);

      if (!data) {
        await sendChat(channelId, "레벨 정보가 없습니다.");
        return;
      }

      const nickname = await profileCache.getNickname(data.userId);
      const remain = Math.max(
        0,
        Number(data.nextLevelScore || 0) - Number(data.score || 0)
      );

      await sendChat(
        channelId,
        [
          `📊 ${nickname} 정보`,
          `레벨 : Lv.${data.level}`,
          `점수 : ${data.score}`,
          `채팅수 : ${data.chatCount}`,
          `다음 레벨까지 : ${remain}점`
        ].join("\n")
      );

      return;
    }

    /* 채팅순위 */
    // else if (command.startsWith("채팅순위")) {
    //   const parsed = parseChatRankCommand(command);

    //   let ranking = [];
    //   let title = "";

    //   if (parsed.period === "broadcast" && parsed.scope === "channel") {
    //     const streamInfo = streamStore.get(channelId);
    //     const broadcastId = streamInfo?.broadcastId || null;

    //     if (!broadcastId) {
    //       await sendChat(channelId, "현재 방송 정보를 찾을 수 없습니다.");
    //       return;
    //     }

    //     ranking = await rankStore.getBroadcastRanking(broadcastId, 10);
    //     title = getChatRankTitle(parsed.scope, parsed.period);
    //   } else {
    //     console.log(getDateKey(parsed.dayOffset))
    //     ranking = await rankStore.getRanking({
    //       channelId,
    //       scope: parsed.scope,
    //       period: parsed.period,
    //       limit: 10,
    //       dayKey: parsed.period === "daily" ? getDateKey(parsed.dayOffset) : undefined
    //     });

    //     title = getChatRankTitle(parsed.scope, parsed.period);
    //   }

    //   if (!ranking.length) {
    //     await sendChat(channelId, "채팅 순위 정보가 없습니다.");
    //     return;
    //   }

    //   const lines = [title];

    //   for (const row of ranking) {
    //     const nickname = await profileCache.getNickname(row.userId);
    //     lines.push(`${row.rank}위 ${nickname} ${row.chatCount}회`);
    //   }

    //   await sendChat(channelId, lines.join("\n"));
    //   return;
    // }
    /* 채팅순위 */
    // else if (command.startsWith("채팅순위")) {
    //   const parsed = parseChatRankCommand(command);

    //   let ranking = [];
    //   let title = "";

    //   if (parsed.period === "broadcast" && parsed.scope === "channel") {
    //     const streamInfo = streamStore.get(channelId);
    //     const broadcastId = streamInfo?.broadcastId || null;

    //     if (!broadcastId) {
    //       await sendChat(channelId, "현재 방송 정보를 찾을 수 없습니다.");
    //       return;
    //     }

    //     ranking = await rankStore.getBroadcastRanking(broadcastId, 10);
    //     title = getChatRankTitle(parsed.scope, parsed.period);
    //   } else {
    //     ranking = await rankStore.getRanking({
    //       channelId,
    //       scope: parsed.scope,
    //       period: parsed.period,
    //       limit: 10,
    //       dayKey: parsed.period === "daily" ? getDateKey(parsed.dayOffset) : undefined
    //     });

    //     title = getChatRankTitle(parsed.scope, parsed.period);
    //   }

    //   if (!ranking.length) {
    //     await sendChat(channelId, "채팅 순위 정보가 없습니다.");
    //     return;
    //   }

    //   const nicknameMap = await getNicknameMap(ranking);
    //   const lines = [title];

    //   for (const row of ranking) {
    //     lines.push(`${row.rank}위 ${nicknameMap[String(row.userId)]} ${row.chatCount}회`);
    //   }

    //   await sendChat(channelId, lines.join("\n"));
    //   return;
    // }
    /* 채팅순위 */
    else if (command.startsWith("채팅순위")) {
      const parsed = parseChatRankCommand(command);

      if (parsed.invalidDateToken) {
        await sendChat(
          channelId,
          `날짜 형식이 올바르지 않습니다. 예) ${startStr}채팅순위 20260309 / ${startStr}채팅순위 전체 2026-03-09`
        );
        return;
      }

      let ranking = [];
      let title = "";

      if (parsed.period === "broadcast" && parsed.scope === "channel") {
        const streamInfo = streamStore.get(channelId);
        const broadcastId = streamInfo?.broadcastId || null;

        if (!broadcastId) {
          await sendChat(channelId, "현재 방송 정보를 찾을 수 없습니다.");
          return;
        }

        ranking = await rankStore.getBroadcastRanking(broadcastId, 10);
        title = getChatRankTitle(parsed.scope, parsed.period, {
          dayOffset: parsed.dayOffset,
          explicitDayKey: parsed.explicitDayKey
        });
      } else {
        const resolvedDayKey =
          parsed.period === "daily"
            ? (parsed.explicitDayKey || getDateKey(parsed.dayOffset))
            : undefined;

        ranking = await rankStore.getRanking({
          channelId,
          scope: parsed.scope,
          period: parsed.period,
          limit: 10,
          dayKey: resolvedDayKey
        });

        title = getChatRankTitle(parsed.scope, parsed.period, {
          dayOffset: parsed.dayOffset,
          explicitDayKey: parsed.explicitDayKey
        });
      }

      if (!ranking.length) {
        await sendChat(channelId, "채팅 순위 정보가 없습니다.");
        return;
      }

      const nicknameMap = await getNicknameMap(ranking);
      const lines = [title];

      for (const row of ranking) {
        lines.push(`${row.rank}위 ${nicknameMap[String(row.userId)]} ${row.chatCount}회`);
      }

      await sendChat(channelId, lines.join("\n"));
      return;
    }

    /* 채팅확인 */
    else if (command.startsWith("채팅확인")) {
      const parts = command.split(" ").filter(Boolean);

      let targetUserId = Number(chat?.clientChannelId);

      if (parts.length >= 2) {
        const parsed = Number(parts[1]);

        if (!parsed) {
          await sendChat(channelId, `사용법: ${startStr}채팅확인 또는 ${startStr}채팅확인 숫자아이디`);
          return;
        }

        targetUserId = parsed;
      }

      const summary = await rankStore.getUserChatSummary(channelId, targetUserId);

      const hasAnyData =
        summary.channelDaily ||
        summary.channelMonthly ||
        summary.channelTotal ||
        summary.globalDaily ||
        summary.globalMonthly ||
        summary.globalTotal;

      if (!hasAnyData) {
        await sendChat(channelId, "채팅 정보가 없습니다.");
        return;
      }

      //const nickname = await profileCache.getNickname(targetUserId);
      const nickname = await getNicknameOrDefault(targetUserId);
      const channelToday = Number(summary.channelDaily?.chatCount || 0);
      const channelMonth = Number(summary.channelMonthly?.chatCount || 0);
      const channelTotal = Number(summary.channelTotal?.chatCount || 0);

      const globalToday = Number(summary.globalDaily?.chatCount || 0);
      const globalMonth = Number(summary.globalMonthly?.chatCount || 0);
      const globalTotal = Number(summary.globalTotal?.chatCount || 0);
      
      const level = Number(summary.globalTotal?.level || 0);
      const score = Number(summary.globalTotal?.score || 0);
      const nextLevelScore = Number(summary.globalTotal?.nextLevelScore || 0);
      const remain = Math.max(0, nextLevelScore - score);

      await sendChat(
        channelId,
        [
          `📊 ${nickname} 채팅 정보`,
          `[현재 방송] 오늘 ${channelToday}회 / 이번달 ${channelMonth}회 / 누적 ${channelTotal}회`,
          `[전체 방송] 오늘 ${globalToday}회 / 이번달 ${globalMonth}회 / 누적 ${globalTotal}회`,
          `레벨 : Lv.${level}`,
          `점수 : ${score}`,
          `다음 레벨까지 : ${remain}점`
        ].join("\n")
      );

      return;
    }

    /* 랜덤 */
    else if (command === "랜덤") {
      const num = Math.floor(Math.random() * 101);

      await sendChat(
        channelId,
        `🎲 ${chat.nickname || "유저"}님의 숫자: ${num}`
      );

      return;
    }

    /* 궁합 */
    else if (command.startsWith("궁합")) {
      const parts = command.split(" ");

      if (parts.length < 3) {
        await sendChat(channelId, `사용법: ${startStr}궁합 닉1 닉2`);
        return;
      }

      const nick1 = parts[1];
      const nick2 = parts[2];
      const result = getCompatibilityDetail(nick1, nick2);

      const msg =
`💘 ${nick1} ❤️ ${nick2} 궁합 분석

💞 케미: ${result.chemistry}%
🗯 티키타카: ${result.tikiTaka}%
⚠ 갈등지수: ${result.danger}%

📊 최종 궁합: ${result.finalScore}%

${result.resultText}`;

      await sendChat(channelId, msg);
      return;
    }

    /* 날씨 */
    else if (command.includes("날씨")) {
      const tokens = command.split(" ");
      let city = "서울";

      if (tokens.length > 1) {
        city = tokens[0];
      }

      const weatherMsg = await getWeather(city);
      await sendChat(channelId, weatherMsg);
      return;
    }

    /* 유튜브연결 */
    else if (command === "유튜브연결") {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "유튜브 연결 권한 없음");
        return;
      }

      const connectMessage = await songRequestService.getConnectMessage(channelId);
      await sendChat(channelId, connectMessage);
      return;
    }

    /* 신청목록 */
    else if (command === "신청목록" || command === "신청 목록") {
      const msg = await songRequestService.getQueueMessage(channelId);
      await sendChat(channelId, msg);
      return;
    }

    /* 신청취소 */
    else if (command === "신청취소" || command === "신청 취소") {
      const result = await songRequestService.cancelMine(chat);
      await sendChat(channelId, result.message);
      return;
    }

    /* 신청초기화 */
    else if (command === "신청초기화" || command === "신청 초기화") {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "신청초기화 권한 없음");
        return;
      }

      const result = await songRequestService.clearAll(channelId);
      await sendChat(channelId, result.message);
      return;
    }

    /* 다음곡 */
    else if (command === "다음곡") {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "다음곡 처리 권한 없음");
        return;
      }

      const result = await songRequestService.completeCurrent(channelId);
      await sendChat(channelId, result.message);
      return;
    }

    /* 신청 */
    else if (command.startsWith("신청 ")) {
      try {
        const result = await songRequestService.addRequest(chat, command);
        await sendChat(channelId, result.message);
      } catch (err) {
        console.error("song request error:", err);
        await sendChat(channelId, `신청 처리 실패: ${err.message}`);
      }
      return;
    }

    /* 타이머 */
    else if (command.startsWith("타이머")) {
      if (!utils.isManager(chat, channelId)) {
        await sendChat(channelId, "타이머 실행 권한 없음");
        return;
      }

      const arg = command.replace(/^타이머/, "").trim();

      if (!arg) {
        const status = timerStore.getStatus(channelId);

        if (!status.running) {
          await sendChat(channelId, `사용법: ${startStr}타이머 10초 / ${startStr}타이머 1분30초 / ${startStr}타이머 중지`);
          return;
        }

        await sendChat(channelId, `⏳ 현재 타이머 진행 중 / 남은 시간 ${timerStore.formatRemain(status.remainSec)}`);
        return;
      }

      if (arg === "중지" || arg === "종료" || arg === "끔" || arg === "꺼") {
        const result = timerStore.stop(channelId);

        if (!result.ok) {
          await sendChat(channelId, "현재 진행 중인 타이머가 없습니다.");
          return;
        }

        await sendChat(channelId, "🛑 타이머를 중지했습니다.");
        return;
      }

      const seconds = timerStore.parseDurationSeconds(arg);

      if (!seconds) {
        await sendChat(channelId, `시간 형식이 올바르지 않습니다. 예) ${startStr}타이머 10초 / ${startStr}타이머 2분`);
        return;
      }

      if (seconds > 600) {
        await sendChat(channelId, "타이머는 최대 10분까지 가능합니다.");
        return;
      }

      const result = timerStore.start(channelId, seconds, chat.nickname || "");

      if (!result.ok) {
        if (result.reason === "already_running") {
          await sendChat(channelId, `이미 타이머가 진행 중입니다. 남은 시간 ${timerStore.formatRemain(result.remainSec)}`);
          return;
        }

        await sendChat(channelId, "타이머 시작에 실패했습니다.");
        return;
      }

      await sendChat(channelId, `⏰ 타이머 ${timerStore.formatRemain(result.durationSec)} 시작합니다.`);
      return;
    }

    /* 운세 */
    else if (command === "운세") {
      await sendChat(
          channelId,
          getFortune(chat.nickname)
      );

      return;
    }

    /* 채널입장 */
    else if (command.startsWith("채널입장 ")) {
      const parts = command.split(" ");

      if (utils.isManager(chat, channelId)) {
        if (parts.length < 3) {
          await sendChat(channelId, `사용법: ${startStr}채널입장 유저아이디 입장멘트`);
          return;
        }

        const userId = parts[1];
        const joinMessage = parts.slice(2).join(" ");

        specialJoin.add(channelId, userId, joinMessage);
        await sendChat(channelId, `✨ 채널 입장멘트 등록: ${userId}`);
      } else {
        await sendChat(channelId, "✅ 명령어 추가 권한 없음");
      }

      return;
    }

    else if (command.startsWith("채널입장삭제 ")) {
      const parts = command.split(" ");
      
      if (utils.isManager(chat, channelId)) {
        if (parts.length < 2) {
          await sendChat(channelId, `사용법: ${startStr}채널입장삭제 유저아이디`);
          return;
        }

        const userId = parts[1];
        specialJoin.remove(channelId, userId);

        await sendChat(channelId, `🗑 채널 입장멘트 삭제: ${userId}`);
      } else {
        await sendChat(channelId, "✅ 명령어 추가 권한 없음");
      }

      return;
    }

    else if (command.startsWith("입장 ")) {
      const parts = command.split(" ");
      if (utils.isMaster(chat)) {
        if (parts.length < 3) {
          await sendChat(channelId, `사용법: ${startStr}입장 유저아이디 입장멘트`);
          return;
        }

        const userId = parts[1];
        const joinMessage = parts.slice(2).join(" ");

        specialJoin.add("global", userId, joinMessage);
        await sendChat(channelId, `🌍 글로벌 입장멘트 등록: ${userId}`);
      } else {
        await sendChat(channelId, "✅ 명령어 추가 권한 없음");
      }

      return;
    }

    else if (command.startsWith("입장삭제 ")) {
      const parts = command.split(" ");

      if (utils.isMaster(chat)) {
        if (parts.length < 2) {
          await sendChat(channelId, `사용법: ${startStr}입장삭제 유저아이디`);
          return;
        }

        const userId = parts[1];
        specialJoin.remove("global", userId);

        await sendChat(channelId, `🗑 글로벌 입장멘트 삭제: ${userId}`);
      } else {
        await sendChat(channelId, "✅ 명령어 추가 권한 없음");
      }

      return;
    }

    /* 글로벌 추가 */
    else if (command.startsWith("추가 ")) {
      const parts = command.split(" ");

      if (parts.length < 3) {
        await sendChat(channelId, `사용법: ${startStr}추가 명령어 대답`);
        return;
      }

      const key = parts[1];
      const value = parts.slice(2).join(" ");

      await commandStore.addGlobal(key, value);
      await sendChat(channelId, `명령어 추가됨: ${key}`);
      return;
    }

    /* 채널추가 */
    else if (command.startsWith("채널추가 ")) {
      if (utils.isManager(chat, channelId)) {
        const parts = command.split(" ");

        if (parts.length < 3) {
          await sendChat(channelId, `사용법: ${startStr}채널추가 명령어 대답`);
          return;
        }

        const key = parts[1];
        const value = parts.slice(2).join(" ");

        await commandStore.addChannel(channelId, key, value);
        await sendChat(channelId, `✅ 채널 명령어 추가: ${key}`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }
      return;
    }

    /* 글로벌 삭제 */
    else if (command.startsWith("삭제 ")) {
      const parts = command.split(" ");
      if (utils.isMaster(chat)) {
        if (parts.length < 2) {
          await sendChat(channelId, `사용법: ${startStr}삭제 키`);
          return;
        }

        const key = parts[1];
        await commandStore.removeGlobalCommand(key);

        await sendChat(channelId, `🗑 명령어 삭제: ${key}`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 채널삭제 */
    else if (command.startsWith("채널삭제 ")) {
      const parts = command.split(" ");

      if (utils.isManager(chat, channelId)) {
        if (parts.length < 2) {
          await sendChat(channelId, "사용법: #채널삭제 키");
          return;
        }

        const key = parts[1];
        await commandStore.removeChannelCommand(channelId, key);

        await sendChat(channelId, `🗑 명령어 삭제: ${key}`);
      } else {
        await sendChat(channelId, "명령어 추가 권한 없음");
      }

      return;
    }

    /* 명령어 목록 */
    else if (command === "명령어") {
      const list = await commandStore.listCommands(channelId);

      const msg =
        `♣️ 공통 명령어: ${list.global?.join(", ") || "없음"}\n\n` +
        `🐝 방송 고유 명령어: ${list.channel?.join(", ") || ""}`;

      await sendChat(channelId, msg);
      return;
    }

    /* 사용자 정의 명령어 */
    else {
      const reply = await commandStore.findCommand(channelId, command);
      console.log("reply:", reply);

      if (!reply) return;

      await sendChat(channelId, reply);
      return;
    }
  } catch (err) {
    console.error("command error", err);
  }
}

// function parseChatRankCommand(command) {
//   const parts = command.split(/\s+/).filter(Boolean);

//   let scope = "channel";
//   let period = "broadcast";
//   let dayOffset = 0;

//   for (let i = 1; i < parts.length; i += 1) {
//     const token = parts[i];

//     if (token === "전체") {
//       scope = "global";
//     } else if (token === "오늘") {
//       period = "daily";
//       dayOffset = 0;
//     } else if (token === "어제") {
//       period = "daily";
//       dayOffset = -1;
//     } else if (token === "월" || token === "월간") {
//       period = "monthly";
//     } else if (token === "누적") {
//       period = "total";
//     }
//   }

//   if (scope === "global" && period === "broadcast") {
//     period = "daily";
//     dayOffset = 0;
//   }

//   return { scope, period, dayOffset };
// }
function parseChatRankCommand(command) {
  const parts = command.split(/\s+/).filter(Boolean);

  let scope = "channel";
  let period = "broadcast";
  let dayOffset = 0;
  let explicitDayKey = "";
  let invalidDateToken = "";

  for (let i = 1; i < parts.length; i += 1) {
    const token = parts[i];

    if (token === "전체") {
      scope = "global";
      continue;
    }

    if (token === "오늘") {
      period = "daily";
      dayOffset = 0;
      continue;
    }

    if (token === "어제") {
      period = "daily";
      dayOffset = -1;
      continue;
    }

    if (token === "월" || token === "월간") {
      period = "monthly";
      continue;
    }

    if (token === "누적") {
      period = "total";
      continue;
    }

    const parsedDayKey = parseExplicitDateToken(token);

    if (parsedDayKey) {
      explicitDayKey = parsedDayKey;
      continue;
    }

    if (looksLikeDateToken(token)) {
      invalidDateToken = token;
    }
  }

  // 날짜를 직접 넣으면 일간 조회로 강제
  if (explicitDayKey) {
    period = "daily";
    dayOffset = 0;
  }

  // 전체 + 기본값이면 오늘 전체 순위
  if (scope === "global" && period === "broadcast") {
    period = "daily";
    dayOffset = 0;
  }

  return {
    scope,
    period,
    dayOffset,
    explicitDayKey,
    invalidDateToken
  };
}

// function getChatRankTitle(scope, period, dayOffset = 0) {
//   const scopeText = scope === "global" ? "전체 방송" : "현재 방송";

//   if (period === "broadcast") {
//     return `🏆 현재 방송 채팅 순위`;
//   }

//   if (period === "monthly") {
//     return `🏆 ${scopeText} 월간 채팅 순위`;
//   }

//   if (period === "total") {
//     return `🏆 ${scopeText} 누적 채팅 순위`;
//   }

//   if (dayOffset === -1) {
//     return `🏆 ${scopeText} 어제 채팅 순위`;
//   }

//   return `🏆 ${scopeText} 오늘 채팅 순위`;
// }

function getChatRankTitle(scope, period, options = {}) {
  const scopeText = scope === "global" ? "전체 방송" : "현재 방송";
  const dayOffset = Number(options.dayOffset || 0);
  const explicitDayKey = String(options.explicitDayKey || "").trim();

  if (period === "broadcast") {
    return `🏆 현재 방송 채팅 순위`;
  }

  if (period === "monthly") {
    return `🏆 ${scopeText} 월간 채팅 순위`;
  }

  if (period === "total") {
    return `🏆 ${scopeText} 누적 채팅 순위`;
  }

  if (explicitDayKey) {
    return `🏆 ${scopeText} ${explicitDayKey} 채팅 순위`;
  }

  if (dayOffset === -1) {
    return `🏆 ${scopeText} 어제 채팅 순위`;
  }

  return `🏆 ${scopeText} 오늘 채팅 순위`;
}

function parseExplicitDateToken(token) {
  if (!token) return null;

  let year;
  let month;
  let day;

  if (/^\d{8}$/.test(token)) {
    year = Number(token.slice(0, 4));
    month = Number(token.slice(4, 6));
    day = Number(token.slice(6, 8));
  } else {
    const match = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function looksLikeDateToken(token) {
  return /^\d{8}$/.test(token) || /^\d{4}-\d{2}-\d{2}$/.test(token);
}


function getCompatibilityDetail(nick1, nick2) {

  const today = new Date();

  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");

  const pair = [nick1, nick2].sort().join("");
  const seed = pair + dateStr;

  const hash = crypto.createHash("sha256").update(seed).digest("hex");

  function score(index) {
    const num = parseInt(hash.substring(index * 4, index * 4 + 4), 16);
    return num % 101;
  }

  const chemistry = score(0);
  const tikiTaka = score(1);
  const danger = score(2);

  const safe = 100 - danger;

  const finalScore = Math.round(
    (chemistry + tikiTaka + safe) / 3
  );

  let resultText;

  if (finalScore >= 90) resultText = "🔥 천생연분";
  else if (finalScore >= 75) resultText = "😍 케미 폭발";
  else if (finalScore >= 60) resultText = "😊 꽤 잘 맞는 궁합";
  else if (finalScore >= 45) resultText = "🙂 무난한 궁합";
  else if (finalScore >= 30) resultText = "😅 애매한 관계";
  else resultText = "💀 파국의 궁합";

  return {
    chemistry,
    tikiTaka,
    danger,
    finalScore,
    resultText
  };
}

function normalizeName(name) {
  if (!name) return "";
  return name.replace(/[^\p{L}\p{N}]/gu, "");
}

function getDateKey(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

module.exports = { handleCommand };

