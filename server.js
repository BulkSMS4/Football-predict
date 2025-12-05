require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if(!BOT_TOKEN) throw new Error('Bot token missing in .env!');
if(!ADMIN_PASSWORD) throw new Error('Admin password missing in .env!');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-memory subscribers (can persist to JSON file)
const SUB_FILE = 'subscribers.json';
let subscribers = [];
if(fs.existsSync(SUB_FILE)) {
  subscribers = JSON.parse(fs.readFileSync(SUB_FILE));
}

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // for static files (admin html/css/js)

// --------- Admin Dashboard Routes ---------
app.get('/adminlogin', (req,res)=>{
  const password = req.query.password;
  if(password === ADMIN_PASSWORD){
    res.sendFile(path.join(__dirname, 'public', 'telegram_admin.html'));
  } else {
    res.send('Invalid password');
  }
});

// Get subscriber list
app.get('/api/subscribers', (req,res)=>{
  res.json(subscribers);
});

// Approve subscription
app.post('/api/approveSub/:id', (req,res)=>{
  const id = req.params.id;
  const sub = subscribers.find(s=>s.id==id);
  if(sub) sub.status = 'active';
  fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers,null,2));
  res.json({ok:true});
});

// Reject subscription
app.post('/api/rejectSub/:id', (req,res)=>{
  const id = req.params.id;
  subscribers = subscribers.filter(s=>s.id!=id);
  fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers,null,2));
  res.json({ok:true});
});

// Send tip from admin
app.post('/api/sendTip', (req,res)=>{
  const { text, target } = req.body;
  let sentCount = 0;
  subscribers.filter(s=>s.status==='active').forEach(s=>{
    bot.sendMessage(s.id, text).catch(console.error);
    sentCount++;
  });
  res.json({ok:true, sent: sentCount});
});

// --------- Telegram Bot Commands ---------
bot.onText(/\/start/, (msg)=>{
  const chatId = msg.chat.id;
  const totalSubs = subscribers.length;
  let welcome = `👋 Welcome to MatchIQ Bot!\n\n` +
    `Get daily, weekly, monthly, yearly, and free tips.\n` +
    `Total subscribers: ${totalSubs}\n\n` +
    `Type /subscribe to view subscription options or /help to see commands.`;
  bot.sendMessage(chatId, welcome);
});

bot.onText(/\/help/, (msg)=>{
  const chatId = msg.chat.id;
  let helpText = `📌 Commands:\n`+
    `/subscribe - Subscribe to VIP tips\n`+
    `/status - Check your subscription status\n`+
    `/history - View your past tips\n`+
    `/help - Show commands`;
  bot.sendMessage(chatId, helpText);
});

bot.onText(/\/subscribe/, (msg)=>{
  const chatId = msg.chat.id;
  const keyboard = {
    reply_markup: {
      keyboard: [
        [{ text: 'Daily VIP' }, { text: 'Weekly VIP' }],
        [{ text: 'Monthly VIP' }, { text: 'Yearly VIP' }],
        [{ text: 'Free Tips' }]
      ],
      one_time_keyboard: true
    }
  };
  bot.sendMessage(chatId, 'Select your subscription option:', keyboard);
});

bot.onText(/\/status/, (msg)=>{
  const chatId = msg.chat.id;
  const sub = subscribers.find(s=>s.id==chatId);
  if(!sub) return bot.sendMessage(chatId,'❌ You are not subscribed.');
  let endDate = sub.endDate ? new Date(sub.endDate).toLocaleString() : 'N/A';
  bot.sendMessage(chatId, `Subscription: ${sub.subscriptionType}\nStatus: ${sub.status}\nExpires: ${endDate}`);
});

bot.onText(/\/history/, (msg)=>{
  const chatId = msg.chat.id;
  // Load history if you store it per user
  bot.sendMessage(chatId, 'History feature coming soon!');
});

// Handle subscription selection & payments
bot.on('message', async (msg)=>{
  const chatId = msg.chat.id;
  const text = msg.text;

  // Avoid processing commands again
  if(text.startsWith('/')) return;

  const subOptions = ['Daily VIP','Weekly VIP','Monthly VIP','Yearly VIP','Free Tips'];
  if(subOptions.includes(text)){
    let price = 0;
    switch(text){
      case 'Daily VIP': price = 5; break;
      case 'Weekly VIP': price = 20; break;
      case 'Monthly VIP': price = 70; break;
      case 'Yearly VIP': price = 800; break;
      case 'Free Tips': price = 0; break;
    }

    if(price>0){
      bot.sendMessage(chatId, `💰 You selected ${text}. Send payment: $${price} to +2335622504 (if outside Ghana, use WorldRemit or Ria, name: Richard Atidepe). Then send the payment screenshot.`);
      // Add/update subscriber as pending
      const existing = subscribers.find(s=>s.id==chatId);
      if(existing){
        existing.subscriptionType = text;
        existing.status = 'pending';
        existing.startDate = new Date();
        existing.endDate = null;
      } else {
        subscribers.push({id:chatId, subscriptionType:text, status:'pending', startDate: new Date(), endDate:null});
      }
      fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers,null,2));
    } else {
      bot.sendMessage(chatId, `✅ You selected Free Tips. You can start receiving tips immediately.`);
      const existing = subscribers.find(s=>s.id==chatId);
      if(existing){
        existing.subscriptionType = text;
        existing.status = 'active';
        existing.startDate = new Date();
        existing.endDate = null;
      } else {
        subscribers.push({id:chatId, subscriptionType:text, status:'active', startDate: new Date(), endDate:null});
      }
      fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers,null,2));
    }
  }

  // Handle screenshot/payment receipt
  if(msg.photo || (text && text.toLowerCase().includes('paid'))){
    bot.sendMessage(chatId, '✅ Payment received! Waiting for admin approval.');
    // Forward to admin
    const adminId = process.env.ADMIN_CHAT_ID;
    if(adminId){
      if(msg.photo){
        const fileId = msg.photo[msg.photo.length-1].file_id;
        bot.sendPhoto(adminId, fileId, {caption:`Payment from ${msg.from.username || chatId}`});
      } else {
        bot.sendMessage(adminId, `Payment notification from ${msg.from.username || chatId}:\n${text}`);
      }
    }
  }
});

// Start server
app.listen(PORT, ()=>{
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/adminlogin?password=YOUR_PASSWORD`);
});
