require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const dbFile = './subscribers.json';

// Load subscribers
let subscribers = {};
if (fs.existsSync(dbFile)) subscribers = JSON.parse(fs.readFileSync(dbFile));

function saveSubscribers() {
  fs.writeFileSync(dbFile, JSON.stringify(subscribers, null, 2));
}

// /subscribe command
bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `Choose your subscription:\n\n` +
    `1️⃣ Daily VIP - $1\n` +
    `2️⃣ Weekly VIP - $5\n` +
    `3️⃣ Monthly VIP - $15\n` +
    `4️⃣ Yearly VIP - $150\n\nReply with the number to pay and activate.`
  );
});

// Capture user choice
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (['1','2','3','4'].includes(text)) {
    let durationDays = 1;
    let amount = 1;
    if (text==='2'){durationDays=7; amount=5;}
    if (text==='3'){durationDays=30; amount=15;}
    if (text==='4'){durationDays=365; amount=150;}

    // Here you should integrate payment API
    bot.sendMessage(chatId, `💳 Please pay $${amount} to activate VIP.`);

    // Simulate payment success
    setTimeout(()=>{
      const expires = new Date(Date.now() + durationDays*24*60*60*1000);
      subscribers[chatId] = { subscription: { plan: text, expires: expires, alertSent:false } };
      saveSubscribers();
      bot.sendMessage(chatId, `✅ VIP activated! Expires: ${expires.toDateString()}`);
    }, 3000); // simulate 3s payment processing
  }
});

// Mask VIP tips for non-subscribers
bot.onText(/\/tip/, (msg) => {
  const chatId = msg.chat.id;
  if (!subscribers[chatId] || !isActive(chatId)) {
    bot.sendMessage(chatId, `💎 VIP tip: Subscribe to access VIP tips! Use /subscribe`);
  }
});
