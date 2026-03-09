// const express = require("express");
// const registry = require("../command/registry");

// const app = express();
// app.use(express.json());

// app.post("/command", (req, res) => {

//   const { grep, output } = req.body;

//   registry.register(new RegExp(grep), async () => {

//     console.log("bot reply:", output);

//   });

//   res.send({ result: "ok" });

// });

// app.get("/health", (req,res)=>{
//   res.send({status:"ok"});
// });

// const PORT = process.env.PORT || 4001;

// app.listen(PORT, () => {
//   console.log("command api started :", PORT);
// });

const express = require("express");
const registry = require("../command/registry");
const youtubeOAuthService = require("../service/youtubeOAuthService");
const youtubeTokenStore = require("../store/youtubeTokenStore");

const app = express();
app.use(express.json());

app.post("/command", (req, res) => {
  const { grep, output } = req.body;

  registry.register(new RegExp(grep), async () => {
    console.log("bot reply:", output);
  });

  res.send({ result: "ok" });
});

app.get("/youtube/auth/start", async (req, res) => {
  try {
    const channelId = String(req.query.channelId || "").trim();

    if (!channelId) {
      res.status(400).send("channelId is required");
      return;
    }

    const url = youtubeOAuthService.getAuthUrl(channelId);
    res.redirect(url);
  } catch (err) {
    console.error("youtube auth start error", err);
    res.status(500).send("youtube auth start error: " + err.message);
  }
});

app.get("/youtube/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const result = await youtubeOAuthService.handleOAuthCallback(code, state);

    res.send(`
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>YouTube 연결 완료</title>
        </head>
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>유튜브 연결 완료</h2>
          <p>채널: ${result.channelId}</p>
          <p>Google 계정: ${result.googleEmail || "확인 불가"}</p>
          <p>신청곡 플레이리스트: ${result.playlistTitle}</p>
          <p>이제 채팅에서 !신청 가수-노래 를 사용할 수 있습니다.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("youtube auth callback error", err);
    res.status(500).send(`OAuth 처리 실패: ${err.message}`);
  }
});

app.get("/youtube/status/:channelId", async (req, res) => {
  try {
    const data = await youtubeTokenStore.getToken(req.params.channelId);

    res.send({
      connected: !!(data && data.enabled && data.refreshTokenEnc),
      playlistId: data?.playlistId || null,
      playlistTitle: data?.playlistTitle || null,
      googleEmail: data?.googleEmail || null
    });
  } catch (err) {
    console.error("youtube status error", err);
    res.status(500).send({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.send({ status: "ok" });
});

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log("command api started :", PORT);
});