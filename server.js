import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) console.warn("⚠ BOT_TOKEN not set");

app.post("/api/sendTip", async (req, res) => {
  try {
    const { target, text } = req.body;
    if (!target || !text) {
      return res.status(400).json({ error: "target and text required" });
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    const data = await resp.json();
    if (!data.ok) {
      return res.status(500).json({ error: "Telegram API error", telegram: data });
    }

    res.json({ ok: true, telegram: data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server listening on", PORT);
});
