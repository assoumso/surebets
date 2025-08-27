const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/analyze', (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }
  exec(`node index.js ${date}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: 'Error executing analysis' });
    }
    try {
      const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
      res.json(results);
    } catch (readError) {
      res.status(500).json({ error: 'Error reading results' });
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});