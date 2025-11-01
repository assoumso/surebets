const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  url: 'https://www.mybets.today/soccer-predictions/',
  timeout: 10000, // milliseconds
  retryAttempts: 3,
  delayBetweenRequests: 2000, // milliseconds
  cacheFile: path.join(__dirname, 'cache.json'),
  selectors: {
    fixtures: '.event-fixtures',
    time: '.timediv time',
    homeTeam: '.homediv .homespan',
    awayTeam: '.awaydiv .awayspan',
    tip: '.tipdiv span',
    // Ajoutez d'autres sélecteurs pour scores, cotes, etc., selon l'analyse HTML
  }
};

// Fonction pour charger le cache existant
function loadCache() {
  if (fs.existsSync(CONFIG.cacheFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.cacheFile, 'utf8'));
  }
  return [];
}

// Fonction pour sauvegarder dans le cache
function saveCache(data) {
  fs.writeFileSync(CONFIG.cacheFile, JSON.stringify(data, null, 2));
}

// Fonction pour extraire les données
async function scrapeData() {
  let cache = loadCache();
  let newData = [];

  try {
    const response = await axios.get(CONFIG.url, { timeout: CONFIG.timeout });
    const $ = cheerio.load(response.data);

    $(CONFIG.selectors.fixtures).each((i, elem) => {
      const time = $(elem).find(CONFIG.selectors.time).text().trim();
      const home = $(elem).find(CONFIG.selectors.homeTeam).text().trim();
      const away = $(elem).find(CONFIG.selectors.awayTeam).text().trim();
      const tip = $(elem).find(CONFIG.selectors.tip).text().trim();

      // TODO: Extraire scores, cotes, dates si disponibles

      const match = { time, home, away, tip };

      // Vérifier si déjà dans le cache (mise à jour incrémentielle)
      const exists = cache.some(c => c.home === home && c.away === away && c.time === time);
      if (!exists) {
        newData.push(match);
      }
    });

    // Ajouter les nouvelles données au cache
    cache = [...cache, ...newData];
    saveCache(cache);

    console.log('Données extraites:', newData);
    // TODO: Exporter en CSV si nécessaire

  } catch (error) {
    console.error('Erreur lors du scraping:', error);
    // Gestion des retries
    // TODO: Implémenter retries
  }
}

// Exécuter le script
scrapeData();

// Documentation:
// - Modifiez CONFIG.selectors pour adapter aux changements HTML.
// - Le script charge un cache JSON et ajoute seulement les nouvelles entrées.
// - Respecte les délais et timeouts pour politesse.