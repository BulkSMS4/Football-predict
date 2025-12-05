// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // your HTML/CSS/JS in 'public'

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PORT = process.env.PORT || 3000;

// Telegram bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Subscribers storage
let subscribers = [];
const subsFile = path.join(__dirname, 'subscribers.json');

// Load subscribers from file if exists
if (fs.existsSync(subsFile)) {
  subscribers = JSON.parse(fs.readFileSync(subsFile));
}

// Odds/prices storage
let oddsPrices = {
  daily: { odds: '', price: '' },
  weekly: { odds: '', price: '' },
  monthly: { odds: '', price: '' },
  yearly: { odds: '', price: '' }
};

// Save subscribers helper
function saveSubscribers() {
  fs.writeFileSync(subsFile, JSON.stringify(subscribers, null, 2));
}

// Save odds helper
function saveOdds() {
  const file = path.join(__dirname, 'oddsPrices.json');
  fs.writeFileSync(file, JSON.stringify(oddsPrices, null, 2));
}

// Load odds if exists
const oddsFile = path.join(__dirname, 'oddsPrices.json');
if (fs.existsSync(oddsFile)) {
  oddsPrices = JSON.parse(fs.readFileSync(oddsFile));
}

// --- Express API ---
// Send tip from admin dashboard
app.post('/api/sendTip', (req, res) => {
  const { text } = req.body;
  let sent = 0;
  subscribers.filter(s => s.status === 'approved').forEach(sub => {
    bot.sendMessage(sub.id, text).catch(() => {});
    sent++;
  });
  res.json({ success: true, sent });
});

// Get subscriber list
app.get('/api/subscribers', (req, res) => {
  res.json(subscribers);
});

// Approve subscription
app.post('/api/approveSub/:id', (req, res) => {
  const sub = subscribers.find(s => s.id == req.params.id);
  if (sub) sub.status = 'approved';
  saveSubscribers();
  res.json({ success: true });
});

// Reject subscription
app.post('/api/rejectSub/:id', (req, res) => {
  const subIndex = subscribers.findIndex(s => s.id == req.params.id);
  if (subIndex > -1) subscribers.splice(subIndex, 1);
  saveSubscribers();
  res.json({ success: true });
});

// Save odds & prices
app.post('/api/saveOdds', (req, res) => {
  oddsPrices = req.body;
  saveOdds();
  res.json({ success: true });
});

// --- Telegram Bot Commands ---
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  const username = msg.from.username || `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  
  // Add subscriber if new
  if (!subscribers.find(s => s.id === userId)) {
    subscribers.push({ id: userId, username, status: 'free', subscriptionType: 'free', endDate: null });
    saveSubscribers();
  }
  
  const totalSubs = subscribers.length;
  
  bot.sendMessage(userId, 
    `📢 Welcome to MATCHIQ Tips!\n\nGet daily, weekly, monthly, yearly, and free odds here.\n\nTotal Subscribers: ${totalSubs}\n\nUse /subscribe to get VIP tips or /help to see commands.`
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.from.id, 
    `Available commands:\n/subscribe - Subscribe to VIP tips\n/status - Check subscription\n/help - Show commands`
  );
});

bot.onText(/\/status/, (msg) => {
  const user = subscribers.find(s => s.id === msg.from.id);
  if (!user) return bot.sendMessage(msg.from.id, 'You are not subscribed yet.');
  const status = user.status === 'approved' ? 'Active' : 'Pending';
  bot.sendMessage(msg.from.id, `Subscription: ${user.subscriptionType}\nStatus: ${status}\nExpires: ${user.endDate ? new Date(user.endDate).toLocaleString() : 'N/A'}`);
});

// Handle /subscribe
bot.onText(/\/subscribe/, (msg) => {
  const userId = msg.from.id;
  const user = subscribers.find(s => s.id === userId) || { id: userId, username: msg.from.username, status: 'free', subscriptionType: 'free', endDate: null };

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: `Daily - ${oddsPrices.daily.odds || 'N/A'} - GHS ${oddsPrices.daily.price || 'N/A'}`, callback_data: 'subscribe_daily' }],
        [{ text: `Weekly - ${oddsPrices.weekly.odds || 'N/A'} - GHS ${oddsPrices.weekly.price || 'N/A'}`, callback_data: 'subscribe_weekly' }],
        [{ text: `Monthly - ${oddsPrices.monthly.odds || 'N/A'} - GHS ${oddsPrices.monthly.price || 'N/A'}`, callback_data: 'subscribe_monthly' }],
        [{ text: `Yearly - ${oddsPrices.yearly.odds || 'N/A'} - GHS ${oddsPrices.yearly.price || 'N/A'}`, callback_data: 'subscribe_yearly' }],
        [{ text: `Free Tips`, callback_data: 'subscribe_free' }]
      ]
    }
  };

  bot.sendMessage(userId, "Choose a subscription plan:", opts);
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const data = query.data;
  const user = subscribers.find(s => s.id === userId);
  
  if (!user) {
    return bot.sendMessage(userId, "Please start the bot first with /start");
  }

  if (data === 'subscribe_free') {
    user.subscriptionType = 'free';
    user.status = 'approved';
    user.endDate = null;
    saveSubscribers();
    return bot.sendMessage(userId, 'You are now subscribed to Free Tips!');
  }

  // Paid subscriptions
  let type = data.split('_')[1];
  let price = oddsPrices[type].price || 'N/A';
  user.subscriptionType = type;
  user.status = 'pending';
  saveSubscribers();

  bot.sendMessage(userId, `You selected ${type} subscription.\nPlease send your payment of GHS ${price} to +2335622504 (Richard Atidepe).\n\nAfter payment, send a screenshot of the receipt here.`);

  // Notify admin
  const adminIds = subscribers.filter(s => s.status==='admin').map(a=>a.id);
  adminIds.forEach(adminId => {
    bot.sendMessage(adminId, `User @${user.username || user.id} selected ${type} subscription and is pending payment.`);
  });
});

// Receive photo (payment screenshot)
bot.on('photo', async (msg) => {
  const user = subscribers.find(s => s.id === msg.from.id);
  if (!user || user.status !== 'pending') return;

  // save screenshot info
  if (!user.screenshots) user.screenshots = [];
  user.screenshots.push(msg.photo[msg.photo.length-1].file_id);
  saveSubscribers();

  // Notify admin
  const adminIds = subscribers.filter(s => s.status==='admin').map(a=>a.id);
  adminIds.forEach(adminId => {
    bot.sendPhoto(adminId, msg.photo[msg.photo.length-1].file_id, { caption: `Payment screenshot from @${user.username || user.id} for ${user.subscriptionType} subscription.` });
  });

  bot.sendMessage(msg.from.id, 'Screenshot received. Admin will review and approve your subscription.');
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
