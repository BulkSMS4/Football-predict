require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // Your Telegram ID
const bot = new TelegramBot(token, { polling: true });

// Load or initialize subscribers
const subsFile = path.join(__dirname, 'subscribers.json');
let subscribers = [];
if (fs.existsSync(subsFile)) {
  subscribers = JSON.parse(fs.readFileSync(subsFile));
}

// Subscription options with Odds and Price
const SUBS_OPTIONS = {
  daily: [
    { odds: 2, price: 10 },
    { odds: 5, price: 25 },
    { odds: 50, price: 200 },
  ],
  weekly: [
    { odds: 2, price: 20 },
    { odds: 5, price: 50 },
    { odds: 50, price: 400 },
  ],
  monthly: [
    { odds: 2, price: 60 },
    { odds: 5, price: 150 },
    { odds: 50, price: 1000 },
  ],
  yearly: [
    { odds: 2, price: 600 },
    { odds: 5, price: 1500 },
    { odds: 50, price: 10000 },
  ]
};

// Helper functions
function saveSubscribers() {
  fs.writeFileSync(subsFile, JSON.stringify(subscribers, null, 2));
}

function getSubscriber(id) {
  return subscribers.find(s => s.id === id);
}

function subscriptionExpired(sub) {
  return new Date() > new Date(sub.endDate);
}

// Commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const text = `Welcome to MatchIQ Tips Bot!\n\nCommands:\n/subscribe - Subscribe to VIP tips\n/status - Check your subscription\n/history - View past tips\n/help - Show commands`;
  bot.sendMessage(chatId, text);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const text = `Commands:\n/subscribe - Subscribe to VIP tips or free tips\n/status - Check subscription status\n/history - View past tips\n/help - Show this message`;
  bot.sendMessage(chatId, text);
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const sub = getSubscriber(chatId);
  if (!sub || subscriptionExpired(sub)) {
    return bot.sendMessage(chatId, "You do not have an active subscription. Use /subscribe to get VIP tips.");
  }
  bot.sendMessage(chatId, `Subscription: ${sub.type}\nExpires: ${new Date(sub.endDate).toLocaleString()}`);
});

bot.onText(/\/history/, (msg) => {
  const chatId = msg.chat.id;
  const sub = getSubscriber(chatId);
  if (!sub || subscriptionExpired(sub)) return bot.sendMessage(chatId, "No access. Subscribe first.");
  // Here you can send past tips from a JSON file or database
  bot.sendMessage(chatId, "Here is your past tip history:\n(Example tip 1)\n(Example tip 2)");
});

// Subscribe
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Daily", callback_data: "subscribe_daily" }],
        [{ text: "Weekly", callback_data: "subscribe_weekly" }],
        [{ text: "Monthly", callback_data: "subscribe_monthly" }],
        [{ text: "Yearly", callback_data: "subscribe_yearly" }],
        [{ text: "Free Game", callback_data: "subscribe_free" }],
      ]
    }
  };
  bot.sendMessage(chatId, "Choose your subscription:", opts);
});

// Handle button clicks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("subscribe_")) {
    const type = data.split("_")[1];

    if (type === "free") {
      bot.sendMessage(chatId, "You have selected the Free Game. Enjoy your free tips!");
      return;
    }

    // Show odds & prices
    const options = SUBS_OPTIONS[type];
    let text = `Subscription: ${type.toUpperCase()}\nAvailable Odds & Prices:\n`;
    options.forEach(o => text += `${o.odds} Odds - $${o.price}\n`);
    text += "\nAfter payment, send a screenshot/receipt here.";

    // Save pending subscription
    let sub = getSubscriber(chatId);
    if (!sub) {
      sub = { id: chatId, pendingType: type };
      subscribers.push(sub);
    } else {
      sub.pendingType = type;
    }
    saveSubscribers();

    bot.sendMessage(chatId, text);
  }
});

// Receive payment screenshots
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const sub = getSubscriber(chatId);
  if (!sub || !sub.pendingType) return;

  const photo = msg.photo[msg.photo.length - 1]; // best quality
  const fileId = photo.file_id;

  // Send to admin for verification
  bot.sendPhoto(ADMIN_CHAT_ID, fileId, { caption: `Payment screenshot from user ${chatId}. Subscription type: ${sub.pendingType}` });

  bot.sendMessage(chatId, "Payment received. Admin will verify and activate your subscription.");
});

// Admin approval simulation (you can implement real approval)
bot.onText(/\/approve (\d+)/, (msg, match) => {
  const adminId = msg.chat.id;
  if (adminId != ADMIN_CHAT_ID) return;

  const userId = parseInt(match[1]);
  const sub = getSubscriber(userId);
  if (!sub || !sub.pendingType) return bot.sendMessage(adminId, "User not found or no pending subscription.");

  const type = sub.pendingType;
  let days = 1;
  if (type === "daily") days = 1;
  else if (type === "weekly") days = 7;
  else if (type === "monthly") days = 30;
  else if (type === "yearly") days = 365;

  sub.type = type;
  sub.startDate = new Date().toISOString();
  sub.endDate = new Date(Date.now() + days*24*60*60*1000).toISOString();
  delete sub.pendingType;
  saveSubscribers();

  bot.sendMessage(userId, `✅ Your ${type} subscription is now active! Expires on ${sub.endDate}`);
  bot.sendMessage(adminId, `User ${userId} subscription activated.`);
});

// Auto notify expired subscriptions
setInterval(() => {
  const now = new Date();
  subscribers.forEach(s => {
    if (!s.type || !s.endDate) return;
    const end = new Date(s.endDate);
    if (now > end && !s.expiredNotified) {
      bot.sendMessage(s.id, "⚠️ Your subscription has expired. Please renew using /subscribe.");
      s.expiredNotified = true;
      saveSubscribers();
    } else if ((end - now) < 24*60*60*1000 && !s.warned) {
      bot.sendMessage(s.id, "⏰ Your subscription will expire in less than 24 hours. Renew soon!");
      s.warned = true;
      saveSubscribers();
    }
  });
}, 60*60*1000); // check every hour

console.log("MatchIQ Bot is running...");
