// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const SUB_FILE = path.join(__dirname, 'subscribers.json');
const ODDS_FILE = path.join(__dirname, 'odds.json');

// Ensure files exist
if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, JSON.stringify([]));
if (!fs.existsSync(ODDS_FILE)) fs.writeFileSync(ODDS_FILE, JSON.stringify({
  daily: [], weekly: [], monthly: [], yearly: []
}));

// Load / Save helpers
function loadSubscribers() { return JSON.parse(fs.readFileSync(SUB_FILE)); }
function saveSubscribers(data) { fs.writeFileSync(SUB_FILE, JSON.stringify(data, null, 2)); }
function loadOdds() { return JSON.parse(fs.readFileSync(ODDS_FILE)); }
function saveOdds(data) { fs.writeFileSync(ODDS_FILE, JSON.stringify(data, null, 2)); }

// Get all subscribers
app.get('/api/subscribers', (req, res) => res.json(loadSubscribers()));

// Get odds for plans
app.get('/api/odds', (req, res) => res.json(loadOdds()));

// Update odds (admin)
app.post('/api/odds', (req, res) => {
  const { plan, oddsList } = req.body;
  if (!plan || !oddsList) return res.status(400).json({ error: 'Missing plan or oddsList' });
  const odds = loadOdds();
  odds[plan] = oddsList;
  saveOdds(odds);
  res.json({ success: true, odds });
});

// Approve subscription
app.post('/api/approve', (req, res) => {
  const { id, plan, endDate } = req.body;
  if (!id || !plan || !endDate) return res.status(400).json({ error: 'Missing fields' });
  const subs = loadSubscribers();
  const user = subs.find(s => s.id === id);
  if (!user) return res.status(404).json({ error: 'Subscriber not found' });
  user.subscriptionType = plan;
  user.endDate = new Date(endDate).toISOString();
  user.status = 'active';
  saveSubscribers(subs);
  res.json({ success: true, subscriber: user });
});

// Reject subscription
app.post('/api/reject', (req, res) => {
  const { id } = req.body;
  const subs = loadSubscribers();
  const user = subs.find(s => s.id === id);
  if (!user) return res.status(404).json({ error: 'Subscriber not found' });
  user.subscriptionType = 'rejected';
  saveSubscribers(subs);
  res.json({ success: true, subscriber: user });
});

// Send tip to Telegram
app.post('/api/sendTip', async (req, res) => {
  const { target, text } = req.body;
  if (!target || !text) return res.status(400).json({ error: 'Missing target or text' });

  const axios = require('axios');
  const token = process.env.BOT_TOKEN;
  try {
    const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: target,
      text
    });
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
