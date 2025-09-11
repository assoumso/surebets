const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
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
      const resultsPath = path.join(__dirname, 'results.json');
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      res.json(results);
    } catch (readError) {
      console.error('Error reading results:', readError);
      res.status(500).json({ error: 'Error reading results', details: readError.message });
    }
  });
});

app.get('/api/analyze', (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }
  
  // Données exemple pour Vercel (fallback quand scraping indisponible)
  const mockData = [
    {
      match: "https://www.mybets.today/match/arsenal-vs-chelsea/",
      time: "15:00",
      correctScore: "2-1",
      correctScoreProb: 65,
      layProb: 65,
      bttsProb: 72,
      otherProb: 15,
      date: date,
      team1Form: "WWWDW",
      team2Form: "LWWDL",
      team1Over: 70,
      team2Over: 60,
      goalProb: 0.85
    },
    {
      match: "https://www.mybets.today/match/man-utd-vs-liverpool/",
      time: "17:30",
      correctScore: "1-2",
      correctScoreProb: 58,
      layProb: 58,
      bttsProb: 68,
      otherProb: 20,
      date: date,
      team1Form: "LDDWW",
      team2Form: "WWWDW",
      team1Over: 55,
      team2Over: 75,
      goalProb: 0.78
    }
  ];
  
  res.json(mockData);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});