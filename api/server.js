const express = require("express");
const registry = require("../command/registry");
const youtubeOAuthService = require("../service/youtubeOAuthService");
const youtubeTokenStore = require("../store/youtubeTokenStore");
const streamStore = require("../store/streamStore");

const app = express();
app.use(express.json());

app.get("/players", (req, res) => {

  try {

    const players = streamStore.getAll();

    res.send({
      count: players.length,
      players
    });

  } catch (err) {

    console.error("players error:", err);

    res.status(500).send({
      error: err.message
    });

  }

});


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
app.get("/dashboard", (req, res) => {

  try {

    const players = streamStore.getAll();

    const rows = players.map(p => {

      const start = p.startedAt
        ? new Date(p.startedAt).toLocaleString("ko-KR")
        : "-";

      return `
      <tr>
        <td>${p.channelId}</td>
        <td>${p.ownerNickname || "-"}</td>
        <td>${p.title || "-"}</td>
        <td>${p.streamId}</td>
        <td>${start}</td>
      </tr>
      `;

    }).join("");

    res.send(`
      <html lang="ko">
      <head>
        <meta charset="utf-8"/>
        <title>HARIBO BOT Dashboard</title>

        <style>
          body{
            background:#0f0f0f;
            color:#fff;
            font-family:Arial;
            padding:30px;
          }

          h1{
            margin-bottom:20px;
          }

          table{
            width:100%;
            border-collapse:collapse;
          }

          th,td{
            border:1px solid #333;
            padding:10px;
            text-align:left;
          }

          th{
            background:#222;
          }

          tr:nth-child(even){
            background:#181818;
          }

          .count{
            margin-bottom:20px;
            font-size:18px;
          }
        </style>

      </head>

      <body>

        <h1>📡 HARIBO AI 방송 대시보드</h1>

        <div class="count">
          현재 방송 수 : <b>${players.length}</b>
        </div>

        <table>

          <tr>
            <th>채널</th>
            <th>BJ</th>
            <th>방송 제목</th>
            <th>StreamId</th>
            <th>시작 시간</th>
          </tr>

          ${rows}

        </table>

      </body>
      </html>
    `);

  } catch (err) {

    console.error("dashboard error:", err);

    res.status(500).send("dashboard error");

  }

});
const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log("command api started :", PORT);
});