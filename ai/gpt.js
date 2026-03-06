const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function askGPT(message) {

  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: "너는 방송 채팅 봇이다. 짧고 재밌게 대답해라."
      },
      {
        role: "user",
        content: message
      }
    ]
  });

  return res.choices[0].message.content;

}

module.exports = { askGPT };