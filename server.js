// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const SUB_FILE = path.join(__dirname, 'subscribers.json');

// Ensure subscribers file exists
if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, JSON.stringify([]));

// Load / Save subscribers
function loadSubscribers() {
  return JSON.parse(fs.readFileSync(SUB_FILE));
}
function saveSubscribers(data) {
  fs.writeFileSync(SUB_FILE, JSON.stringify(data, null, 2));
}
function findSubscriber(id) {
  return loadSubscribers().find(s => s.id === id);
}

// Get all subscribers (for admin)
app.get('/api/subscribers', (req, res) => {
  const subs = loadSubscribers();
  res.json(subs);
});

// Approve subscription (admin)
app.post('/api/approve', (req, res) => {
  const { id, plan, endDate } = req.body;
  if (!id || !plan || !endDate) return res.status(400).json({ error: 'Missing fields' });

  const subs = loadSubscribers();
  const user = subs.find(s => s.id === id);
  if (!user) return res.status(404).json({ error: 'Subscriber not found' });

  user.subscriptionType = plan;
  user.endDate = new Date(endDate).toISOString();
  saveSubscribers(subs);
  res.json({ success: true, subscriber: user });
});

// Send tip to channel (admin dashboard)
app.post('/api/sendTip', (req, res) => {
  const { target, text } = req.body;
  if (!target || !text) return res.status(400).json({ error: 'Missing target or text' });

  const axios = require('axios');
  const token = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  axios.post(url, { chat_id: target, text })
    .then(r => res.json({ success: true, data: r.data }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
