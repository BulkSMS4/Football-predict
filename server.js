require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Load subscribers from JSON
const SUB_FILE = './subscribers.json';
let subscribers = [];
if(fs.existsSync(SUB_FILE)){
  subscribers = JSON.parse(fs.readFileSync(SUB_FILE));
}

// Save subscribers
function saveSubscribers(){
  fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers, null,2));
}

// Telegram bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Admin login check
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin_login.html'));
});

// API: Subscribe
app.post('/api/subscribe', (req,res)=>{
  const { chatId, username, type, duration } = req.body;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + duration);

  let sub = subscribers.find(s => s.chatId === chatId);
  if(sub){
    sub.type = type;
    sub.expiry = expiry;
    sub.active = true;
  } else {
    subscribers.push({ chatId, username, type, expiry, active: true });
  }
  saveSubscribers();
  res.json({ message: 'Subscribed', expiry });
});

// API: Send tip
app.post('/api/sendTip', (req,res)=>{
  const { target, text, meta } = req.body;
  const now = new Date();

  if(meta.postType === 'vip'){
    // Only send to active subscribers
    subscribers.forEach(s => {
      if(s.active && new Date(s.expiry) > now){
        bot.sendMessage(s.chatId, `💎 VIP TIP\n\n${text}`);
      }
    });
  } else {
    // Send free tips to everyone or channel
    if(target){
      bot.sendMessage(target, text).catch(console.log);
    }
  }
  // Notify all active subscribers about new game if free
  if(meta.postType === 'free'){
    subscribers.forEach(s => {
      if(s.active) bot.sendMessage(s.chatId, `🆓 New Game Tip:\n\n${text}`);
    });
  }

  res.json({ success:true });
});

// Periodic check to expire subscriptions and alert users
setInterval(()=>{
  const now = new Date();
  subscribers.forEach(s => {
    if(s.active){
      const diff = (new Date(s.expiry) - now)/(1000*60*60*24);
      if(diff <=0){
        s.active=false;
        bot.sendMessage(s.chatId, '⛔ Your VIP subscription expired. Please renew.');
      } else if(diff <=1){
        bot.sendMessage(s.chatId, `⚠️ VIP subscription expiring soon (${diff.toFixed(1)} days)`);
      }
    }
  });
  saveSubscribers();
}, 1000*60*60); // every hour

// Start server
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));

/* ---------------- Telegram Bot Commands ---------------- */

// /start
bot.onText(/\/start/, (msg)=>{
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
`👋 Welcome to MatchIQ VIP Tips Bot!
Use:
/subscribe - Join VIP
/status - Check subscription
/help - Show commands`);
});

// /help
bot.onText(/\/help/, (msg)=>{
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
`Commands:
/subscribe - Subscribe to VIP tips
/status - Check your subscription
/help - Show commands`);
});

// /status
bot.onText(/\/status/, (msg)=>{
  const chatId = msg.chat.id;
  const sub = subscribers.find(s => s.chatId===chatId);
  if(!sub) return bot.sendMessage(chatId,'You are not subscribed yet.');
  const remaining = Math.max(0,(new Date(sub.expiry)-new Date())/(1000*60*60*24));
  const status = sub.active ? 'Active ✅' : 'Expired ⛔';
  bot.sendMessage(chatId, `Subscription: ${sub.type}\nStatus: ${status}\nDays remaining: ${remaining.toFixed(1)}`);
});

// /subscribe
bot.onText(/\/subscribe/, (msg)=>{
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  bot.sendMessage(chatId,'Select your subscription plan:', {
    reply_markup:{
      inline_keyboard:[
        [{ text:'Daily', callback_data:'subscribe_daily' },{ text:'Weekly', callback_data:'subscribe_weekly' }],
        [{ text:'Monthly', callback_data:'subscribe_monthly' },{ text:'Yearly', callback_data:'subscribe_yearly' }]
      ]
    }
  });
});

// handle subscription selection
bot.on('callback_query', async (callbackQuery)=>{
  const chatId = callbackQuery.message.chat.id;
  const username = callbackQuery.from.username || callbackQuery.from.first_name;
  const data = callbackQuery.data;
  let plan='', duration=0;

  if(data==='subscribe_daily'){ plan='Daily'; duration=1; }
  else if(data==='subscribe_weekly'){ plan='Weekly'; duration=7; }
  else if(data==='subscribe_monthly'){ plan='Monthly'; duration=30; }
  else if(data==='subscribe_yearly'){ plan='Yearly'; duration=365; }

  if(plan){
    // call API
    const fetch = require('node-fetch');
    const res = await fetch(`${process.env.SERVER_URL}/api/subscribe`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chatId, username, type:plan, duration })
    });
    const data = await res.json();
    bot.sendMessage(chatId, `✅ Subscribed for ${plan} VIP Tips!\nExpiry: ${new Date(data.expiry).toLocaleString()}`);
  }
});

// /admin command to open admin dashboard
bot.onText(/\/admin/, (msg)=>{
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Open Admin Dashboard: ${process.env.SERVER_URL}/admin`);
});
