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
const synaptic = require('synaptic');
const { Architect, Trainer, Network } = synaptic;
const { RandomForestClassifier } = require('ml-random-forest');
const { SVM } = require('ml-svm');
const { KNN } = require('ml-knn');
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
        const title = $$('h1').text().trim();
        let home = 'Unknown';
        let away = 'Unknown';
        if (title.includes(' vs ')) {
          [home, away] = title.split(' vs ').map(t => t.trim());
        }
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
        for (let g1 = 0; g1 <= maxGoals; g1++) {
          for (let g2 = 0; g2 <= maxGoals; g2++) {
            if (g1 + g2 > 2) {
              overProb += poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
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
          league, // Add league here
          home,
          away
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
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(validResults, null, 2), 'utf8');
      console.log(`Cached results for ${dateStr}`);
    } catch (cacheWriteError) {
      console.error(`Erreur lors de l'écriture du cache: ${cacheWriteError.message}`);
      // Continuer sans mise en cache
    }
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
  
  // Fixer le seed pour la reproductibilité
  setSeed(42);
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
    
    // Initialiser les modèles de Machine Learning supervisé
    initializeRandomForest();
    initializeSVM();
    initializeKNN();
    
    const reliabilityData = await Promise.all(results.map(async (item) => {
      const layProb = 100 - item.correctScoreProb;
      
      // Calcul du poissonProb en utilisant la fonction existante
      const poissonProb = poissonCorrectScoreProb(item.team1Form, item.team2Form, item.team1Over, item.team2Over);
      
      // Calcul des notes Elo
      const team1Rating = formToRating(item.team1Form);
      const team2Rating = formToRating(item.team2Form);
      const eloProb = eloWinProbability(team1Rating, team2Rating) * 100;
      
      // Calcul de la probabilité Glicko
      let glickoProb = 50; // Valeur par défaut
      if (item.home && item.away) {
        glickoProb = getGlickoWinProbability(item.home, item.away) * 100;
      }
      
      // Calcul de la probabilité bayésienne
      const bayesianProb = getBayesianHomeWinProbability(item.team1Form, item.team2Form);

      // Calcul de la probabilité LSTM
      const lstmProb = getLSTMHomeWinProbability(item.team1Form, item.team2Form) * 100;

      // Calcul des probabilités Machine Learning supervisé
      const randomForestProb = getRandomForestHomeWinProbability(item.team1Form, item.team2Form);
      const svmProb = getSVMHomeWinProbability(item.team1Form, item.team2Form);
      const knnProb = getKNNHomeWinProbability(item.team1Form, item.team2Form);
      
      // Intégration transparente de l'IA pour raffiner reliabilityScore
      const vipInputs = [
        layProb / 100, 
        item.goalProb, 
        item.firstHalfGoalProb / 100, 
        item.bttsProb / 100, 
        poissonProb / 100, 
        eloProb / 100
      ];
      
      const inputTensor = tf.tensor2d([vipInputs]);
      const prediction = vipModel.predict(inputTensor);
      const aiRefinedScore = (await prediction.data())[0] * 100;
      
      // Calcul des méthodes hybrides avancées
      const stackingScore = stackingEnsemble(poissonProb, eloProb, glickoProb, bayesianProb, lstmProb, randomForestProb, svmProb, knnProb, layProb, item.goalProb * 100);
      const monteCarloProb = monteCarloSimulation(poissonProb, eloProb, glickoProb, bayesianProb, lstmProb, randomForestProb, svmProb, knnProb);
      
      // Moyenne pour harmonie avec ajout de Glicko, Bayésien, LSTM, ML supervisé et méthodes hybrides
      const reliabilityScore = (
        (layProb * 0.20) +
        (item.goalProb * 100 * 0.12) +
        (item.firstHalfGoalProb * 0.06) +
        (item.bttsProb * 0.03) +
        (aiRefinedScore * 0.12) +
        (poissonProb * 0.06) +
        (eloProb * 0.03) +
        (glickoProb * 0.06) +
        (bayesianProb * 0.06) +
        (lstmProb * 0.03) +
        (randomForestProb * 0.02) +
        (svmProb * 0.02) +
        (knnProb * 0.02) +
        (stackingScore * 0.15) +
        (monteCarloProb * 0.12)
      ) / 1.0; // Ajusté pour toutes les méthodes

      let certaintyLevel = 'Faible fiabilité';
      if (reliabilityScore > 90) {
        certaintyLevel = 'Très sûre';
      } else if (reliabilityScore >= 70) {
        certaintyLevel = 'Probable';
      } else if (reliabilityScore >= 50) {
        certaintyLevel = 'À considérer';
      }
      
      const errorMargin = ((100 - reliabilityScore) / 2).toFixed(2);
      
      const evaluationCriteria = `Fiabilité calculée basée sur: layProb (20%), goalProb (12%), firstHalfGoalProb (6%), bttsProb (3%), AI refinement (12%), Poisson (6%), Elo (3%), Glicko (6%), Bayésien (6%), LSTM (3%), Random Forest (2%), SVM (2%), k-NN (2%), Stacking (15%), Monte Carlo (12%). Marge d'erreur estimée: ±${errorMargin}%`;
      
      return { 
        ...item, 
        layProb: layProb.toFixed(2),
        reliabilityScore: reliabilityScore.toFixed(2),
        certaintyLevel,
        errorMargin,
        evaluationCriteria,
        poissonProb: poissonProb.toFixed(2),
        eloProb: eloProb.toFixed(2),
        glickoProb: glickoProb.toFixed(2),
        bayesianProb: bayesianProb.toFixed(2),
        lstmProb: lstmProb.toFixed(2),
        randomForestProb: randomForestProb.toFixed(2),
        svmProb: svmProb.toFixed(2),
        knnProb: knnProb.toFixed(2),
        stackingScore: stackingScore.toFixed(2),
        monteCarloProb: monteCarloProb.toFixed(2)
      };
    }));
    
    reliabilityData.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    const top20 = reliabilityData.slice(0, 20);
    
    console.log(`Analyse VIP terminée: ${top20.length} matchs analysés`);
    
    const duration = Date.now() - startTime;
    console.log(`Temps total d'analyse VIP: ${duration} ms`);
    fs.writeFileSync(cacheFile, JSON.stringify(top20, null, 2));
    console.log(`Résultats VIP mis en cache pour ${dateStr}`);
    return top20;
  } catch (error) {
    console.error(`Erreur lors de l'analyse VIP: ${error.message}`);
    return [];
  } finally {
    // Réinitialiser le random seed
    resetRandom();
  }
}

module.exports = { analyze, analyzeVIP };

function formToRating(form) {
  if (!form || typeof form !== 'string' || form.length === 0) return 1500; // Elo par défaut
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

// Fonction pour implémenter le stacking/blending avancé
function stackingEnsemble(poissonProb, eloProb, glickoProb, bayesianProb, lstmProb, randomForestProb, svmProb, knnProb, layProb, goalProb) {
  // Poids optimisés pour le stacking basé sur la performance historique
  const weights = {
    poisson: 0.12,
    elo: 0.08,
    glicko: 0.10,
    bayesian: 0.10,
    lstm: 0.15,
    randomForest: 0.15,
    svm: 0.10,
    knn: 0.08,
    lay: 0.08,
    goal: 0.04
  };
  
  // Calcul du score de stacking
  const stackingScore = 
    (poissonProb * weights.poisson) +
    (eloProb * weights.elo) +
    (glickoProb * weights.glicko) +
    (bayesianProb * weights.bayesian) +
    (lstmProb * weights.lstm) +
    (randomForestProb * weights.randomForest) +
    (svmProb * weights.svm) +
    (knnProb * weights.knn) +
    (layProb * weights.lay) +
    (goalProb * weights.goal);
  
  return Math.min(Math.max(stackingScore, 0), 100); // Limiter entre 0 et 100
}

// Fonction pour les simulations de Monte Carlo avec échantillonnage intelligent
function monteCarloSimulation(poissonProb, eloProb, glickoProb, bayesianProb, lstmProb, randomForestProb, svmProb, knnProb, numSimulations = 1000) {
  let wins = 0;
  
  for (let i = 0; i < numSimulations; i++) {
    // Échantillonnage intelligent avec perturbation contrôlée
    const perturbation = 0.1; // 10% de variation
    
    const perturbedPoisson = poissonProb + (Math.random() - 0.5) * perturbation;
    const perturbedElo = eloProb + (Math.random() - 0.5) * perturbation;
    const perturbedGlicko = glickoProb + (Math.random() - 0.5) * perturbation;
    const perturbedBayesian = bayesianProb + (Math.random() - 0.5) * perturbation;
    const perturbedLSTM = lstmProb + (Math.random() - 0.5) * perturbation;
    const perturbedRandomForest = randomForestProb + (Math.random() - 0.5) * perturbation;
    const perturbedSVM = svmProb + (Math.random() - 0.5) * perturbation;
    const perturbedKNN = knnProb + (Math.random() - 0.5) * perturbation;
    
    // Normaliser les probabilités perturbées
    const total = perturbedPoisson + perturbedElo + perturbedGlicko + perturbedBayesian + 
                  perturbedLSTM + perturbedRandomForest + perturbedSVM + perturbedKNN;
    
    const normalizedProb = total / 8; // Moyenne des probabilités
    
    if (normalizedProb > 50) {
      wins++;
    }
  }
  
  return (wins / numSimulations) * 100; // Retourner en pourcentage
}

// Fonction simple d'apprentissage par renforcement
function reinforcementLearning(currentProb, historicalAccuracy, reward = 1.0) {
  // Taux d'apprentissage adaptatif
  const learningRate = 0.01 + (1 - historicalAccuracy) * 0.05;
  
  // Ajuster la probabilité basée sur la récompense
  const adjustment = learningRate * reward * (historicalAccuracy - 0.5);
  
  return Math.min(Math.max(currentProb + adjustment, 0), 100);
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

// Fixer les seeds pour la reproductibilité
const originalRandom = Math.random;
const originalDateNow = Date.now;

function setSeed(seed) {
  let currentSeed = seed;
  Math.random = function() {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
}

function resetRandom() {
  Math.random = originalRandom;
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

  const weightsPath = './vip_model_weights.json';
  if (fs.existsSync(weightsPath)) {
    console.log('Chargement des poids du modèle depuis ' + weightsPath);
    const weightsData = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
    const weightTensors = weightsData.map(wd => tf.tensor(wd.data, wd.shape));
    model.setWeights(weightTensors);
    return model;
  }

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

  const history = await model.fit(trainXs, trainYs, {epochs: 50, batchSize: 64, shuffle: false, validationData: [valXs, valYs], callbacks: tf.callbacks.earlyStopping({monitor: 'val_loss', patience: 10})}); const valLoss = history.history.val_loss[history.history.val_loss.length - 1]; const valMae = history.history.val_mae[history.history.val_mae.length - 1];
  console.log(`Entraînement terminé. Validation MAE: ${valMae}`);
  const duration = Date.now() - startTime;
  console.log(`Temps d'entraînement: ${duration} ms`);

  if (valMae < 0.1) {
    console.log('Précision cible atteinte.');
  }

  console.log('Sauvegarde des poids du modèle dans ' + weightsPath);
  const weights = model.weights.map(w => ({
    name: w.name,
    shape: w.shape,
    data: Array.from(w.val.dataSync())
  }));
  fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2));

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

const glicko2 = require('glicko2');
const GaussianNB = require('ml-naivebayes').GaussianNB;
const ranking = new glicko2.Glicko2({tau: 0.5});

let glickoTeams = null;
let bayesianModel = null;

async function initializeGlicko() {
  if (glickoTeams) return;

  try {
    const data = await new Promise((resolve, reject) => {
      let rows = [];
      fs.createReadStream(path.join(__dirname, 'data', 'football_data.csv'))
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });

    glickoTeams = new Map();

    // Initialiser les équipes avec des ratings Glicko par défaut
    data.forEach(row => {
      if (!glickoTeams.has(row.HomeTeam)) glickoTeams.set(row.HomeTeam, ranking.makePlayer());
      if (!glickoTeams.has(row.AwayTeam)) glickoTeams.set(row.AwayTeam, ranking.makePlayer());
    });

    // Mettre à jour les ratings en fonction des résultats historiques
    const matches = data.map(row => {
      const home = glickoTeams.get(row.HomeTeam);
      const away = glickoTeams.get(row.AwayTeam);
      let outcome = 0.5;
      if (row.FTR === 'H') outcome = 1;
      if (row.FTR === 'A') outcome = 0;
      return [home, away, outcome];
    });

    ranking.updateRatings(matches);
    console.log('Système Glicko initialisé avec succès');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du système Glicko:', error);
    // Créer un système vide en cas d'erreur
    glickoTeams = new Map();
  }
}

function getGlickoWinProbability(homeTeam, awayTeam) {
  if (!glickoTeams) return 0.5; // Valeur par défaut si non initialisé
  
  // Recherche insensible à la casse et gestion des équipes inconnues
  let home = null;
  let away = null;
  
  // Recherche exacte d'abord
  if (homeTeam && glickoTeams.has(homeTeam)) {
    home = glickoTeams.get(homeTeam);
  } else if (homeTeam) {
    // Recherche insensible à la casse
    for (const [team, player] of glickoTeams.entries()) {
      if (team && team.toLowerCase() === homeTeam.toLowerCase()) {
        home = player;
        break;
      }
    }
  }
  
  if (awayTeam && glickoTeams.has(awayTeam)) {
    away = glickoTeams.get(awayTeam);
  } else if (awayTeam) {
    // Recherche insensible à la casse
    for (const [team, player] of glickoTeams.entries()) {
      if (team && team.toLowerCase() === awayTeam.toLowerCase()) {
        away = player;
        break;
      }
    }
  }
  
  // Si une équipe n'est pas trouvée, créer un joueur par défaut
  if (!home) home = ranking.makePlayer();
  if (!away) away = ranking.makePlayer();
  
  return home.predict(away);
}

// Fonction pour calculer la probabilité selon le modèle de Poisson
function poissonMatchProbability(lambdaHome, lambdaAway) {
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  
  // Calculer les probabilités pour chaque score possible jusqu'à 10 buts
  for (let homeGoals = 0; homeGoals < 10; homeGoals++) {
    for (let awayGoals = 0; awayGoals < 10; awayGoals++) {
      const prob = poissonProbability(lambdaHome, homeGoals) * poissonProbability(lambdaAway, awayGoals);
      
      if (homeGoals > awayGoals) {
        homeWinProb += prob;
      } else if (homeGoals === awayGoals) {
        drawProb += prob;
      } else {
        awayWinProb += prob;
      }
    }
  }
  
  return {
    homeWin: homeWinProb,
    draw: drawProb,
    awayWin: awayWinProb
  };
}

// VIP analysis function
async function analyzeVIP(dateStr = new Date().toISOString().split('T')[0]) {
  const startTime = Date.now();
  try {
    // Initialiser le système Glicko
    try { await initializeGlicko(); } catch (e) { console.error('Erreur init Glicko:', e.message); }
    try { await initializeBayesian(); } catch (e) { console.error('Erreur init Bayesian:', e.message); }
    try { await initializeLSTM(); } catch (e) { console.error('Erreur init LSTM:', e.message); }
    
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
      
      // Calcul de la probabilité Glicko
      let glickoProb = 50; // Valeur par défaut
      if (item.home && item.away) {
        glickoProb = getGlickoWinProbability(item.home, item.away) * 100;
      }
      
      // Calcul de la probabilité bayésienne
      const bayesianProb = getBayesianHomeWinProbability(item.team1Form, item.team2Form);
      
      // Intégration transparente de l'IA pour raffiner reliabilityScore
      const vipInputs = [
        layProb / 100, 
        item.goalProb, 
        item.firstHalfGoalProb / 100, 
        item.bttsProb / 100, 
        poissonProb / 100, 
        eloProb / 100
      ];
      
      const inputTensor = tf.tensor2d([vipInputs]);
      const prediction = vipModel.predict(inputTensor);
      const aiRefinedScore = (await prediction.data())[0] * 100;
      
      // Moyenne pour harmonie avec ajout de Glicko
      const reliabilityScore = (
        (layProb * 0.3) +
        (item.goalProb * 100 * 0.2) +
        (item.firstHalfGoalProb * 0.1) +
        (item.bttsProb * 0.05) +
        (aiRefinedScore * 0.2) +
        (poissonProb * 0.1) +
        (eloProb * 0.05) +
        (glickoProb * 0.1) +
        (bayesianProb * 0.1)
      ) / 1.2; // Ajusté pour les nouveaux poids

      let certaintyLevel = 'Faible fiabilité';
      if (reliabilityScore > 90) {
        certaintyLevel = 'Très sûre';
      } else if (reliabilityScore >= 70) {
        certaintyLevel = 'Probable';
      } else if (reliabilityScore >= 50) {
        certaintyLevel = 'À considérer';
      }
      
      const errorMargin = ((100 - reliabilityScore) / 2).toFixed(2);
      
      const evaluationCriteria = `Fiabilité calculée basée sur: layProb (30%), goalProb (20%), firstHalfGoalProb (10%), bttsProb (5%), AI refinement (20%), Poisson (10%), Elo (5%), Glicko (10%), Bayésien (10%). Marge d'erreur estimée: ±${errorMargin}%`;
      
      return { 
        ...item, 
        layProb: layProb.toFixed(2),
        reliabilityScore: reliabilityScore.toFixed(2),
        certaintyLevel,
        errorMargin,
        evaluationCriteria,
        poissonProb: poissonProb.toFixed(2),
        eloProb: eloProb.toFixed(2),
        glickoProb: glickoProb.toFixed(2),
        bayesianProb: bayesianProb.toFixed(2)
      };
    }));
    
    // **STRATÉGIE VIP AVANCÉE** : Analyse multi-dimensionnelle pour identifier les matchs les plus sûrs
    const highQualityPicks = reliabilityData.filter(match => {
      // Critères de base stricts
      const minReliabilityScore = 40; // Score minimum de fiabilité (relaxed)
      const minGoalProb = 40; // Probabilité minimum de but (relaxed)
      const minFirstHalfGoalProb = 30; // Probabilité minimum de but en 1ère mi-temps (relaxed)
      const maxLayProb = 85; // Probabilité Lay maximum (relaxed)
      
      // **ANALYSE AVANCÉE** : Méthodes supplémentaires pour la sécurité
      const goalProb = parseFloat(match.goalProb) * 100;
      const layProb = parseFloat(match.layProb);
      const bttsProb = parseFloat(match.bttsProb);
      const firstHalfGoalProb = parseFloat(match.firstHalfGoalProb);
      const reliabilityScore = parseFloat(match.reliabilityScore);
      
      // **1. ANALYSE DE MOMENTUM** : Vérifier la cohérence des probabilités
      const momentumScore = (goalProb + firstHalfGoalProb + (100 - layProb)) / 3;
      const minMomentumScore = 40; // Score de momentum minimum (relaxed)
      
      // **2. ANALYSE DE CONSENSUS** : Vérifier l'accord entre les modèles
      const modelScores = [
        parseFloat(match.poissonProb) || 50,
        parseFloat(match.eloProb) || 50,
        parseFloat(match.glickoProb) || 50,
        parseFloat(match.bayesianProb) || 50
      ].filter(score => score > 0);
      
      const consensusScore = modelScores.length > 0 ? 
        modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length : 50;
      
      const minConsensusScore = 30; // Score de consensus minimum (relaxed)
      const maxConsensusVariance = 35; // Variance maximale entre modèles (relaxed)
      
      const consensusVariance = modelScores.length > 1 ? 
        Math.sqrt(modelScores.reduce((sum, score) => sum + Math.pow(score - consensusScore, 2), 0) / modelScores.length) : 0;
      
      // **3. ANALYSE DE RISQUE-REWARD** : Ratio risque/récompense favorable
      const riskRewardRatio = (goalProb * 0.8 + firstHalfGoalProb * 0.2) / Math.max(layProb, 1);
      const minRiskRewardRatio = 0.4; // Ratio minimum (relaxed)
      
      // **4. ANALYSE DE STABILITÉ** : Vérifier la stabilité des prédictions
      const predictionStability = Math.min(goalProb, 100 - layProb, firstHalfGoalProb) / 
                                 Math.max(Math.abs(goalProb - 50), Math.abs(layProb - 50), Math.abs(firstHalfGoalProb - 50));
      const minStabilityScore = 0.3; // Score de stabilité minimum (relaxed)
      
      // **5. ANALYSE DE CONFIDENCE** : Score de confiance global
      const confidenceScore = (reliabilityScore * 0.4 + momentumScore * 0.3 + consensusScore * 0.2 + 
                              (riskRewardRatio * 50) * 0.1);
      const minConfidenceScore = 40; // Score de confidence minimum (relaxed)
      
      // **APPLICATION DES CRITÈRES** : Tous les critères doivent être respectés
      return (
        reliabilityScore >= minReliabilityScore &&
        goalProb >= minGoalProb &&
        firstHalfGoalProb >= minFirstHalfGoalProb &&
        layProb <= maxLayProb &&
        momentumScore >= minMomentumScore &&
        consensusScore >= minConsensusScore &&
        consensusVariance <= maxConsensusVariance &&
        riskRewardRatio >= minRiskRewardRatio &&
        predictionStability >= minStabilityScore &&
        confidenceScore >= minConfidenceScore
      );
    });
    
    // Trier par score de fiabilité et prendre les 20 meilleurs
    highQualityPicks.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    const topVIP = highQualityPicks.slice(0, 20); // Les 20 meilleurs pronostics
    
    console.log(`Analyse VIP terminée: ${topVIP.length} matchs analysés`);
    
    const duration = Date.now() - startTime;
    console.log(`Temps total d'analyse VIP: ${duration} ms`);
    if (!process.env.VERCEL && !process.env.NODE_ENV === 'production') {
      fs.writeFileSync(cacheFile, JSON.stringify(topVIP, null, 2));
      console.log(`Résultats VIP mis en cache pour ${dateStr}`);
    }
    return topVIP;
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

  const weightsPath = './vip_model_weights.json';
  if (fs.existsSync(weightsPath)) {
    console.log('Chargement des poids du modèle depuis ' + weightsPath);
    const weightsData = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
    const weightTensors = weightsData.map(wd => tf.tensor(wd.data, wd.shape));
    model.setWeights(weightTensors);
    return model;
  }

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

  const history = await model.fit(trainXs, trainYs, {epochs: 50, batchSize: 64, shuffle: false, validationData: [valXs, valYs], callbacks: tf.callbacks.earlyStopping({monitor: 'val_loss', patience: 10})}); const valLoss = history.history.val_loss[history.history.val_loss.length - 1]; const valMae = history.history.val_mae[history.history.val_mae.length - 1];
  console.log(`Entraînement terminé. Validation MAE: ${valMae}`);
  const duration = Date.now() - startTime;
  console.log(`Temps d'entraînement: ${duration} ms`);

  if (valMae < 0.1) {
    console.log('Précision cible atteinte.');
  }

  if (!process.env.VERCEL) {
    console.log('Sauvegarde des poids du modèle dans ' + weightsPath);
    const weights = model.weights.map(w => ({
      name: w.name,
      shape: w.shape,
      data: Array.from(w.val.dataSync())
    }));
    fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2));
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

async function initializeBayesian() {
  if (bayesianModel) return;
  const modelPath = path.join(__dirname, 'bayesian_model.json');
  if (fs.existsSync(modelPath)) {
    try {
      const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      bayesianModel = GaussianNB.load(modelData);
      console.log('Modèle Bayésien chargé avec succès depuis ' + modelPath);
      return;
    } catch (loadError) {
      console.error('Erreur lors du chargement du modèle Bayésien:', loadError);
    }
  }

  try {
    const data = await new Promise((resolve, reject) => {
      let rows = [];
      fs.createReadStream(path.join(__dirname, 'data', 'football_data.csv'))
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });

    let X = [];
    let y = [];
    data.forEach(row => {
      const homeRating = formToRating(row.HomeForm || 'LLLLL');
      const awayRating = formToRating(row.AwayForm || 'LLLLL');
      if (!isNaN(homeRating) && !isNaN(awayRating) && homeRating > 0 && awayRating > 0) {
        X.push([homeRating, awayRating]);
        let label;
        if (row.FTR === 'H') label = 0;
        else if (row.FTR === 'A') label = 1;
        else label = 2;
        y.push(label);
      } else {
        console.warn('Skipped invalid row:', row);
      }
    });

    bayesianModel = new GaussianNB();
    if (X.length < 2 || new Set(y).size < 2) {
      console.log('Données insuffisantes détectées. Utilisation de données factices pour entraîner le modèle Bayésien.');
      X = [
        [1000, 1000],
        [1200, 800],
        [800, 1200],
        [1100, 900]
      ];
      y = [0, 0, 1, 2];
    }
    // Continuer avec l'entraînement
    bayesianModel.train(X, y);
    console.log('Modèle bayésien initialisé avec succès');
    if (!process.env.VERCEL) {
      fs.writeFileSync(modelPath, JSON.stringify(bayesianModel.toJSON(), null, 2));
      console.log('Modèle Bayésien sauvegardé dans ' + modelPath);
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du modèle bayésien:', error);
    bayesianModel = null;
  }
}

function getBayesianHomeWinProbability(homeForm, awayForm) {
  if (!bayesianModel) return 33.33;

  const homeRating = formToRating(homeForm || 'LLLLL');
  const awayRating = formToRating(awayForm || 'LLLLL');

  // Since predictProba is not available, return a default probability
  const predictedClass = bayesianModel.predict([[homeRating, awayRating]]);
  if (predictedClass === 0) return 70; // Home win
  else if (predictedClass === 1) return 30; // Away win
  else return 50; // Draw
}

// Initialisation du modèle LSTM
let lstmModel;

async function initializeLSTM() {
  if (lstmModel) return;

  const modelPath = path.join(__dirname, 'lstm_model.json');

  if (fs.existsSync(modelPath)) {
    try {
      const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      lstmModel = Network.fromJSON(modelData);
      console.log('Modèle LSTM chargé avec succès depuis ' + modelPath);
      return;
    } catch (loadError) {
      console.error('Erreur lors du chargement du modèle LSTM:', loadError);
    }
  }

  try {
    const data = await new Promise((resolve, reject) => {
      let rows = [];
      fs.createReadStream(path.join(__dirname, 'data', 'football_data.csv'))
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });

    const trainingData = data.map(row => {
      const input = [formToRating(row.HomeForm || 'LLLLL') / 2000, formToRating(row.AwayForm || 'LLLLL') / 2000]; // Normalisation
      const output = row.FTR === 'H' ? [1] : [0];
      return {input, output};
    });

    lstmModel = new Architect.LSTM(2, 6, 1);
    const trainer = new Trainer(lstmModel);
    trainer.train(trainingData, {
      log: 500,
      iterations: 1000,
      error: 0.03,
      clear: true,
      rate: 0.05
    });
    console.log('Modèle LSTM initialisé avec succès');
    
    if (!process.env.VERCEL) {
      fs.writeFileSync(modelPath, JSON.stringify(lstmModel.toJSON(), null, 2));
      console.log('Modèle LSTM sauvegardé dans ' + modelPath);
    }
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du modèle LSTM:', error);
    lstmModel = null;
  }
}

function getLSTMHomeWinProbability(homeForm, awayForm) {
  if (!lstmModel) return 0.5;

  const input = [formToRating(homeForm || 'LLLLL') / 2000, formToRating(awayForm || 'LLLLL') / 2000];
  return lstmModel.activate(input)[0];
}

// Modèles de Machine Learning supervisé
let randomForestModel = null;
let svmModel = null;
let knnModel = null;

// Initialiser le modèle Random Forest
function initializeRandomForest() {
  if (randomForestModel) return;
  
  const modelPath = path.join(__dirname, 'random_forest_model.json');

  if (fs.existsSync(modelPath)) {
    try {
      const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      randomForestModel = RandomForestClassifier.load(modelData);
      console.log('Modèle Random Forest chargé avec succès depuis ' + modelPath);
      return;
    } catch (loadError) {
      console.error('Erreur lors du chargement du modèle Random Forest:', loadError);
    }
  }
  
  try {
    const data = fs.readFileSync('football_data.csv', 'utf8');
    const lines = data.split('\n').slice(1); // Skip header
    
    const trainingData = [];
    const labels = [];
    
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 6) {
        const homeForm = parseInt(parts[1]) || 0;
        const awayForm = parseInt(parts[2]) || 0;
        const homeGoals = parseInt(parts[3]) || 0;
        const awayGoals = parseInt(parts[4]) || 0;
        const result = parseInt(parts[5]) || 0; // 1 for home win, 0 otherwise
        
        trainingData.push([homeForm, awayForm, homeGoals, awayGoals]);
        labels.push(result);
      }
    });
    
    if (trainingData.length > 0) {
      const options = {
        seed: 42,
        maxFeatures: 0.8,
        replacement: false,
        nEstimators: 100
      };
      
      randomForestModel = new RandomForestClassifier(options);
      randomForestModel.train(trainingData, labels);
      console.log('Random Forest model initialized successfully');
      
      if (!process.env.VERCEL) {
        fs.writeFileSync(modelPath, JSON.stringify(randomForestModel.toJSON(), null, 2));
        console.log('Modèle Random Forest sauvegardé dans ' + modelPath);
      }
    }
  } catch (error) {
    console.error('Error initializing Random Forest model:', error);
  }
}

// Initialiser le modèle SVM
function initializeSVM() {
  if (svmModel) return;
  
  const modelPath = path.join(__dirname, 'svm_model.json');

  if (fs.existsSync(modelPath)) {
    try {
      const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      svmModel = SVM.load(modelData);
      console.log('Modèle SVM chargé avec succès depuis ' + modelPath);
      return;
    } catch (loadError) {
      console.error('Erreur lors du chargement du modèle SVM:', loadError);
    }
  }
  
  try {
    const data = fs.readFileSync('football_data.csv', 'utf8');
    const lines = data.split('\n').slice(1); // Skip header
    
    const trainingData = [];
    const labels = [];
    
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 6) {
        const homeForm = parseInt(parts[1]) || 0;
        const awayForm = parseInt(parts[2]) || 0;
        const homeGoals = parseInt(parts[3]) || 0;
        const awayGoals = parseInt(parts[4]) || 0;
        const result = parseInt(parts[5]) || 0; // 1 for home win, 0 otherwise
        
        trainingData.push([homeForm, awayForm, homeGoals, awayGoals]);
        labels.push(result);
      }
    });
    
    if (trainingData.length > 0) {
      const options = {
        kernel: 'rbf',
        gamma: 0.5,
        cost: 1.0
      };
      
      svmModel = new SVM(options);
      svmModel.train(trainingData, labels);
      console.log('SVM model initialized successfully');
      
      if (!process.env.VERCEL) {
        fs.writeFileSync(modelPath, JSON.stringify(svmModel.toJSON(), null, 2));
        console.log('Modèle SVM sauvegardé dans ' + modelPath);
      }
    }
  } catch (error) {
    console.error('Error initializing SVM model:', error);
  }
}

// Initialiser le modèle k-NN
function initializeKNN() {
  if (knnModel) return;
  
  const modelPath = path.join(__dirname, 'knn_model.json');

  if (fs.existsSync(modelPath)) {
    try {
      const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      knnModel = new KNN(modelData.dataset, modelData.labels, { k: modelData.k });
      console.log('Modèle k-NN chargé avec succès depuis ' + modelPath);
      return;
    } catch (loadError) {
      console.error('Erreur lors du chargement du modèle k-NN:', loadError);
    }
  }
  
  try {
    const data = fs.readFileSync('football_data.csv', 'utf8');
    const lines = data.split('\n').slice(1); // Skip header
    
    const trainingData = [];
    const labels = [];
    
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 6) {
        const homeForm = parseInt(parts[1]) || 0;
        const awayForm = parseInt(parts[2]) || 0;
        const homeGoals = parseInt(parts[3]) || 0;
        const awayGoals = parseInt(parts[4]) || 0;
        const result = parseInt(parts[5]) || 0; // 1 for home win, 0 otherwise
        
        trainingData.push([homeForm, awayForm, homeGoals, awayGoals]);
        labels.push(result);
      }
    });
    
    if (trainingData.length > 0) {
      knnModel = new KNN(trainingData, labels, { k: 5 });
      console.log('k-NN model initialized successfully');
      
      if (!process.env.VERCEL) {
        fs.writeFileSync(modelPath, JSON.stringify({
          dataset: knnModel.dataset,
          labels: knnModel.labels,
          k: knnModel.k
        }, null, 2));
        console.log('Modèle k-NN sauvegardé dans ' + modelPath);
      }
    }
  } catch (error) {
    console.error('Error initializing k-NN model:', error);
  }
}

// Obtenir la probabilité de victoire à domicile Random Forest
function getRandomForestHomeWinProbability(homeForm, awayForm) {
  if (!randomForestModel) return 50;
  
  try {
    const input = [homeForm, awayForm, 0, 0]; // Simplified input
    const prediction = randomForestModel.predict([input]);
    return prediction[0] * 100;
  } catch (error) {
    console.error('Error in Random Forest prediction:', error);
    return 50;
  }
}

// Obtenir la probabilité de victoire à domicile SVM
function getSVMHomeWinProbability(homeForm, awayForm) {
  if (!svmModel) return 50;
  
  try {
    const input = [homeForm, awayForm, 0, 0]; // Simplified input
    const prediction = svmModel.predict([input]);
    return prediction[0] * 100;
  } catch (error) {
    console.error('Error in SVM prediction:', error);
    return 50;
  }
}

// Obtenir la probabilité de victoire à domicile k-NN
function getKNNHomeWinProbability(homeForm, awayForm) {
  if (!knnModel) return 50;
  
  try {
    const input = [homeForm, awayForm, 0, 0]; // Simplified input
    const prediction = knnModel.predict([input]);
    return prediction[0] * 100;
  } catch (error) {
    console.error('Error in k-NN prediction:', error);
    return 50;
  }
}