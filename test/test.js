const axios = require("axios");
const config = require("../config/config");
async function test() {
    console.log(config)
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "안녕" }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${config.openaiKey}`
      }
    }
  );

  console.log(res.data.choices[0].message.content);

}

test();