const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 10000;

// -------------------------
// CONFIGURATION
// -------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mypassword123'; // store in Render secrets
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE'; // store securely
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// -------------------------
// MIDDLEWARE
// -------------------------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------
// PASSWORD-PROTECTED DASHBOARD
// Access via: /admin?password=SECRET
// -------------------------
app.get('/admin', (req, res) => {
  const password = req.query.password;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).send('<h2>Unauthorized: Wrong password</h2>');
  }
  res.sendFile(path.join(__dirname, 'public', 'telegram_admin.html'));
});

// -------------------------
// HEALTH CHECK
// -------------------------
app.get('/api', (req, res) => {
  res.json({ status: 'Football Predict Bot API is running ✅' });
});

// -------------------------
// RECEIVE TIPS FROM ADMIN DASHBOARD
// -------------------------
app.post('/api/sendTip', (req, res) => {
  const { target, text, meta } = req.body;

  if (!target || !text) {
    return res.status(400).json({ error: 'Missing target or text' });
  }

  // Send tip via Telegram bot
  bot.sendMessage(target, text).then(() => {
    console.log('Tip sent:', { target, text, meta });
    res.json({ success: true, message: 'Tip sent successfully', payload: { target, text, meta } });
  }).catch(err => {
    console.error('Error sending tip:', err);
    res.status(500).json({ success: false, error: err.message });
  });
});

// -------------------------
// TELEGRAM BOT COMMANDS
// -------------------------
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const url = `https://football-predict-k7yp.onrender.com/admin?password=${ADMIN_PASSWORD}`;
  bot.sendMessage(chatId, `🔑 Open the admin dashboard here: [Click Here](${url})`, { parse_mode: 'Markdown' });
});

// Optional: Health check via bot
bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ Football Predict Bot API is running.');
});

// -------------------------
// START SERVER
// -------------------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Admin dashboard (password protected): http://localhost:${port}/admin?password=${ADMIN_PASSWORD}`);
});
