// bot.js
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is not set in environment variables');

const bot = new TelegramBot(token, { polling: true });

// Command to open admin dashboard
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const url = `https://football-predict-k7yp.onrender.com/admin?password=${process.env.ADMIN_PASSWORD}`;
  bot.sendMessage(chatId, `🔑 Open admin dashboard: [Click Here](${url})`, { parse_mode: 'Markdown' });
});

// Optional: status check
bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ Football Predict Bot API is running.');
});

module.exports = bot;
