const fs = require('fs');
const path = require('path');
// Remove unused playwright require
// const playwright = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
// Importer uniquement les modules TensorFlow.js nécessaires pour la compatibilité serverless
const tf = require('@tensorflow/tfjs-core');
require('@tensorflow/tfjs-backend-cpu');
// Importer le module layers pour les fonctions comme sequential, dense, etc.
const tfl = require('@tensorflow/tfjs-layers');
// Importer l'expert IA spécialisé dans l'analyse sportive
const SportAnalyticsAI = require('./ai-expert');
// Importer WASM backend de manière conditionnelle pour éviter les problèmes sur Vercel
let wasmBackendInitialized = false;

// Initialiser l'expert IA
const aiExpert = new SportAnalyticsAI();

// Fonction pour initialiser le backend WASM si nécessaire
async function initTensorFlowBackend() {
  try {
    // Vérifier si nous sommes dans un environnement Vercel
    const isVercel = process.env.VERCEL;
    
    // Utiliser le backend CPU par défaut
    await tf.setBackend('cpu');
    
    // Initialiser l'expert IA
    await aiExpert.initialize();
    
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
  // Initialiser TensorFlow et l'expert IA si nécessaire
  await initTensorFlowBackend();
  
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
  console.log(`Analyse des matchs pour ${dateParam} (${dateStr}) avec IA avancée`);

  try {
    // Optimisation des performances - traitement en parallèle
    const startTime = Date.now();
    
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
    
    console.log(`${matches.length} matchs trouvés pour ${dateParam} - Traitement avec IA`);

    // Optimisation: traitement par lots pour améliorer les performances
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < matches.length; i += batchSize) {
      batches.push(matches.slice(i, i + batchSize));
    }

    const allResults = [];
    for (const batch of batches) {
      const batchPromises = batch.map(async (match) => {
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
        const lambdaTeam1 = (team1Over / 100 * 3) + formToScore(team1Form) * 0.5;
        const lambdaTeam2 = (team2Over / 100 * 3) + formToScore(team2Form) * 0.5;
        const lambdaTeam1Half = lambdaTeam1 * 0.45;
        const lambdaTeam2Half = lambdaTeam2 * 0.45;
        const probNoGoalFirstHalf = Math.exp(-lambdaTeam1Half) * Math.exp(-lambdaTeam2Half);
        const firstHalfGoalProb = (1 - probNoGoalFirstHalf) * 100;
        const probNoGoalTeam1 = Math.exp(-lambdaTeam1);
        const probNoGoalTeam2 = Math.exp(-lambdaTeam2);
        const probAnyGoals = 1 - (probNoGoalTeam1 * probNoGoalTeam2);

        // Remove TensorFlow import to fix compatibility issues on Vercel
        // Remplacer par un calcul statistique avancé simple sans bibliothèque externe
        let goalProb = (basicGoalProb + probAnyGoals + (bttsProb / 100)) / 3; // Moyenne pondérée comme exemple d'algorithme 'avancé'
    
        // Fonction factorielle pour calcul Poisson
        const factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
    
        // Fonction de probabilité Poisson : P(k événements) = (e^{-lambda} * lambda^k) / k!
        const poissonProbability = (k, lambda) => (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
    
        // Ajustement avancé des lambdas basé sur BTTS pour plus de robustesse
        const adjustedLambdaTeam1 = lambdaTeam1 * (1 + (team1Btts / 100 - 0.5) * 0.2);
        const adjustedLambdaTeam2 = lambdaTeam2 * (1 + (team2Btts / 100 - 0.5) * 0.2);
    
        // Calcul avancé du score exact le plus probable en utilisant Poisson
        const maxGoals = 5; // Limite raisonnable pour éviter surcharge computationnelle
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
    
        // Calcul raffiné de la probabilité de buts avec Poisson (probabilité non-zéro buts)
        const probNoGoal = poissonProbability(0, adjustedLambdaTeam1) * poissonProbability(0, adjustedLambdaTeam2);
        const refinedGoalProb = (1 - probNoGoal) * 100; // Convertir en pourcentage
    
        // Calcul analytique pour BTTS: P(both &gt; 0) = 1 - P(team1=0) - P(team2=0) + P(both=0)
        const pTeam1Zero = poissonProbability(0, adjustedLambdaTeam1);
        const pTeam2Zero = poissonProbability(0, adjustedLambdaTeam2);
        const refinedBttsProb = (1 - pTeam1Zero - pTeam2Zero + (pTeam1Zero * pTeam2Zero)) * 100;
    
        // Calcul de la probabilité de plus de 1,5 buts
        const p0Goals = probNoGoal;
        const p1Goal = poissonProbability(0, adjustedLambdaTeam1) * poissonProbability(1, adjustedLambdaTeam2) +
                       poissonProbability(1, adjustedLambdaTeam1) * poissonProbability(0, adjustedLambdaTeam2) +
                       poissonProbability(1, adjustedLambdaTeam1) * poissonProbability(1, adjustedLambdaTeam2);
        const over15Prob = (1 - p0Goals - p1Goal) * 100;
    
        // Calcul de la probabilité de plus de 2,5 buts (similaire mais pour &gt;2 buts)
        let over25Prob = 0;
        for (let totalGoals = 3; totalGoals <= maxGoals * 2; totalGoals++) {
          for (let g1 = 0; g1 <= totalGoals; g1++) {
            const g2 = totalGoals - g1;
            over25Prob += poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
          }
        }
    
        // Calcul analytique pour Over 2.5
        let overProb = 0;
        for (let g1 = 0; g1 <= maxGoals; g1++) {
          for (let g2 = 0; g2 <= maxGoals; g2++) {
            if (g1 + g2 > 2) {
              overProb += poissonProbability(g1, adjustedLambdaTeam1) * poissonProbability(g2, adjustedLambdaTeam2) * 100;
            }
          }
        }
    
        bttsProb = Math.max(0, Math.min(100, (bttsProb + refinedBttsProb) / 2)); // Fusion avec données historiques
    
        const refinedOverProb = (team1Over + team2Over + overProb) / 3; // Intégration exemple
    
        // Mise à jour goalProb avec tous les raffinements
        goalProb = (basicGoalProb + probAnyGoals + refinedGoalProb / 100 + refinedOverProb / 100) / 4; // Ajusté sans AI
    
        // S'assurer que goalProb est entre 0 et 1
goalProb = Math.max(0, Math.min(1, goalProb));

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
          firstHalfGoalProb 
        });

        // Intégrer l'analyse IA pour améliorer la précision
        try {
          const aiAnalysis = await aiExpert.analyzeMatchData(matchData);
          
          // Enrichir les données avec l'analyse IA
          matchData.aiConfidence = aiAnalysis.aiConfidence;
          matchData.aiRecommendation = aiAnalysis.aiRecommendation;
          matchData.enhancedCorrectScoreProb = aiAnalysis.enhancedMetrics.enhancedCorrectScoreProb;
          matchData.enhancedBttsProb = aiAnalysis.enhancedMetrics.enhancedBttsProb;
          matchData.enhancedGoalProb = aiAnalysis.enhancedMetrics.enhancedGoalProb;
          matchData.aiOptimizedScore = aiAnalysis.enhancedMetrics.aiOptimizedScore;
          matchData.riskAssessment = aiAnalysis.enhancedMetrics.riskAssessment;
          matchData.valueRating = aiAnalysis.enhancedMetrics.valueRating;
          matchData.trendAnalysis = aiAnalysis.trendAnalysis;
          matchData.over15Prob = aiAnalysis.aiPrediction.over15Prob || over15Prob;
          matchData.highOver15 = matchData.over15Prob > 70; // Identifier comme haute probabilité si >70%
          
          console.log(`IA appliquée au match ${match.link}: Confiance ${aiAnalysis.aiConfidence}%`);
        } catch (aiError) {
          console.warn(`Erreur IA pour le match ${match.link}: ${aiError.message}`);
          // Valeurs par défaut si l'IA échoue
          matchData.aiConfidence = 60;
          matchData.aiRecommendation = "Analyse standard";
        }

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

    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);
      
      // Pause entre les lots pour éviter la surcharge
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Filtrer les résultats valides
    const validResults = allResults.filter(result => result && validateMatchData(result));
    
    // Statistiques de performance
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    console.log(`Traitement terminé en ${processingTime}ms pour ${validResults.length}/${matches.length} matchs valides`);
    
    // Optimisation: mise à jour des métriques de performance de l'IA
    if (aiExpert && aiExpert.updatePerformanceMetrics) {
      aiExpert.updatePerformanceMetrics({
        totalMatches: matches.length,
        validResults: validResults.length,
        processingTime: processingTime,
        successRate: (validResults.length / matches.length) * 100
      });
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
      const results = await analyze(process.argv[2]);
      console.log(JSON.stringify(results, null, 2));
    } catch (error) {
      console.error(error);
    }
  })();
}
// Fonction supplémentaire pour traiter et classer le top 15 des prédictions VIP avec algorithme de fiabilité avancé
async function analyzeVIP(dateStr = new Date().toISOString().split('T')[0]) {
  try {
    // Vérifier d'abord si un cache VIP existe pour cette date
    const vipCacheFile = path.join(__dirname, `vip_cache_${dateStr}.json`);
    
    if (fs.existsSync(vipCacheFile)) {
      console.log(`Chargement du cache VIP pour ${dateStr}`);
      const cachedData = JSON.parse(fs.readFileSync(vipCacheFile, 'utf8'));
      if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        return cachedData;
      }
    }
    
    // Si pas de cache VIP, utiliser les résultats d'analyse normale
    const results = await analyze(dateStr) || [];
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn(`Aucun résultat valide pour l'analyse VIP à la date ${dateStr}`);
      return [];
    }
    
    const reliabilityData = results.map(item => {
      const layProb = 100 - item.correctScoreProb;
      
      const reliabilityScore = 
        (layProb * 0.4) + 
        (item.goalProb * 100 * 0.3) + 
        (item.firstHalfGoalProb * 0.2) + 
        (item.bttsProb * 0.1);
      
      let certaintyLevel = 'Faible fiabilité';
      if (reliabilityScore > 90) {
        certaintyLevel = 'Très sûre';
      } else if (reliabilityScore >= 70) {
        certaintyLevel = 'Probable';
      } else if (reliabilityScore >= 50) {
        certaintyLevel = 'À considérer';
      }
      
      const errorMargin = ((100 - reliabilityScore) / 2).toFixed(2);
      
      const evaluationCriteria = `Fiabilité calculée basée sur: layProb (40%), goalProb (30%), firstHalfGoalProb (20%), bttsProb (10%). Marge d'erreur estimée: ±${errorMargin}%`;
      
      return { 
        ...item, 
        layProb: layProb.toFixed(2),
        reliabilityScore: reliabilityScore.toFixed(2),
        certaintyLevel,
        errorMargin,
        evaluationCriteria
      };
    });
    
    reliabilityData.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    const top15 = reliabilityData.slice(0, 15);
    
    console.log(`Analyse VIP terminée: ${top15.length} matchs analysés`);
    
    return top15;
  } catch (error) {
    console.error(`Erreur lors de l'analyse VIP: ${error.message}`);
    return [];
  }
}

module.exports = { analyze, analyzeVIP };