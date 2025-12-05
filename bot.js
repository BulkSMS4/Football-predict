// bot.js
const TelegramBot = require('node-telegram-bot-api');

if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN not set');
if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD not set');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// --- /admin command: dashboard link ---
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const url = `https://football-predict-k7yp.onrender.com/admin?password=${process.env.ADMIN_PASSWORD}`;
  bot.sendMessage(chatId, `🔑 Open admin dashboard: [Click Here](${url})`, { parse_mode: 'Markdown' });
});

// --- /status command ---
bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ Football Predict Bot API is running.');
});

// --- /tips command: show inline buttons ---
bot.onText(/\/tips/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Select a tip type to send:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Free Tip', callback_data: 'tip_free' }],
        [{ text: 'VIP Tip', callback_data: 'tip_vip' }],
        [{ text: 'Result', callback_data: 'tip_result' }]
      ]
    }
  });
});

// --- Handle inline button clicks ---
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  await bot.sendMessage(chatId, 'Enter the target channel or chat ID (e.g., @channelname or -1001234567890):');

  const targetListener = (msg) => {
    if (msg.chat.id !== chatId) return;

    const target = msg.text;

    // Default tip content
    let text = '';
    if (data === 'tip_free') text = '🆓 FREE TIP\n⚽ Match: TeamA vs TeamB\n🎯 Tip: Over 2.5 Goals';
    if (data === 'tip_vip') text = '💎 VIP TIP\n⚽ Match: TeamC vs TeamD\n🎯 Tip: Correct Score — 2-1\n📝 Notes: Small stake recommended';
    if (data === 'tip_result') text = '✅ RESULT\n⚽ Match: TeamE vs TeamF\n🎯 Result: 1–1 (Over 1.5)';

    // Send tip
    bot.sendMessage(target, text)
      .then(() => bot.sendMessage(chatId, '✅ Tip sent successfully!'))
      .catch(err => bot.sendMessage(chatId, '❌ Failed to send tip: ' + err.message));

    // Remove listener to avoid duplicate triggers
    bot.removeListener('message', targetListener);
  };

  bot.on('message', targetListener);
});

module.exports = bot;
