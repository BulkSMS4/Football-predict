require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Subscribers database
let subscribers = {};
const dbFile = './subscribers.json';
if (fs.existsSync(dbFile)) subscribers = JSON.parse(fs.readFileSync(dbFile));

// Save subscribers helper
function saveSubscribers() {
  fs.writeFileSync(dbFile, JSON.stringify(subscribers, null, 2));
}

// Check if subscription is active
function isActive(chatId) {
  const user = subscribers[chatId];
  if (!user || !user.subscription) return false;
  return new Date(user.subscription.expires) > new Date();
}

// Send alerts for subscription expiry (1 day before)
function checkExpiringSubscriptions() {
  const now = new Date();
  for (const id in subscribers) {
    const sub = subscribers[id].subscription;
    if (!sub) continue;
    const expires = new Date(sub.expires);
    const diffDays = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    if (diffDays === 1 && !sub.alertSent) {
      bot.sendMessage(id, `⚠️ Your VIP subscription expires tomorrow. Renew to continue receiving tips.`);
      subscribers[id].subscription.alertSent = true;
    }
  }
  saveSubscribers();
}
setInterval(checkExpiringSubscriptions, 60 * 60 * 1000); // every hour

// Broadcast tip to subscribers
function broadcastTip(post) {
  const { target, text, meta } = post;

  if (meta.postType === 'vip') {
    for (const id in subscribers) {
      if (isActive(id)) bot.sendMessage(id, `💎 VIP Tip:\n${text}`);
    }
  } else {
    bot.sendMessage(target, text, { parse_mode: 'Markdown' });
  }
}

// API endpoint for admin dashboard
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

// Serve static files (admin.html etc.)
app.use(express.static('public'));

app.listen(port, () => console.log(`Server running on port ${port}`));
