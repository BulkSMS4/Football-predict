// server.js
require('dotenv').config(); // Load .env
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Read from .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // Your Telegram ID for admin
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // For admin dashboard commands

if (!BOT_TOKEN || !ADMIN_ID || !ADMIN_PASSWORD) {
  console.error("Please set BOT_TOKEN, ADMIN_ID, and ADMIN_PASSWORD in .env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Paths for storing data
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
const ODDS_FILE = path.join(__dirname, 'odds.json');

// Ensure files exist
if (!fs.existsSync(SUBSCRIBERS_FILE)) fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify([]));
if (!fs.existsSync(ODDS_FILE)) fs.writeFileSync(ODDS_FILE, JSON.stringify({
  daily: [],
  weekly: [],
  monthly: [],
  yearly: []
}));

function readSubscribers() {
  return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8'));
}

function writeSubscribers(data) {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2));
}

function readOdds() {
  return JSON.parse(fs.readFileSync(ODDS_FILE, 'utf-8'));
}

function checkSubscription(userId) {
  const subs = readSubscribers();
  const sub = subs.find(s => s.id === userId);
  if (!sub) return null;
  if (new Date(sub.endDate) < new Date()) return null; // expired
  return sub;
}

// Commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `Welcome! Available commands:\n`+
    `/subscribe - Subscribe to VIP tips\n`+
    `/status - Check your subscription\n`+
    `/help - Show commands`
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `Commands:\n`+
    `/subscribe - Subscribe to VIP tips\n`+
    `/status - Check your subscription\n`+
    `/help - Show commands\n`+
    `/admin - Admin access (restricted)`
  );
});

// Check subscription status
bot.onText(/\/status/, (msg) => {
  const sub = checkSubscription(msg.from.id);
  if (!sub) {
    bot.sendMessage(msg.chat.id, `You do not have an active subscription. Use /subscribe to join VIP.`);
  } else {
    bot.sendMessage(msg.chat.id, 
      `Subscription: ${sub.subscriptionType}\n` +
      `Odds: ${sub.odds}\n` +
      `Expires: ${new Date(sub.endDate).toLocaleString()}`
    );
  }
});

// Admin command with password
bot.onText(/\/admin\s*(.*)/, (msg, match) => {
  const password = match[1].trim();
  if (msg.from.id.toString() !== ADMIN_ID || password !== ADMIN_PASSWORD) {
    bot.sendMessage(msg.chat.id, `Access denied.`);
    return;
  }
  const subs = readSubscribers();
  let text = `Subscribers List (${subs.length}):\n`;
  subs.forEach(s => {
    text += `${s.username || s.first_name} - ${s.subscriptionType} - Odds: ${s.odds} - Expires: ${new Date(s.endDate).toLocaleString()}\n`;
  });
  bot.sendMessage(msg.chat.id, text || 'No subscribers yet.');
});

// Subscribe command
bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;
  const oddsData = readOdds();
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Daily', callback_data: 'sub_daily' }],
        [{ text: 'Weekly', callback_data: 'sub_weekly' }],
        [{ text: 'Monthly', callback_data: 'sub_monthly' }],
        [{ text: 'Yearly', callback_data: 'sub_yearly' }],
        [{ text: 'Free Game', callback_data: 'sub_free' }]
      ]
    }
  };
  bot.sendMessage(chatId, `Choose a subscription:`, options);
});

// Handle subscription selection
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const username = query.from.username || query.from.first_name;
  const type = query.data;

  if (type.startsWith('sub_')) {
    const subType = type.replace('sub_', '');
    const oddsData = readOdds();

    if (subType === 'free') {
      bot.sendMessage(chatId, `You have access to the Free Game!`);
      return;
    }

    if (!oddsData[subType] || oddsData[subType].length === 0) {
      bot.sendMessage(chatId, `No odds configured for ${subType}. Contact admin.`);
      return;
    }

    let text = `Choose odds for ${subType} subscription:\n`;
    oddsData[subType].forEach((o, i) => {
      text += `${i+1}. Odds: ${o.odds} - Price: ${o.price}\n`;
    });
    bot.sendMessage(chatId, text + `\nAfter payment, send screenshot/receipt to verify.`);
    
    const subs = readSubscribers();
    subs.push({ id: query.from.id, username, subscriptionType: subType, pending: true });
    writeSubscribers(subs);
  }
});

// Receive receipt image
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const subs = readSubscribers();
  const pending = subs.find(s => s.id === chatId && s.pending);
  if (!pending) {
    bot.sendMessage(chatId, `No pending subscription found. Use /subscribe to start.`);
    return;
  }

  const photo = msg.photo[msg.photo.length - 1].file_id;
  bot.sendPhoto(ADMIN_ID, photo, { caption: `Payment proof from ${pending.username} for ${pending.subscriptionType} subscription.` });
  bot.sendMessage(chatId, `Payment sent to admin for verification. You will get confirmation once approved.`);

  pending.receiptSent = true;
  writeSubscribers(subs);
});

// Express endpoint to send tips
app.post('/api/sendTip', (req, res) => {
  const { text, target } = req.body;
  if (!text || !target) return res.status(400).json({ error: 'Missing text or target' });
  bot.sendMessage(target, text).then(() => {
    res.json({ success: true });
  }).catch(err => res.status(500).json({ error: err.message }));
});

// Endpoint to get subscribers
app.get('/api/subscribers', (req, res) => {
  const subs = readSubscribers();
  res.json(subs.filter(s => !s.pending));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
