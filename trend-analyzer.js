/**
 * Analyseur de tendances sportives avancé
 * Détecte et analyse les patterns et tendances dans les données sportives
 */
class TrendAnalyzer {
  constructor() {
    this.historicalData = new Map();
    this.trendPatterns = new Map();
    this.seasonalFactors = new Map();
    this.teamPerformanceHistory = new Map();
    this.competitionTrends = new Map();
    this.timeBasedTrends = new Map();
  }

  /**
   * Analyse les tendances principales d'un match
   */
  analyzeTrends(matchData, historicalMatches = []) {
    try {
      const trends = {
        scoringTrends: this.analyzeScoring(matchData, historicalMatches),
        defensiveTrends: this.analyzeDefense(matchData, historicalMatches),
        formTrends: this.analyzeForm(matchData, historicalMatches),
        seasonalTrends: this.analyzeSeasonalPatterns(matchData),
        competitionTrends: this.analyzeCompetitionTrends(matchData),
        timeBasedTrends: this.analyzeTimeBasedTrends(matchData),
        overallTrendScore: 0,
        trendConfidence: 0,
        keyInsights: []
      };

      // Calculer le score global des tendances
      trends.overallTrendScore = this.calculateOverallTrendScore(trends) || 50;
      trends.trendConfidence = this.calculateTrendConfidence(trends) || 60;
      trends.keyInsights = this.generateKeyInsights(trends) || [];

      return trends;
    } catch (error) {
      console.warn('Erreur lors de l\'analyse des tendances:', error.message);
      return {
        scoringTrends: {},
        defensiveTrends: {},
        formTrends: {},
        seasonalTrends: {},
        competitionTrends: {},
        timeBasedTrends: {},
        overallTrendScore: 50,
        trendConfidence: 60,
        keyInsights: []
      };
    }
  }

  /**
   * Analyse les tendances de marquage
   */
  analyzeScoring(matchData, historicalMatches) {
    const scoringTrend = {
      averageGoalsPerMatch: 0,
      goalTrend: 'stable', // increasing, decreasing, stable
      highScoringProbability: 0,
      bttsConsistency: 0,
      firstHalfGoalTrend: 0,
      confidence: 0
    };

    // Analyser les données historiques si disponibles
    if (historicalMatches.length > 0) {
      const totalGoals = historicalMatches.reduce((sum, match) => {
        return sum + (match.homeGoals || 0) + (match.awayGoals || 0);
      }, 0);
      scoringTrend.averageGoalsPerMatch = totalGoals / historicalMatches.length;

      // Analyser la tendance des buts
      const recentMatches = historicalMatches.slice(-5);
      const olderMatches = historicalMatches.slice(0, -5);
      
      if (recentMatches.length > 0 && olderMatches.length > 0) {
        const recentAvg = recentMatches.reduce((sum, match) => 
          sum + (match.homeGoals || 0) + (match.awayGoals || 0), 0) / recentMatches.length;
        const olderAvg = olderMatches.reduce((sum, match) => 
          sum + (match.homeGoals || 0) + (match.awayGoals || 0), 0) / olderMatches.length;
        
        if (recentAvg > olderAvg * 1.1) {
          scoringTrend.goalTrend = 'increasing';
        } else if (recentAvg < olderAvg * 0.9) {
          scoringTrend.goalTrend = 'decreasing';
        }
      }
    }

    // Utiliser les données actuelles du match
    scoringTrend.highScoringProbability = (matchData.goalProb || 0.5) * 100;
    scoringTrend.bttsConsistency = matchData.bttsProb || 50;
    scoringTrend.firstHalfGoalTrend = matchData.firstHalfGoalProb || 50;

    // Calculer la confiance
    scoringTrend.confidence = this.calculateScoringConfidence(scoringTrend, historicalMatches);

    return scoringTrend;
  }

  /**
   * Analyse les tendances défensives
   */
  analyzeDefense(matchData, historicalMatches) {
    const defensiveTrend = {
      cleanSheetFrequency: 0,
      defensiveStability: 'medium', // strong, medium, weak
      concededGoalsAverage: 0,
      defensiveTrend: 'stable', // improving, declining, stable
      confidence: 0
    };

    // Analyser les clean sheets
    const team1Clean = matchData.team1Clean || 30;
    const team2Clean = matchData.team2Clean || 30;
    defensiveTrend.cleanSheetFrequency = (team1Clean + team2Clean) / 2;

    // Déterminer la stabilité défensive
    if (defensiveTrend.cleanSheetFrequency > 40) {
      defensiveTrend.defensiveStability = 'strong';
    } else if (defensiveTrend.cleanSheetFrequency < 25) {
      defensiveTrend.defensiveStability = 'weak';
    }

    // Analyser les données historiques
    if (historicalMatches.length > 0) {
      const totalConceded = historicalMatches.reduce((sum, match) => {
        return sum + (match.awayGoals || 0) + (match.homeGoals || 0);
      }, 0);
      defensiveTrend.concededGoalsAverage = totalConceded / (historicalMatches.length * 2);

      // Analyser la tendance défensive
      const recentMatches = historicalMatches.slice(-5);
      const olderMatches = historicalMatches.slice(0, -5);
      
      if (recentMatches.length > 0 && olderMatches.length > 0) {
        const recentConceded = recentMatches.reduce((sum, match) => 
          sum + (match.awayGoals || 0) + (match.homeGoals || 0), 0) / (recentMatches.length * 2);
        const olderConceded = olderMatches.reduce((sum, match) => 
          sum + (match.awayGoals || 0) + (match.homeGoals || 0), 0) / (olderMatches.length * 2);
        
        if (recentConceded < olderConceded * 0.9) {
          defensiveTrend.defensiveTrend = 'improving';
        } else if (recentConceded > olderConceded * 1.1) {
          defensiveTrend.defensiveTrend = 'declining';
        }
      }
    }

    defensiveTrend.confidence = this.calculateDefensiveConfidence(defensiveTrend, historicalMatches);

    return defensiveTrend;
  }

  /**
   * Analyse les tendances de forme
   */
  analyzeForm(matchData, historicalMatches) {
    const formTrend = {
      team1FormScore: 0,
      team2FormScore: 0,
      formDifference: 0,
      formTrend: 'balanced', // team1_advantage, team2_advantage, balanced
      momentum: 'neutral', // positive, negative, neutral
      confidence: 0
    };

    // Calculer les scores de forme
    formTrend.team1FormScore = this.calculateFormScore(matchData.team1Form || 'WWDWW');
    formTrend.team2FormScore = this.calculateFormScore(matchData.team2Form || 'WWDWW');
    formTrend.formDifference = Math.abs(formTrend.team1FormScore - formTrend.team2FormScore);

    // Déterminer l'avantage de forme
    if (formTrend.formDifference > 0.2) {
      if (formTrend.team1FormScore > formTrend.team2FormScore) {
        formTrend.formTrend = 'team1_advantage';
      } else {
        formTrend.formTrend = 'team2_advantage';
      }
    }

    // Analyser le momentum
    const avgForm = (formTrend.team1FormScore + formTrend.team2FormScore) / 2;
    if (avgForm > 0.7) {
      formTrend.momentum = 'positive';
    } else if (avgForm < 0.4) {
      formTrend.momentum = 'negative';
    }

    formTrend.confidence = this.calculateFormConfidence(formTrend, historicalMatches);

    return formTrend;
  }

  /**
   * Analyse les patterns saisonniers
   */
  analyzeSeasonalPatterns(matchData) {
    const currentMonth = new Date().getMonth();
    const seasonalTrend = {
      season: this.getCurrentSeason(currentMonth),
      seasonalFactor: 0,
      expectedPerformance: 'normal', // high, normal, low
      seasonalAdjustment: 0,
      confidence: 0
    };

    // Facteurs saisonniers
    const seasonalFactors = {
      'early_season': { factor: 0.8, performance: 'high' },
      'mid_season': { factor: 1.0, performance: 'normal' },
      'late_season': { factor: 0.9, performance: 'normal' },
      'end_season': { factor: 0.7, performance: 'low' }
    };

    const currentSeasonData = seasonalFactors[seasonalTrend.season];
    seasonalTrend.seasonalFactor = currentSeasonData.factor;
    seasonalTrend.expectedPerformance = currentSeasonData.performance;
    seasonalTrend.seasonalAdjustment = (currentSeasonData.factor - 1) * 10; // Pourcentage d'ajustement

    seasonalTrend.confidence = 75; // Confiance modérée pour les patterns saisonniers

    return seasonalTrend;
  }

  /**
   * Analyse les tendances de compétition
   */
  analyzeCompetitionTrends(matchData) {
    const competitionTrend = {
      competitionType: this.identifyCompetition(matchData.match || ''),
      competitionFactor: 0,
      intensityLevel: 'medium', // high, medium, low
      pressureLevel: 'normal', // high, normal, low
      confidence: 0
    };

    // Facteurs de compétition
    const competitionFactors = {
      'champions_league': { factor: 1.2, intensity: 'high', pressure: 'high' },
      'premier_league': { factor: 1.1, intensity: 'high', pressure: 'high' },
      'la_liga': { factor: 1.1, intensity: 'high', pressure: 'high' },
      'bundesliga': { factor: 1.0, intensity: 'medium', pressure: 'normal' },
      'serie_a': { factor: 1.0, intensity: 'medium', pressure: 'normal' },
      'league_one': { factor: 0.9, intensity: 'medium', pressure: 'normal' },
      'other': { factor: 0.8, intensity: 'low', pressure: 'low' }
    };

    const competitionData = competitionFactors[competitionTrend.competitionType] || competitionFactors['other'];
    competitionTrend.competitionFactor = competitionData.factor;
    competitionTrend.intensityLevel = competitionData.intensity;
    competitionTrend.pressureLevel = competitionData.pressure;

    competitionTrend.confidence = 70;

    return competitionTrend;
  }

  /**
   * Analyse les tendances temporelles
   */
  analyzeTimeBasedTrends(matchData) {
    const timeBasedTrend = {
      matchTime: matchData.time || '15:00',
      timeCategory: 'afternoon', // morning, afternoon, evening, night
      timeFactor: 0,
      expectedIntensity: 'normal', // high, normal, low
      confidence: 0
    };

    const hour = parseInt(timeBasedTrend.matchTime.split(':')[0]);
    
    // Catégoriser le temps
    if (hour < 12) {
      timeBasedTrend.timeCategory = 'morning';
      timeBasedTrend.timeFactor = 0.9;
      timeBasedTrend.expectedIntensity = 'low';
    } else if (hour < 17) {
      timeBasedTrend.timeCategory = 'afternoon';
      timeBasedTrend.timeFactor = 1.0;
      timeBasedTrend.expectedIntensity = 'normal';
    } else if (hour < 21) {
      timeBasedTrend.timeCategory = 'evening';
      timeBasedTrend.timeFactor = 1.1;
      timeBasedTrend.expectedIntensity = 'high';
    } else {
      timeBasedTrend.timeCategory = 'night';
      timeBasedTrend.timeFactor = 1.05;
      timeBasedTrend.expectedIntensity = 'normal';
    }

    timeBasedTrend.confidence = 60;

    return timeBasedTrend;
  }

  /**
   * Calcule le score global des tendances
   */
  calculateOverallTrendScore(trends) {
    const weights = {
      scoring: 0.3,
      defensive: 0.25,
      form: 0.25,
      seasonal: 0.1,
      competition: 0.05,
      timeBased: 0.05
    };

    let totalScore = 0;
    totalScore += this.normalizeTrendScore(trends.scoringTrends) * weights.scoring;
    totalScore += this.normalizeTrendScore(trends.defensiveTrends) * weights.defensive;
    totalScore += this.normalizeTrendScore(trends.formTrends) * weights.form;
    totalScore += this.normalizeTrendScore(trends.seasonalTrends) * weights.seasonal;
    totalScore += this.normalizeTrendScore(trends.competitionTrends) * weights.competition;
    totalScore += this.normalizeTrendScore(trends.timeBasedTrends) * weights.timeBased;

    return Math.round(totalScore * 100);
  }

  /**
   * Calcule la confiance globale des tendances
   */
  calculateTrendConfidence(trends) {
    const confidences = [
      trends.scoringTrends.confidence,
      trends.defensiveTrends.confidence,
      trends.formTrends.confidence,
      trends.seasonalTrends.confidence,
      trends.competitionTrends.confidence,
      trends.timeBasedTrends.confidence
    ];

    return Math.round(confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length);
  }

  /**
   * Génère des insights clés basés sur les tendances
   */
  generateKeyInsights(trends) {
    const insights = [];

    // Insights sur le scoring
    if (trends.scoringTrends.goalTrend === 'increasing') {
      insights.push("Tendance offensive à la hausse - Probabilité de buts élevée");
    }
    if (trends.scoringTrends.bttsConsistency > 70) {
      insights.push("Forte probabilité que les deux équipes marquent");
    }

    // Insights défensifs
    if (trends.defensiveTrends.defensiveStability === 'strong') {
      insights.push("Défenses solides - Match potentiellement serré");
    }
    if (trends.defensiveTrends.defensiveTrend === 'declining') {
      insights.push("Défenses en baisse - Opportunité pour les attaquants");
    }

    // Insights de forme
    if (trends.formTrends.formTrend !== 'balanced') {
      const advantage = trends.formTrends.formTrend === 'team1_advantage' ? 'équipe domicile' : 'équipe extérieure';
      insights.push(`Avantage de forme pour l'${advantage}`);
    }

    // Insights saisonniers
    if (trends.seasonalTrends.expectedPerformance === 'high') {
      insights.push("Période favorable - Performances attendues élevées");
    }

    // Insights de compétition
    if (trends.competitionTrends.intensityLevel === 'high') {
      insights.push("Match de haute intensité - Enjeux importants");
    }

    return insights;
  }

  // Fonctions utilitaires
  calculateFormScore(form) {
    if (!form || typeof form !== 'string') return 0.5;
    return form.split('').reduce((acc, res) => {
      return acc + (res === 'W' ? 1 : res === 'D' ? 0.5 : 0);
    }, 0) / form.length;
  }

  getCurrentSeason(month) {
    if (month >= 7 && month <= 10) return 'early_season';
    if (month >= 11 || month <= 1) return 'mid_season';
    if (month >= 2 && month <= 4) return 'late_season';
    return 'end_season';
  }

  identifyCompetition(matchUrl) {
    if (matchUrl.includes('champions')) return 'champions_league';
    if (matchUrl.includes('premier')) return 'premier_league';
    if (matchUrl.includes('la-liga')) return 'la_liga';
    if (matchUrl.includes('bundesliga')) return 'bundesliga';
    if (matchUrl.includes('serie-a')) return 'serie_a';
    if (matchUrl.includes('league-1')) return 'league_one';
    return 'other';
  }

  normalizeTrendScore(trendData) {
    // Normalise les données de tendance entre 0 et 1
    if (!trendData || !trendData.confidence) return 0.5;
    return trendData.confidence / 100;
  }

  calculateScoringConfidence(scoringTrend, historicalMatches) {
    let confidence = 60; // Base
    if (historicalMatches.length > 10) confidence += 15;
    if (scoringTrend.goalTrend !== 'stable') confidence += 10;
    if (scoringTrend.bttsConsistency > 60) confidence += 10;
    return Math.min(95, confidence);
  }

  calculateDefensiveConfidence(defensiveTrend, historicalMatches) {
    let confidence = 55; // Base
    if (historicalMatches.length > 10) confidence += 15;
    if (defensiveTrend.defensiveStability !== 'medium') confidence += 15;
    if (defensiveTrend.defensiveTrend !== 'stable') confidence += 10;
    return Math.min(95, confidence);
  }

  calculateFormConfidence(formTrend, historicalMatches) {
    let confidence = 70; // Base plus élevée car la forme est plus fiable
    if (formTrend.formDifference > 0.3) confidence += 15;
    if (formTrend.momentum !== 'neutral') confidence += 10;
    return Math.min(95, confidence);
  }

  /**
   * Met à jour les données historiques pour améliorer les analyses futures
   */
  updateHistoricalData(matchId, matchResult) {
    if (!this.historicalData.has(matchId)) {
      this.historicalData.set(matchId, []);
    }
    this.historicalData.get(matchId).push({
      ...matchResult,
      timestamp: Date.now()
    });

    // Garder seulement les 50 derniers matchs pour chaque équipe
    if (this.historicalData.get(matchId).length > 50) {
      this.historicalData.get(matchId).shift();
    }
  }

  /**
   * Obtient les données historiques pour une équipe ou un match
   */
  getHistoricalData(identifier) {
    return this.historicalData.get(identifier) || [];
  }
}

module.exports = TrendAnalyzer;