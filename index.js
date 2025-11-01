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

// Fonction de validation des données
function validateMatchData(match) {
  const issues = [];
  
  if (!match.time || match.time === 'N/A') issues.push('Heure manquante');
  if (!match.correctScore) issues.push('Score correct manquant');
  if (isNaN(match.correctScoreProb) || match.correctScoreProb < 0 || match.correctScoreProb > 100) {
    issues.push(`Probabilité de score correct invalide: ${match.correctScoreProb}`);
    match.correctScoreProb = Math.max(0, Math.min(100, match.correctScoreProb || 0));
  }
  if (isNaN(match.bttsProb) || match.bttsProb < 0 || match.bttsProb > 100) {
    issues.push(`Probabilité BTTS invalide: ${match.bttsProb}`);
    match.bttsProb = Math.max(0, Math.min(100, match.bttsProb || 0));
  }
  if (isNaN(match.goalProb) || match.goalProb < 0 || match.goalProb > 1) {
    issues.push(`Probabilité de but invalide: ${match.goalProb}`);
    match.goalProb = Math.max(0, Math.min(1, match.goalProb || 0));
  }
  
  if (issues.length > 0) {
    console.warn(`Problèmes détectés pour le match ${match.match}: ${issues.join(', ')}`);
  }
  
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

        const formToScore = (form) => form.split('').reduce((acc, res) => acc + (res === 'W' ? 1.5 : res === 'D' ? 1 : 0.5), 0) / 5;
        const lambdaTeam1 = (team1Over / 100 * 1.5) + formToScore(team1Form) * 0.3; // Réduction pour valeurs plus réalistes
        const lambdaTeam2 = (team2Over / 100 * 1.5) + formToScore(team2Form) * 0.3; // Réduction pour valeurs plus réalistes
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
let over15Prob = 0; // Nouveau calcul pour Over 1.5
for (let g1 = 0; g1 <= maxGoals; g1++) {
  for (let g2 = 0; g2 <= maxGoals; g2++) {
    const totalGoals = g1 + g2;
    if (totalGoals > 2) {
      overProb += poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
    }
    if (totalGoals > 1) { // Condition pour Over 1.5 (au moins 2 buts)
      over15Prob += poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
    }
  }
}
    
        bttsProb = Math.max(0, Math.min(100, (bttsProb + refinedBttsProb) / 2));
    
        const refinedOverProb = (team1Over + team2Over + overProb) / 3;
    
        // Mise à jour goalProb avec raffinements
        goalProb = Math.min(1, Math.max(0, (basicGoalProb + probAnyGoals + refinedGoalProb / 100 + refinedOverProb / 100) / 4)); // Normalisation à [0,1]
    
        // Intégration de l'IA pour raffiner goalProb
        const inputs = [lambdaTeam1, lambdaTeam2, bttsProb / 100, firstHalfGoalProb / 100, team1Over / 100, team2Over / 100];
      
        const model = await createFixedVIPModel();
        const inputTensor = tf.tensor2d([inputs]);
        const prediction = model.predict(inputTensor);
        const aiRefinedGoalProb = (await prediction.data())[0] * 100;
      
        goalProb = Math.min(1, Math.max(0, (goalProb + aiRefinedGoalProb / 100) / 2)); // Moyenne et normalisation finale en [0,1]
    
        // Intégration de l'IA pour raffiner over15Prob
const inputsOver15 = [adjustedLambdaTeam1, adjustedLambdaTeam2, bttsProb / 100, overProb / 100, team1Over / 100, team2Over / 100];
const inputTensorOver15 = tf.tensor2d([inputsOver15]);
const predictionOver15 = model.predict(inputTensorOver15);
const aiRefinedOver15Prob = (await predictionOver15.data())[0] * 100;
over15Prob = Math.min(100, Math.max(0, (over15Prob + aiRefinedOver15Prob) / 2));

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
          over15Prob,
          league // Add league here
        });

        return matchData;
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
          error: error.message
        };
      }
    });

    // Attendre que toutes les promesses soient résolues
    const results = await Promise.all(resultsPromises);
    
    // Filtrer les résultats null ou avec erreur
    const validResults = results.filter(result => result && !result.error);
    
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
      
      // Calcul des notes Elo
      const team1Rating = formToRating(item.team1Form);
      const team2Rating = formToRating(item.team2Form);
      const eloProb = eloWinProbability(team1Rating, team2Rating) * 100;
      
      // Intégration transparente de l'IA pour raffiner reliabilityScore
      const vipInputs = [layProb / 100, item.goalProb, item.firstHalfGoalProb / 100, item.bttsProb / 100, poissonProb / 100, eloProb / 100];
      
      const inputTensor = tf.tensor2d([vipInputs]);
      const prediction = vipModel.predict(inputTensor);
      const aiRefinedScore = (await prediction.data())[0] * 100;
      
      // Moyenne pour harmonie
      const reliabilityScore = (
        (layProb * 0.4) +
        (item.goalProb * 100 * 0.3) +
        (item.firstHalfGoalProb * 0.2) +
        (item.bttsProb * 0.1) +
        (aiRefinedScore * 0.2) +
        (poissonProb * 0.2) +
        (eloProb * 0.1)
      ) / 1.5;

      let certaintyLevel = 'Faible fiabilité';
      if (reliabilityScore > 90) {
        certaintyLevel = 'Très sûre';
      } else if (reliabilityScore >= 70) {
        certaintyLevel = 'Probable';
      } else if (reliabilityScore >= 50) {
        certaintyLevel = 'À considérer';
      }
      
      const errorMargin = ((100 - reliabilityScore) / 2).toFixed(2);
      
      const evaluationCriteria = `Fiabilité calculée basée sur: layProb (40%), goalProb (30%), firstHalfGoalProb (20%), bttsProb (10%), AI refinement (20%), Poisson (20%), Elo (10%). Marge d'erreur estimée: ±${errorMargin}%`;
      
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
    const top15 = reliabilityData.slice(0, 15);
    
    console.log(`Analyse VIP terminée: ${top15.length} matchs analysés`);
    
    const duration = Date.now() - startTime;
    console.log(`Temps total d'analyse VIP: ${duration} ms`);
    if (!process.env.VERCEL) {
      fs.writeFileSync(cacheFile, JSON.stringify(top15, null, 2));
      console.log(`Résultats VIP mis en cache pour ${dateStr}`);
    }
    return top15;
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

// Mise à jour de createFixedVIPModel pour entraîner le modèle à chaque fois
async function createFixedVIPModel() {
  if (cachedModel) {
    return cachedModel;
  }
  console.log('Entraînement du modèle VIP en cours...');
  cachedModel = await trainVIPModel();
  return cachedModel;
}

// Nouvelle fonction pour extraire les noms d'équipes à partir du lien du match
function extractTeamNames(matchLink) {
  const parts = matchLink.split('/match-prediction-analysis-');
  if (parts.length < 2) return { team1: 'Unknown', team2: 'Unknown' };
  const slug = parts[1].split('-betting-tip')[0];
  const [team1, team2] = slug.split('-vs-').map(t => t.replace(/-/g, ' ').trim());
  return { team1, team2 };
}

// Nouvelle fonction pour obtenir les ratings Elo réels depuis ClubElo API
async function getEloRating(teamName) {
  try {
    const response = await axios.get(`http://clubelo.com/api/${encodeURIComponent(teamName)}`);
    const data = response.data;
    return data.elo || 1500; // Valeur par défaut si non trouvée
  } catch (error) {
    console.error(`Erreur lors de la récupération du rating Elo pour ${teamName}:`, error.message);
    return 1500; // Valeur par défaut en cas d'erreur
  }
}

// Nouvelle fonction pour obtenir les stats réelles (buts marqués/encaissés) via Football-Data.org API
async function getTeamStats(teamName, league) {
  const API_KEY = 'YOUR_FOOTBALL_DATA_API_KEY'; // Remplacez par votre clé API gratuite de Football-Data.org
  try {
    // Exemple : Obtenir l'ID de l'équipe (cette partie peut nécessiter une recherche préalable)
    // Pour simplifier, supposons une recherche par nom d'équipe dans une ligue spécifique
    const searchResponse = await axios.get(`https://api.football-data.org/v4/teams?name=${encodeURIComponent(teamName)}`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const teamId = searchResponse.data.teams?.[0]?.id;
    if (!teamId) return { avgGoalsScored: 1.5, avgGoalsConceded: 1.5 };

    // Obtenir les stats (exemple pour la saison en cours)
    const statsResponse = await axios.get(`https://api.football-data.org/v4/teams/${teamId}/matches?status=FINISHED&limit=10`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const matches = statsResponse.data.matches;
    let totalScored = 0, totalConceded = 0, count = 0;
    matches.forEach(m => {
      const isHome = m.homeTeam.id === teamId;
      totalScored += isHome ? m.score.fullTime.home : m.score.fullTime.away;
      totalConceded += isHome ? m.score.fullTime.away : m.score.fullTime.home;
      count++;
    });
    return {
      avgGoalsScored: count > 0 ? totalScored / count : 1.5,
      avgGoalsConceded: count > 0 ? totalConceded / count : 1.5
    };
  } catch (error) {
    console.error(`Erreur lors de la récupération des stats pour ${teamName}:`, error.message);
    return { avgGoalsScored: 1.5, avgGoalsConceded: 1.5 }; // Valeurs par défaut
  }
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
      
      // Calcul des notes Elo
      const team1Rating = formToRating(item.team1Form);
      const team2Rating = formToRating(item.team2Form);
      const eloProb = eloWinProbability(team1Rating, team2Rating) * 100;
      
      // Intégration transparente de l'IA pour raffiner reliabilityScore
      const vipInputs = [layProb / 100, item.goalProb, item.firstHalfGoalProb / 100, item.bttsProb / 100, poissonProb / 100, eloProb / 100];
      
      const inputTensor = tf.tensor2d([vipInputs]);
      const prediction = vipModel.predict(inputTensor);
      const aiRefinedScore = (await prediction.data())[0] * 100;
      
      // Moyenne pour harmonie
      const reliabilityScore = (
        (layProb * 0.4) +
        (item.goalProb * 100 * 0.3) +
        (item.firstHalfGoalProb * 0.2) +
        (item.bttsProb * 0.1) +
        (aiRefinedScore * 0.2) +
        (poissonProb * 0.2) +
        (eloProb * 0.1)
      ) / 1.5;

      let certaintyLevel = 'Faible fiabilité';
      if (reliabilityScore > 90) {
        certaintyLevel = 'Très sûre';
      } else if (reliabilityScore >= 70) {
        certaintyLevel = 'Probable';
      } else if (reliabilityScore >= 50) {
        certaintyLevel = 'À considérer';
      }
      
      const errorMargin = ((100 - reliabilityScore) / 2).toFixed(2);
      
      const evaluationCriteria = `Fiabilité calculée basée sur: layProb (40%), goalProb (30%), firstHalfGoalProb (20%), bttsProb (10%), AI refinement (20%), Poisson (20%), Elo (10%). Marge d'erreur estimée: ±${errorMargin}%`;
      
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
    const top15 = reliabilityData.slice(0, 15);
    
    console.log(`Analyse VIP terminée: ${top15.length} matchs analysés`);
    
    const duration = Date.now() - startTime;
    console.log(`Temps total d'analyse VIP: ${duration} ms`);
    if (!process.env.VERCEL) {
      fs.writeFileSync(cacheFile, JSON.stringify(top15, null, 2));
      console.log(`Résultats VIP mis en cache pour ${dateStr}`);
    }
    return top15;
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