/**
 * Améliorateur de Dataset pour BarakaSYT
 * Génère des données d'entraînement plus réalistes basées sur des patterns footballistiques
 */

const fs = require('fs');
const path = require('path');

class DataEnhancer {
  constructor() {
    this.originalDataPath = path.join(__dirname, 'data', 'football_data.csv');
    this.enhancedDataPath = path.join(__dirname, 'data', 'football_data_enhanced.csv');
    this.backupPath = path.join(__dirname, 'data', 'football_data_original.csv');
  }

  /**
   * Génère des données réalistes basées sur des patterns footballistiques
   */
  generateRealisticData(numSamples = 500) {
    const data = [];
    
    // Patterns réalistes basés sur l'analyse de matchs de football
    const patterns = [
      // Équipes fortes à domicile
      { lay: [0.7, 0.9], goal: [0.6, 0.8], fhg: [0.5, 0.7], btts: [0.4, 0.6], poisson: [0.65, 0.85], elo: [0.6, 0.8], target: [0.65, 0.8] },
      // Équipes moyennes
      { lay: [0.5, 0.7], goal: [0.5, 0.7], fhg: [0.4, 0.6], btts: [0.5, 0.7], poisson: [0.5, 0.7], elo: [0.45, 0.65], target: [0.5, 0.7] },
      // Équipes faibles à l'extérieur
      { lay: [0.3, 0.5], goal: [0.3, 0.5], fhg: [0.2, 0.4], btts: [0.3, 0.5], poisson: [0.3, 0.5], elo: [0.3, 0.5], target: [0.3, 0.5] },
      // Matchs équilibrés
      { lay: [0.45, 0.55], goal: [0.45, 0.55], fhg: [0.4, 0.6], btts: [0.5, 0.7], poisson: [0.45, 0.55], elo: [0.45, 0.55], target: [0.45, 0.55] },
      // Gros favoris
      { lay: [0.8, 0.95], goal: [0.7, 0.9], fhg: [0.6, 0.8], btts: [0.3, 0.5], poisson: [0.75, 0.9], elo: [0.7, 0.9], target: [0.75, 0.9] }
    ];

    for (let i = 0; i < numSamples; i++) {
      // Sélectionner un pattern aléatoire
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      
      const sample = {};
      Object.keys(pattern).forEach(key => {
        const [min, max] = pattern[key];
        // Ajouter une variation réaliste
        const base = min + Math.random() * (max - min);
        const variation = (Math.random() - 0.5) * 0.1; // ±5% de variation
        sample[key] = Math.max(0.1, Math.min(0.95, base + variation));
      });

      // Ajuster la target en fonction des autres variables (logique réaliste)
      const weightedScore = (
        sample.lay * 0.25 +
        sample.goal * 0.2 +
        sample.fhg * 0.15 +
        sample.btts * 0.1 +
        sample.poisson * 0.2 +
        sample.elo * 0.1
      );
      
      // Ajouter du bruit réaliste
      const noise = (Math.random() - 0.5) * 0.15;
      sample.target = Math.max(0.1, Math.min(0.95, weightedScore + noise));

      data.push(sample);
    }

    return data;
  }

  /**
   * Sauvegarde les données originales et crée un dataset amélioré
   */
  async enhanceDataset(numSamples = 500) {
    try {
      // Sauvegarder les données originales
      if (fs.existsSync(this.originalDataPath) && !fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.originalDataPath, this.backupPath);
        console.log('✅ Données originales sauvegardées');
      }

      // Lire les données existantes
      let existingData = [];
      if (fs.existsSync(this.originalDataPath)) {
        const content = fs.readFileSync(this.originalDataPath, 'utf8');
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',');
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() && !lines[i].startsWith('//')) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
              row[header] = parseFloat(values[index]) || 0;
            });
            existingData.push(row);
          }
        }
      }

      // Générer de nouvelles données
      const newData = this.generateRealisticData(numSamples);
      
      // Combiner les données
      const allData = [...existingData, ...newData];

      // Créer le nouveau fichier CSV
      const headers = ['lay', 'goal', 'fhg', 'btts', 'poisson', 'elo', 'target'];
      let csvContent = headers.join(',') + '\n';
      
      allData.forEach(row => {
        const values = headers.map(header => row[header].toFixed(3));
        csvContent += values.join(',') + '\n';
      });

      // Écrire le fichier amélioré
      fs.writeFileSync(this.enhancedDataPath, csvContent);
      console.log(`✅ Dataset amélioré créé avec ${allData.length} échantillons`);

      return {
        originalCount: existingData.length,
        newCount: newData.length,
        totalCount: allData.length,
        enhancedPath: this.enhancedDataPath
      };

    } catch (error) {
      console.error(`❌ Erreur lors de l'amélioration du dataset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Active le dataset amélioré en remplaçant l'original
   */
  activateEnhancedDataset() {
    try {
      if (!fs.existsSync(this.enhancedDataPath)) {
        throw new Error('Dataset amélioré introuvable');
      }

      fs.copyFileSync(this.enhancedDataPath, this.originalDataPath);
      console.log('✅ Dataset amélioré activé');
      return true;
    } catch (error) {
      console.error(`❌ Erreur lors de l'activation: ${error.message}`);
      return false;
    }
  }

  /**
   * Restaure le dataset original
   */
  restoreOriginalDataset() {
    try {
      if (!fs.existsSync(this.backupPath)) {
        throw new Error('Sauvegarde originale introuvable');
      }

      fs.copyFileSync(this.backupPath, this.originalDataPath);
      console.log('✅ Dataset original restauré');
      return true;
    } catch (error) {
      console.error(`❌ Erreur lors de la restauration: ${error.message}`);
      return false;
    }
  }

  /**
   * Analyse la qualité du dataset
   */
  analyzeDataset(filePath = this.originalDataPath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const dataLines = lines.slice(1).filter(line => line.trim() && !line.startsWith('//'));
      
      console.log(`📊 Analyse du dataset: ${filePath}`);
      console.log(`   - Nombre d'échantillons: ${dataLines.length}`);
      console.log(`   - Colonnes: ${lines[0]}`);
      
      if (dataLines.length < 100) {
        console.log('⚠️  ATTENTION: Dataset trop petit (< 100 échantillons)');
      } else if (dataLines.length < 1000) {
        console.log('⚠️  Dataset petit (< 1000 échantillons)');
      } else {
        console.log('✅ Taille de dataset acceptable');
      }

      return {
        sampleCount: dataLines.length,
        headers: lines[0].split(','),
        quality: dataLines.length >= 1000 ? 'good' : dataLines.length >= 100 ? 'fair' : 'poor'
      };

    } catch (error) {
      console.error(`❌ Erreur lors de l'analyse: ${error.message}`);
      return null;
    }
  }
}

module.exports = DataEnhancer;

// Utilisation en ligne de commande
if (require.main === module) {
  const enhancer = new DataEnhancer();
  
  const command = process.argv[2];
  const numSamples = parseInt(process.argv[3]) || 500;
  
  switch (command) {
    case 'enhance':
      enhancer.enhanceDataset(numSamples)
        .then(result => {
          console.log(`🎯 Amélioration terminée:`);
          console.log(`   - Données originales: ${result.originalCount}`);
          console.log(`   - Nouvelles données: ${result.newCount}`);
          console.log(`   - Total: ${result.totalCount}`);
        })
        .catch(console.error);
      break;
    case 'activate':
      enhancer.activateEnhancedDataset();
      break;
    case 'restore':
      enhancer.restoreOriginalDataset();
      break;
    case 'analyze':
      enhancer.analyzeDataset();
      if (fs.existsSync(enhancer.enhancedDataPath)) {
        console.log('\n--- Dataset Amélioré ---');
        enhancer.analyzeDataset(enhancer.enhancedDataPath);
      }
      break;
    default:
      console.log('Usage: node data_enhancer.js [enhance <num_samples>|activate|restore|analyze]');
  }
}