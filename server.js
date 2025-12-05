const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 10000;

// Parse JSON bodies
app.use(bodyParser.json());

// Serve all static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// --- Example API routes ---

// Health check
app.get('/api', (req, res) => {
  res.json({ status: 'Football Predict Bot API is running ✅' });
});

// Example POST predict endpoint
app.post('/api/predict', (req, res) => {
  const { match, date } = req.body;

  if (!match || !date) {
    return res.status(400).json({ error: 'Missing match or date in request body' });
  }

  // Example prediction logic (replace with your real logic)
  const prediction = {
    match,
    date,
    winner: 'TeamA', 
    score: '2-1',
  };

  res.json(prediction);
});

// --- Serve admin dashboard ---
// Access it via: /telegram_admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'telegram_admin.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Admin dashboard: http://localhost:${port}/telegram_admin.html`);
});
