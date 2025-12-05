// bot.js
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// === CONFIG ===
const BOT_TOKEN = '8596462347:AAF8B11EYoPKaaVFQgzC2dvIDcAKkPc4ybQ';
const ADMIN_ID = '6482794683'; // where to send payment screenshots
const SUB_FILE = './subscribers.json';
const ODDS_FILE = './odds.json';
const PENDING_FILE = './pendingPayments.json';

if(!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, '[]');
if(!fs.existsSync(ODDS_FILE)) fs.writeFileSync(ODDS_FILE, '{}');
if(!fs.existsSync(PENDING_FILE)) fs.writeFileSync(PENDING_FILE, '[]');

const bot = new Telegraf(BOT_TOKEN);

// === Helpers ===
function loadSubs(){ return JSON.parse(fs.readFileSync(SUB_FILE)); }
function saveSubs(subs){ fs.writeFileSync(SUB_FILE, JSON.stringify(subs,null,2)); }

function loadOdds(){ return JSON.parse(fs.readFileSync(ODDS_FILE)); }

function loadPending(){ return JSON.parse(fs.readFileSync(PENDING_FILE)); }
function savePending(p){ fs.writeFileSync(PENDING_FILE, JSON.stringify(p,null,2)); }

function findSub(userId){ return loadSubs().find(s=>s.id===userId); }
function addSub(userId, username, type, duration){ 
    const subs = loadSubs();
    subs.push({id:userId, username, subscriptionType:type, durationType:duration, status:'pending', startDate:null, endDate:null});
    saveSubs(subs);
}

// Check if subscription active
function isActive(sub){
    if(!sub || sub.status!=='active') return false;
    return Date.now() < sub.endDate;
}

// === Commands ===

// /start
bot.start(ctx=>{
    const sub = findSub(ctx.from.id);
    let msg = `👋 Welcome ${ctx.from.first_name}!\nUse /help to see available commands.`;
    if(sub && isActive(sub)){
        msg += `\n✅ Your subscription is active until ${new Date(sub.endDate).toLocaleString()}`;
    }
    ctx.reply(msg, subscriptionKeyboard(sub));
});

// /help
bot.command('help', ctx=>{
    ctx.reply(`Available Commands:
/subscribe - Subscribe to VIP tips
/status - Check your subscription
/free - Get free tips
/help - Show commands`);
});

// /status
bot.command('status', ctx=>{
    const sub = findSub(ctx.from.id);
    if(!sub){
        return ctx.reply('You do not have any subscription. Use /subscribe to join VIP.');
    }
    if(isActive(sub)){
        return ctx.reply(`✅ Your subscription is active until ${new Date(sub.endDate).toLocaleString()}`);
    }else{
        return ctx.reply('⚠️ Your subscription has expired. Please /subscribe again.');
    }
});

// /free
bot.command('free', ctx=>{
    ctx.reply('🆓 Free Tip:\nManchester United vs Chelsea\nTip: Over 2.5 Goals\nConfidence: Medium');
});

// /subscribe
bot.command('subscribe', ctx=>{
    const odds = loadOdds();
    ctx.reply('Select subscription type:', Markup.inlineKeyboard([
        [Markup.button.callback(`Daily`, `sub_daily`)],
        [Markup.button.callback(`Weekly`, `sub_weekly`)],
        [Markup.button.callback(`Monthly`, `sub_monthly`)],
        [Markup.button.callback(`Yearly`, `sub_yearly`)]
    ]));
});

// === Handle subscription button clicks ===
bot.action(/sub_(.+)/, ctx=>{
    const type = ctx.match[1]; // daily, weekly, monthly, yearly
    const odds = loadOdds()[type] || [];
    if(!odds.length) return ctx.reply(`No options set for ${type}. Contact admin.`);

    let msg = `💎 ${type.toUpperCase()} Subscription Options:\n`;
    odds.forEach(o=>{
        msg += `${o.odds} Odds - Price: ${o.price}\n`;
    });
    msg += `\nAfter payment, send your payment screenshot here.`;
    ctx.reply(msg);

    // Save that user is in payment flow
    ctx.session = ctx.session || {};
    ctx.session.paymentFlow = {type};
});

// Handle photo as payment
bot.on('photo', async ctx=>{
    if(!ctx.session || !ctx.session.paymentFlow) return ctx.reply('Please select a subscription first via /subscribe.');
    const file_id = ctx.message.photo.pop().file_id;
    const subType = ctx.session.paymentFlow.type;

    // Save to pending
    const pending = loadPending();
    pending.push({id:ctx.from.id, username:ctx.from.username, subscriptionType:subType, photo:file_id, date:Date.now()});
    savePending(pending);

    ctx.reply('✅ Screenshot received. Admin will review and approve your subscription.');

    // Notify admin
    await bot.telegram.sendPhoto(ADMIN_ID, file_id, {caption:`Payment from @${ctx.from.username || ctx.from.first_name} for ${subType} subscription.`});
    ctx.session.paymentFlow = null;
});

// Admin: list pending payments
bot.command('admin', ctx=>{
    if(ctx.from.id!=ADMIN_ID) return;
    const pending = loadPending();
    if(!pending.length) return ctx.reply('No pending payments.');
    pending.forEach(p=>{
        bot.telegram.sendPhoto(ADMIN_ID, p.photo, {caption:`User: @${p.username || p.id}\nType: ${p.subscriptionType}\nApprove: /approve_${p.id}\nReject: /reject_${p.id}`});
    });
});

// Admin: approve
bot.command(/approve_(.+)/, ctx=>{
    if(ctx.from.id!=ADMIN_ID) return;
    const userId = parseInt(ctx.match[1]);
    const pending = loadPending();
    const idx = pending.findIndex(p=>p.id===userId);
    if(idx===-1) return ctx.reply('Not found');
    const p = pending.splice(idx,1)[0];
    savePending(pending);

    // Add to subscribers
    const subs = loadSubs();
    const odds = loadOdds();
    const subOption = p.subscriptionType;
    const duration = subOption==='daily'? 'daily': subOption==='weekly'? 'weekly': subOption==='monthly'? 'monthly':'yearly';
    const sub = subs.find(s=>s.id===p.id);
    if(sub){
        sub.status='active';
        sub.startDate=Date.now();
        sub.endDate = duration==='daily'?Date.now()+86400000
                    : duration==='weekly'?Date.now()+7*86400000
                    : duration==='monthly'?Date.now()+30*86400000
                    :Date.now()+365*86400000;
    } else {
        subs.push({
            id:p.id,
            username:p.username,
            subscriptionType:subOption,
            durationType:duration,
            status:'active',
            startDate:Date.now(),
            endDate: duration==='daily'?Date.now()+86400000
                    : duration==='weekly'?Date.now()+7*86400000
                    : duration==='monthly'?Date.now()+30*86400000
                    :Date.now()+365*86400000
        });
    }
    saveSubs(subs);
    ctx.reply(`Approved subscription for ${p.username || p.id}`);
    bot.telegram.sendMessage(p.id, '✅ Your subscription has been approved! You now have access to VIP tips.');
});

// Admin: reject
bot.command(/reject_(.+)/, ctx=>{
    if(ctx.from.id!=ADMIN_ID) return;
    const userId = parseInt(ctx.match[1]);
    const pending = loadPending();
    const idx = pending.findIndex(p=>p.id===userId);
    if(idx===-1) return ctx.reply('Not found');
    const p = pending.splice(idx,1)[0];
    savePending(pending);
    ctx.reply(`Rejected subscription for ${p.username || p.id}`);
    bot.telegram.sendMessage(p.id, '❌ Your subscription was rejected. Please try again.');
});

// Helper: subscription keyboard
function subscriptionKeyboard(sub){
    if(sub && isActive(sub)){
        return Markup.inlineKeyboard([
            [Markup.button.callback('View Free History','freeHistory')]
        ]);
    } else {
        return Markup.inlineKeyboard([
            [Markup.button.callback('Subscribe','subscribe')]
        ]);
    }
}

// Launch bot
bot.launch();
console.log('Bot started');
