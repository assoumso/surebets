const express = require('express');
const path = require('path');
const { analyze, analyzeVIP } = require('../index');
const stripe = require('stripe')('your_stripe_secret_key'); // Remplacez par votre clé secrète Stripe
const fs = require('fs');
const cors = require('cors');


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const port = process.env.PORT || 3000;

// Modèle IA pour l'analyse avancée des matchs


let visitCount = 0;
const countFile = path.join(__dirname, '..', 'visitCount.json');

try {
  if (fs.existsSync(countFile)) {
    visitCount = JSON.parse(fs.readFileSync(countFile, 'utf8')).count;
  }
} catch (error) {
  console.error('Error loading visit count:', error);
}

// Modified to increment and save on page load
app.get('/', (req, res) => {
  visitCount++;
  try {
    fs.writeFileSync(countFile, JSON.stringify({ count: visitCount }), 'utf8');
  } catch (error) {
    console.error('Error saving visit count:', error);
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Modified to just return count without incrementing
app.get('/visit-count', (req, res) => {
  res.json({ count: visitCount });
});
// Dans l'endpoint /analyze
app.get('/analyze', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  // Validation de la date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: 'Date invalide. Format attendu: YYYY-MM-DD' });
  }
  console.log(`Requête d'analyse reçue pour la date: ${date}`);
  
  try {
    const startTime = Date.now();
    const results = await analyze(date) || []; // Ajouter une valeur par défaut si undefined
    const duration = Date.now() - startTime;
    
    console.log(`Analyse terminée en ${duration}ms, ${results ? results.length : 0} matchs trouvés`);
    
    if (!Array.isArray(results)) {
      console.error(`Format de résultat invalide: ${typeof results}`);
      return res.status(500).json({ error: 'Format de résultat invalide' });
    }
    
    if (results.length === 0) {
      console.warn(`Aucun match trouvé pour la date ${date}`);
    }
    
    // Vérifier et formater les résultats pour s'assurer que tous les pourcentages sont arrondis
    const formattedResults = results.map(match => {
      // S'assurer que toutes les probabilités sont des nombres valides
      const ensureValidNumber = (value, isPercentage = true) => {
        const num = parseFloat(value);
        if (isNaN(num)) return isPercentage ? 0 : 0;
        return isPercentage ? Math.max(0, Math.min(100, num)) : Math.max(0, Math.min(1, num));
      };
      
      return {
        ...match,
        correctScoreProb: ensureValidNumber(match.correctScoreProb),
        layProb: ensureValidNumber(match.layProb),
        bttsProb: ensureValidNumber(match.bttsProb),
        goalProb: ensureValidNumber(match.goalProb, false),
        firstHalfGoalProb: ensureValidNumber(match.firstHalfGoalProb)
      };
    });
    
    res.json(formattedResults);
  } catch (error) {
    console.error(`Erreur pendant l'analyse: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({ 
      error: 'Erreur pendant l\'analyse', 
      message: error.message,
      date: date
    });
  }
});

app.get('/api/analyze', (req, res) => {
  res.json([
    { match: 'Match 1', time: '15:00', correctScore: '2:1', correctScoreProb: 25, layProb: 75, bttsProb: 60, otherProb: 10, date: '2023-10-01', aiConfidence: 85.2, aiRecommendation: "Forte recommandation" },
    { match: 'Match 2', time: '18:00', correctScore: '1:1', correctScoreProb: 20, layProb: 80, bttsProb: 55, otherProb: 15, date: '2023-10-01', aiConfidence: 62.7, aiRecommendation: "Recommandation modérée" }
  ]);
});

app.post('/create-payment-intent', express.json(), async (req, res) => {
  const { amount } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      payment_method_types: ['card'],
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Nouvel endpoint pour l'analyse IA avancée
app.get('/api/advanced-analysis', (req, res) => {
  const matchId = req.query.matchId;
  // Simuler une analyse avancée avec IA
  const analysis = {
    matchId,
    detailedPredictions: {
      winProbability: Math.random() * 100,
      drawProbability: Math.random() * 100,
      loseProbability: Math.random() * 100,
      exactScoreProbabilities: {
        "1:0": Math.random() * 20,
        "2:0": Math.random() * 15,
        "2:1": Math.random() * 10,
        "0:0": Math.random() * 10,
        "1:1": Math.random() * 15,
        "0:1": Math.random() * 10,
        "0:2": Math.random() * 5,
        "1:2": Math.random() * 10,
        "2:2": Math.random() * 5
      }
    },
    aiConfidenceScore: Math.random() * 100,
    recommendedBets: [
      { type: "BTTS", confidence: Math.random() * 100 },
      { type: "Over 2.5", confidence: Math.random() * 100 },
      { type: "1X", confidence: Math.random() * 100 }
    ]
  };
  res.json(analysis);
});

// Nouvel endpoint pour les résultats VIP
app.post('/analyze', async (req, res) => {
  try {
    const results = await analyze(req.body.date || new Date().toISOString().split('T')[0]) || [];
    res.json({ message: 'Analyse terminée avec succès', results });
  } catch (error) {
    console.error("Erreur pendant l'analyse:", error);
    res.status(500).json({ error: "Erreur pendant l'analyse" });
  }
});
// Dans l'endpoint /analyze-vip
app.get('/analyze-vip', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  // Validation de la date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: 'Date invalide. Format attendu: YYYY-MM-DD' });
  }
  console.log(`Requête d'analyse VIP reçue pour la date: ${date}`);
  
  try {
    const startTime = Date.now();
    const results = await analyzeVIP(date) || []; // Ajouter une valeur par défaut si undefined
    const duration = Date.now() - startTime;
    
    console.log(`Analyse VIP terminée en ${duration}ms, ${results ? results.length : 0} matchs trouvés`);
    
    if (!Array.isArray(results)) {
      console.error(`Format de résultat VIP invalide: ${typeof results}`);
      return res.status(500).json({ error: 'Format de résultat VIP invalide' });
    }
    
    if (results.length === 0) {
      console.warn(`Aucun match VIP trouvé pour la date ${date}`);
    }
    
    res.json(results);
  } catch (error) {
    console.error(`Erreur pendant l'analyse VIP: ${error.message}`);
    console.error(error.stack);
    // Assurer que l'erreur est toujours au format JSON valide
    res.status(500).json({
      error: 'Erreur pendant l\'analyse VIP',
      message: error.message || 'Erreur inconnue',
      stack: process.env.NODE_ENV === 'production' ? null : error.stack,
      date: date
    });
  }
});

app.get('/past-vip-results', (req, res) => {
  try {
    const results = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'results.json'), 'utf8'));
    res.json(results);
  } catch (error) {
    console.error('Erreur lors du chargement de results.json:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des résultats passés' });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
  });
}

module.exports = app;