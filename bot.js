// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const SUB_FILE = path.join(__dirname, 'subscribers.json');
const ADMIN_ID = process.env.ADMIN_CHAT_ID;

// Ensure subscribers file exists
if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, JSON.stringify([]));

// Load / Save subscribers
function loadSubscribers() {
  return JSON.parse(fs.readFileSync(SUB_FILE));
}
function saveSubscribers(subs) {
  fs.writeFileSync(SUB_FILE, JSON.stringify(subs, null, 2));
}
function findSubscriber(id) {
  return loadSubscribers().find(s => s.id === id);
}

// Subscription plans
const plans = {
  daily: [{ odds: 2, price: 50 }, { odds: 5, price: 100 }],
  weekly: [{ odds: 5, price: 300 }, { odds: 10, price: 500 }],
  monthly: [{ odds: 10, price: 1000 }, { odds: 50, price: 4000 }],
  yearly: [{ odds: 50, price: 15000 }, { odds: 100, price: 25000 }],
};

// Handle /help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, "Commands:\n/subscribe - Subscribe to VIP tips\n/status - Check subscription\n/help - Show commands\n/free - Get free tip games");
});

// Handle /free command
bot.onText(/\/free/, (msg) => {
  bot.sendMessage(msg.chat.id, "Here is your free tip:\n⚽ Arsenal vs Brighton — Over 2.5 Goals");
});

// Check subscription
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const user = findSubscriber(chatId);
  if (!user) return bot.sendMessage(chatId, "You have no active subscription. Use /subscribe to join VIP.");

  const now = new Date();
  const end = new Date(user.endDate);
  if (now > end) return bot.sendMessage(chatId, "Your subscription expired. Use /subscribe to renew.");
  bot.sendMessage(chatId, `Your subscription: ${user.subscriptionType}\nExpires: ${end.toLocaleString()}`);
});

// Subscribe command
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = [
    [{ text: 'Daily' }, { text: 'Weekly' }],
    [{ text: 'Monthly' }, { text: 'Yearly' }],
    [{ text: 'Free Game' }]
  ];
  bot.sendMessage(chatId, "Select a subscription plan:", { reply_markup: { keyboard, one_time_keyboard: true } });
});

// Handle subscription selection & payments
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

  if (['daily','weekly','monthly','yearly'].includes(text)) {
    let optionsText = plans[text].map(o => `${o.odds} Odds - Price: ${o.price} GHS`).join('\n');
    bot.sendMessage(chatId, `You selected ${text} plan. Options:\n${optionsText}\nAfter payment, click 'I Paid' and send screenshot.`);
    return;
  }

  if (text === 'i paid') {
    bot.sendMessage(chatId, "Please send the screenshot / receipt of your payment.");
    return;
  }

  if (msg.photo || msg.document) {
    // Forward receipt to admin
    bot.forwardMessage(ADMIN_ID, chatId, msg.message_id);
    bot.sendMessage(chatId, "Receipt sent to admin. Waiting for approval.");

    // Add subscriber if not exists
    let subs = loadSubscribers();
    if (!findSubscriber(chatId)) {
      subs.push({ id: chatId, username: msg.from.username, subscriptionType: 'pending', endDate: null });
      saveSubscribers(subs);
    }
    return;
  }
});
