require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ''; // put your Telegram ID for admin notifications

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Load subscribers
let subscribers = [];
const subsFile = './subscribers.json';
if (fs.existsSync(subsFile)) {
  subscribers = JSON.parse(fs.readFileSync(subsFile));
}

// Save subscribers
function saveSubscribers() {
  fs.writeFileSync(subsFile, JSON.stringify(subscribers, null, 2));
}

// Utility to find subscriber
function getSubscriber(id) {
  return subscribers.find(s => s.id === id);
}

// ---------- /start command ----------
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const totalSubs = subscribers.length;

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🆓 Free Tips', callback_data: 'free' }],
        [{ text: '💎 VIP Subscription', callback_data: 'subscribe' }],
        [{ text: '📊 Status', callback_data: 'status' }],
        [{ text: '💰 I have Paid', callback_data: 'paid' }],
        [{ text: 'ℹ️ Help', callback_data: 'help' }]
      ]
    }
  };

  bot.sendMessage(chatId,
    `⚽ *MATCHIQ Football Predictions*\n\n` +
    `✅ Free Odds\n✅ Daily / Weekly / Monthly / Yearly VIP\n✅ Accurate Analysis\n\n` +
    `📊 Total Subscribers: ${totalSubs}\n\n` +
    `Select an option below to continue.`, 
    { parse_mode: 'Markdown', ...opts }
  );
});

// ---------- Callback button handler ----------
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  let sub = getSubscriber(chatId);

  switch (data) {
    case 'free':
      bot.sendMessage(chatId, '🆓 *Free Tip*\nArsenal vs Brighton — Over 2.5 Goals', { parse_mode: 'Markdown' });
      break;

    case 'subscribe':
      bot.sendMessage(chatId,
        '💎 *VIP Subscription Options:*\n' +
        'Daily: 2 Odds — $10, 5 Odds — $20, 50 Odds — $100\n' +
        'Weekly: 2 Odds — $30, 5 Odds — $50, 50 Odds — $250\n' +
        'Monthly: 2 Odds — $100, 5 Odds — $200, 50 Odds — $1000\n' +
        'Yearly: 2 Odds — $1000, 5 Odds — $2000, 50 Odds — $10000\n\n' +
        'Send payment and click "I have Paid" after.', 
        { parse_mode: 'Markdown' }
      );
      break;

    case 'status':
      if (!sub || !sub.subscriptionEnd || Date.now() > new Date(sub.subscriptionEnd)) {
        bot.sendMessage(chatId, '❌ You do not have an active subscription.');
      } else {
        bot.sendMessage(chatId,
          `✅ Your subscription is active.\nType: ${sub.subscriptionType}\nExpires: ${new Date(sub.subscriptionEnd).toLocaleString()}`
        );
      }
      break;

    case 'paid':
      bot.sendMessage(chatId,
        '💰 Please send a *screenshot or payment receipt* of your VIP subscription.\n\n' +
        'Once we verify, your subscription will be activated.', 
        { parse_mode: 'Markdown' }
      );
      break;

    case 'help':
      bot.sendMessage(chatId,
        'ℹ️ *Commands & Options:*\n' +
        '/start — Open main menu\n' +
        '🆓 Free Tips — Get free tips\n' +
        '💎 VIP Subscription — Subscribe for paid tips\n' +
        '📊 Status — Check your subscription\n' +
        '💰 I have Paid — Send payment receipt\n' +
        'ℹ️ Help — Show this menu', 
        { parse_mode: 'Markdown' }
      );
      break;
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// ---------- Handle payment screenshot / receipt ----------
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;

  // Save or forward to admin
  if (ADMIN_CHAT_ID) {
    await bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);
    bot.sendMessage(chatId, '📨 Payment screenshot sent to admin. Verification will be done soon.');
  } else {
    bot.sendMessage(chatId, '⚠️ Admin chat not set. Cannot send receipt.');
  }
});

// ---------- Admin command to add subscription manually ----------
bot.onText(/\/addsub (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_CHAT_ID) return; // Only admin

  const days = parseInt(match[1]);
  const targetId = msg.reply_to_message?.forward_from?.id;
  if (!targetId) return bot.sendMessage(chatId, 'Reply to a user\'s message containing receipt to add subscription.');

  let sub = getSubscriber(targetId);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  if (!sub) {
    sub = { id: targetId, subscriptionType: `${days}-Day VIP`, subscriptionEnd: endDate };
    subscribers.push(sub);
  } else {
    sub.subscriptionType = `${days}-Day VIP`;
    sub.subscriptionEnd = endDate;
  }

  saveSubscribers();
  bot.sendMessage(chatId, `✅ Subscription added for user ${targetId}, expires on ${endDate.toLocaleString()}`);
  bot.sendMessage(targetId, `🎉 Your VIP subscription is active until ${endDate.toLocaleString()}`);
});

// ---------- Periodic subscription check (alert if near expiry) ----------
setInterval(() => {
  const now = Date.now();
  subscribers.forEach(sub => {
    const end = new Date(sub.subscriptionEnd).getTime();
    if (end - now < 24*60*60*1000 && end - now > 0) { // less than 24h remaining
      bot.sendMessage(sub.id, `⚠️ Your subscription is ending soon (${new Date(sub.subscriptionEnd).toLocaleString()}). Renew to continue receiving VIP tips.`);
    }
    if (end < now) {
      bot.sendMessage(sub.id, `❌ Your subscription has expired. Please renew to access VIP tips.`);
    }
  });
}, 60*60*1000); // every hour

console.log('✅ Telegram bot running...');
