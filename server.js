// server.js
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

// ====== CONFIG ======
const BOT_TOKEN = '8596462347:AAF8B11EYoPKaaVFQgzC2dvIDcAKkPc4ybQ';
const ADMIN_PASSWORD = 'forgetme';
const ADMIN_ID = '@Kj9000000'; // optional
const PORT = process.env.PORT || 3000;

// ====== STORAGE FILES ======
const SUB_FILE = './subscribe.json';
const TIP_FILE = './tipHistory.json';

if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, JSON.stringify([]));
if (!fs.existsSync(TIP_FILE)) fs.writeFileSync(TIP_FILE, JSON.stringify([]));

let subscribers = JSON.parse(fs.readFileSync(SUB_FILE));
let tipHistory = JSON.parse(fs.readFileSync(TIP_FILE));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let adminSessions = {}; // admin session states

function saveSubscribers() { fs.writeFileSync(SUB_FILE, JSON.stringify(subscribers, null, 2)); }
function saveTips() { fs.writeFileSync(TIP_FILE, JSON.stringify(tipHistory, null, 2)); }

function checkSubscription(userId) {
    const now = Date.now();
    return subscribers.find(s => s.id == userId && s.endDate > now) || null;
}

// ====== START ======
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome! Use /admin to login as admin or /subscribe to get VIP tips.');
});

// ====== ADMIN LOGIN ======
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Enter admin password:');
    adminSessions[chatId] = { step: 'await_password' };
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!adminSessions[chatId]) return;

    const session = adminSessions[chatId];

    // Password check
    if (session.step === 'await_password') {
        if (text === ADMIN_PASSWORD && (ADMIN_ID == 0 || chatId == ADMIN_ID)) {
            adminSessions[chatId] = { step: 'menu' };
            bot.sendMessage(chatId, '✅ Logged in as admin.', { reply_markup: adminMenu() });
        } else {
            bot.sendMessage(chatId, '❌ Wrong password.');
            delete adminSessions[chatId];
        }
        return;
    }

    // Tip workflow inputs
    if (session.step && session.step.startsWith('tip_')) {
        switch (session.step) {
            case 'tip_match':
                session.tipData.match = text;
                session.step = 'tip_analysis';
                bot.sendMessage(chatId, 'Enter Analysis (short):');
                break;
            case 'tip_analysis':
                session.tipData.analysis = text;
                session.step = 'tip_tip';
                bot.sendMessage(chatId, 'Enter Tip / Correct Score:');
                break;
            case 'tip_tip':
                session.tipData.tip = text;
                session.step = 'tip_confidence';
                bot.sendMessage(chatId, 'Enter Confidence (Low, Medium, High):', {
                    reply_markup: {
                        keyboard: [['Low','Medium','High']], one_time_keyboard: true, resize_keyboard:true
                    }
                });
                break;
            case 'tip_confidence':
                session.tipData.confidence = text;
                session.step = 'tip_kickoff';
                bot.sendMessage(chatId, 'Enter Kickoff time (local/GMT):');
                break;
            case 'tip_kickoff':
                session.tipData.kickoff = text;
                session.step = 'tip_notes';
                bot.sendMessage(chatId, 'Enter Extra Notes (optional):');
                break;
            case 'tip_notes':
                session.tipData.notes = text;
                session.step = 'tip_preview';
                // Show preview
                const previewText = buildPost(session.tipData);
                session.tipData.previewText = previewText;
                bot.sendMessage(chatId, `Preview:\n\n${previewText}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Send', callback_data: 'send_confirm' }],
                            [{ text: '❌ Cancel', callback_data: 'send_cancel' }]
                        ]
                    }
                });
                break;
        }
        return;
    }
});

// ====== ADMIN MENU ======
function adminMenu() {
    return {
        inline_keyboard: [
            [{ text: '📝 Send Tip', callback_data: 'send_tip' }],
            [{ text: '📄 View Subscribers', callback_data: 'view_subs' }],
            [{ text: '📜 Tip History', callback_data: 'view_history' }]
        ]
    };
}

// ====== CALLBACK HANDLER ======
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    if (!adminSessions[chatId]) return bot.answerCallbackQuery(callbackQuery.id, { text: 'Session expired.' });

    const session = adminSessions[chatId];

    // Admin menu actions
    if (session.step === 'menu') {
        switch (data) {
            case 'send_tip':
                session.tipData = {};
                session.step = 'tip_post_type';
                bot.sendMessage(chatId, 'Select Post Type:', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Free', callback_data: 'type_free' }],
                            [{ text: 'VIP', callback_data: 'type_vip' }],
                            [{ text: 'Result', callback_data: 'type_result' }],
                            [{ text: 'Announcement', callback_data: 'type_announcement' }]
                        ]
                    }
                });
                break;
            case 'view_subs':
                let msg = '📋 Subscribers:\n';
                if(subscribers.length === 0) msg += 'No subscribers yet.';
                else subscribers.forEach(s=>{
                    msg += `• ${s.username || s.id} — ${s.subscriptionType} — Expires: ${new Date(s.endDate).toLocaleString()}\n`;
                });
                bot.sendMessage(chatId, msg);
                break;
            case 'view_history':
                let histMsg = '📜 Tip History:\n';
                if(tipHistory.length===0) histMsg+='No tips yet.';
                else tipHistory.slice(-20).forEach(t=>{
                    histMsg += `• ${t.postType} — ${t.match} — ${t.tip}\n`;
                });
                bot.sendMessage(chatId, histMsg);
                break;
        }
        return bot.answerCallbackQuery(callbackQuery.id);
    }

    // Tip post type selection
    if (session.step === 'tip_post_type') {
        const typeMap = { 'type_free':'free', 'type_vip':'vip', 'type_result':'result', 'type_announcement':'announcement' };
        session.tipData.postType = typeMap[data];
        session.step = 'tip_match';
        bot.sendMessage(chatId, 'Enter Match title (e.g., Arsenal vs Brighton):');
        return bot.answerCallbackQuery(callbackQuery.id);
    }

    // Send / Cancel tip
    if (session.step === 'tip_preview') {
        if (data === 'send_confirm') {
            sendTipToSubscribers(session.tipData);
            tipHistory.push(session.tipData);
            if (tipHistory.length>200) tipHistory.shift();
            saveTips();
            bot.sendMessage(chatId, '✅ Tip sent to subscribers.');
            session.step = 'menu';
            bot.sendMessage(chatId, 'Back to menu', { reply_markup: adminMenu() });
        } else if (data === 'send_cancel') {
            session.step = 'menu';
            bot.sendMessage(chatId, '❌ Tip sending cancelled.', { reply_markup: adminMenu() });
        }
        return bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ====== BUILD POST TEXT ======
function buildPost(data) {
    let lines = [];
    if(data.postType==='announcement') lines.push('📢 ANNOUNCEMENT');
    if(data.postType==='vip') lines.push('💎 VIP TIP');
    if(data.postType==='free') lines.push('🆓 FREE TIP');
    if(data.postType==='result') lines.push('✅ RESULT');

    if(data.match) lines.push('⚽ Match: '+data.match);
    if(data.analysis) lines.push('📊 Analysis: '+data.analysis);
    if(data.tip) lines.push('🎯 Tip: '+data.tip);
    if(data.confidence) lines.push('📈 Confidence: '+data.confidence);
    if(data.kickoff) lines.push('🕒 Kickoff: '+data.kickoff);
    if(data.notes) lines.push('📝 Notes: '+data.notes);

    lines.push('\n⚠️ Disclaimer: All tips are predictions. Bet responsibly.');
    return lines.join('\n');
}

// ====== SEND TIP TO SUBSCRIBERS ======
function sendTipToSubscribers(tip) {
    subscribers.forEach(s=>{
        const active = checkSubscription(s.id);
        if(tip.postType==='vip' && !active) return; // skip non-subscribed
        bot.sendMessage(s.id, buildPost(tip));
    });
}

// ====== USER SUBSCRIBE ======
bot.onText(/\/subscribe/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Select subscription:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Daily', callback_data: 'sub_daily' }],
                [{ text: 'Weekly', callback_data: 'sub_weekly' }],
                [{ text: 'Monthly', callback_data: 'sub_monthly' }],
                [{ text: 'Yearly', callback_data: 'sub_yearly' }]
            ]
        }
    });
});

// ====== HANDLE SUBS ======
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data.startsWith('sub_')) {
        let days=0, type='';
        switch(data) {
            case 'sub_daily': days=1; type='Daily'; break;
            case 'sub_weekly': days=7; type='Weekly'; break;
            case 'sub_monthly': days=30; type='Monthly'; break;
            case 'sub_yearly': days=365; type='Yearly'; break;
        }
        const endDate = Date.now()+days*24*60*60*1000;
        const existing = subscribers.find(s=>s.id==chatId);
        if(existing){ existing.endDate=endDate; existing.subscriptionType=type; }
        else { subscribers.push({id:chatId, username:callbackQuery.from.username, endDate, subscriptionType:type}); }
        saveSubscribers();
        bot.sendMessage(chatId, `✅ Subscribed for ${type}. Expires: ${new Date(endDate).toLocaleString()}`);
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ====== EXPRESS API ======
app.post('/api/sendTip', (req,res)=>{
    const { text, target } = req.body;
    if(!text||!target) return res.status(400).json({error:'Missing fields'});
    bot.sendMessage(target, text).then(()=>res.json({ok:true})).catch(err=>res.json({ok:false,error:err.message}));
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
