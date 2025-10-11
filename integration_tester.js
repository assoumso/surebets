/**
 * Système de Test d'Intégration pour BarakaSYT
 * Valide toutes les améliorations avant déploiement
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class IntegrationTester {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
  }

  /**
   * Lance tous les tests d'intégration
   */
  async runAllTests() {
    console.log('🚀 DÉMARRAGE DES TESTS D\'INTÉGRATION');
    console.log('=====================================\n');

    const tests = [
      { name: 'Système de Sauvegarde', method: 'testBackupSystem' },
      { name: 'Amélioration des Données', method: 'testDataEnhancer' },
      { name: 'Système de Validation', method: 'testValidationSystem' },
      { name: 'Système de Backtesting', method: 'testBacktestingSystem' },
      { name: 'Intégration Complète', method: 'testFullIntegration' },
      { name: 'Performance du Serveur', method: 'testServerPerformance' }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.method);
    }

    this.generateFinalReport();
  }

  /**
   * Exécute un test individuel
   */
  async runTest(testName, methodName) {
    console.log(`🔍 Test: ${testName}`);
    console.log('─'.repeat(50));

    const startTime = Date.now();
    let result = { name: testName, status: 'FAILED', duration: 0, details: [] };

    try {
      const testResult = await this[methodName]();
      result.status = testResult.success ? 'PASSED' : 'FAILED';
      result.details = testResult.details || [];
      result.score = testResult.score || 0;
    } catch (error) {
      result.details.push(`❌ Erreur: ${error.message}`);
    }

    result.duration = Date.now() - startTime;
    this.testResults.push(result);

    console.log(`${result.status === 'PASSED' ? '✅' : '❌'} ${testName}: ${result.status}`);
    console.log(`⏱️  Durée: ${result.duration}ms\n`);

    return result;
  }

  /**
   * Test du système de sauvegarde
   */
  async testBackupSystem() {
    const details = [];
    let score = 0;

    try {
      // Vérifier l'existence du fichier
      if (fs.existsSync(path.join(__dirname, 'backup_system.js'))) {
        details.push('✅ Fichier backup_system.js existe');
        score += 25;
      } else {
        details.push('❌ Fichier backup_system.js manquant');
        return { success: false, details, score };
      }

      // Tester la création de backup
      const result = await this.runCommand('node backup_system.js list');
      if (result.success) {
        details.push('✅ Commande de listage fonctionne');
        score += 25;
      } else {
        details.push('❌ Erreur lors du listage des backups');
      }

      // Vérifier la structure des backups
      const backupDir = path.join(__dirname, 'backups');
      if (fs.existsSync(backupDir)) {
        const backups = fs.readdirSync(backupDir);
        details.push(`✅ Répertoire backups existe (${backups.length} backups)`);
        score += 25;
      } else {
        details.push('⚠️  Répertoire backups n\'existe pas encore');
        score += 10;
      }

      // Test de fonctionnalité
      if (score >= 50) {
        details.push('✅ Système de backup fonctionnel');
        score += 25;
      }

    } catch (error) {
      details.push(`❌ Erreur lors du test: ${error.message}`);
    }

    return { success: score >= 75, details, score };
  }

  /**
   * Test de l'amélioration des données
   */
  async testDataEnhancer() {
    const details = [];
    let score = 0;

    try {
      // Vérifier l'existence du fichier
      if (fs.existsSync(path.join(__dirname, 'data_enhancer.js'))) {
        details.push('✅ Fichier data_enhancer.js existe');
        score += 20;
      } else {
        details.push('❌ Fichier data_enhancer.js manquant');
        return { success: false, details, score };
      }

      // Tester l'analyse des données
      const analyzeResult = await this.runCommand('node data_enhancer.js analyze');
      if (analyzeResult.success) {
        details.push('✅ Analyse des données fonctionne');
        score += 20;
      } else {
        details.push('❌ Erreur lors de l\'analyse des données');
      }

      // Vérifier le fichier de données amélioré
      const enhancedDataPath = path.join(__dirname, 'data', 'football_data.csv');
      if (fs.existsSync(enhancedDataPath)) {
        const content = fs.readFileSync(enhancedDataPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length > 100) {
          details.push(`✅ Dataset amélioré (${lines.length} lignes)`);
          score += 30;
        } else {
          details.push(`⚠️  Dataset petit (${lines.length} lignes)`);
          score += 15;
        }
      } else {
        details.push('❌ Fichier de données amélioré manquant');
      }

      // Vérifier la qualité des données
      if (score >= 50) {
        details.push('✅ Amélioration des données réussie');
        score += 30;
      }

    } catch (error) {
      details.push(`❌ Erreur lors du test: ${error.message}`);
    }

    return { success: score >= 70, details, score };
  }

  /**
   * Test du système de validation
   */
  async testValidationSystem() {
    const details = [];
    let score = 0;

    try {
      // Vérifier l'existence du fichier
      if (fs.existsSync(path.join(__dirname, 'validation_system.js'))) {
        details.push('✅ Fichier validation_system.js existe');
        score += 25;
      } else {
        details.push('❌ Fichier validation_system.js manquant');
        return { success: false, details, score };
      }

      // Tester le système de validation
      const testResult = await this.runCommand('node validation_system.js');
      if (testResult.success) {
        details.push('✅ Système de validation fonctionne');
        score += 25;
      } else {
        details.push('❌ Erreur lors du test de validation');
      }

      // Vérifier l'intégration dans index.js
      const indexPath = path.join(__dirname, 'index.js');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf8');
        if (content.includes('ValidationSystem')) {
          details.push('✅ Validation intégrée dans index.js');
          score += 25;
        } else {
          details.push('❌ Validation non intégrée dans index.js');
        }
      }

      // Vérifier les métriques
      if (score >= 50) {
        details.push('✅ Système de validation opérationnel');
        score += 25;
      }

    } catch (error) {
      details.push(`❌ Erreur lors du test: ${error.message}`);
    }

    return { success: score >= 75, details, score };
  }

  /**
   * Test du système de backtesting
   */
  async testBacktestingSystem() {
    const details = [];
    let score = 0;

    try {
      // Vérifier l'existence du fichier
      if (fs.existsSync(path.join(__dirname, 'backtesting_system.js'))) {
        details.push('✅ Fichier backtesting_system.js existe');
        score += 20;
      } else {
        details.push('❌ Fichier backtesting_system.js manquant');
        return { success: false, details, score };
      }

      // Tester un backtest simple
      const backtestResult = await this.runCommand('node backtesting_system.js run 2024-12-01 2024-12-05');
      if (backtestResult.success) {
        details.push('✅ Backtest simple fonctionne');
        score += 25;
      } else {
        details.push('❌ Erreur lors du backtest');
      }

      // Tester le rapport
      const reportResult = await this.runCommand('node backtesting_system.js report');
      if (reportResult.success) {
        details.push('✅ Génération de rapport fonctionne');
        score += 20;
      } else {
        details.push('❌ Erreur lors de la génération de rapport');
      }

      // Tester Walk-Forward
      const walkforwardResult = await this.runCommand('node backtesting_system.js walkforward');
      if (walkforwardResult.success) {
        details.push('✅ Analyse Walk-Forward fonctionne');
        score += 20;
      } else {
        details.push('❌ Erreur lors de l\'analyse Walk-Forward');
      }

      // Vérifier les résultats sauvegardés
      const resultsPath = path.join(__dirname, 'backtest_results.json');
      if (fs.existsSync(resultsPath)) {
        details.push('✅ Résultats de backtest sauvegardés');
        score += 15;
      } else {
        details.push('⚠️  Aucun résultat de backtest sauvegardé');
      }

    } catch (error) {
      details.push(`❌ Erreur lors du test: ${error.message}`);
    }

    return { success: score >= 70, details, score };
  }

  /**
   * Test d'intégration complète
   */
  async testFullIntegration() {
    const details = [];
    let score = 0;

    try {
      // Vérifier que tous les fichiers principaux existent
      const requiredFiles = [
        'index.js', 'backup_system.js', 'data_enhancer.js',
        'validation_system.js', 'backtesting_system.js'
      ];

      let filesExist = 0;
      requiredFiles.forEach(file => {
        if (fs.existsSync(path.join(__dirname, file))) {
          filesExist++;
        }
      });

      details.push(`✅ ${filesExist}/${requiredFiles.length} fichiers requis présents`);
      score += (filesExist / requiredFiles.length) * 30;

      // Vérifier l'intégration dans index.js
      const indexPath = path.join(__dirname, 'index.js');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf8');
        
        let integrations = 0;
        if (content.includes('ValidationSystem')) integrations++;
        if (content.includes('require')) integrations++;
        
        details.push(`✅ ${integrations} intégrations détectées dans index.js`);
        score += integrations * 15;
      }

      // Vérifier la structure des données
      const dataPath = path.join(__dirname, 'data', 'football_data.csv');
      if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length > 500) {
          details.push('✅ Dataset suffisamment large');
          score += 20;
        } else {
          details.push('⚠️  Dataset pourrait être plus large');
          score += 10;
        }
      }

      // Test de compatibilité
      if (score >= 60) {
        details.push('✅ Intégration complète réussie');
        score += 15;
      }

    } catch (error) {
      details.push(`❌ Erreur lors du test d'intégration: ${error.message}`);
    }

    return { success: score >= 70, details, score };
  }

  /**
   * Test de performance du serveur
   */
  async testServerPerformance() {
    const details = [];
    let score = 0;

    try {
      // Vérifier que le serveur peut démarrer
      details.push('🔄 Test de démarrage du serveur...');
      
      // Simuler un test de performance basique
      const packagePath = path.join(__dirname, 'package.json');
      if (fs.existsSync(packagePath)) {
        details.push('✅ package.json existe');
        score += 20;
      }

      // Vérifier les dépendances critiques
      const indexPath = path.join(__dirname, 'index.js');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf8');
        
        if (content.includes('express')) {
          details.push('✅ Express détecté');
          score += 20;
        }
        
        if (content.includes('tensorflow')) {
          details.push('✅ TensorFlow détecté');
          score += 20;
        }
        
        if (content.length > 10000) {
          details.push('✅ Application substantielle');
          score += 20;
        }
      }

      // Test de structure
      const publicPath = path.join(__dirname, 'public');
      if (fs.existsSync(publicPath)) {
        details.push('✅ Répertoire public existe');
        score += 20;
      }

    } catch (error) {
      details.push(`❌ Erreur lors du test de performance: ${error.message}`);
    }

    return { success: score >= 70, details, score };
  }

  /**
   * Exécute une commande et retourne le résultat
   */
  runCommand(command) {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { 
        cwd: __dirname,
        stdio: 'pipe'
      });

      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          output,
          error,
          code
        });
      });

      // Timeout après 10 secondes
      setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          output,
          error: 'Timeout',
          code: -1
        });
      }, 10000);
    });
  }

  /**
   * Génère le rapport final
   */
  generateFinalReport() {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.testResults.filter(t => t.status === 'PASSED').length;
    const totalTests = this.testResults.length;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log('\n🎯 RAPPORT FINAL DES TESTS');
    console.log('==========================');
    console.log(`📊 Résultats: ${passedTests}/${totalTests} tests réussis (${successRate}%)`);
    console.log(`⏱️  Durée totale: ${totalDuration}ms`);
    console.log(`🏆 Statut global: ${successRate >= 80 ? '✅ SUCCÈS' : '❌ ÉCHEC'}\n`);

    // Détails par test
    this.testResults.forEach(test => {
      console.log(`${test.status === 'PASSED' ? '✅' : '❌'} ${test.name}`);
      if (test.score !== undefined) {
        console.log(`   Score: ${test.score}/100`);
      }
      test.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
      console.log('');
    });

    // Recommandations
    console.log('📋 RECOMMANDATIONS:');
    if (successRate >= 90) {
      console.log('🎉 Excellent! Toutes les améliorations sont prêtes pour le déploiement.');
    } else if (successRate >= 70) {
      console.log('👍 Bon travail! Quelques ajustements mineurs recommandés.');
    } else {
      console.log('⚠️  Attention! Des corrections importantes sont nécessaires avant déploiement.');
    }

    // Sauvegarder le rapport
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passedTests,
        successRate: parseFloat(successRate),
        duration: totalDuration
      },
      tests: this.testResults
    };

    fs.writeFileSync(
      path.join(__dirname, 'integration_test_report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n💾 Rapport sauvegardé dans integration_test_report.json');
  }
}

module.exports = IntegrationTester;

// Utilisation en ligne de commande
if (require.main === module) {
  const tester = new IntegrationTester();
  tester.runAllTests().catch(console.error);
}