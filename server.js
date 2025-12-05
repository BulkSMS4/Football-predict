// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');

const app = express();
app.use(bodyParser.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; 
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const bot = new Telegraf(BOT_TOKEN);

// Data files
const SUB_FILE = path.join(__dirname,'subscribers.json');
const TIPS_FILE = path.join(__dirname,'tips.json');
if(!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE,'[]');
if(!fs.existsSync(TIPS_FILE)) fs.writeFileSync(TIPS_FILE,'[]');

// Utilities
function loadSubs(){ return JSON.parse(fs.readFileSync(SUB_FILE)); }
function saveSubs(data){ fs.writeFileSync(SUB_FILE, JSON.stringify(data,null,2)); }

function loadTips(){ return JSON.parse(fs.readFileSync(TIPS_FILE)); }
function saveTips(data){ fs.writeFileSync(TIPS_FILE, JSON.stringify(data,null,2)); }

// Helper: find subscriber
function getSubscriber(id){ return loadSubs().find(s=>s.id===id); }

// Send tip to all subscribers
async function sendTipToSubscribers(tip){
  const subs = loadSubs().filter(s=>s.status==='active');
  for(const s of subs){
    try{
      await bot.telegram.sendMessage(s.id, tip);
    } catch(err){ console.log('Error sending to', s.id, err.message); }
  }
}

// API endpoint to post tips from admin dashboard
app.post('/api/sendTip', async (req,res)=>{
  const { text, meta } = req.body;
  if(!text) return res.status(400).json({error:'No text'});
  // save tip
  const tips = loadTips();
  tips.unshift({id:Date.now(), text, meta});
  saveTips(tips);
  // send to subscribers
  await sendTipToSubscribers(text);
  res.json({success:true, sentTo:loadSubs().filter(s=>s.status==='active').length});
});

// API endpoint to get subscribers (for admin dashboard)
app.get('/api/subscribers', (req,res)=>{
  res.json(loadSubs());
});

// Bot commands
bot.start(ctx=>{
  const sub = getSubscriber(ctx.from.id);
  if(sub && sub.status==='active'){
    return ctx.reply(`Welcome back, ${ctx.from.first_name}! You are subscribed (${sub.subscriptionType}). Use /help to see commands.`);
  }
  ctx.reply(`Hi ${ctx.from.first_name}! Welcome to MatchIQ Tips.\nUse /subscribe to view subscription options.\nUse /help to see commands.`);
});

bot.help(ctx=>{
  ctx.reply(`Available commands:
/subscribe - Subscribe to VIP tips
/status - Check your subscription
/help - Show this message
/admin - Admin menu (password protected)`);
});

// /status command
bot.command('status', ctx=>{
  const sub = getSubscriber(ctx.from.id);
  if(!sub || sub.status!=='active') return ctx.reply('You are not subscribed yet.');
  ctx.reply(`Your subscription:
Type: ${sub.subscriptionType}
Expires: ${new Date(sub.endDate).toLocaleString()}`);
});

// /subscribe command
bot.command('subscribe', ctx=>{
  ctx.reply('Select subscription type:',{
    reply_markup:{
      inline_keyboard:[
        [{text:'Free',callback_data:'sub_free'}],
        [{text:'Daily',callback_data:'sub_daily'}],
        [{text:'Weekly',callback_data:'sub_weekly'}],
        [{text:'Monthly',callback_data:'sub_monthly'}],
        [{text:'Yearly',callback_data:'sub_yearly'}],
      ]
    }
  });
});

// Handle subscription selection
bot.on('callback_query', async ctx=>{
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  let subs = loadSubs();
  let subscriber = subs.find(s=>s.id===userId);
  if(!subscriber){
    subscriber = { id:userId, username:ctx.from.username, status:'pending' };
    subs.push(subscriber);
  }

  // Free subscription
  if(data==='sub_free'){
    subscriber.subscriptionType='free';
    subscriber.status='active';
    subscriber.endDate = new Date(Date.now()+24*60*60*1000).toISOString(); // 1 day free
    saveSubs(subs);
    await ctx.answerCbQuery('Free tip activated for 1 day!');
    return ctx.reply('You are now subscribed to free tips!');
  }

  // Paid subscriptions
  if(data.startsWith('sub_') && data!=='sub_free'){
    const plan = data.split('_')[1];
    subscriber.subscriptionType=plan;
    subscriber.status='pending';
    saveSubs(subs);
    let paymentInfo = plan==='daily'? 'Pay 20 USD via MTN Mobile Money (Ghana) or WorldRemit/RIA (International, Richard Atidepe)' :
                      plan==='weekly'? 'Pay 100 USD via MTN Mobile Money (Ghana) or WorldRemit/RIA' :
                      plan==='monthly'? 'Pay 350 USD via MTN Mobile Money (Ghana) or WorldRemit/RIA' :
                      'Pay 1000 USD via MTN Mobile Money (Ghana) or WorldRemit/RIA';

    await ctx.answerCbQuery();
    return ctx.reply(`You selected ${plan} subscription.\nSend proof of payment (screenshot/receipt) to verify.\n${paymentInfo}`);
  }
});

// Handle photos (payment proof)
bot.on('photo', async ctx=>{
  const sub = getSubscriber(ctx.from.id);
  if(sub && sub.status==='pending'){
    // forward screenshot to admin
    await bot.telegram.sendPhoto(ADMIN_CHAT_ID, ctx.message.photo[ctx.message.photo.length-1].file_id,{
      caption:`Payment screenshot from @${ctx.from.username || ctx.from.first_name} for ${sub.subscriptionType} subscription`
    });
    await ctx.reply('Payment screenshot received. Admin will verify shortly.');
  }
});

// Expiration alert & auto-block
setInterval(()=>{
  const subs = loadSubs();
  const now = Date.now();
  let updated = false;
  subs.forEach(s=>{
    if(s.status==='active' && new Date(s.endDate).getTime() < now){
      s.status='expired';
      updated = true;
      // notify user
      bot.telegram.sendMessage(s.id, `Your ${s.subscriptionType} subscription has expired. Please renew to continue receiving VIP tips.`);
    } else if(s.status==='active'){
      // notify if less than 1 day remaining
      const remaining = new Date(s.endDate).getTime()-now;
      if(remaining<24*60*60*1000 && !s.alertSent){
        bot.telegram.sendMessage(s.id, `Your subscription will expire in less than 24h. Please renew to avoid interruption.`);
        s.alertSent=true;
        updated=true;
      }
    }
  });
  if(updated) saveSubs(subs);
},60*60*1000); // check every hour

bot.launch();
console.log('Bot running...');

// Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log('Server running on port',PORT));
