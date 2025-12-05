// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve html/js/css

// === CONFIG ===
const BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const SUB_FILE = './subscribers.json';
const ODDS_FILE = './odds.json';

// Ensure files exist
if(!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, '[]');
if(!fs.existsSync(ODDS_FILE)) fs.writeFileSync(ODDS_FILE, '{}');

// === Helper functions ===
function loadSubs(){ return JSON.parse(fs.readFileSync(SUB_FILE)); }
function saveSubs(subs){ fs.writeFileSync(SUB_FILE, JSON.stringify(subs,null,2)); }

function loadOdds(){ return JSON.parse(fs.readFileSync(ODDS_FILE)); }
function saveOdds(odds){ fs.writeFileSync(ODDS_FILE, JSON.stringify(odds,null,2)); }

// === API Endpoints ===

// Get subscriber list
app.get('/api/subscribers', (req,res)=>{
    const subs = loadSubs();
    res.json(subs);
});

// Approve a subscriber
app.post('/api/approveSub/:id', (req,res)=>{
    const subs = loadSubs();
    const sub = subs.find(s=>s.id==req.params.id);
    if(sub){
        sub.status = 'active';
        sub.startDate = Date.now();
        sub.endDate = sub.durationType==='daily'?Date.now()+86400000
                   :sub.durationType==='weekly'?Date.now()+7*86400000
                   :sub.durationType==='monthly'?Date.now()+30*86400000
                   :Date.now()+365*86400000;
        saveSubs(subs);
        return res.json({ok:true, message:'Subscriber approved'});
    }
    res.json({ok:false,message:'Not found'});
});

// Reject subscriber
app.post('/api/rejectSub/:id', (req,res)=>{
    let subs = loadSubs();
    subs = subs.filter(s=>s.id!=req.params.id);
    saveSubs(subs);
    res.json({ok:true,message:'Subscriber rejected and removed'});
});

// Send tip to all active subscribers
app.post('/api/sendTip', async (req,res)=>{
    const { text } = req.body;
    if(!text) return res.json({ok:false,message:'No text'});
    const subs = loadSubs().filter(s=>s.status==='active');
    let results = [];
    for(const s of subs){
        try{
            const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
                chat_id: s.id,
                text
            });
            results.push({id:s.id,status:'sent'});
        }catch(err){
            results.push({id:s.id,status:'error',error:err.message});
        }
    }
    res.json({ok:true,results});
});

// Save odds/prices from admin
app.post('/api/saveOdds', (req,res)=>{
    const odds = req.body; // expect {daily:{odds,price},weekly:{...},...}
    saveOdds(odds);
    res.json({ok:true,message:'Saved'});
});

// Admin can add a subscriber manually (for testing)
app.post('/api/addSub', (req,res)=>{
    const { id, username, subscriptionType, durationType } = req.body;
    const subs = loadSubs();
    subs.push({
        id,
        username,
        subscriptionType,
        durationType,
        status:'pending',
        startDate:null,
        endDate:null
    });
    saveSubs(subs);
    res.json({ok:true,message:'Added'});
});

// === Start server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
