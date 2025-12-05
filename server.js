const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yourpassword';
const bot = new TelegramBot(TOKEN, { polling: true });

const subscribersPath = path.join(__dirname, 'public', 'subscribe.json');

// Utilities
function getSubscribers() {
  if (!fs.existsSync(subscribersPath)) return [];
  const data = fs.readFileSync(subscribersPath);
  return JSON.parse(data).subscribers || [];
}

function saveSubscribers(subs) {
  fs.writeFileSync(subscribersPath, JSON.stringify({ subscribers: subs }, null, 2));
}

function isActiveSubscriber(id) {
  const subs = getSubscribers();
  const sub = subs.find(s => s.id === id);
  if (!sub) return false;
  return new Date(sub.endDate) > new Date();
}

function addOrUpdateSubscriber(id, username, type, durationDays) {
  let subs = getSubscribers();
  const now = new Date();
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const existing = subs.find(s => s.id === id);

  if (existing) {
    existing.subscriptionType = type;
    existing.startDate = now.toISOString();
    existing.endDate = endDate.toISOString();
    existing.username = username;
  } else {
    subs.push({ id, username, subscriptionType: type, startDate: now.toISOString(), endDate: endDate.toISOString() });
  }
  saveSubscribers(subs);
}

// Admin dashboard route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'telegram_admin.html'));
});

// API to send tips
app.post('/api/sendTip', (req, res) => {
  const { target, text } = req.body;
  if (!target || !text) return res.status(400).json({ error: 'Missing target or text' });
  bot.sendMessage(target, text).then(() => res.json({ success: true })).catch(err => res.status(500).json({ error: err.message }));
});

// API to get subscribers (for admin dashboard)
app.get('/api/subscribers', (req, res) => {
  res.json(getSubscribers());
});

// Telegram bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Daily", callback_data: "subscribe_daily" },
          { text: "Weekly", callback_data: "subscribe_weekly" },
          { text: "Monthly", callback_data: "subscribe_monthly" },
          { text: "Yearly", callback_data: "subscribe_yearly" }
        ]
      ]
    }
  };

  if (isActiveSubscriber(chatId)) {
    bot.sendMessage(chatId, "✅ You are already subscribed to VIP.", { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(chatId, `Welcome ${username}! Choose a subscription plan:`, opts);
  }
});

// Handle subscription button clicks
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const username = query.from.username || query.from.first_name;
  const data = query.data;

  let durationDays = 0;
  let type = "";

  switch (data) {
    case 'subscribe_daily':
      durationDays = 1; type = 'daily'; break;
    case 'subscribe_weekly':
      durationDays = 7; type = 'weekly'; break;
    case 'subscribe_monthly':
      durationDays = 30; type = 'monthly'; break;
    case 'subscribe_yearly':
      durationDays = 365; type = 'yearly'; break;
    default: return;
  }

  addOrUpdateSubscriber(chatId, username, type, durationDays);
  bot.answerCallbackQuery(query.id, { text: `Subscribed to ${type} plan! ✅` });
  bot.sendMessage(chatId, `🎉 You are now subscribed for ${type}. Enjoy VIP tips!`);
});

// Periodic check to alert about expiring subscriptions (every hour)
setInterval(() => {
  const subs = getSubscribers();
  const now = new Date();
  subs.forEach(sub => {
    const end = new Date(sub.endDate);
    const remaining = Math.floor((end - now)/1000/60/60); // in hours
    if (remaining > 0 && remaining <= 24) {
      bot.sendMessage(sub.id, `⚠️ Your ${sub.subscriptionType} VIP subscription is ending in less than 24 hours.`);
    }
    if (remaining <= 0) {
      bot.sendMessage(sub.id, `❌ Your ${sub.subscriptionType} VIP subscription has expired. Please renew to continue receiving VIP tips.`);
    }
  });
}, 1000 * 60 * 60); // every 1 hour

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
