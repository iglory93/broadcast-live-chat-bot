const express = require("express");
const registry = require("../command/registry");

const app = express();
app.use(express.json());

app.post("/command", (req, res) => {

  const { grep, output } = req.body;

  registry.register(new RegExp(grep), async () => {

    console.log("bot reply:", output);

  });

  res.send({ result: "ok" });

});

app.get("/health", (req,res)=>{
  res.send({status:"ok"})
})

app.listen(4001, () => {
  console.log("command api started :4001");
});