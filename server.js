const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // serve HTML/CSS/JS

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'YOUR_ADMIN_PASSWORD';
const PORT = process.env.PORT || 3000;

// Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Subscribers storage
const SUB_FILE = path.join(__dirname, 'subscribe.json');
let subscribers = [];
if (fs.existsSync(SUB_FILE)) {
  subscribers = JSON.parse(fs.readFileSync(SUB_FILE, 'utf8'));
}

// Save subscribers helper
function saveSubscribers() {
  fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers, null, 2));
}

// Middleware to check admin password
function checkAdminPassword(req, res, next) {
  const password = req.query.password || req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) return res.status(403).send({ error: 'Unauthorized' });
  next();
}

// API: Send tip
app.post('/api/sendTip', (req, res) => {
  const { text, target } = req.body;
  if (!text || !target) return res.status(400).send({ error: 'Missing text or target' });

  bot.sendMessage(target, text, { parse_mode: 'Markdown' })
    .then(() => {
      // Notify all active VIP subscribers if it's a VIP tip
      if (text.includes('💎 VIP')) {
        const now = Date.now();
        subscribers.forEach(sub => {
          if (sub.endDate > now) {
            bot.sendMessage(sub.id, `New VIP Tip:\n\n${text}`, { parse_mode: 'Markdown' });
          }
        });
      }
      res.send({ success: true });
    })
    .catch(err => res.status(500).send({ error: err.message }));
});

// API: Get subscriber list
app.get('/api/subscribers', checkAdminPassword, (req, res) => {
  res.send(subscribers);
});

// API: Add subscription
app.post('/api/subscribe', (req, res) => {
  const { id, username, type } = req.body; // type: daily, weekly, monthly, yearly
  if (!id || !type) return res.status(400).send({ error: 'Missing id or subscription type' });

  let duration = 0;
  if (type === 'daily') duration = 1 * 24 * 60 * 60 * 1000;
  else if (type === 'weekly') duration = 7 * 24 * 60 * 60 * 1000;
  else if (type === 'monthly') duration = 30 * 24 * 60 * 60 * 1000;
  else if (type === 'yearly') duration = 365 * 24 * 60 * 60 * 1000;

  const now = Date.now();
  const endDate = now + duration;

  const existing = subscribers.find(s => s.id === id);
  if (existing) {
    existing.subscriptionType = type;
    existing.startDate = now;
    existing.endDate = endDate;
    existing.username = username;
  } else {
    subscribers.push({ id, username, subscriptionType: type, startDate: now, endDate: endDate });
  }

  saveSubscribers();
  res.send({ success: true, endDate });
});

// Telegram bot: handle admin command
bot.onText(/\/admin/, msg => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Open admin dashboard: /adminlogin`);
});

// Telegram bot: handle admin login link
bot.onText(/\/adminlogin/, msg => {
  const chatId = msg.chat.id;
  const url = `https://yourdomain.com/telegram_admin.html?password=${ADMIN_PASSWORD}`;
  bot.sendMessage(chatId, `Open admin dashboard:\n${url}`);
});

// Periodic check: notify about expiry 1 day before
setInterval(() => {
  const now = Date.now();
  subscribers.forEach(sub => {
    const diff = sub.endDate - now;
    if (diff > 0 && diff < 24*60*60*1000 && !sub.alertSent) {
      bot.sendMessage(sub.id, `⚠️ Your subscription (${sub.subscriptionType}) will expire soon! Renew to continue accessing VIP tips.`);
      sub.alertSent = true;
    }
    // block expired users
    if (diff <= 0) sub.blocked = true;
  });
  saveSubscribers();
}, 60 * 60 * 1000); // every hour

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
