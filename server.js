const express = require('express');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const SUB_FILE = './subscribers.json';
const HISTORY_FILE = './history.json';
const REF_FILE = './referrals.json';

// ---------- HELPERS ----------
const load = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : {};
const save = (f,d)=>fs.writeFileSync(f,JSON.stringify(d,null,2));
const isActive = s => s && s.paid && Date.now() < s.expiry;

// ---------- LOAD DATA ----------
let subs = load(SUB_FILE);
let hist = load(HISTORY_FILE);
let ref = load(REF_FILE);

// ---------- COMMANDS ----------
bot.onText(/\/help/, m=>{
  bot.sendMessage(m.chat.id,
`📌 *Commands*
/free – Free tips
/subscribe – VIP plans
/status – Subscription status
/help – Commands
/refer <code> – Invite friends`,
  {parse_mode:'Markdown'});
});

bot.onText(/\/free/, m=>{
  bot.sendMessage(m.chat.id,
`🆓 *FREE TIPS*
✅ Over 2.5 ✅
✅ BTTS ✅
💎 VIP gives more wins`,
  {parse_mode:'Markdown'});
});

bot.onText(/\/status/, m=>{
  const s=subs[m.chat.id];
  if(!isActive(s)) return bot.sendMessage(m.chat.id,'❌ No active VIP');
  bot.sendMessage(m.chat.id,
`✅ ACTIVE VIP
⏳ Expires: ${new Date(s.expiry).toDateString()}`);
});

bot.onText(/\/refer (.+)/, (m,match)=>{
  const code = match[1];
  if(!ref[code]) ref[code]={count:0};
  ref[code].count++;
  save(REF_FILE,ref);
  bot.sendMessage(m.chat.id,`✅ Referral counted! You invited ${ref[code].count} friends`);
});

// ---------- SUBSCRIBE ----------
bot.onText(/\/subscribe/, m=>{
  bot.sendMessage(m.chat.id,'💎 VIP Subscription',{
    parse_mode:'Markdown',
    reply_markup:{
      inline_keyboard:[
        [{text:'📜 View History',callback_data:'history'}],
        [{text:'✅ Subscribe',callback_data:'plans'}]
      ]
    }
  });
});

// ---------- CALLBACK ----------
bot.on('callback_query', q=>{
  const id=q.message.chat.id;

  // ---------------- VIEW HISTORY ----------------
  if(q.data==='history'){
    let msg='📊 *Past Performance*\n\n';
    Object.values(hist).slice(-5).forEach(h=>{
      msg+=`✅ ${h.match} — WIN ✅\n`;
    });
    return bot.sendMessage(id,msg||'No history',{parse_mode:'Markdown'});
  }

  // ---------------- SUBSCRIBE PLANS ----------------
  if(q.data==='plans'){
    return bot.sendMessage(id,'Choose Plan',{
      reply_markup:{
        inline_keyboard:[
          [{text:'Daily',callback_data:'p_daily'}],
          [{text:'Weekly',callback_data:'p_weekly'}],
          [{text:'Monthly',callback_data:'p_monthly'}],
          [{text:'Yearly',callback_data:'p_yearly'}]
        ]
      }
    });
  }

  // ---------------- SELECT PLAN ----------------
  if(q.data.startsWith('p_')){
    subs[id]={ plan:q.data.split('_')[1], paid:false };
    save(SUB_FILE,subs);
    return bot.sendMessage(id,
`💳 Payment Instructions:

🇬🇭 Ghana MoMo: 05622504
👤 Richard Atidepe

🌍 WorldRemit/Ria → Ghana

✅ Click after paying`,
{
      reply_markup:{inline_keyboard:[[{text:'I Paid ✅',callback_data:'paid'}]]}
    });
  }

  // ---------------- USER PAID ----------------
  if(q.data==='paid'){
    bot.sendMessage(ADMIN_ID,
`✅ Payment Alert
User: ${id}
Plan: ${subs[id].plan}`,
{
      reply_markup:{
        inline_keyboard:[
          [{text:'Approve',callback_data:`ok_${id}`}],
          [{text:'Reject',callback_data:`no_${id}`}],
          [{text:'Revoke',callback_data:`revoke_${id}`}]
        ]
      }
    });
  }

  // ---------------- ADMIN APPROVE ----------------
  if(q.data.startsWith('ok_')){
    const uid=q.data.split('_')[1];
    const d={daily:1,weekly:7,monthly:30,yearly:365}[subs[uid].plan];
    subs[uid].paid=true;
    subs[uid].expiry=Date.now()+d*86400000;
    subs[uid].warned=false;
    subs[uid].expired=false;
    save(SUB_FILE,subs);
    bot.sendMessage(uid,'✅ VIP Activated');
  }

  // ---------------- ADMIN REJECT ----------------
  if(q.data.startsWith('no_')){
    const uid=q.data.split('_')[1];
    delete subs[uid];
    save(SUB_FILE,subs);
  }

  // ---------------- ADMIN REVOKE ----------------
  if(q.data.startsWith('revoke_')){
    const uid=q.data.split('_')[1];
    delete subs[uid];
    save(SUB_FILE,subs);
    bot.sendMessage(uid,'⛔ VIP revoked by admin');
  }
});

// ---------- ADMIN VIP POST ----------
bot.onText(/\/vip (.+)/, (m,match)=>{
  if(String(m.chat.id)!==ADMIN_ID) return;
  const text=`💎 VIP TIP\n${match[1]}`;

  hist[Date.now()]={match:match[1]};
  save(HISTORY_FILE,hist);

  Object.keys(subs).forEach(uid=>{
    if(isActive(subs[uid])){
      bot.sendMessage(uid,`🔥 NEW VIP GAME POSTED\n\n${text}`);
    }
  });
});

// ---------- ADMIN BROADCAST ----------
bot.onText(/\/broadcast (.+)/, (m,match)=>{
  if(String(m.chat.id)!==ADMIN_ID) return;
  Object.keys(subs).forEach(uid=>{
    bot.sendMessage(uid,`📢 BROADCAST:\n\n${match[1]}`);
  });
});

// ---------- EXPIRY CHECK & ALERTS ----------
setInterval(()=>{
  Object.keys(subs).forEach(id=>{
    const s=subs[id];
    if(!s.paid) return;

    const left = s.expiry-Date.now();

    if(left<86400000 && left>0 && !s.warned){
      s.warned=true;
      bot.sendMessage(id,'⏰ VIP expires in 24 hours');
    }

    if(left<=0 && !s.expired){
      s.expired=true;
      bot.sendMessage(id,'⛔ VIP expired. Renew to continue');
    }
  });
  save(SUB_FILE,subs);
}, 60000);

// ---------- SERVER ----------
app.get('/',(_,res)=>res.send('✅ MatchIQ Running'));
app.listen(10000,()=>console.log('Server running'));
