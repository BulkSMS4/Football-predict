// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null; // optional

const SUBSCRIBE_FILE = path.join(__dirname, 'subscribe.json');

// Create file if not exists
if(!fs.existsSync(SUBSCRIBE_FILE)) fs.writeFileSync(SUBSCRIBE_FILE, JSON.stringify([]));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- Middleware ---
app.use(bodyParser.json());
app.use(express.static('public'));

// --- Admin login ---
app.get('/admin', (req, res) => {
  const pass = req.query.password;
  if(pass !== ADMIN_PASSWORD) return res.status(401).send('Unauthorized: wrong password');
  res.sendFile(path.join(__dirname, 'public/telegram_admin.html'));
});

// --- Send Tip API ---
app.post('/api/sendTip', async (req, res) => {
  const { target, text, postType } = req.body;

  try {
    let subscribers = JSON.parse(fs.readFileSync(SUBSCRIBE_FILE, 'utf8'));
    if(postType === 'vip') {
      // Only send VIP tips to active subscribers
      const now = Date.now();
      const activeSubs = subscribers.filter(s => s.endDate > now);
      for(const sub of activeSubs){
        await bot.sendMessage(sub.id, `💎 VIP Tip:\n\n${text}`);
      }
      return res.json({ status:'ok', sent: activeSubs.length });
    } else {
      // Free or other tips sent to target channel/user
      if(!target) return res.status(400).json({ error:'Target required for free tips' });
      await bot.sendMessage(target, text);
      return res.json({ status:'ok', sentTo: target });
    }
  } catch(err){
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Get Subscriber List ---
app.get('/api/subscribers', (req, res) => {
  try{
    const subs = JSON.parse(fs.readFileSync(SUBSCRIBE_FILE, 'utf8'));
    res.json(subs);
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

// --- Telegram Commands & Subscription ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `Welcome! Choose your subscription type to get VIP tips:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text:'Daily', callback_data:'sub_daily' }],
          [{ text:'Weekly', callback_data:'sub_weekly' }],
          [{ text:'Monthly', callback_data:'sub_monthly' }],
          [{ text:'Yearly', callback_data:'sub_yearly' }]
        ]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const username = query.from.username || query.from.first_name;
  let subs = JSON.parse(fs.readFileSync(SUBSCRIBE_FILE, 'utf8'));
  const now = Date.now();
  let duration = 0;
  let type = '';

  switch(query.data){
    case 'sub_daily': duration = 1*24*60*60*1000; type='Daily'; break;
    case 'sub_weekly': duration = 7*24*60*60*1000; type='Weekly'; break;
    case 'sub_monthly': duration = 30*24*60*60*1000; type='Monthly'; break;
    case 'sub_yearly': duration = 365*24*60*60*1000; type='Yearly'; break;
    default: return;
  }

  const endDate = now + duration;
  const existing = subs.find(s => s.id === chatId);
  if(existing){
    existing.subscriptionType = type;
    existing.endDate = endDate;
  } else {
    subs.push({ id: chatId, username, subscriptionType: type, endDate });
  }

  fs.writeFileSync(SUBSCRIBE_FILE, JSON.stringify(subs, null, 2));
  await bot.answerCallbackQuery(query.id, { text:`Subscribed ${type}!` });
  bot.sendMessage(chatId, `✅ You are subscribed for ${type}. Your subscription will expire on ${new Date(endDate).toLocaleString()}`);
});

// --- Periodic alerts for expiring subscriptions ---
setInterval(() => {
  let subs = JSON.parse(fs.readFileSync(SUBSCRIBE_FILE, 'utf8'));
  const now = Date.now();
  subs.forEach(s => {
    const remaining = s.endDate - now;
    if(remaining > 0 && remaining < 24*60*60*1000){ // less than 24h remaining
      bot.sendMessage(s.id, `⚠️ Your ${s.subscriptionType} subscription is ending soon! Renew to continue receiving VIP tips.`);
    }
  });
}, 60*60*1000); // every hour

// --- Deploy ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
