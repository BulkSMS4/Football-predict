// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config(); // For local .env
const bot = require('./bot');

const app = express();
const port = process.env.PORT || 10000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'defaultPassword123';

// -------------------------
// Middleware
// -------------------------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------
// Password-protected admin dashboard
// -------------------------
app.get('/admin', (req, res) => {
  const password = req.query.password;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).send('<h2>Unauthorized: Wrong password</h2>');
  }
  res.sendFile(path.join(__dirname, 'public', 'telegram_admin.html'));
});

// -------------------------
// Health check
// -------------------------
app.get('/api', (req, res) => {
  res.json({ status: 'Football Predict Bot API is running ✅' });
});

// -------------------------
// Receive tips from dashboard
// -------------------------
app.post('/api/sendTip', (req, res) => {
  const { target, text, meta } = req.body;

  if (!target || !text) return res.status(400).json({ error: 'Missing target or text' });

  bot.sendMessage(target, text)
    .then(() => {
      console.log('Tip sent:', { target, text, meta });
      res.json({ success: true, message: 'Tip sent successfully', payload: { target, text, meta } });
    })
    .catch(err => {
      console.error('Error sending tip:', err);
      res.status(500).json({ success: false, error: err.message });
    });
});

// -------------------------
// Start server
// -------------------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Admin dashboard: http://localhost:${port}/admin?password=${ADMIN_PASSWORD}`);
});
