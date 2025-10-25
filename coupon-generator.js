/**
 * Générateur de coupons pour les résultats VIP
 * Regroupe les matchs par heures et sélectionne 2 équipes par coupon
 */

class CouponGenerator {
  constructor() {
    this.minReliabilityScore = 50; // Score minimum pour inclure un match
    this.maxTimeGap = 2; // Écart maximum en heures entre les matchs d'un coupon
  }

  /**
   * Génère des coupons basés sur les résultats VIP
   * @param {Array} vipResults - Résultats VIP analysés
   * @returns {Array} Liste des coupons générés
   */
  generateCoupons(vipResults) {
    if (!vipResults || !Array.isArray(vipResults) || vipResults.length === 0) {
      console.warn('Aucun résultat VIP disponible pour la génération de coupons');
      return [];
    }

    // Filtrer les matchs avec un score de fiabilité suffisant
    const reliableMatches = vipResults.filter(match => 
      parseFloat(match.reliabilityScore) >= this.minReliabilityScore
    );

    if (reliableMatches.length < 2) {
      console.warn('Pas assez de matchs fiables pour générer des coupons');
      return [];
    }

    // Grouper les matchs par heures
    const matchesByTime = this.groupMatchesByTime(reliableMatches);
    
    // Générer les coupons
    const coupons = this.createCoupons(matchesByTime);
    
    // Trier les coupons par score de fiabilité moyen
    coupons.sort((a, b) => b.averageReliability - a.averageReliability);

    console.log(`${coupons.length} coupons générés avec succès`);
    return coupons;
  }

  /**
   * Groupe les matchs par créneaux horaires
   * @param {Array} matches - Liste des matchs
   * @returns {Object} Matchs groupés par heures
   */
  groupMatchesByTime(matches) {
    const timeGroups = {};

    matches.forEach(match => {
      const time = match.time;
      if (!time) return;

      const hour = parseInt(time.split(':')[0]);
      
      // Créer des créneaux de 2 heures
      const timeSlot = Math.floor(hour / 2) * 2;
      const timeKey = `${timeSlot}:00-${timeSlot + 2}:00`;

      if (!timeGroups[timeKey]) {
        timeGroups[timeKey] = [];
      }
      
      timeGroups[timeKey].push({
        ...match,
        hour: hour,
        timeSlot: timeKey
      });
    });

    // Trier les matchs dans chaque groupe par score de fiabilité
    Object.keys(timeGroups).forEach(timeKey => {
      timeGroups[timeKey].sort((a, b) => 
        parseFloat(b.reliabilityScore) - parseFloat(a.reliabilityScore)
      );
    });

    return timeGroups;
  }

  /**
   * Crée les coupons à partir des groupes de matchs
   * @param {Object} matchesByTime - Matchs groupés par heures
   * @returns {Array} Liste des coupons
   */
  createCoupons(matchesByTime) {
    const coupons = [];
    let couponId = 1;

    // Générer des coupons avec 2 matchs par créneau horaire
    Object.keys(matchesByTime).forEach(timeSlot => {
      const matches = matchesByTime[timeSlot];
      
      // Créer des coupons avec les 2 meilleurs matchs de chaque créneau
      for (let i = 0; i < matches.length - 1; i += 2) {
        if (i + 1 < matches.length) {
          const match1 = matches[i];
          const match2 = matches[i + 1];
          
          const coupon = this.createCoupon(couponId++, [match1, match2], timeSlot);
          coupons.push(coupon);
        }
      }
    });

    // Générer des coupons inter-créneaux pour les meilleurs matchs
    const allMatches = Object.values(matchesByTime).flat();
    const topMatches = allMatches.slice(0, 6); // Top 6 matchs

    for (let i = 0; i < topMatches.length - 1; i++) {
      for (let j = i + 1; j < topMatches.length; j++) {
        const match1 = topMatches[i];
        const match2 = topMatches[j];
        
        // Vérifier que les matchs ne sont pas dans le même créneau
        if (match1.timeSlot !== match2.timeSlot) {
          const timeDiff = Math.abs(match1.hour - match2.hour);
          
          if (timeDiff <= this.maxTimeGap) {
            const coupon = this.createCoupon(
              couponId++, 
              [match1, match2], 
              `${Math.min(match1.hour, match2.hour)}:00-${Math.max(match1.hour, match2.hour)}:00`
            );
            coupons.push(coupon);
          }
        }
      }
    }

    return coupons;
  }

  /**
   * Crée un coupon individuel
   * @param {number} id - ID du coupon
   * @param {Array} matches - Liste des matchs (2 matchs)
   * @param {string} timeSlot - Créneau horaire
   * @returns {Object} Coupon généré
   */
  createCoupon(id, matches, timeSlot) {
    const totalReliability = matches.reduce((sum, match) => 
      sum + parseFloat(match.reliabilityScore), 0
    );
    const averageReliability = totalReliability / matches.length;

    // Calculer la cote combinée estimée
    const combinedOdds = matches.reduce((product, match) => {
      const probability = parseFloat(match.reliabilityScore) / 100;
      const odds = 1 / probability;
      return product * odds;
    }, 1);

    // Déterminer le niveau de confiance
    let confidenceLevel = 'Faible';
    if (averageReliability >= 80) {
      confidenceLevel = 'Très élevé';
    } else if (averageReliability >= 70) {
      confidenceLevel = 'Élevé';
    } else if (averageReliability >= 60) {
      confidenceLevel = 'Moyen';
    }

    return {
      id: id,
      timeSlot: timeSlot,
      matches: matches.map(match => ({
        teams: this.extractTeamNames(match.match),
        time: match.time,
        prediction: match.correctScore,
        reliability: parseFloat(match.reliabilityScore),
        certaintyLevel: match.certaintyLevel,
        bttsProb: match.bttsProb,
        goalProb: match.goalProb,
        url: match.match
      })),
      averageReliability: parseFloat(averageReliability.toFixed(2)),
      combinedOdds: parseFloat(combinedOdds.toFixed(2)),
      confidenceLevel: confidenceLevel,
      recommendation: this.generateRecommendation(matches, averageReliability),
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Extrait les noms des équipes à partir de l'URL du match
   * @param {string} matchUrl - URL du match
   * @returns {string} Noms des équipes formatés
   */
  extractTeamNames(matchUrl) {
    try {
      const urlParts = matchUrl.split('/');
      const matchPart = urlParts.find(part => part.includes('match-prediction-analysis-'));
      
      if (matchPart) {
        const teamsPart = matchPart.replace('match-prediction-analysis-', '').replace('-betting-tip-', ' vs ');
        const teams = teamsPart.split('-vs-');
        
        if (teams.length >= 2) {
          const team1 = teams[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const team2 = teams[1].split('-')[0].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `${team1} vs ${team2}`;
        }
      }
      
      return 'Équipes non identifiées';
    } catch (error) {
      console.warn('Erreur lors de l\'extraction des noms d\'équipes:', error);
      return 'Équipes non identifiées';
    }
  }

  /**
   * Génère une recommandation pour le coupon
   * @param {Array} matches - Matchs du coupon
   * @param {number} averageReliability - Fiabilité moyenne
   * @returns {string} Recommandation
   */
  generateRecommendation(matches, averageReliability) {
    if (averageReliability >= 80) {
      return 'Coupon fortement recommandé - Très haute fiabilité';
    } else if (averageReliability >= 70) {
      return 'Coupon recommandé - Bonne fiabilité';
    } else if (averageReliability >= 60) {
      return 'Coupon à considérer - Fiabilité modérée';
    } else {
      return 'Coupon risqué - Fiabilité faible';
    }
  }

  /**
   * Filtre les coupons par niveau de confiance
   * @param {Array} coupons - Liste des coupons
   * @param {string} minConfidence - Niveau de confiance minimum
   * @returns {Array} Coupons filtrés
   */
  filterByConfidence(coupons, minConfidence = 'Moyen') {
    const confidenceLevels = {
      'Faible': 1,
      'Moyen': 2,
      'Élevé': 3,
      'Très élevé': 4
    };

    const minLevel = confidenceLevels[minConfidence] || 2;

    return coupons.filter(coupon => 
      confidenceLevels[coupon.confidenceLevel] >= minLevel
    );
  }
}

module.exports = CouponGenerator;