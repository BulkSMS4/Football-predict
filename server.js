// server.js
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

// ====== CONFIG ======
const BOT_TOKEN = '8596462347:AAF8B11EYoPKaaVFQgzC2dvIDcAKkPc4ybQ'; // your bot token
const ADMIN_PASSWORD = 'forgetme'; // admin password
const ADMIN_ID = '@Kj9000000'; // admin Telegram ID (optional extra security)
const PORT = process.env.PORT || 3000;

// ====== STORAGE FILES ======
const SUB_FILE = './subscribe.json';
const TIP_FILE = './tipHistory.json';

// Initialize files if not exist
if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, JSON.stringify([]));
if (!fs.existsSync(TIP_FILE)) fs.writeFileSync(TIP_FILE, JSON.stringify([]));

// Load subscribers and tip history
let subscribers = JSON.parse(fs.readFileSync(SUB_FILE));
let tipHistory = JSON.parse(fs.readFileSync(TIP_FILE));

// ====== TELEGRAM BOT ======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Temporary admin sessions (password authentication)
let adminSessions = {};

// ====== HELPERS ======
function saveSubscribers() {
  fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers, null, 2));
}

function saveTips() {
  fs.writeFileSync(TIP_FILE, JSON.stringify(tipHistory, null, 2));
}

function checkSubscription(userId) {
  const now = Date.now();
  const sub = subscribers.find(s => s.id == userId && s.endDate > now);
  return sub || null;
}

// ====== START COMMAND ======
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome! Use /admin to login as admin or /subscribe to get VIP tips.');
});

// ====== ADMIN LOGIN ======
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Enter admin password:');
  adminSessions[chatId] = { step: 'await_password' };
});

// Handle messages for admin session
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip if not in admin session
  if (!adminSessions[chatId]) return;

  const session = adminSessions[chatId];

  // Password verification
  if (session.step === 'await_password') {
    if (text === ADMIN_PASSWORD && (ADMIN_ID == 0 || chatId == ADMIN_ID)) {
      adminSessions[chatId] = { step: 'menu' };
      bot.sendMessage(chatId, '✅ Logged in as admin.', { reply_markup: adminMenu() });
    } else {
      bot.sendMessage(chatId, '❌ Wrong password.');
      delete adminSessions[chatId];
    }
    return;
  }
});

// ====== INLINE KEYBOARD MENU ======
function adminMenu() {
  return {
    inline_keyboard: [
      [{ text: '📝 Send Tip', callback_data: 'send_tip' }],
      [{ text: '📄 View Subscribers', callback_data: 'view_subs' }],
      [{ text: '📜 Tip History', callback_data: 'view_history' }],
      [{ text: '💎 Templates', callback_data: 'templates' }]
    ]
  };
}

// ====== HANDLE CALLBACK QUERIES ======
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (!adminSessions[chatId] || adminSessions[chatId].step !== 'menu') {
    return bot.answerCallbackQuery(callbackQuery.id, { text: 'Session expired. Send /admin to login again.' });
  }

  switch (data) {
    case 'send_tip':
      adminSessions[chatId].step = 'await_post_type';
      bot.sendMessage(chatId, 'Select post type:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Free', callback_data: 'type_free' }],
            [{ text: 'VIP', callback_data: 'type_vip' }],
            [{ text: 'Result', callback_data: 'type_result' }],
            [{ text: 'Announcement', callback_data: 'type_announcement' }]
          ]
        }
      });
      break;

    case 'view_subs':
      let msg = '📋 Subscribers:\n';
      if (subscribers.length === 0) msg += 'No subscribers yet.';
      else {
        subscribers.forEach(s => {
          msg += `• ${s.username || s.id} — ${s.subscriptionType} — Expires: ${new Date(s.endDate).toLocaleString()}\n`;
        });
      }
      bot.sendMessage(chatId, msg);
      break;

    case 'view_history':
      let historyMsg = '📜 Tip History:\n';
      if (tipHistory.length === 0) historyMsg += 'No tips yet.';
      else {
        tipHistory.slice(-20).forEach(t => {
          historyMsg += `• ${t.postType} — ${t.match} — ${t.tip}\n`;
        });
      }
      bot.sendMessage(chatId, historyMsg);
      break;

    case 'templates':
      bot.sendMessage(chatId, 'Templates:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Free Tip Template', callback_data: 'tmpl_free' }],
            [{ text: 'VIP Tip Template', callback_data: 'tmpl_vip' }],
            [{ text: 'Result Template', callback_data: 'tmpl_result' }]
          ]
        }
      });
      break;
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// ====== SUBSCRIBE COMMAND (for users) ======
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Select subscription:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Daily', callback_data: 'sub_daily' }],
        [{ text: 'Weekly', callback_data: 'sub_weekly' }],
        [{ text: 'Monthly', callback_data: 'sub_monthly' }],
        [{ text: 'Yearly', callback_data: 'sub_yearly' }]
      ]
    }
  });
});

// ====== HANDLE SUBSCRIPTIONS ======
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // Subscription purchase
  if (data.startsWith('sub_')) {
    let days = 0;
    let type = '';
    switch (data) {
      case 'sub_daily': days = 1; type = 'Daily'; break;
      case 'sub_weekly': days = 7; type = 'Weekly'; break;
      case 'sub_monthly': days = 30; type = 'Monthly'; break;
      case 'sub_yearly': days = 365; type = 'Yearly'; break;
    }
    const endDate = Date.now() + days*24*60*60*1000;

    // Add or update subscriber
    const existing = subscribers.find(s => s.id == chatId);
    if (existing) { existing.endDate = endDate; existing.subscriptionType = type; }
    else { subscribers.push({ id: chatId, username: callbackQuery.from.username, endDate, subscriptionType: type }); }
    saveSubscribers();
    bot.sendMessage(chatId, `✅ You subscribed for ${type}. Expires on ${new Date(endDate).toLocaleString()}`);
    bot.answerCallbackQuery(callbackQuery.id);
  }

  // Templates for admin
  if (data.startsWith('tmpl_')) {
    const session = adminSessions[chatId];
    if (!session) return;
    switch (data) {
      case 'tmpl_free':
        session.tipData = { postType:'free', match:'Man City vs Wolves', analysis:'Man City strong at home; Wolves weak defense', tip:'Over 2.5 Goals', confidence:'Medium', kickoff:'20:00 GMT' };
        break;
      case 'tmpl_vip':
        session.tipData = { postType:'vip', match:'Arsenal vs Brighton', analysis:'Arsenal unbeaten last 5; Brighton poor away', tip:'Correct Score — 2–1', confidence:'High', kickoff:'18:45 GMT', notes:'VIP small stake' };
        break;
      case 'tmpl_result':
        session.tipData = { postType:'result', match:'Man Utd vs Chelsea', tip:'Result: 1–1 (Over 1.5)', confidence:'Low' };
        break;
    }
    bot.sendMessage(chatId, 'Template loaded. You can now /send the tip.');
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

// ====== EXPRESS API (Optional for sending from other sources) ======
app.post('/api/sendTip', (req,res)=>{
  const { text, target } = req.body;
  if(!text || !target) return res.status(400).json({error:'Missing fields'});
  bot.sendMessage(target, text).then(()=>res.json({ok:true})).catch(err=>res.json({ok:false,error:err.message}));
});

// ====== START SERVER ======
app.listen(PORT, () => console.log(`Server running on port ${PORTpasswordord
