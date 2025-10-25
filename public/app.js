document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
    // Référence aux éléments DOM
    const analyzeBtn = document.getElementById('analyze-btn');
    const generateCouponsBtn = document.getElementById('generate-coupons-btn');
    const dateSelector = document.getElementById('date');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('results');
    const tableBody = document.querySelector('#results-table tbody');
    const noResults = document.getElementById('no-results');
    
    resultsSection.style.display = 'none';
    noResults.style.display = 'none';
    
    // Définir la date par défaut à aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    dateSelector.value = today;
    
    // Gestionnaire d'événement pour le bouton Analyser
    analyzeBtn.addEventListener('click', function() {
        const selectedDate = dateSelector.value;
    
        // Afficher l'indicateur de chargement
        loading.style.display = 'block';
        resultsSection.style.display = 'none';
        noResults.style.display = 'none';
        tableBody.innerHTML = '';
    
        fetch('/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate }) }).then(response => response.json())
            .then(data => {
                // Masquer l'indicateur de chargement
                loading.style.display = 'none';
    
                if (data.error) {
                    alert('Erreur lors de l\'analyse: ' + data.error);
                    return;
                }
    
                let resultsData = data.results || data;
    
                if (!Array.isArray(resultsData)) {
                    alert('Erreur lors de l\'analyse: Données invalides');
                    return;
                }
    
                // Obtenir l'heure actuelle pour filtrer les matchs non joués
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentDate = now.toISOString().split('T')[0];
    
                // Filtrer les matchs qui n'ont pas encore été joués
                let filteredMatches = resultsData;
                // Appliquer le filtre de probabilité
                filteredMatches = filteredMatches.filter(item => item.correctScoreProb < 50);
                // Trier par probabilité Lay décroissante (du plus élevé au plus faible)
                filteredMatches.sort((a, b) => {
                    const layProbA = 100 - a.correctScoreProb;
                    const layProbB = 100 - b.correctScoreProb;
                    return layProbB - layProbA;
                });
                const noResults = document.getElementById('no-results');
                const resultsSection = document.getElementById('results');
    
                if (data.length === 0) {
                    noResults.textContent = 'Aucun match trouvé pour cette date. Essayez aujourd\'hui ou demain.';
                    noResults.style.display = 'block';
                } else {
                    if (filteredMatches.length > 0) {
                        resultsSection.style.display = 'block';
                        displayResults(filteredMatches);
                    } else {
                        noResults.textContent = 'Aucun match avec probabilité de score correct inférieure à 50%. Vérifiez les résultats VIP pour plus d\'options.';
                        noResults.style.display = 'block';
                    }
                }
            })
            .catch(error => {
                loading.style.display = 'none';
                alert('Erreur: ' + error.message);
            });
    });
    // Fonction pour afficher les résultats dans le tableau
function getProbColor(value) {
  if (value > 70) return 'prob-green';
  else if (value > 40) return 'prob-yellow';
  else return 'prob-red';
}

function displayResults(data) {
        tableBody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            
            // Extraire correctement les noms d'équipes de l'URL
            const urlParts = item.match.match(/analysis-(.+?)-betting-tip/);
            const matchSlug = urlParts ? urlParts[1] : 'Inconnu';
            const matchName = matchSlug.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            
            // Calculer layProb en toute sécurité
            const correctScoreProb = item.correctScoreProb ?? 0;
            const layProb = 100 - correctScoreProb;
            
            // Valeurs sécurisées
            const goalProbValue = item.goalProb ? (item.goalProb * 100).toFixed(2) : 'N/A';
            const over15ProbValue = item.over15Prob ? item.over15Prob.toFixed(2) : 'N/A';
            const firstHalfGoalProbValue = item.firstHalfGoalProb ? item.firstHalfGoalProb.toFixed(2) : 'N/A';
            const bttsProbValue = item.bttsProb ? item.bttsProb.toFixed(2) : 'N/A';
            
            row.innerHTML = `
                <td>${matchName}</td>
                <td>${item.time || 'N/A'}</td>
                <td>${item.correctScore || 'N/A'}</td>
                <td>${correctScoreProb.toFixed(2)}%</td>
                <td>${layProb.toFixed(2)}%</td>
                <td>${bttsProbValue}%</td>
                <td class="${getProbColor(item.goalProb * 100 || 0)}">${goalProbValue}%</td>
                <td>${firstHalfGoalProbValue}%</td>
                <td class="${getProbColor(item.over15Prob || 0)}">${over15ProbValue}%</td>
                <td>${item.over15Odds || 'N/A'}</td>
                <td>${item.date || 'N/A'}</td>
            `;
            tableBody.appendChild(row);
        });
        
        makeTableSortable();
    // Stocker data pour export
    window.currentData = data;

    // Ajouter dynamiquement le bouton VIP
    const vipBtn = document.createElement('button');
    vipBtn.id = 'vip-btn';
    vipBtn.textContent = 'Voir Résultats VIP';
    resultsSection.appendChild(vipBtn);
    
    vipBtn.addEventListener('click', async function() {
        const selectedDate = dateSelector.value;
        
        try {
            const response = await fetch('/analyze-vip?date=' + selectedDate);
            if (!response.ok) {
                throw new Error('Erreur lors de la récupération des résultats VIP');
            }
            const data = await response.json();
            
            // Trier les données par probabilité (weightedScore) et limiter à 15 prédictions
            const sortedData = data.sort((a, b) => b.weightedScore - a.weightedScore).slice(0, 15);
            
            // Afficher dans le tableau VIP
            const vipTableBody = document.querySelector('#vip-table tbody');
            vipTableBody.innerHTML = '';
            sortedData.forEach(item => {
                const row = document.createElement('tr');
                const urlParts = item.match.match(/analysis-(.+?)-betting-tip/);
                const matchSlug = urlParts ? urlParts[1] : 'Inconnu';
                const matchName = matchSlug.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                
                const correctScoreProb = item.correctScoreProb ?? 0;
                const layProb = 100 - correctScoreProb;
                
                const goalProbValue = item.goalProb ? (item.goalProb * 100).toFixed(2) : 'N/A';
                const over15ProbValue = item.over15Prob ? item.over15Prob.toFixed(2) : 'N/A';
                const firstHalfGoalProbValue = item.firstHalfGoalProb ? item.firstHalfGoalProb.toFixed(2) : 'N/A';
                const bttsProbValue = item.bttsProb ? item.bttsProb.toFixed(2) : 'N/A';
                const weightedScoreValue = item.weightedScore ? (item.weightedScore * 100).toFixed(2) : 'N/A';
                
                row.innerHTML = `
                    <td>${matchName}</td>
                    <td>${item.time || 'N/A'}</td>
                    <td>${item.correctScore || 'N/A'}</td>
                    <td>${correctScoreProb.toFixed(2)}%</td>
                    <td>${layProb.toFixed(2)}%</td>
                    <td>${bttsProbValue}%</td>
                    <td class="${getColorClass(item.goalProb * 100 || 0)}">${goalProbValue}%</td>
                    <td>${firstHalfGoalProbValue}%</td>
                    <td class="${getColorClass(item.over15Prob || 0)}">${over15ProbValue}%</td>
                    <td>${item.over15Odds || 'N/A'}</td>
                    <td>${weightedScoreValue}%</td>
                    <td>${item.date || 'N/A'}</td>
                `;
                vipTableBody.appendChild(row);
            });
    
            document.getElementById('vip-results').style.display = 'block';
        } catch (error) {
            console.error('Erreur VIP:', error);
            alert('Erreur lors du chargement des résultats VIP: ' + error.message);
        }
    });
}
    
    function makeTableSortable() {
        const table = document.getElementById('results-table');
        const headers = table.querySelectorAll('th');
        
        headers.forEach((header, index) => {
            header.addEventListener('click', () => {
                const rows = Array.from(tableBody.querySelectorAll('tr'));
                const isTime = index === 1;
                const isNumeric = index === 3 || index === 4 || index === 5 || index === 6;
                
                // Déterminer l'ordre de tri (ascendant ou descendant)
                const currentOrder = header.getAttribute('data-order') || 'asc';
                const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
                
                // Réinitialiser l'ordre de tri et classes pour tous les en-têtes
                headers.forEach(h => {
                    h.removeAttribute('data-order');
                    h.classList.remove('sorted-asc', 'sorted-desc');
                });
                header.setAttribute('data-order', newOrder);
                header.classList.add(newOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
                
                // Trier les lignes
                rows.sort((a, b) => {
                    const cellA = a.cells[index].textContent.trim();
                    const cellB = b.cells[index].textContent.trim();
                    
                    if (isTime) {
                        const timeToMinutes = (time) => time === 'N/A' ? 0 : time.split(':').reduce((acc, t) => 60 * acc + +t, 0);
                        const timeA = timeToMinutes(cellA);
                        const timeB = timeToMinutes(cellB);
                        return newOrder === 'asc' ? timeA - timeB : timeB - timeA;
                    } else if (isNumeric) {
                        const numA = parseFloat(cellA.replace('%', ''));
                        const numB = parseFloat(cellB.replace('%', ''));
                        return newOrder === 'asc' ? numA - numB : numB - numA;
                    } else {
                        return newOrder === 'asc' 
                            ? cellA.localeCompare(cellB) 
                            : cellB.localeCompare(cellA);
                    }
                });
                
                // Réorganiser les lignes dans le tableau
                rows.forEach(row => tableBody.appendChild(row));
            });
            
            // Ajouter un style pour indiquer que l'en-tête est cliquable
            header.style.cursor = 'pointer';
            header.title = 'Cliquer pour trier';
        });
    }
    
    // Fonction pour exporter les données en CSV
    function exportToCSV() {
        if (!window.currentData) return;
        const data = window.currentData;
        let csvContent = 'Match,Heure,Score Correct,Probabilité Score Correct,Probabilité Lay,Probabilité BTTS,Probabilité de But,Prob. But 1ère MT (IA),Date\n';
        
        data.forEach(item => {
            const urlParts = item.match.match(/analysis-(.+?)-betting-tip/);
            const matchSlug = urlParts ? urlParts[1] : 'Inconnu';
            const matchName = matchSlug.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            
            // Calculer layProb
            const layProb = 100 - item.correctScoreProb;
            
            csvContent += `"${matchName}","${item.time || 'N/A'}","${item.correctScore}","${item.correctScoreProb.toFixed(2)}%","${layProb.toFixed(2)}%","${item.bttsProb.toFixed(2)}%","${(item.goalProb * 100).toFixed(2)}%","${item.firstHalfGoalProb.toFixed(2)}%","${item.date}"\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `predictions_${dateSelector.value}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // Nouvelle fonction pour déterminer la classe de couleur basée sur le pourcentage
    function getColorClass(prob) {
    const value = parseFloat(prob);
    if (value < 40) return 'low-prob';
    else if (value < 70) return 'medium-prob';
    else return 'high-prob';
    }
    
    // Gestionnaire d'événement pour le bouton Générer Coupons VIP
    generateCouponsBtn.addEventListener('click', function() {
        const selectedDate = dateSelector.value;
        generateCoupons(selectedDate);
    });
    
    // Gestion des liens de navigation
    document.querySelector('nav a[href="#home"]').addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo(0, 0);
});
document.querySelector('nav a[href="#controls"]').addEventListener('click', (e) => {
  e.preventDefault();
  analyzeBtn.click();
});
document.querySelector('nav a[href="#vip-results"]').addEventListener('click', (e) => {
  e.preventDefault();
  loadVIPResults(dateSelector.value);
});


    // Logique de paiement déplacée vers subscriptions.js

    // Charger le compteur de visites
    fetch('/visit-count')
      .then(response => response.json())
      .then(data => {
        const visitCountElement = document.getElementById('visit-count');
        if (visitCountElement) {
          visitCountElement.innerText = data.count;
        }
      })
      .catch(error => console.error('Error fetching visit count:', error));
});


let vipData = [];

function loadVIPResults(date) {
  fetch('/analyze-vip?date=' + date)
    .then(response => response.json())
    .then(data => {
      vipData = data;
      displayVIPResults(data);
    })
    .catch(error => console.error('Erreur lors du chargement des résultats VIP:', error));
}

function displayVIPResults(results) {
  const vipResults = document.getElementById('vip-results');
  vipResults.style.display = 'block'; // Ajouter pour montrer la section
  vipResults.innerHTML = '';
  results.forEach(match => {
    let rowClass = '';
    let icon = '';
    if (match.certaintyLevel === 'Très sûre') {
      rowClass = 'very-safe';
    } else if (match.certaintyLevel === 'Sûre') {
      rowClass = 'safe';
    } else if (match.certaintyLevel === 'Moyenne') {
      rowClass = 'medium';
    } else if (match.certaintyLevel === 'Risquée') {
      rowClass = 'risky';
    } else if (match.certaintyLevel === 'Très risquée') {
      rowClass = 'very-risky';
    }
    const row = document.createElement('tr');
    row.className = rowClass;
    
    const correctScoreProb = match.correctScoreProb ?? 0;
    const bttsProb = match.bttsProb ?? 0;
    const goalProb = match.goalProb ?? 0;
    const firstHalfGoalProb = match.firstHalfGoalProb ?? 0;
    const weightedScore = match.weightedScore ?? 0;
    
    row.innerHTML = `
      <td>${match.match || 'N/A'}</td>
      <td>${match.time || 'N/A'}</td>
      <td>${match.correctScore || 'N/A'}</td>
      <td>${correctScoreProb.toFixed(2)}%</td>
      <td>${bttsProb.toFixed(2)}%</td>
      <td>${goalProb.toFixed(2)}%</td>
      <td>${firstHalfGoalProb.toFixed(2)}%</td>
      <td>${weightedScore.toFixed(2)}%</td>
      <td>${match.date || 'N/A'}</td>
    `;
    vipResults.appendChild(row);
  });
}

function loadPastVIPResults() {
  const pastSection = document.getElementById('past-vip-results');
  pastSection.style.display = 'block';
  
  fetch('/past-vip-results')
    .then(response => {
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des résultats passés');
      }
      return response.json();
    })
    .then(data => {
      console.log('Données des résultats VIP passés reçues:', data);
      const tableBody = document.querySelector('#past-vip-table tbody');
      tableBody.innerHTML = '';
      
      data.forEach(item => {
        const urlParts = item.match.match(/analysis-(.+?)-betting-tip/);
        const matchSlug = urlParts ? urlParts[1] : 'Inconnu';
        const matchName = matchSlug.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        
        const correctScoreProb = item.correctScoreProb ?? 0;
        const layProb = 100 - correctScoreProb;
        
        const bttsProbValue = item.bttsProb ? item.bttsProb.toFixed(2) : 'N/A';
        const goalProbValue = item.goalProb ? item.goalProb.toFixed(2) : 'N/A';
        const firstHalfGoalProbValue = item.firstHalfGoalProb ? item.firstHalfGoalProb.toFixed(2) : 'N/A';
        const weightedScoreValue = item.weightedScore ? item.weightedScore.toFixed(2) : 'N/A';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${matchName}</td>
          <td>${item.date || 'N/A'}</td>
          <td>${item.time || 'N/A'}</td>
          <td>${item.actualScore || 'N/A'}</td>
          <td>${item.correctScore || 'N/A'}</td>
          <td>${correctScoreProb.toFixed(2)}%</td>
          <td>${layProb.toFixed(2)}%</td>
          <td>${bttsProbValue}%</td>
          <td>${goalProbValue}%</td>
          <td>${firstHalfGoalProbValue}%</td>
          <td>${weightedScoreValue}%</td>
        `;
        tableBody.appendChild(row);
      });
      
      if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10">Aucun résultat disponible pour les jours passés.</td></tr>';
      }
    })
    .catch(error => {
      console.error('Erreur lors du chargement des résultats VIP passés:', error);
      const tableBody = document.querySelector('#past-vip-table tbody');
      tableBody.innerHTML = '<tr><td colspan="10">Erreur lors du chargement des données.</td></tr>';
    });
}

// Mettre à jour makeTableSortable pour accepter un ID de table
function makeTableSortable(tableId = '#results-table') {
  const table = document.querySelector(tableId);
  const headers = table.querySelectorAll('th');
  
  headers.forEach((header, index) => {
    header.addEventListener('click', () => {
      const rows = Array.from(table.querySelector('tbody').querySelectorAll('tr'));
      const isTime = index === 2; // Ajuster selon les colonnes
      const isNumeric = [5,6,7,8,9].includes(index); // Ajuster
      
      const currentOrder = header.getAttribute('data-order') || 'asc';
      const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
      
      headers.forEach(h => {
        h.removeAttribute('data-order');
        h.classList.remove('sorted-asc', 'sorted-desc');
      });
      header.setAttribute('data-order', newOrder);
      header.classList.add(newOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
      
      rows.sort((a, b) => {
        const cellA = a.cells[index].textContent.trim();
        const cellB = b.cells[index].textContent.trim();
        
        if (isTime) {
          const timeToMinutes = (time) => time === 'N/A' ? 0 : time.split(':').reduce((acc, t) => 60 * acc + +t, 0);
          const timeA = timeToMinutes(cellA);
          const timeB = timeToMinutes(cellB);
          return newOrder === 'asc' ? timeA - timeB : timeB - timeA;
        } else if (isNumeric) {
          const numA = parseFloat(cellA.replace('%', ''));
          const numB = parseFloat(cellB.replace('%', ''));
          return newOrder === 'asc' ? numA - numB : numB - numA;
        } else {
          return newOrder === 'asc' 
            ? cellA.localeCompare(cellB) 
            : cellB.localeCompare(cellA);
        }
      });
      
      rows.forEach(row => table.querySelector('tbody').appendChild(row));
    });
    
    header.style.cursor = 'pointer';
    header.title = 'Cliquer pour trier';
  });
}
// Supprimer la fonction loadPastVIPResults car elle est maintenant dans results.js

// Fonction pour générer les coupons VIP
async function generateCoupons(date) {
    const loading = document.getElementById('loading');
    const couponsSection = document.getElementById('coupons-results');
    const couponsContainer = document.getElementById('coupons-container');
    
    try {
        // Afficher l'indicateur de chargement
        loading.style.display = 'block';
        couponsSection.style.display = 'none';
        
        // Appel à l'API pour générer les coupons
        const response = await fetch(`/generate-coupons?date=${date}&confidence=Faible`);
        const data = await response.json();
        
        // Masquer l'indicateur de chargement
        loading.style.display = 'none';
        
        if (!response.ok || data.error) {
            alert('Erreur lors de la génération de coupons: ' + (data.error || 'Erreur inconnue'));
            return;
        }
        
        if (!data.coupons || data.coupons.length === 0) {
            alert('Aucun coupon n\'a pu être généré avec les critères actuels.');
            return;
        }
        
        // Afficher les coupons
        displayCoupons(data.coupons);
        couponsSection.style.display = 'block';
        
        // Faire défiler vers les résultats
        couponsSection.scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        loading.style.display = 'none';
        console.error('Erreur lors de la génération de coupons:', error);
        alert('Erreur de connexion lors de la génération de coupons.');
    }
}

// Fonction pour afficher les coupons générés
function displayCoupons(coupons) {
    const couponsContainer = document.getElementById('coupons-container');
    couponsContainer.innerHTML = '';
    
    coupons.forEach(coupon => {
        const couponCard = createCouponCard(coupon);
        couponsContainer.appendChild(couponCard);
    });
}

// Fonction pour créer une carte de coupon
function createCouponCard(coupon) {
    const card = document.createElement('div');
    card.className = 'coupon-card';
    
    // Déterminer la classe de confiance
    let confidenceClass = 'confidence-low';
    if (coupon.confidenceLevel === 'Très élevé' || coupon.confidenceLevel === 'Élevé') {
        confidenceClass = 'confidence-high';
    } else if (coupon.confidenceLevel === 'Moyen') {
        confidenceClass = 'confidence-medium';
    }
    
    card.innerHTML = `
        <div class="coupon-header">
            <div class="coupon-id">Coupon #${coupon.id}</div>
            <div class="coupon-time">${coupon.timeSlot}</div>
        </div>
        
        <div class="coupon-matches">
            ${coupon.matches.map(match => `
                <div class="match-item">
                    <div class="match-teams">${match.teams}</div>
                    <div class="match-details">
                        <span>⏰ ${match.time}</span>
                        <span>🎯 ${match.prediction}</span>
                        <span>📊 ${match.reliability.toFixed(1)}%</span>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="coupon-stats">
            <div class="stat-item">
                <div class="stat-value">${coupon.averageReliability}%</div>
                <div class="stat-label">Fiabilité Moyenne</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${coupon.combinedOdds}</div>
                <div class="stat-label">Cote Combinée</div>
            </div>
        </div>
        
        <div class="coupon-recommendation ${confidenceClass}">
            ${coupon.recommendation}
        </div>
    `;
    
    return card;
}