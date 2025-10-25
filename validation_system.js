/**
 * Système de Validation pour BarakaSYT
 * Mesure les performances des algorithmes sans affecter le fonctionnement
 */

const fs = require('fs');
const path = require('path');

class ValidationSystem {
  constructor() {
    this.metricsPath = path.join(__dirname, 'validation_metrics.json');
    this.logPath = path.join(__dirname, 'validation_log.txt');
    this.isEnabled = true;
  }

  /**
   * Calcule les métriques de performance
   */
  calculateMetrics(predictions, actuals) {
    if (predictions.length !== actuals.length) {
      throw new Error('Les tableaux de prédictions et de valeurs réelles doivent avoir la même taille');
    }

    const n = predictions.length;
    let tp = 0, tn = 0, fp = 0, fn = 0;
    let mse = 0, mae = 0;

    // Seuil pour classification binaire (0.5)
    const threshold = 0.5;

    for (let i = 0; i < n; i++) {
      const pred = predictions[i];
      const actual = actuals[i];

      // Métriques de régression
      const error = pred - actual;
      mse += error * error;
      mae += Math.abs(error);

      // Métriques de classification
      const predClass = pred >= threshold ? 1 : 0;
      const actualClass = actual >= threshold ? 1 : 0;

      if (predClass === 1 && actualClass === 1) tp++;
      else if (predClass === 0 && actualClass === 0) tn++;
      else if (predClass === 1 && actualClass === 0) fp++;
      else if (predClass === 0 && actualClass === 1) fn++;
    }

    // Calculs finaux
    mse /= n;
    mae /= n;
    const rmse = Math.sqrt(mse);

    const accuracy = (tp + tn) / n;
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

    return {
      regression: {
        mse: mse.toFixed(4),
        rmse: rmse.toFixed(4),
        mae: mae.toFixed(4)
      },
      classification: {
        accuracy: accuracy.toFixed(4),
        precision: precision.toFixed(4),
        recall: recall.toFixed(4),
        f1Score: f1Score.toFixed(4)
      },
      confusionMatrix: { tp, tn, fp, fn },
      sampleSize: n
    };
  }

  /**
   * Valide un modèle avec des données de test
   */
  validateModel(modelFunction, testData) {
    if (!this.isEnabled) return null;

    try {
      const predictions = [];
      const actuals = [];

      testData.forEach(sample => {
        const prediction = modelFunction(sample);
        predictions.push(prediction);
        actuals.push(sample.target);
      });

      const metrics = this.calculateMetrics(predictions, actuals);
      
      // Ajouter des métadonnées
      metrics.timestamp = new Date().toISOString();
      metrics.modelType = modelFunction.name || 'unknown';
      
      return metrics;

    } catch (error) {
      console.error(`❌ Erreur lors de la validation: ${error.message}`);
      return null;
    }
  }

  /**
   * Effectue une validation croisée k-fold
   */
  crossValidation(modelFunction, data, k = 5) {
    if (!this.isEnabled) return null;

    try {
      const foldSize = Math.floor(data.length / k);
      const results = [];

      for (let i = 0; i < k; i++) {
        const start = i * foldSize;
        const end = i === k - 1 ? data.length : start + foldSize;
        
        const testData = data.slice(start, end);
        const trainData = [...data.slice(0, start), ...data.slice(end)];

        // Simuler l'entraînement (dans un vrai cas, on réentraînerait le modèle)
        const metrics = this.validateModel(modelFunction, testData);
        
        if (metrics) {
          metrics.fold = i + 1;
          results.push(metrics);
        }
      }

      // Calculer les moyennes
      const avgMetrics = this.averageMetrics(results);
      avgMetrics.folds = results;
      avgMetrics.crossValidation = true;

      return avgMetrics;

    } catch (error) {
      console.error(`❌ Erreur lors de la validation croisée: ${error.message}`);
      return null;
    }
  }

  /**
   * Calcule la moyenne des métriques
   */
  averageMetrics(metricsArray) {
    if (metricsArray.length === 0) return null;

    const avg = {
      regression: { mse: 0, rmse: 0, mae: 0 },
      classification: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
      sampleSize: 0
    };

    metricsArray.forEach(metrics => {
      avg.regression.mse += parseFloat(metrics.regression.mse);
      avg.regression.rmse += parseFloat(metrics.regression.rmse);
      avg.regression.mae += parseFloat(metrics.regression.mae);
      
      avg.classification.accuracy += parseFloat(metrics.classification.accuracy);
      avg.classification.precision += parseFloat(metrics.classification.precision);
      avg.classification.recall += parseFloat(metrics.classification.recall);
      avg.classification.f1Score += parseFloat(metrics.classification.f1Score);
      
      avg.sampleSize += metrics.sampleSize;
    });

    const n = metricsArray.length;
    Object.keys(avg.regression).forEach(key => {
      avg.regression[key] = (avg.regression[key] / n).toFixed(4);
    });
    Object.keys(avg.classification).forEach(key => {
      avg.classification[key] = (avg.classification[key] / n).toFixed(4);
    });

    avg.timestamp = new Date().toISOString();
    avg.averageOf = n;

    return avg;
  }

  /**
   * Sauvegarde les métriques
   */
  saveMetrics(metrics, label = 'validation') {
    try {
      let allMetrics = {};
      
      if (fs.existsSync(this.metricsPath)) {
        allMetrics = JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
      }

      if (!allMetrics[label]) {
        allMetrics[label] = [];
      }

      allMetrics[label].push(metrics);

      // Garder seulement les 50 dernières validations
      if (allMetrics[label].length > 50) {
        allMetrics[label] = allMetrics[label].slice(-50);
      }

      fs.writeFileSync(this.metricsPath, JSON.stringify(allMetrics, null, 2));
      
      // Log textuel
      const logEntry = `[${metrics.timestamp}] ${label}: Accuracy=${metrics.classification.accuracy}, F1=${metrics.classification.f1Score}, RMSE=${metrics.regression.rmse}\n`;
      fs.appendFileSync(this.logPath, logEntry);

      console.log(`✅ Métriques sauvegardées: ${label}`);

    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde: ${error.message}`);
    }
  }

  /**
   * Charge les métriques historiques
   */
  loadMetrics(label = null) {
    try {
      if (!fs.existsSync(this.metricsPath)) {
        return {};
      }

      const allMetrics = JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
      
      return label ? allMetrics[label] || [] : allMetrics;

    } catch (error) {
      console.error(`❌ Erreur lors du chargement: ${error.message}`);
      return {};
    }
  }

  /**
   * Génère un rapport de performance
   */
  generateReport(label = null) {
    const metrics = this.loadMetrics(label);
    
    console.log('\n📊 RAPPORT DE VALIDATION');
    console.log('========================');

    if (label && Array.isArray(metrics)) {
      this.printMetricsReport(label, metrics);
    } else {
      Object.keys(metrics).forEach(key => {
        this.printMetricsReport(key, metrics[key]);
      });
    }
  }

  printMetricsReport(label, metricsArray) {
    if (!metricsArray || metricsArray.length === 0) {
      console.log(`\n${label}: Aucune donnée`);
      return;
    }

    const latest = metricsArray[metricsArray.length - 1];
    console.log(`\n${label.toUpperCase()}:`);
    console.log(`  📈 Dernière validation: ${latest.timestamp}`);
    console.log(`  🎯 Précision: ${latest.classification.accuracy} (${(parseFloat(latest.classification.accuracy) * 100).toFixed(1)}%)`);
    console.log(`  📊 F1-Score: ${latest.classification.f1Score}`);
    console.log(`  📉 RMSE: ${latest.regression.rmse}`);
    console.log(`  📋 Échantillons: ${latest.sampleSize}`);

    if (metricsArray.length > 1) {
      const previous = metricsArray[metricsArray.length - 2];
      const accuracyChange = (parseFloat(latest.classification.accuracy) - parseFloat(previous.classification.accuracy)) * 100;
      const trend = accuracyChange > 0 ? '📈' : accuracyChange < 0 ? '📉' : '➡️';
      console.log(`  ${trend} Évolution: ${accuracyChange > 0 ? '+' : ''}${accuracyChange.toFixed(2)}%`);
    }
  }

  /**
   * Active/désactive le système de validation
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`${enabled ? '✅' : '❌'} Système de validation ${enabled ? 'activé' : 'désactivé'}`);
  }
}

module.exports = ValidationSystem;

// Utilisation en ligne de commande
if (require.main === module) {
  const validator = new ValidationSystem();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'report':
      const label = process.argv[3];
      validator.generateReport(label);
      break;
    case 'test':
      // Test avec des données factices
      const testPredictions = [0.7, 0.3, 0.8, 0.2, 0.6];
      const testActuals = [0.8, 0.2, 0.9, 0.1, 0.5];
      const metrics = validator.calculateMetrics(testPredictions, testActuals);
      console.log('🧪 Test des métriques:');
      console.log(JSON.stringify(metrics, null, 2));
      break;
    case 'enable':
      validator.setEnabled(true);
      break;
    case 'disable':
      validator.setEnabled(false);
      break;
    default:
      console.log('Usage: node validation_system.js [report <label>|test|enable|disable]');
  }
}