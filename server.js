require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.use(bodyParser.json());
app.use(express.static('public'));

// Load subscribers database
let subscribers = {};
const dbFile = './subscribers.json';
if (fs.existsSync(dbFile)) subscribers = JSON.parse(fs.readFileSync(dbFile));

// Helper: save subscribers
function saveSubscribers() {
  fs.writeFileSync(dbFile, JSON.stringify(subscribers, null, 2));
}

// Check subscription active
function isActive(chatId) {
  const user = subscribers[chatId];
  if (!user || !user.subscription) return false;
  return new Date(user.subscription.expires) > new Date();
}

// Broadcast tip to subscribers
function broadcastTip(post) {
  const { target, text, meta } = post;

  if (meta.postType === 'vip') {
    // VIP: send only to active subscribers
    for (const id in subscribers) {
      if (isActive(id)) bot.sendMessage(id, `💎 VIP Tip:\n${text}`);
    }
  } else {
    // Free / result / announcement: send to target channel
    bot.sendMessage(target, text, { parse_mode: 'Markdown' });
  }
}

// API endpoint for dashboard
app.post('/api/sendTip', (req, res) => {
  const { password, target, text, meta } = req.body;

  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });

  try {
    broadcastTip({ target, text, meta });
    res.json({ success: true, message: 'Tip sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
