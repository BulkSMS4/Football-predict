require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/* ------------------ EXPRESS SETUP ------------------ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'matchiq-secret-session',
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, 'public')));

/* ------------------ AUTH MIDDLEWARE ------------------ */
function adminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin-login');
}

/* ------------------ ADMIN ROUTES ------------------ */
app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin_login.html'));
});

app.post('/admin-login', (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/telegram_admin.html');
  }

  res.send('❌ Wrong password');
});

app.get('/telegram_admin.html', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/telegram_admin.html'));
});

/* ------------------ SUBSCRIBERS API ------------------ */
app.get('/api/subscribers', adminAuth, (req, res) => {
  if (!fs.existsSync('./subscribers.json')) return res.json([]);
  const data = JSON.parse(fs.readFileSync('./subscribers.json'));
  res.json(data);
});

/* ------------------ SEND TIP API ------------------ */
app.post('/api/sendTip', adminAuth, async (req, res) => {
  const { text, target } = req.body;

  try {
    await bot.sendMessage(target, text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------ TELEGRAM BOT START MESSAGE ------------------ */
bot.onText(/\/start/, async (msg) => {
  const subs = fs.existsSync('./subscribers.json')
    ? JSON.parse(fs.readFileSync('./subscribers.json'))
    : [];

  bot.sendMessage(msg.chat.id, `
⚽ *MATCHIQ Football Predictions*

✅ Free Odds
✅ Daily / Weekly / Monthly / Yearly VIP
✅ Accurate Analysis

📊 Total Subscribers: *${subs.length}*

Tap buttons below 👇
`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "🆓 Free Tips", callback_data: "free" }],
        [{ text: "💎 VIP Subscription", callback_data: "vip" }],
        [{ text: "📊 Status", callback_data: "status" }]
      ]
    }
  });
});

/* ------------------ START SERVER ------------------ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
