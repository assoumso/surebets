const express = require('express');
const path = require('path');
const { analyze } = require('./index');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/analyze', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const results = await analyze(date);
    res.json(results);
  } catch (error) {
    console.error(`Error during analysis: ${error}`);
    res.status(500).send('Error during analysis');
  }
});

app.get('/api/analyze', (req, res) => {
  res.json([
    { match: 'Match 1', time: '15:00', correctScore: '2:1', correctScoreProb: 25, layProb: 75, bttsProb: 60, otherProb: 10, date: '2023-10-01' },
    { match: 'Match 2', time: '18:00', correctScore: '1:1', correctScoreProb: 20, layProb: 80, bttsProb: 55, otherProb: 15, date: '2023-10-01' }
  ]);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});