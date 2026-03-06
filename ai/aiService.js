const config = require("../config/config");
const fetch = require("node-fetch");
const { buildCommandContext } = require("./commandContext");
const streamStore = require("../store/streamStore");
const viewerStore = require("../store/viewerStore");
const chatMemory = require("../store/chatMemory");

async function askAI(message, nickname, channelId, userId, type="chat") {

  try {

    const viewers = viewerStore.get(channelId) || [];
    const historyArr = chatMemory.get(channelId) || [];
    const history = historyArr.join("\n");

    const names = viewers.slice(0,5).map(v => v.nickname).join(", ");

    const stream = streamStore.get(channelId);

    const context = `
# 방송정보
- BJ: ${stream?.owner?.nickname || ""}
- 방송제목: ${stream?.stream?.title || ""}
- 방송설명: ${stream?.description || ""}
- 현재 시청자: ${stream?.status?.performance?.viewerCount || 0}

# 현재 채팅 참여자
- ${names}

# 최근 채팅
${history}
`;

    const commandData = buildCommandContext(channelId);

    let commandText = "\n# 채팅 키워드\n";

    if (commandData.global) {
      commandText += "\n[공통]\n";
      for (const [k,v] of Object.entries(commandData.global)) {
        commandText += `${k} : ${v}\n`;
      }
    }

    if (commandData.channel) {
      commandText += "\n[채널]\n";
      for (const [k,v] of Object.entries(commandData.channel)) {
        commandText += `${k} : ${v}\n`;
      }
    }

    // 질문 분석
    let userQuestion = message;

    if (type === "chat") {
        // if (message.includes("최근") || message.includes("무슨 얘기")) {
        //     userQuestion = "최근 채팅 내용을 방송 채팅처럼 요약해서 말해줘";
        // }
    }

    if (type === "gift") {
        userQuestion = `
        후원 이벤트 발생

        ${message}

        방송 채팅처럼 짧게 드립으로 반응해라
        `;
    }

    if (type === "announcement") {
        userQuestion = `
        전광판 이벤트 발생

        ${message}

        채팅창처럼 반응해라
        `;
    }

    const systemPrompt = `
너는 인터넷 방송 채팅방에서 활동하는 AI 채팅봇이다.

${context}

${commandText}

# AI 역할
- 최근 채팅을 읽고 방송 채팅 분위기를 이해한다.
- 질문이 최근 채팅과 관련되면 채팅 내용을 요약하거나 상황을 설명한다.
- 채팅 키워드가 나오면 설명을 참고해서 자연스럽게 반응한다.
- 방송 채팅처럼 드립과 장난을 섞어 말한다.

정보
- 여기는 한국이다 (+9시간 기준)
- 방송정보 / 채팅 참여자 / 최근 채팅 / 채팅 키워드를 활용해라.

성격
- 살짝 까칠하고 장난치는 스타일
- 시청자를 가볍게 놀리는 드립 가능
- 너무 착하게 굴지 않는다
- MBTI는 INTP로 설정 

스타일
- 방송 채팅처럼 짧게 말한다
- 최대 2문장
- 가끔 이모지 사용

규칙
- 심한 욕설 금지
- 채팅 메시지만 출력
- 한국어만 사용
- 남의 닉네임인것처럼 대답하지 말 것
- 너의 주관을 확실하게 전달할 것 

`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:"POST",
      headers:{
        "Authorization":`Bearer ${config.openRouteAiKey}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"openai/gpt-4o-mini",
        messages:[
          {
            role:"system",
            content: systemPrompt
          },
          {
            role:"user",
            content:`${nickname}: ${userQuestion}`
          }
        ]
      })
    });

    const data = await res.json();

    if(!data.choices){
      console.log("AI error:",data);
      return null;
    }

    let answer = data.choices[0].message.content;

    answer = answer
      .replace(/\n/g," ")
      .replace(/\s+/g," ")
      .substring(0,240);

    // AI 답변도 memory 저장 (대화 자연스럽게)
    chatMemory.add(channelId, "HARIBO AI", answer);

    return answer;

  } catch(err) {

    console.log("AI error:",err);
    return null;

  }

}

module.exports = { askAI };