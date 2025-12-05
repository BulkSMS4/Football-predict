require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_IDS = [6482794683]; // ✅ YOUR TELEGRAM ID
const VIP_CHANNEL_ID = '-100XXXXXXXXXX'; // ✅ Your private channel ID

const DB_FILE = './subscribe.json';

/* ---------- DATABASE ---------- */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ---------- SUBSCRIPTION TIME ---------- */
const PLANS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365
};

function addDays(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

/* ---------- USER COMMANDS ---------- */

/>> HELP
bot.onText(/\/help/, msg => {
  bot.sendMessage(msg.chat.id,
`📌 *MatchIQ Commands*

/subscribe – Subscribe to VIP tips
/status – Check your subscription
/help – Show commands`, { parse_mode: 'Markdown' });
});

/>> SUBSCRIBE
bot.onText(/\/subscribe/, msg => {
  bot.sendMessage(msg.chat.id, 'Choose a plan 👇', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Daily', callback_data: 'sub_daily' }],
        [{ text: '✅ Weekly', callback_data: 'sub_weekly' }],
        [{ text: '✅ Monthly', callback_data: 'sub_monthly' }],
        [{ text: '✅ Yearly', callback_data: 'sub_yearly' }]
      ]
    }
  });
});

/>> STATUS
bot.onText(/\/status/, msg => {
  const db = loadDB();
  const user = db.users[msg.from.id];

  if (!user || user.expiry < Date.now()) {
    return bot.sendMessage(msg.chat.id, '❌ You have no active subscription.');
  }

  const daysLeft = Math.ceil((user.expiry - Date.now()) / 86400000);
  bot.sendMessage(msg.chat.id, `✅ Active VIP
⏳ Days left: ${daysLeft}`);
});

/* ---------- CALLBACK HANDLER ---------- */

bot.on('callback_query', q => {
  if (!q.data.startsWith('sub_')) return;

  const plan = q.data.split('_')[1];
  const db = loadDB();

  db.users[q.from.id] = {
    username: q.from.username || '',
    expiry: addDays(PLANS[plan])
  };

  saveDB(db);

  bot.sendMessage(q.from.id,
`✅ Subscription successful
Plan: *${plan.toUpperCase()}*
Access granted to VIP tips ✅`, { parse_mode: 'Markdown' });

  bot.answerCallbackQuery(q.id);
});

/* ---------- ADMIN ---------- */

bot.onText(/\/admin/, msg => {
  if (!ADMIN_IDS.includes(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, '❌ Access denied');
  }

  bot.sendMessage(msg.chat.id,
`🛠 *Admin Panel*

/postvip – Post VIP tip
/postfree – Post free tip
/subscribers – View subscribers
/broadcast – Send alert`,
{ parse_mode: 'Markdown' });
});

/>> POST VIP
bot.onText(/\/postvip (.+)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const tip = match[1];
  const db = loadDB();

  for (const uid in db.users) {
    if (db.users[uid].expiry > Date.now()) {
      bot.sendMessage(uid, `🔥 *VIP TIP*\n${tip}`, { parse_mode: 'Markdown' });
    }
  }

  bot.sendMessage(msg.chat.id, '✅ VIP tip sent');
});

/>> POST FREE
bot.onText(/\/postfree (.+)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  bot.sendMessage(VIP_CHANNEL_ID,
`⚽ *FREE TIP*\n${match[1]}`, { parse_mode: 'Markdown' });
});

/>> SUBSCRIBERS LIST
bot.onText(/\/subscribers/, msg => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  const db = loadDB();
  let text = '👥 *Subscribers*\n\n';

  for (const id in db.users) {
    const days = Math.ceil((db.users[id].expiry - Date.now()) / 86400000);
    text += `• ${id} — ${days} days\n`;
  }

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

/* ---------- AUTO EXPIRY CHECK ---------- */

setInterval(() => {
  const db = loadDB();

  for (const id in db.users) {
    if (db.users[id].expiry < Date.now()) {
      bot.sendMessage(id, '⚠️ Your VIP subscription has expired.');
      delete db.users[id];
    }
  }

  saveDB(db);
}, 3600000); // every hour
