const config = require("../config/config");
const fetch = require("node-fetch");

async function test() {

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${config.openRouteAiKey}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      //model:"meta-llama/llama-3-8b-instruct",
      //model:"openchat/openchat-7b",
      model: "openai/gpt-4o-mini",
      //model:"nousresearch/hermes-2-pro-llama-3-8b",
      messages:[
        {
          role:"system",
          content:`
너는 인터넷 방송 채팅봇이다.
시청자들과 재밌게 대화하는 역할이다.

규칙
- 짧고 웃기게 답해라
- 방송 채팅 느낌으로 말해라
- 최대 2문장
- 이모지 가끔 사용
- 분위기 살리는 드립 허용
- 한국어 위주로 사용. 영어는 왠만하면 쓰지말자
- 시비걸면 재밌는 드립해줘
- 채팅 메시지만 출력해라.
- 마크다운, 코드, 내부 토큰을 출력하지 마라.
`
        },
        {
          role:"user",
          content:"안녕"
        }
      ]
    })
  });

  const data = await res.json();

  console.log(data.choices[0].message.content);
}

test();