const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = process.env.ADMIN_ID;

const SUB_FILE = './subscribers.json';

// ===== Helpers =====
function loadSubs() {
  if (!fs.existsSync(SUB_FILE)) return {};
  return JSON.parse(fs.readFileSync(SUB_FILE));
}

function saveSubs(data) {
  fs.writeFileSync(SUB_FILE, JSON.stringify(data, null, 2));
}

function isActive(sub) {
  return sub && Date.now() < sub.expiry;
}

// ===== Commands =====

bot.onText(/\/help/, msg => {
  bot.sendMessage(msg.chat.id,
`📌 *MatchIQ Commands*

/subscribe – Subscribe to VIP tips
/status – Check subscription status
/help – Show commands`,
{ parse_mode: 'Markdown' });
});

// ===== SUBSCRIBE =====
bot.onText(/\/subscribe/, msg => {
  bot.sendMessage(msg.chat.id,
`💎 *Choose Subscription Plan*`,
{
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Daily', callback_data: 'plan_daily' }],
      [{ text: 'Weekly', callback_data: 'plan_weekly' }],
      [{ text: 'Monthly', callback_data: 'plan_monthly' }],
      [{ text: 'Yearly', callback_data: 'plan_yearly' }]
    ]
  }
});
});

// ===== PLAN SELECT =====
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const subs = loadSubs();

  if (q.data.startsWith('plan_')) {
    subs[chatId] = { plan: q.data.replace('plan_', ''), paid: false };
    saveSubs(subs);

    return bot.sendMessage(chatId,
`💳 *Payment Instructions*

🇬🇭 *GHANA*
Send Mobile Money to:
📞 +2335622504
👤 Richard Atidepe

🌍 *INTERNATIONAL*
WorldRemit or Ria
➡ Country: Ghana
➡ Name: Richard Atidepe
➡ Payout: Mobile Money
➡ Number: +2335622504

✅ After payment click below`,
{
  parse_mode: 'Markdown',
  reply_markup: { inline_keyboard: [[{ text: '✅ I Have Paid', callback_data: 'paid_confirm' }]] }
});
}

  // ===== PAYMENT CONFIRM =====
  if (q.data === 'paid_confirm') {
    const user = q.from;
    return bot.sendMessage(ADMIN_ID,
`✅ *PAYMENT CONFIRMATION*

👤 ${user.first_name}
🆔 ${user.id}
📦 Plan: ${subs[user.id]?.plan || 'Unknown'}

Approve?`,
{
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ Approve', callback_data: `approve_${user.id}` }],
      [{ text: '❌ Reject', callback_data: `reject_${user.id}` }]
    ]
  }
});
}

  // ===== ADMIN APPROVE =====
  if (q.data.startsWith('approve_')) {
    const id = q.data.split('_')[1];
    const sub = subs[id];
    let days = { daily:1, weekly:7, monthly:30, yearly:365 }[sub.plan];

    sub.paid = true;
    sub.start = Date.now();
    sub.expiry = Date.now() + days * 86400000;
    saveSubs(subs);

    bot.sendMessage(id,
`✅ *Subscription Activated*

📦 Plan: ${sub.plan}
⏳ Expires: ${new Date(sub.expiry).toDateString()}`,
{ parse_mode: 'Markdown' });

    return bot.sendMessage(ADMIN_ID, '✅ Activated');
  }

  // ===== ADMIN REJECT =====
  if (q.data.startsWith('reject_')) {
    const id = q.data.split('_')[1];
    delete subs[id];
    saveSubs(subs);
    bot.sendMessage(id, '❌ Payment not approved.');
  }
});

// ===== STATUS =====
bot.onText(/\/status/, msg => {
  const subs = loadSubs();
  const sub = subs[msg.chat.id];

  if (!sub) return bot.sendMessage(msg.chat.id, '❌ No active subscription.');

  if (!isActive(sub)) {
    return bot.sendMessage(msg.chat.id, '⛔ Subscription expired. Use /subscribe.');
  }

  bot.sendMessage(msg.chat.id,
`✅ *ACTIVE SUBSCRIPTION*
📦 Plan: ${sub.plan}
⏳ Expires: ${new Date(sub.expiry).toDateString()}`,
{ parse_mode: 'Markdown' });
});

// ===== ADMIN LIST =====
bot.onText(/\/admin/, msg => {
  if (String(msg.chat.id) !== ADMIN_ID) return;

  const subs = loadSubs();
  let text = '👥 *Subscribers*\n\n';

  Object.entries(subs).forEach(([id,s])=>{
    if (s.paid) {
      text += `🆔 ${id}\n📦 ${s.plan}\n⏳ ${new Date(s.expiry).toDateString()}\n\n`;
    }
  });

  bot.sendMessage(ADMIN_ID, text || 'No subscribers', { parse_mode: 'Markdown' });
});

// ===== VIP MESSAGE GATE =====
bot.on('message', msg => {
  if (!msg.text) return;
  if (!msg.text.startsWith('VIP:')) return;

  const subs = loadSubs();
  const sub = subs[msg.chat.id];

  if (!sub || !isActive(sub)) {
    return bot.sendMessage(msg.chat.id,
'🔒 VIP content blocked.\nUse /subscribe to access.');
  }
});

// ===== SERVER =====
app.get('/', (req,res)=>res.send('✅ MatchIQ Bot Running'));
app.listen(10000);
