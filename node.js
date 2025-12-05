const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Store VIP subscribers
const vipSubscribers = {}; // chatId -> { plan: 'daily'|'weekly'|'monthly'|'yearly', expires: timestamp }

// Subscription plans
const plans = {
  daily: { price: 1, duration: 1*24*60*60*1000 },
  weekly: { price: 5, duration: 7*24*60*60*1000 },
  monthly: { price: 15, duration: 30*24*60*60*1000 },
  yearly: { price: 100, duration: 365*24*60*60*1000 }
};

// Example: VIP tip
const vipTip = {
  match: 'Arsenal vs Brighton',
  analysis: 'Arsenal unbeaten last 5; Brighton poor away.',
  tip: 'Correct Score — 2–1'
};

// Start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome! Use /viptip to see VIP tips.');
});

// VIP Tip command
bot.onText(/\/viptip/, (msg) => {
  const chatId = msg.chat.id;
  const sub = vipSubscribers[chatId];

  if (!sub || sub.expires < Date.now()) {
    // Not subscribed or expired
    bot.sendMessage(chatId, '❌ You are not subscribed to VIP tips. Choose a plan:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Daily $1', callback_data: 'sub_daily' }],
          [{ text: 'Weekly $5', callback_data: 'sub_weekly' }],
          [{ text: 'Monthly $15', callback_data: 'sub_monthly' }],
          [{ text: 'Yearly $100', callback_data: 'sub_yearly' }]
        ]
      }
    });
  } else {
    // Show VIP tip
    bot.sendMessage(chatId,
      `💎 VIP Tip\n⚽ Match: ${vipTip.match}\n📊 Analysis: ${vipTip.analysis}\n🎯 Tip: ${vipTip.tip}\n\nValid until: ${new Date(sub.expires).toLocaleString()}`
    );
  }
});

// Handle subscription button click
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('sub_')) {
    const planKey = data.split('_')[1];
    const plan = plans[planKey];
    if (!plan) return;

    // Generate fake payment link (replace with real payment integration)
    const paymentLink = `https://yourpaymentgateway.com/pay?amount=${plan.price}&user=${chatId}&plan=${planKey}`;
    bot.sendMessage(chatId, `💳 Click to pay for ${planKey} subscription: ${paymentLink}`);

    // For demo: grant VIP immediately (in real life, verify payment webhook)
    vipSubscribers[chatId] = { plan: planKey, expires: Date.now() + plan.duration };
    bot.sendMessage(chatId, `✅ Subscription activated! You can now view VIP tips. Expires: ${new Date(vipSubscribers[chatId].expires).toLocaleString()}`);
  }
});
