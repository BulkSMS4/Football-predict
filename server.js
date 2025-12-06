require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());

/* ================== ENV ================== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

/* ================== BOT ================== */
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/* ================== DATA FILES ================== */
const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = `${DATA_DIR}/users.json`;
const SUBS_FILE = `${DATA_DIR}/subscriptions.json`;

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
if (!fs.existsSync(SUBS_FILE)) fs.writeFileSync(SUBS_FILE, "{}");

const readJSON = (f) => JSON.parse(fs.readFileSync(f));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

/* ================== PRICES & ODDS ================== */
const PLANS = {
  daily: [
    { odds: 2, price: "GHS 10" },
    { odds: 5, price: "GHS 20" }
  ],
  weekly: [
    { odds: 10, price: "GHS 50" }
  ],
  monthly: [
    { odds: 50, price: "GHS 150" }
  ],
  yearly: [
    { odds: 200, price: "GHS 800" }
  ]
};

/* ================== HELPERS ================== */
function now() {
  return Math.floor(Date.now() / 1000);
}

function addDays(days) {
  return now() + days * 86400;
}

function isActive(sub) {
  return sub && sub.expires > now();
}

/* ================== /START ================== */
bot.onText(/\/start/, (msg) => {
  const users = readJSON(USERS_FILE);
  if (!users[msg.chat.id]) {
    users[msg.chat.id] = { id: msg.chat.id, joined: now() };
    writeJSON(USERS_FILE, users);
  }

  const total = Object.keys(users).length;

  bot.sendMessage(
    msg.chat.id,
`✅ *MATCHIQ FOOTBALL PREDICT*

🎯 Daily • Weekly • Monthly • Yearly & FREE odds

👥 Total users: *${total}*

📌 Commands:
/subscribe – VIP plans
/status – Your subscription
/help – How it works`,
{ parse_mode: "Markdown" }
);
});

/* ================== /HELP ================== */
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
`ℹ️ *HOW MATCHIQ WORKS*

1️⃣ Use /subscribe to select plan  
2️⃣ Pay via Mobile Money  
3️⃣ Send receipt screenshot  
4️⃣ Admin approves  
5️⃣ Enjoy VIP odds

✅ No crypto
✅ International supported
✅ Auto expiration`,
{ parse_mode: "Markdown" }
);
});

/* ================== /STATUS ================== */
bot.onText(/\/status/, (msg) => {
  const subs = readJSON(SUBS_FILE);
  const sub = subs[msg.chat.id];

  if (!isActive(sub)) {
    bot.sendMessage(msg.chat.id, "❌ You have no active subscription.");
    return;
  }

  const days = Math.ceil((sub.expires - now()) / 86400);
  bot.sendMessage(msg.chat.id,
`✅ *Active Subscription*

📦 Plan: ${sub.plan}
🎯 Odds: ${sub.odds}
⏳ Days left: ${days}`, { parse_mode: "Markdown" });
});

/* ================== /SUBSCRIBE ================== */
bot.onText(/\/subscribe/, (msg) => {
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🆓 Free Tips", callback_data: "free" }],
        [{ text: "📅 Daily VIP", callback_data: "daily" }],
        [{ text: "📆 Weekly VIP", callback_data: "weekly" }],
        [{ text: "📅 Monthly VIP", callback_data: "monthly" }],
        [{ text: "📆 Yearly VIP", callback_data: "yearly" }]
      ]
    }
  };

  bot.sendMessage(msg.chat.id, "Select a subscription:", keyboard);
});

/* ================== CALLBACK HANDLER ================== */
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (data === "free") {
    bot.sendMessage(chatId, "✅ Free games will be posted publicly.");
    return;
  }

  const options = PLANS[data].map(p =>
    [{ text: `🎯 ${p.odds} Odds – ${p.price}`, callback_data: `${data}:${p.odds}` }]
  );

  bot.sendMessage(chatId, "Choose odds:", {
    reply_markup: { inline_keyboard: options }
  });
});

/* ================== SELECT ODDS ================== */
bot.on("callback_query", (q) => {
  if (!q.data.includes(":")) return;

  const [plan, odds] = q.data.split(":");
  const chatId = q.message.chat.id;
  const price = PLANS[plan].find(p => p.odds == odds).price;

  bot.sendMessage(chatId,
`💰 *PAYMENT DETAILS*

Plan: ${plan.toUpperCase()}
Odds: ${odds}
Price: ${price}

📲 Ghana: Send via MoMo to:
📞 +2335622504
👤 Richard Atidepe

🌍 Outside Ghana:
Send via WorldRemit or RIA

✅ After payment, send screenshot here`,
{ parse_mode: "Markdown" });

});

/* ================== PAYMENT SCREENSHOT ================== */
bot.on("photo", (msg) => {
  bot.sendMessage(ADMIN_CHAT_ID,
`📥 *PAYMENT PROOF*

👤 User: ${msg.chat.id}`, {
parse_mode: "Markdown"
  });

  bot.forwardMessage(ADMIN_CHAT_ID, msg.chat.id, msg.message_id);
});

/* ================== ADMIN APPROVAL ================== */
bot.onText(/\/approve (\d+) (\w+) (\d+)/, (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_CHAT_ID) return;

  const [, userId, plan, odds] = match;
  const subs = readJSON(SUBS_FILE);

  const duration =
    plan === "daily" ? 1 :
    plan === "weekly" ? 7 :
    plan === "monthly" ? 30 : 365;

  subs[userId] = {
    plan,
    odds,
    expires: addDays(duration)
  };

  writeJSON(SUBS_FILE, subs);

  bot.sendMessage(userId,
`✅ *SUBSCRIPTION ACTIVATED*

📅 Plan: ${plan}
🎯 Odds: ${odds}`, { parse_mode: "Markdown" });
});

/* ================== EXPRESS ================== */
app.get("/", (_, res) => {
  res.send("✅ MatchIQ Bot is running");
});

/* ================== START SERVER ================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
