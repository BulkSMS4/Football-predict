import express from "express";
import fetch from "node-fetch";

const app = express();

// Middleware
app.use(express.json());

// ✅ Home route (fixes Cannot GET /)
app.get("/", (req, res) => {
  res.send("✅ Football Predict Bot API is running");
});

// ✅ Telegram Send Tip API
app.post("/api/sendTip", async (req, res) => {
  try {
    const { target, text } = req.body;

    if (!target || !text) {
      return res.status(400).json({
        error: "target and text required"
      });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN) {
      return res.status(500).json({
        error: "BOT_TOKEN not set"
      });
    }

    const telegramURL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    const tgResponse = await fetch(telegramURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: target,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    const data = await tgResponse.json();

    if (!data.ok) {
      return res.status(500).json({
        error: "Telegram API Error",
        telegram: data
      });
    }

    res.json({
      success: true,
      telegram: data
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

// ✅ Render port
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
