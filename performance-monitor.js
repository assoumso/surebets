/**
 * Module de surveillance et d'optimisation des performances
 * Surveille les métriques système et optimise automatiquement les performances
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      responseTime: [],
      memoryUsage: [],
      cpuUsage: [],
      requestCount: 0,
      errorCount: 0,
      cacheHitRate: 0,
      aiProcessingTime: [],
      predictionAccuracy: []
    };
    
    this.thresholds = {
      maxResponseTime: 5000, // 5 secondes
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      minCacheHitRate: 0.7, // 70%
      maxErrorRate: 0.05 // 5%
    };
    
    this.optimizations = {
      cacheEnabled: true,
      batchProcessing: true,
      parallelRequests: 5,
      requestThrottling: false
    };
    
    this.startMonitoring();
  }

  /**
   * Démarre la surveillance des performances
   */
  startMonitoring() {
    // Surveillance de la mémoire toutes les 30 secondes
    setInterval(() => {
      this.recordMemoryUsage();
    }, 30000);
    
    console.log('Surveillance des performances activée');
  }

  /**
   * Enregistre le temps de réponse d'une requête
   */
  recordResponseTime(startTime, endTime) {
    const responseTime = endTime - startTime;
    this.metrics.responseTime.push(responseTime);
    
    // Garder seulement les 100 dernières mesures
    if (this.metrics.responseTime.length > 100) {
      this.metrics.responseTime.shift();
    }
    
    // Optimisation automatique si nécessaire
    if (responseTime > this.thresholds.maxResponseTime) {
      this.optimizePerformance('responseTime', responseTime);
    }
  }

  /**
   * Enregistre l'utilisation de la mémoire
   */
  recordMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage.push(memUsage.heapUsed);
      
      if (this.metrics.memoryUsage.length > 100) {
        this.metrics.memoryUsage.shift();
      }
      
      if (memUsage.heapUsed > this.thresholds.maxMemoryUsage) {
        this.optimizePerformance('memory', memUsage.heapUsed);
      }
    }
  }

  /**
   * Enregistre les métriques de l'IA
   */
  recordAIMetrics(processingTime, accuracy) {
    this.metrics.aiProcessingTime.push(processingTime);
    if (accuracy !== undefined) {
      this.metrics.predictionAccuracy.push(accuracy);
    }
    
    // Garder les 50 dernières mesures
    if (this.metrics.aiProcessingTime.length > 50) {
      this.metrics.aiProcessingTime.shift();
    }
    if (this.metrics.predictionAccuracy.length > 50) {
      this.metrics.predictionAccuracy.shift();
    }
  }

  /**
   * Enregistre une erreur
   */
  recordError(error) {
    this.metrics.errorCount++;
    console.warn(`Erreur enregistrée: ${error.message}`);
    
    const errorRate = this.getErrorRate();
    if (errorRate > this.thresholds.maxErrorRate) {
      this.optimizePerformance('errorRate', errorRate);
    }
  }

  /**
   * Calcule le taux d'erreur
   */
  getErrorRate() {
    return this.metrics.requestCount > 0 ? 
      this.metrics.errorCount / this.metrics.requestCount : 0;
  }

  /**
   * Obtient les métriques moyennes
   */
  getAverageMetrics() {
    return {
      avgResponseTime: this.calculateAverage(this.metrics.responseTime),
      avgMemoryUsage: this.calculateAverage(this.metrics.memoryUsage),
      avgAIProcessingTime: this.calculateAverage(this.metrics.aiProcessingTime),
      avgPredictionAccuracy: this.calculateAverage(this.metrics.predictionAccuracy),
      errorRate: this.getErrorRate(),
      totalRequests: this.metrics.requestCount
    };
  }

  /**
   * Calcule la moyenne d'un tableau
   */
  calculateAverage(array) {
    if (array.length === 0) return 0;
    return array.reduce((sum, val) => sum + val, 0) / array.length;
  }

  /**
   * Optimise automatiquement les performances
   */
  optimizePerformance(metric, value) {
    console.log(`Optimisation automatique déclenchée pour ${metric}: ${value}`);
    
    switch (metric) {
      case 'responseTime':
        if (!this.optimizations.requestThrottling) {
          this.optimizations.requestThrottling = true;
          this.optimizations.parallelRequests = Math.max(2, this.optimizations.parallelRequests - 1);
          console.log('Limitation des requêtes activée');
        }
        break;
        
      case 'memory':
        if (this.optimizations.cacheEnabled) {
          this.clearCache();
          console.log('Cache vidé pour libérer la mémoire');
        }
        break;
        
      case 'errorRate':
        this.optimizations.parallelRequests = Math.max(1, this.optimizations.parallelRequests - 1);
        console.log('Réduction du parallélisme pour réduire les erreurs');
        break;
    }
  }

  /**
   * Vide le cache pour libérer la mémoire
   */
  clearCache() {
    // Simulation du vidage de cache
    console.log('Cache système vidé');
  }

  /**
   * Obtient les recommandations d'optimisation
   */
  getOptimizationRecommendations() {
    const metrics = this.getAverageMetrics();
    const recommendations = [];
    
    if (metrics.avgResponseTime > 3000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Temps de réponse élevé - Considérer l\'optimisation des requêtes',
        action: 'Activer le cache ou réduire la taille des lots'
      });
    }
    
    if (metrics.errorRate > 0.03) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Taux d\'erreur élevé - Vérifier la stabilité du système',
        action: 'Réduire le parallélisme ou ajouter des retry'
      });
    }
    
    if (metrics.avgPredictionAccuracy < 0.7) {
      recommendations.push({
        type: 'accuracy',
        priority: 'medium',
        message: 'Précision des prédictions faible - Améliorer le modèle IA',
        action: 'Réentraîner le modèle ou ajuster les paramètres'
      });
    }
    
    return recommendations;
  }

  /**
   * Génère un rapport de performance
   */
  generatePerformanceReport() {
    const metrics = this.getAverageMetrics();
    const recommendations = this.getOptimizationRecommendations();
    
    return {
      timestamp: new Date().toISOString(),
      metrics: metrics,
      optimizations: this.optimizations,
      recommendations: recommendations,
      status: this.getSystemStatus(metrics)
    };
  }

  /**
   * Détermine le statut du système
   */
  getSystemStatus(metrics) {
    if (metrics.errorRate > 0.05 || metrics.avgResponseTime > 5000) {
      return 'critical';
    } else if (metrics.errorRate > 0.02 || metrics.avgResponseTime > 3000) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Incrémente le compteur de requêtes
   */
  incrementRequestCount() {
    this.metrics.requestCount++;
  }
}

module.exports = PerformanceMonitor;