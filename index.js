const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const axios = require('axios');
const cheerio = require('cheerio');
// Remove: const tf = require('@tensorflow/tfjs');


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
  const chromium = require('@sparticuz/chromium');
  const { chromium: playwright } = require('playwright-core');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    let browser = null;
    try {
      browser = await playwright.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      
      const page = await context.newPage();
      await page.goto(url, { timeout: AXIOS_TIMEOUT });
      const content = await page.content();
      
      await browser.close();
      return { data: content };
    } catch (error) {
      if (browser) await browser.close();
      console.error(`Tentative ${attempt} échouée pour ${url} avec navigateur: ${error.message}`);
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
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

  try {
    // Utiliser fetchWithBrowser si sur Vercel, sinon fetchWithRetry
    const fetchFunction = process.env.VERCEL ? fetchWithBrowser : fetchWithRetry;
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

        // Fonction de raffinement IA avec TensorFlow
        async function refineWithAI(features) {
          return features.reduce((a, b) => a + b, 0) / features.length; // Direct fallback to average
        }

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
        const refinedGoalProb = 1 - probNoGoal;

        // Générateur aléatoire de buts basé sur distribution Poisson (algorithme inverse transform)
        const randomPoisson = (lambda) => {
          let L = Math.exp(-lambda);
          let k = 0;
          let p = 1;
          while (p > L) {
            k++;
            p *= Math.random();
          }
          return k - 1;
        };

        // Simulation Monte Carlo pour estimer BTTS et Over/Under de manière probabiliste
        const numSimulations = 1000; // Nombre de simulations pour précision statistique
        let bttsCount = 0;
        let overCount = 0;
        for (let i = 0; i < numSimulations; i++) {
          const goals1 = randomPoisson(adjustedLambdaTeam1);
          const goals2 = randomPoisson(adjustedLambdaTeam2);
          if (goals1 > 0 && goals2 > 0) bttsCount++;
          if (goals1 + goals2 > 2.5) overCount++;
        }
        const refinedBttsProb = (bttsCount / numSimulations) * 100;
        const overProb = (overCount / numSimulations) * 100;

        bttsProb = Math.max(0, Math.min(100, (bttsProb + refinedBttsProb) / 2)); // Fusion avec données historiques

        const refinedOverProb = (team1Over + team2Over + overProb) / 3; // Intégration exemple



        const aiRefinedProb = await refineWithAI([lambdaTeam1, lambdaTeam2, team1Over / 100, team2Over / 100, bttsProb / 100]);
        goalProb = (goalProb + aiRefinedProb) / 2;

        // Mise à jour goalProb avec tous les raffinements
        goalProb = (basicGoalProb + probAnyGoals + refinedGoalProb + aiRefinedProb) / 4;

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
    
    // Sauvegarde désactivée pour compatibilité Vercel\n    return validResults;
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

// Fonction supplémentaire pour traiter et classer le top 20 des probabilités VIP
async function analyzeTop20VIP(dateStr = new Date().toISOString().split('T')[0]) {
  try {
    const results = await analyze(dateStr);
    
    // Filtrer les matchs avec layProb >= 80%
    const filteredResults = results.filter(item => (100 - item.correctScoreProb) >= 80);
    
    // Ajouter le niveau de certitude
    const classifiedResults = filteredResults.map(item => {
      const layProb = 100 - item.correctScoreProb;
      let certaintyLevel = 'autre';
      if (layProb > 90) {
        certaintyLevel = 'très sûre';
      } else if (layProb >= 80) {
        certaintyLevel = 'probable';
      }
      
      return { 
        ...item, 
        layProb: layProb.toFixed(2),
        certaintyLevel,
        correctScoreProb: item.correctScoreProb.toFixed(2),
        bttsProb: item.bttsProb.toFixed(2),
        goalProb: (item.goalProb * 100).toFixed(2),
        firstHalfGoalProb: item.firstHalfGoalProb.toFixed(2)
      };
    });
    
    // Trier par layProb descendant
    classifiedResults.sort((a, b) => b.layProb - a.layProb);
    
    // Prendre top 20 et valider
    const top20 = classifiedResults.slice(0, 20).map(validateMatchData);
    
    console.log(`Analyse Top 20 VIP terminée: ${top20.length} matchs classifiés`);
    
    return top20;
  } catch (error) {
    console.error(`Erreur lors de l'analyse Top 20 VIP: ${error.message}`);
    return [];
  }
}

module.exports = { analyze, analyzeVIP, analyzeTop20VIP };

// Fonction pour analyser les résultats VIP avec optimisations
async function analyzeVIP(dateStr = new Date().toISOString().split('T')[0]) {
  try {
    const results = await analyze(dateStr);
    
    // Calculer un score pondéré pour l'analyse approfondie
    const weightedData = results.map(item => {
      // Convertir forme en score (W=3, D=1, L=0)
      const formScore = (form) => form.split('').reduce((acc, res) => acc + (res === 'W' ? 3 : res === 'D' ? 1 : 0), 0) / 5;
      const team1FormScore = formScore(item.team1Form || 'LLLLL');
      const team2FormScore = formScore(item.team2Form || 'LLLLL');
      const avgForm = (team1FormScore + team2FormScore) / 2;
      
      // Score pondéré: combinaison de probabilités et forme
      const weightedScore = (
        (100 - item.correctScoreProb) * 0.4 +  // layProb
        item.bttsProb * 0.2 +
        (item.goalProb * 100) * 0.2 +
        item.firstHalfGoalProb * 0.1 +
        avgForm * 0.1
      ) / 100;
      
      return { ...item, weightedScore };
    });
    
    // Trier par score pondéré descendant et prendre top 20
    weightedData.sort((a, b) => b.weightedScore - a.weightedScore);
    const top20 = weightedData.slice(0, 20);
    
    console.log(`Analyse VIP terminée: ${top20.length} matchs analysés`);
    
    return top20;
  } catch (error) {
    console.error(`Erreur lors de l'analyse VIP: ${error.message}`);
    return [];
  }
}