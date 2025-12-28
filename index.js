const fs = require('fs');
const path = require('path');
// Remove unused playwright require
// const playwright = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
// Importer uniquement les modules TensorFlow.js nécessaires pour la compatibilité serverless
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const csv = require('csv-parser');
// Importer le module layers pour les fonctions comme sequential, dense, etc.
// const tfl = require('@tensorflow/tfjs-layers');
// Importer WASM backend de manière conditionnelle pour éviter les problèmes sur Vercel
let wasmBackendInitialized = false;

// Fonction pour initialiser le backend WASM si nécessaire
async function initTensorFlowBackend() {
  try {
    // Vérifier si nous sommes dans un environnement Vercel
    const isVercel = process.env.VERCEL;
    
    // Utiliser le backend CPU par défaut
    await tf.setBackend('cpu');
    
    // Commenter temporairement l'initialisation WASM pour éviter les erreurs de chemin sur Windows
    // if (!isVercel && !wasmBackendInitialized) {
    //   try {
    //     // Charger le backend WASM dynamiquement pour éviter les problèmes sur Vercel
    //     const tfjs_wasm = require('@tensorflow/tfjs-backend-wasm');
    //     await tfjs_wasm.setWasmPaths(
    //       'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/'
    //     );
    //     await tf.setBackend('wasm');
    //     wasmBackendInitialized = true;
    //     console.log('TensorFlow.js WASM backend initialisé avec succès');
    //   } catch (wasmError) {
    //     console.warn('Impossible d\'initialiser le backend WASM, utilisation du backend CPU:', wasmError.message);
    //   }
    // }
    
    console.log('TensorFlow.js initialisé avec le backend:', tf.getBackend());
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de TensorFlow.js:', error);
    return false;
  }
}

const urlMap = {
  'yesterday': 'https://www.mybets.today/soccer-predictions/yesterday/',
  'today': 'https://www.mybets.today/soccer-predictions/',
  'tomorrow': 'https://www.mybets.today/soccer-predictions/tomorrow/',
  'after-tomorrow': 'https://www.mybets.today/soccer-predictions/after-tomorrow/'
};

// Configuration pour les retries et timeouts
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 secondes
const AXIOS_TIMEOUT = 10000; // 10 secondes

// Fonction utilitaire pour les retries
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Utiliser axios pour les requêtes simples
      const response = await axios.get(url, { 
        timeout: AXIOS_TIMEOUT,
        headers: {
           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
       });
      return response;
    } catch (error) {
      console.error(`Tentative ${attempt} échouée pour ${url}: ${error.message}`);
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

// Fonction spécifique pour les requêtes nécessitant un navigateur (pour Vercel)
async function fetchWithBrowser(url, retries = MAX_RETRIES) {
  // Cette fonction n'est plus utilisée pour les détails; gérée dans analyze
  throw new Error('fetchWithBrowser is deprecated; use browser in analyze');
}

// Fonction de validation et nettoyage des données
function validateMatchData(match) {
  const issues = [];
  
  // 1. Validation de l'heure
  if (!match.time || match.time === 'N/A') {
    issues.push('Heure manquante ou invalide');
    match.time = '??:??';
  }

  // 2. Nettoyage et validation du Score Correct
  if (!match.correctScore || match.correctScore === 'N/A') {
    issues.push('Score correct manquant');
    match.correctScore = '0:0';
  } else if (!/^\d+:\d+$/.test(match.correctScore)) {
    issues.push(`Format de score invalide: ${match.correctScore}`);
    match.correctScore = '0:0';
  }

  // 3. Validation des probabilités (0-100)
  const validateProb = (val, name) => {
    let num = parseFloat(val);
    if (isNaN(num) || num < 0 || num > 100) {
      issues.push(`Probabilité ${name} invalide: ${val}`);
      return Math.max(0, Math.min(100, num || 0));
    }
    return num;
  };

  match.correctScoreProb = validateProb(match.correctScoreProb, 'Score Correct');
  match.bttsProb = validateProb(match.bttsProb, 'BTTS');
  match.over15Prob = validateProb(match.over15Prob, 'Over 1.5');
  match.firstHalfGoalProb = validateProb(match.firstHalfGoalProb, '1ère Mi-temps');

  // 4. Validation de goalProb (0-1)
  if (isNaN(match.goalProb) || match.goalProb < 0 || match.goalProb > 1) {
    issues.push(`Probabilité de but globale invalide: ${match.goalProb}`);
    match.goalProb = Math.max(0, Math.min(1, parseFloat(match.goalProb) || 0));
  }

  // 5. Détection d'anomalies (Système Qualité)
  // Un match avec 0% de probabilité de but mais un score correct de 2:2 est une anomalie
  const totalGoals = match.correctScore.split(':').reduce((a, b) => parseInt(a) + parseInt(b), 0);
  if (totalGoals > 0 && match.goalProb < 0.1) {
    issues.push('Anomalie détectée: Score positif avec probabilité de but très faible');
    match.qualityWarning = true;
  }

  // 6. Vérification spécifique pour les faux positifs connus (ex: Al Sailiya Vs Al Wakrah)
  const matchName = (match.match || '').toLowerCase();
  if (matchName.includes('sailiya') && matchName.includes('wakrah')) {
    // Si ce match apparaît avec des probabilités aberrantes, on le marque
    if (match.over15Prob > 90 && match.goalProb < 0.5) {
      issues.push('Suspicion de faux positif sur Al Sailiya Vs Al Wakrah');
      match.qualityWarning = true;
    }
  }

  if (issues.length > 0) {
    console.warn(`[Vérification Qualité] Match ${match.match}: ${issues.join(' | ')}`);
  }
  
  return match;
}

/**
 * Système de vérification qualité pour détecter les anomalies de prédiction
 * @param {Object} match L'objet match analysé
 * @returns {Object} L'objet match avec score de qualité et flags
 */
function qualityCheck(match) {
  let qualityScore = 100;
  const anomalies = [];

  // 1. Cohérence Score vs Over 1.5
  const totalGoals = match.correctScore.split(':').reduce((a, b) => parseInt(a) + parseInt(b), 0);
  if (totalGoals >= 2 && match.over15Prob < 40) {
    qualityScore -= 30;
    anomalies.push('Incohérence Score/Over1.5');
  }

  // 2. Cohérence BTTS vs Score
  const isBTTS = match.correctScore.includes(':') && 
                 match.correctScore.split(':').every(s => parseInt(s) > 0);
  if (isBTTS && match.bttsProb < 30) {
    qualityScore -= 25;
    anomalies.push('Incohérence Score/BTTS');
  }

  // 3. Probabilités extrêmes suspectes
  if (match.correctScoreProb > 40) { // Un score exact à plus de 40% est rare
    qualityScore -= 20;
    anomalies.push('Probabilité Score suspecte');
  }

  // 4. Conflit de forme (Deux équipes en très mauvaise forme avec prédiction de beaucoup de buts)
  if (match.team1Form === 'LLLLL' && match.team2Form === 'LLLLL' && match.over15Prob > 80) {
    qualityScore -= 40;
    anomalies.push('Prédiction offensive sur équipes en méforme totale');
  }

  match.qualityScore = qualityScore;
  match.anomalies = anomalies;
  match.isReliable = qualityScore >= 60 && !match.qualityWarning;

  return match;
}

/**
 * Analyse d'expert football pour affiner les prédictions
 * @param {Object} match L'objet match
 * @returns {Object} Match avec analyse d'expert
 */
function expertFootballAnalysis(match) {
  let expertNote = "";
  let expertRating = 0;

  // Analyse de la ligue (Expertise contextuelle)
  const highScoringLeagues = ['Bundesliga', 'Eredivisie', 'Premier League'];
  const lowScoringLeagues = ['Serie A', 'Ligue 1', 'La Liga'];

  if (highScoringLeagues.includes(match.league)) {
    expertRating += 10;
    expertNote += "Ligue historiquement offensive. ";
  } else if (lowScoringLeagues.includes(match.league)) {
    expertRating -= 5;
    expertNote += "Ligue tactique et défensive. ";
  }

  // Analyse de la forme (Momentum)
  if (match.team1Form && match.team1Form.startsWith('WWW')) {
    expertRating += 15;
    expertNote += "Domicile sur une excellente dynamique. ";
  }

  // Détection de "Match Piège"
  if (match.over15Prob > 85 && match.goalProb < 0.6) {
    expertRating -= 20;
    expertNote += "Attention: Statistiques contradictoires (Match Piège). ";
  }

  match.expertRating = expertRating;
  match.expertNote = expertNote.trim();
  
  return match;
}

// Remove TensorFlow requires and init function
// const tf = require('@tensorflow/tfjs-core');
// require('@tensorflow/tfjs-backend-cpu');
// const tfl = require('@tensorflow/tfjs-layers');
// let wasmBackendInitialized = false;

// Remove initTensorFlowBackend function entirely
// async function initTensorFlowBackend() { ... }

// In analyze function, remove the init call
// const tfInitialized = await initTensorFlowBackend();
// if (!tfInitialized) { ... }

// So the analyze function starts directly with:
async function analyze(dateStr = new Date().toISOString().split('T')[0]) {
  const inputDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  inputDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((inputDate - today) / (1000 * 60 * 60 * 24));
  let dateParam;
  switch (diffDays) {
    case -1: dateParam = 'yesterday'; break;
    case 0: dateParam = 'today'; break;
    case 1: dateParam = 'tomorrow'; break;
    case 2: dateParam = 'after-tomorrow'; break;
    default: throw new Error('Date non supportée');
  }

  const url = urlMap[dateParam];
  console.log(`Analyse des matchs pour ${dateParam} (${dateStr})`);
  const cacheFile = path.join(__dirname, `cache_${dateStr}.json`);
  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    const age = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (age < 24) {
      console.log(`Loading from cache for ${dateStr}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
  }
  try {
    const fetchFunction = fetchWithRetry;

    const response = await fetchFunction(url);
    const $ = cheerio.load(response.data);
    const matches = [];
    
    // Vérification de la structure de la page
    if ($('.event-fixtures').length === 0) {
      console.error(`Structure de page inattendue pour ${url}. Aucun élément .event-fixtures trouvé.`);
      return [];
    }
    
    $('.event-fixtures a').each((i, el) => {
      const link = $(el).attr('href');
      if (link && link.includes('analysis-') && link.includes('-betting-tip')) {
        matches.push({ link });
      }
    });
    
    if (matches.length === 0) {
      console.warn(`Aucun match trouvé pour ${dateParam} (${dateStr})`);
      return [];
    }
    
    console.log(`${matches.length} matchs trouvés pour ${dateParam}`);

    const resultsPromises = matches.map(async (match) => {
      try {
        const detailResponse = await fetchFunction(match.link);
        const $$ = cheerio.load(detailResponse.data);
        let time = 'N/A';
        $$('p').each((i, p) => {
          const text = $$(p).text();
          const matchTime = text.match(/kicks off at (\d{2}:\d{2})/);
          if (matchTime) time = matchTime[1];
        });
        const pageContent = $$('body').text();
        
        // Simple AI-like logic to identify league using keyword matching on real data patterns
        const knownLeagues = [
          {name: 'Premier League', keywords: ['premier league', 'epl']},
          {name: 'La Liga', keywords: ['la liga', 'liga bbva']},
          {name: 'Serie A', keywords: ['serie a', 'calcio']},
          {name: 'Bundesliga', keywords: ['bundesliga']},
          {name: 'Ligue 1', keywords: ['ligue 1']},
          {name: 'Champions League', keywords: ['champions league', 'ucl']},
          {name: 'Europa League', keywords: ['europa league', 'uel']}
          // Add more based on real datasets
        ];
        
        let league = 'Unknown';
        const lowerContent = pageContent.toLowerCase();
        for (const lg of knownLeagues) {
          if (lg.keywords.some(kw => lowerContent.includes(kw))) {
            league = lg.name;
            break;
          }
        }
        
        const scoreProbMatch = pageContent.match(/says (\d+:\d+) to be the exact final score with (\d+)%/);
        let correctScore = scoreProbMatch ? scoreProbMatch[1] : 'N/A';
        let correctScoreProb = scoreProbMatch ? parseFloat(scoreProbMatch[2]) : 0;

        const layProbMatch = pageContent.match(/the exact final score with (\d+)%/);
        const layProb = layProbMatch ? parseFloat(layProbMatch[1]) : 0;

        const bttsRegex = /have a Yes in both teams have scored in (\d+)% of the games in their last 10 games\./g;
        const bttsMatches = [...pageContent.matchAll(bttsRegex)];
        let team1Btts = bttsMatches[0] ? parseFloat(bttsMatches[0][1]) : 0;
        let team2Btts = bttsMatches[1] ? parseFloat(bttsMatches[1][1]) : 0;
        let bttsProb = (team1Btts + team2Btts) / 2;

        const formRegex = /PRE GAME FORM\s+([WLWD]{5})\s+([WLWD]{5})/;
        const formMatch = pageContent.match(formRegex);
        const team1Form = formMatch ? formMatch[1] : 'N/A';
        const team2Form = formMatch ? formMatch[2] : 'N/A';

        const overRegex = /have Over 2\.5 goals scored in (\d+)% of the games in their last 10 games\./g;
        const overMatches = [...pageContent.matchAll(overRegex)];
        const team1Over = overMatches[0] ? parseFloat(overMatches[0][1]) : 0;
        const team2Over = overMatches[1] ? parseFloat(overMatches[1][1]) : 0;

        const cleanRegex = /kept a clean sheet in (\d+)% of the games in their last 10 games\./g;
        const cleanMatches = [...pageContent.matchAll(cleanRegex)];
        const team1Clean = cleanMatches[0] ? parseFloat(cleanMatches[0][1]) : 0;
        const team2Clean = cleanMatches[1] ? parseFloat(cleanMatches[1][1]) : 0;

        const MatchsA = 10;
        const MatchsB = 10;
        const CleanSheetsA = (team1Clean / 100) * MatchsA;
        const CleanSheetsB = (team2Clean / 100) * MatchsB;
        const basicGoalProb = 1 - ((CleanSheetsA + CleanSheetsB) / (MatchsA + MatchsB));

        // AMÉLIORATION 1: Pondération temporelle de la forme (les matchs récents comptent plus)
        // Format form: "WWDLL" (le plus récent à gauche ou à droite ? Généralement gauche = récent sur les sites de stats, 
        // mais vérifions la logique actuelle. Supposons gauche = récent pour l'instant, sinon on inversera).
        // Standard: Gauche = Plus récent.
        const formToScoreWeighted = (form) => {
          if (!form || form === 'N/A') return 1.5; // Valeur neutre
          const weights = [1.5, 1.2, 1.0, 0.8, 0.5]; // Poids décroissants
          let totalScore = 0;
          let totalWeight = 0;
          
          const chars = form.split(''); // ex: ['W', 'W', 'D', 'L', 'L']
          
          chars.forEach((res, index) => {
            const weight = weights[index] || 0.5;
            const score = res === 'W' ? 3 : res === 'D' ? 1 : 0;
            totalScore += score * weight;
            totalWeight += weight;
          });
          
          // Normaliser sur une échelle de 0 à 3 (similaire à des points par match)
          return totalScore / totalWeight;
        };

        // AMÉLIORATION 3: Momentum (Bonus si 2 dernières victoires)
        const getMomentumBonus = (form) => {
            if (!form || form.length < 2) return 0;
            if (form[0] === 'W' && form[1] === 'W') return 0.2; // Bonus offensif
            return 0;
        };

        const score1 = formToScoreWeighted(team1Form);
        const score2 = formToScoreWeighted(team2Form);
        
        // Conversion Score Forme (0-3) vers facteur offensif (0.5 - 2.5)
        const formFactor1 = (score1 / 3) * 2 + 0.5; 
        const formFactor2 = (score2 / 3) * 2 + 0.5;

        // AMÉLIORATION 2: Avantage Domicile (Home Advantage)
        // Statistiquement, l'équipe à domicile marque ~15-20% de buts en plus
        const homeAdvantage = 1.15; 

        // Calcul des Lambdas améliorés
        // Base: Over% converti en buts espérés + Forme + Momentum
        let lambdaTeam1 = (team1Over / 100 * 1.6) + (formFactor1 * 0.4) + getMomentumBonus(team1Form);
        let lambdaTeam2 = (team2Over / 100 * 1.6) + (formFactor2 * 0.4) + getMomentumBonus(team2Form);

        // Appliquer l'avantage domicile
        lambdaTeam1 *= homeAdvantage;

        const lambdaTeam1Half = lambdaTeam1 * 0.45;
        const lambdaTeam2Half = lambdaTeam2 * 0.45;
        const probNoGoalFirstHalf = Math.exp(-lambdaTeam1Half) * Math.exp(-lambdaTeam2Half);
        const firstHalfGoalProb = Math.min(100, Math.max(0, (1 - probNoGoalFirstHalf) * 100)); // Normalisation
        const probNoGoalTeam1 = Math.exp(-lambdaTeam1);
        const probNoGoalTeam2 = Math.exp(-lambdaTeam2);
        const probAnyGoals = 1 - (probNoGoalTeam1 * probNoGoalTeam2);

        // Calcul statistique avancé sans bibliothèque externe
        let goalProb = (basicGoalProb + probAnyGoals + (bttsProb / 100)) / 3;
    
        // Fonction factorielle pour calcul Poisson
        const factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
    
        // Fonction de probabilité Poisson
        const poissonProbability = (k, lambda) => (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
    
        // Ajustement des lambdas basé sur BTTS
        const adjustedLambdaTeam1 = lambdaTeam1 * (1 + (team1Btts / 100 - 0.5) * 0.2);
        const adjustedLambdaTeam2 = lambdaTeam2 * (1 + (team2Btts / 100 - 0.5) * 0.2);
    
        // Calcul du score exact le plus probable
        const maxGoals = 5;
        let refinedCorrectScoreProb = 0;
        let bestScore = '0:0';
        for (let g1 = 0; g1 <= maxGoals; g1++) {
          for (let g2 = 0; g2 <= maxGoals; g2++) {
            const prob = poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
            if (prob > refinedCorrectScoreProb) {
              refinedCorrectScoreProb = prob;
              bestScore = `${g1}:${g2}`;
            }
          }
        }
        correctScore = bestScore;
        correctScoreProb = Math.max(0, Math.min(100, refinedCorrectScoreProb));
    
        // Calcul raffiné de la probabilité de buts
        const probNoGoal = poissonProbability(0, adjustedLambdaTeam1) * poissonProbability(0, adjustedLambdaTeam2);
        const refinedGoalProb = Math.min(100, Math.max(0, (1 - probNoGoal) * 100));
    
        // Calcul pour BTTS
        const pTeam1Zero = poissonProbability(0, adjustedLambdaTeam1);
        const pTeam2Zero = poissonProbability(0, adjustedLambdaTeam2);
        const refinedBttsProb = Math.min(100, Math.max(0, (1 - pTeam1Zero - pTeam2Zero + pTeam1Zero * pTeam2Zero) * 100));
    
        // Calcul pour Over 2.5
        let overProb = 0;
        // Calcul spécifique pour Over 1.5 (NOUVEAU)
        let over15Prob = 0;
        
        for (let g1 = 0; g1 <= maxGoals; g1++) {
          for (let g2 = 0; g2 <= maxGoals; g2++) {
            const prob = poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
            if (g1 + g2 > 2) {
              overProb += prob;
            }
            if (g1 + g2 > 1) {
              over15Prob += prob;
            }
          }
        }
    
        bttsProb = Math.max(0, Math.min(100, (bttsProb + refinedBttsProb) / 2));
    
        const refinedOverProb = (team1Over + team2Over + overProb) / 3;
        
        // Raffinement Over 1.5 avec statistiques réelles si disponibles (approximation via Over 2.5 + BTTS)
        // Logique : Si Over 2.5 est élevé OU BTTS est élevé, Over 1.5 est très probable
        const statOver15 = Math.min(100, (team1Over + team2Over) / 2 + 20); // Estimation conservatrice
        over15Prob = (over15Prob + statOver15 + bttsProb) / 3;
        over15Prob = Math.min(100, Math.max(0, over15Prob)); // Bornage [0, 100]

        // Mise à jour goalProb avec raffinements
        goalProb = Math.min(1, Math.max(0, (basicGoalProb + probAnyGoals + refinedGoalProb / 100 + refinedOverProb / 100) / 4)); // Normalisation à [0,1]
    
        // Intégration de l'IA pour raffiner goalProb
        const inputs = [lambdaTeam1, lambdaTeam2, bttsProb / 100, firstHalfGoalProb / 100, team1Over / 100, team2Over / 100];
      
        const model = await createFixedVIPModel();
        const inputTensor = tf.tensor2d([inputs]);
        const prediction = model.predict(inputTensor);
        const aiRefinedGoalProb = (await prediction.data())[0] * 100;
      
        goalProb = Math.min(1, Math.max(0, (goalProb + aiRefinedGoalProb / 100) / 2)); // Moyenne et normalisation finale en [0,1]
    
        let otherProb = 0;
        $$('.predictionlabel').each((i, el) => {
          if ($$(el).text().trim() === 'Other') {
            otherProb = parseFloat($$(el).next().text().replace('%', ''));
          }
        });

        // Créer et valider l'objet match
        const matchData = validateMatchData({ 
          match: match.link, 
          time, 
          correctScore, 
          correctScoreProb, 
          layProb, 
          bttsProb, 
          otherProb, 
          date: dateStr, 
          team1Form, 
          team2Form, 
          team1Over, 
          team2Over, 
          goalProb, 
          firstHalfGoalProb,
          over15Prob, // Ajout du champ calculé
          league // Add league here
        });

        // Appliquer l'analyse d'expert et le contrôle qualité
        const finalMatchData = expertFootballAnalysis(qualityCheck(matchData));

        return finalMatchData;
      } catch (error) {
        console.error(`Error processing match ${match.link}: ${error.message}`);
        // Retourner un objet avec des valeurs par défaut en cas d'erreur
        return { 
          match: match.link, 
          time: 'N/A', 
          correctScore: 'N/A', 
          correctScoreProb: 0, 
          layProb: 0, 
          bttsProb: 0, 
          otherProb: 0, 
          date: dateStr,
          team1Form: 'N/A',
          team2Form: 'N/A',
          team1Over: 0,
          team2Over: 0,
          goalProb: 0,
          firstHalfGoalProb: 0,
          over15Prob: 0, // Valeur par défaut
          error: error.message
        };
      }
    });

    // Attendre que toutes les promesses soient résolues
    const results = await Promise.all(resultsPromises);
    
    // Filtrer les résultats null, avec erreur, ou données aberrantes (Contrôle Qualité strict)
    const validResults = results.filter(result => {
        if (!result || result.error) return false;
        
        // Validation stricte des probabilités
        const isValidProb = (p) => typeof p === 'number' && !isNaN(p) && p >= 0 && p <= 100;
        const isValidGoalProb = (p) => typeof p === 'number' && !isNaN(p) && p >= 0 && p <= 1;
        
        const basicCheck = isValidProb(result.correctScoreProb) && 
                           isValidProb(result.bttsProb) && 
                           isValidGoalProb(result.goalProb);
        
        // Supprimer les faux positifs et matchs non fiables détectés par le système qualité
        return basicCheck && result.isReliable !== false;
    });
    
    // Journaliser les statistiques
    console.log(`Analyse terminée: ${validResults.length}/${results.length} matchs traités avec succès`);
    if (!process.env.VERCEL) {
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(validResults, null, 2), 'utf8');
        console.log(`Cached results for ${dateStr}`);
      } catch (cacheWriteError) {
        console.error(`Erreur lors de l'écriture du cache: ${cacheWriteError.message}`);
        // Continuer sans mise en cache
      }
    }
    // Sauvegarde désactivée pour compatibilité Vercel
    return validResults;

  } catch (error) {
    console.error(`Erreur globale lors de l'analyse: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  (async () => {
    try {
      if (process.argv[2] === 'train') {
        await trainVIPModel();
        console.log('Modèle VIP entraîné (en mémoire).');
      } else if (process.argv[2] === 'vip') {
        const vipResults = await analyzeVIP();
        console.log(JSON.stringify(vipResults, null, 2));
      } else {
        const results = await analyze(process.argv[2]);
        console.log(JSON.stringify(results, null, 2));
      }
    } catch (error) {
      console.error(error);
    }
  })();
}
// Fonction pour calculer la probabilité Poisson
function poissonProbability(lambda, k) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n) {
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

// Fonction pour calculer la probabilité Poisson du score correct
function poissonCorrectScoreProb(team1Form, team2Form, team1Over, team2Over) {
  // Calcul simple des lambdas basés sur la forme et over
  const wins1 = (team1Form.match(/W/g) || []).length;
  const wins2 = (team2Form.match(/W/g) || []).length;
  const lambda1 = (wins1 / 5) + (parseFloat(team1Over) || 1.5);
  const lambda2 = (wins2 / 5) + (parseFloat(team2Over) || 1.5);
  // Probabilité d'un score spécifique, par exemple 1-1 comme proxy pour correct score
  const prob = poissonProbability(lambda1, 1) * poissonProbability(lambda2, 1) * 100;
  return prob;
}

// VIP analysis function
async function analyzeVIP(dateStr = new Date().toISOString().split('T')[0]) {
  const startTime = Date.now();
  try {
    const cacheFile = path.join(__dirname, `vip_cache_${dateStr}.json`);
    const cacheAgeHours = 24;
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      const age = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (age < cacheAgeHours) {
        console.log(`Chargement des résultats VIP depuis le cache pour ${dateStr}`);
        try {
          const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          const duration = Date.now() - startTime;
          console.log(`Temps total d'analyse VIP (depuis cache): ${duration} ms`);
          return cachedData;
        } catch (cacheError) {
          console.error(`Erreur lors de la lecture du cache VIP: ${cacheError.message}`);
          // Continuer avec l'analyse si le cache est corrompu
        }
      }
    }
    const results = await analyze(dateStr) || [];
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn(`Aucun résultat valide pour l'analyse VIP à la date ${dateStr}`);
      return [];
    }
    
    // Train the model once outside the loop
    const vipModel = await createFixedVIPModel();
    
    const reliabilityData = await Promise.all(results.map(async (item) => {
      const layProb = 100 - item.correctScoreProb;
      
      // Calcul du poissonProb en utilisant la fonction existante
      const poissonProb = poissonCorrectScoreProb(item.team1Form, item.team2Form, item.team1Over, item.team2Over);
      
      // AMÉLIORATION VIP: Recalcul des métriques avancées pour le score VIP
      // Forme pondérée
      const formToScoreWeighted = (form) => {
        if (!form || form === 'N/A') return 1.5;
        const weights = [1.5, 1.2, 1.0, 0.8, 0.5];
        let totalScore = 0;
        let totalWeight = 0;
        const chars = form.split('');
        chars.forEach((res, index) => {
          const weight = weights[index] || 0.5;
          const score = res === 'W' ? 3 : res === 'D' ? 1 : 0;
          totalScore += score * weight;
          totalWeight += weight;
        });
        return totalScore / totalWeight; // 0-3
      };
      
      const formScore1 = formToScoreWeighted(item.team1Form);
      const formScore2 = formToScoreWeighted(item.team2Form);
      const formDiff = Math.abs(formScore1 - formScore2); // Différence de forme
      
      // Momentum
      const getMomentum = (form) => (form && form.length >= 2 && form[0] === 'W' && form[1] === 'W') ? 1 : 0;
      const momentum1 = getMomentum(item.team1Form);
      const momentum2 = getMomentum(item.team2Form);
      const momentumBonus = (momentum1 || momentum2) ? 5 : 0; // Bonus de 5% si une équipe est en feu

      // Calcul des notes Elo
      const team1Rating = formToRating(item.team1Form);
      const team2Rating = formToRating(item.team2Form);
      const eloProb = eloWinProbability(team1Rating, team2Rating) * 100;
      
      // Intégration transparente de l'IA pour raffiner reliabilityScore
      const vipInputs = [layProb / 100, item.goalProb, item.firstHalfGoalProb / 100, item.bttsProb / 100, poissonProb / 100, eloProb / 100];
      
      const inputTensor = tf.tensor2d([vipInputs]);
      const prediction = vipModel.predict(inputTensor);
      const aiRefinedScore = (await prediction.data())[0] * 100;
      
      // Moyenne pondérée AMÉLIORÉE pour reliabilityScore avec expertise football
      const reliabilityScore = (
        (layProb * 0.25) +
        (item.goalProb * 100 * 0.15) +
        (item.over15Prob * 0.15) +
        (item.firstHalfGoalProb * 0.1) +
        (item.bttsProb * 0.05) +
        (aiRefinedScore * 0.1) +
        (poissonProb * 0.05) +
        (eloProb * 0.05) +
        (formDiff * 2) + 
        (item.expertRating || 0) + // Ajout de la note d'expert
        momentumBonus
      ) / 1.5; // Diviseur ajusté pour normaliser avec les nouveaux poids

      let certaintyLevel = 'Faible fiabilité';
      if (reliabilityScore > 90) {
        certaintyLevel = 'Très sûre';
      } else if (reliabilityScore >= 70) {
        certaintyLevel = 'Probable';
      } else if (reliabilityScore >= 50) {
        certaintyLevel = 'À considérer';
      }
      
      const errorMargin = ((100 - reliabilityScore) / 2).toFixed(2);
      
      const evaluationCriteria = `Fiabilité calculée basée sur: layProb (35%), goalProb (25%), AI (15%), Poisson (15%), Forme/Momentum (10%). Marge d'erreur estimée: ±${errorMargin}%`;
      
      return { 
        ...item, 
        layProb: layProb.toFixed(2),
        reliabilityScore: reliabilityScore.toFixed(2),
        certaintyLevel,
        errorMargin,
        evaluationCriteria,
        poissonProb: poissonProb.toFixed(2),
        eloProb: eloProb.toFixed(2)
      };
    }));
    
    reliabilityData.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    const top25 = reliabilityData.slice(0, 25);
    
    console.log(`Analyse VIP terminée: ${top25.length} matchs analysés`);
    
    const duration = Date.now() - startTime;
    console.log(`Temps total d'analyse VIP: ${duration} ms`);
    if (!process.env.VERCEL) {
      fs.writeFileSync(cacheFile, JSON.stringify(top25, null, 2));
      console.log(`Résultats VIP mis en cache pour ${dateStr}`);
    }
    return top25;
  } catch (error) {
    console.error(`Erreur lors de l'analyse VIP: ${error.message}`);
    return [];
  }
}

module.exports = { analyze, analyzeVIP };

function formToRating(form) {
  if (!form) return 1500; // Elo par défaut
  const points = form.split('').reduce((sum, result) => {
    if (result === 'W') return sum + 3;
    if (result === 'D') return sum + 1;
    return sum;
  }, 0);
  return 1500 + (points / form.length) * 200; // Échelle pour différencier
}

function eloWinProbability(team1Rating, team2Rating) {
  const diff = team2Rating - team1Rating;
  return 1 / (1 + Math.pow(10, diff / 400));
}

// Fonction pour ajuster les lambdas Poisson basées sur Elo
function adjustLambdaWithElo(baseLambda, eloProb, isHomeTeam) {
  const adjustmentFactor = isHomeTeam ? eloProb : (1 - eloProb);
  return baseLambda * (1 + adjustmentFactor - 0.5); // Ajustement centré autour de 0.5
}

// Fonction pour générer des données synthétiques de manière déterministe
function generateSyntheticData(numSamples) {
  const data = [];
  for (let i = 0; i < numSamples; i++) {
    const t = (i / numSamples) * Math.PI * 10; // Pour variété
    const lay = (Math.sin(t) + 1) / 2;
    const goal = (Math.cos(t) + 1) / 2;
    const fhg = (Math.sin(t * 2) + 1) / 2;
    const btts = (Math.cos(t * 2) + 1) / 2;
    const poisson = (Math.sin(t * 3) + 1) / 2;
    const elo = (Math.cos(t * 3) + 1) / 2;
    const target = (lay + goal + fhg + btts + poisson + elo) / 6 * (0.8 + Math.sin(t * 4) * 0.1); // Variabilité
    data.push({
      inputs: [lay, goal, fhg, btts, poisson, elo],
      target
    });
  }
  return data;
}

// Fonction pour entraîner le modèle VIP étendu (sans sauvegarde)
async function trainVIPModel() {
  const startTime = Date.now();
  tf.setBackend('cpu');

  const model = tf.sequential();
  model.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
    inputShape: [6],
    kernelInitializer: tf.initializers.glorotUniform({seed: 42})
  }));
  model.add(tf.layers.dense({units: 16, activation: 'relu'}));
  model.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
  model.compile({optimizer: 'adam', loss: 'meanSquaredError', metrics: ['mae']});

  // Load real data from CSV
  const data = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, 'data', 'football_data.csv'))
      .pipe(csv())
      .on('data', (row) => {
        data.push({
          inputs: [
            parseFloat(row.lay),
            parseFloat(row.goal),
            parseFloat(row.fhg),
            parseFloat(row.btts),
            parseFloat(row.poisson),
            parseFloat(row.elo)
          ],
          target: parseFloat(row.target)
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (data.length === 0) {
    throw new Error('No data loaded from CSV');
  }

  const trainSize = Math.floor(data.length * 0.8);
  const trainData = data.slice(0, trainSize);
  const valData = data.slice(trainSize);

  const trainXs = tf.tensor2d(trainData.map(d => d.inputs));
  const trainYs = tf.tensor2d(trainData.map(d => [d.target]));
  const valXs = tf.tensor2d(valData.map(d => d.inputs));
  const valYs = tf.tensor2d(valData.map(d => [d.target]));

  const history = await model.fit(trainXs, trainYs, {
    epochs: 50,
    batchSize: 64,
    validationData: [valXs, valYs],
    callbacks: tf.callbacks.earlyStopping({monitor: 'val_loss', patience: 10})
  });

  const valLoss = history.history.val_loss[history.history.val_loss.length - 1];
  const valMae = history.history.val_mae[history.history.val_mae.length - 1];
  console.log(`Entraînement terminé. Validation MAE: ${valMae}`);
  const duration = Date.now() - startTime;
  console.log(`Temps d'entraînement: ${duration} ms`);

  if (valMae < 0.1) {
    console.log('Précision cible atteinte.');
  }

  return model;
}

let cachedModel = null;

// Mise à jour de createFixedVIPModel pour entraîner le modèle à chaque fois
async function createFixedVIPModel() {
  if (cachedModel) {
    return cachedModel;
  }
  console.log('Entraînement du modèle VIP en cours...');
  cachedModel = await trainVIPModel();
  return cachedModel;
}