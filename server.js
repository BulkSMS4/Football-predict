require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(express.static('public'));

// --- Data storage ---
let subscribers = [];  // { chatId, username, type, expiry, active }
let chatLogs = [];     // { chatId, username, message, type, timestamp }

// --- Telegram bot ---
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// --- Send admin dashboard link ---
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Open admin dashboard: [Click Here](https://yourdomain.com/telegram_admin.html)`, { parse_mode: 'Markdown' });
});

// --- Send tip ---
bot.onText(/\/tip (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tipText = match[1];

  // Check subscription
  const sub = subscribers.find(s => s.chatId === chatId && s.active);
  if(!sub) {
    bot.sendMessage(chatId, `❌ You need an active VIP subscription to receive tips. Please subscribe using /subscribe`);
    return;
  }

  bot.sendMessage(chatId, `🎯 VIP Tip:\n${tipText}`);
  chatLogs.push({ chatId, username: msg.from.username || msg.from.first_name, message: tipText, type: 'VIP Tip', timestamp: Date.now() });
});

// --- Subscription command ---
bot.onText(/\/subscribe (daily|weekly|monthly|yearly)/, (msg, match) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  const type = match[1];

  let expiry = new Date();
  if(type==='daily') expiry.setDate(expiry.getDate()+1);
  else if(type==='weekly') expiry.setDate(expiry.getDate()+7);
  else if(type==='monthly') expiry.setMonth(expiry.getMonth()+1);
  else if(type==='yearly') expiry.setFullYear(expiry.getFullYear()+1);

  let subIndex = subscribers.findIndex(s=>s.chatId===chatId);
  if(subIndex>=0){
    subscribers[subIndex] = { chatId, username, type, expiry: expiry.getTime(), active:true };
  } else {
    subscribers.push({ chatId, username, type, expiry: expiry.getTime(), active:true });
  }

  bot.sendMessage(chatId, `✅ Subscription activated (${type}). Expiry: ${expiry.toLocaleString()}`);
  chatLogs.push({ chatId, username, message: `Subscribed: ${type}`, type:'subscription', timestamp: Date.now() });
});

// --- Check expired subscriptions every 1 hour ---
setInterval(()=>{
  const now = Date.now();
  subscribers.forEach(s=>{
    if(s.active && s.expiry < now){
      s.active = false;
      bot.sendMessage(s.chatId, `⏰ Your subscription has expired. Please subscribe again to continue receiving VIP tips.`);
      chatLogs.push({ chatId: s.chatId, username: s.username, message:'Subscription expired', type:'alert', timestamp: Date.now() });
    }
  });
}, 60*60*1000);

// --- API to send tips from admin dashboard ---
app.post('/api/sendTip', (req,res)=>{
  const { target, text } = req.body;
  if(!target || !text) return res.status(400).json({ error:'Missing target or text' });

  // Send message to Telegram
  bot.sendMessage(target, text).then(()=>{
    chatLogs.push({ chatId: target, username: 'Admin', message: text, type:'Admin Tip', timestamp: Date.now() });
    res.json({ success:true });
  }).catch(err=>{
    res.status(500).json({ error: err.message });
  });
});

// --- API to get subscribers ---
app.get('/api/subscribers', (req,res)=>{
  res.json(subscribers);
});

// --- API to get chat logs ---
app.get('/api/chatlogs', (req,res)=>{
  res.json(chatLogs);
});

// --- Start server ---
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
