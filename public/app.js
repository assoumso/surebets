document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
    // Référence aux éléments DOM
    const analyzeBtn = document.getElementById('analyze-btn');
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
    
        fetch('/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: selectedDate }) })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
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
                // Appliquer le filtre de probabilité\n                // filteredMatches = filteredMatches.filter(item => item.correctScoreProb < 50);
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
            
            // Calculer layProb
            const layProb = 100 - item.correctScoreProb;
            
            row.innerHTML = `
                <td>${matchName}</td>
                <td>${item.time || 'N/A'}</td>
                <td>${item.correctScore}</td>
                <td>${item.correctScoreProb.toFixed(2)}%</td>
                <td>${layProb.toFixed(2)}%</td>
                <td>${item.bttsProb.toFixed(2)}%</td>
                <td class="${getProbColor(item.goalProb * 100)}">${(item.goalProb * 100).toFixed(2)}%</td>
                <td>${item.firstHalfGoalProb.toFixed(2)}%</td>
                <td>${item.date}</td>
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
    
    vipBtn.addEventListener('click', function() {
    const selectedDate = dateSelector.value;
    loadVIPResults(selectedDate);
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
    if (!localStorage.getItem('visited')) {
      fetch('/increment-visit', { method: 'POST' })
        .then(response => {
          if (!response.ok) {
            console.warn('Failed to increment visit count:', response.status);
          }
          localStorage.setItem('visited', 'true');
          updateVisitCount();
        })
        .catch(error => console.error('Error incrementing visit count:', error));
    }
    
    // Mise à jour en temps réel du compteur toutes les 30 secondes
    setInterval(updateVisitCount, 30000);

    function updateVisitCount() {
      fetch('/visit-count')
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          const visitCountElement = document.getElementById('visit-count');
          if (visitCountElement) {
            // Animation de comptage progressif
            const currentCount = parseInt(visitCountElement.innerText.replace(/,/g, '')) || 0;
            const targetCount = data.count;
            
            if (currentCount !== targetCount) {
              animateCounter(visitCountElement, currentCount, targetCount, 1000);
              addCounterPulse(); // Ajouter l'effet pulse
            }
            
            // Ajouter la classe premium pour les comptes élevés
            const visitCounter = document.getElementById('visit-counter');
            if (visitCounter && targetCount > 1000) {
              visitCounter.classList.add('high-traffic');
            }
          }
          
          const futuristicCountElement = document.getElementById('futuristic-count');
          if (futuristicCountElement) {
            futuristicCountElement.innerText = data.count;
          }
        })
        .catch(error => console.error('Error fetching visit count:', error));
    }
    
    // Fonction d'animation du compteur avec effet smooth
    function animateCounter(element, start, end, duration) {
      const startTime = performance.now();
      const difference = end - start;
      
      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function pour une animation plus naturelle
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.floor(start + (difference * easeOutQuart));
        
        element.innerText = currentValue.toLocaleString();
        
        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        }
      }
      
      requestAnimationFrame(updateCounter);
    }
    
    // Ajouter un effet de pulse quand le compteur change
    function addCounterPulse() {
      const visitCounter = document.getElementById('visit-counter');
      if (visitCounter) {
        visitCounter.style.transform = 'scale(1.05)';
        setTimeout(() => {
          visitCounter.style.transform = 'scale(1)';
        }, 200);
      }
    }

    updateVisitCount();
    setInterval(updateVisitCount, 5000); // Actualiser toutes les 5 secondes
});


// Nouvelle fonction pour déterminer la classe de couleur basée sur le pourcentage
function getColorClass(prob) {
  const value = parseFloat(prob);
  if (value < 40) return 'low-prob';
  else if (value < 70) return 'medium-prob';
  else return 'high-prob';
}

let vipData = [];

function loadVIPResults(date) {
  fetch('/analyze-vip?date=' + date)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data)) {
        console.error('Données VIP invalides reçues:', data);
        displayVIPResults([]);
        return;
      }
      vipData = data.sort((a, b) => b.reliabilityScore - a.reliabilityScore).slice(0, 20);
      displayVIPResults(vipData);
    })
    .catch(error => {
      console.error('Erreur lors du chargement des résultats VIP:', error);
      displayVIPResults([]);
    });
}

function displayVIPResults(results) {
  const vipResults = document.getElementById('vip-results');
  vipResults.style.display = 'block';
  const vipTableBody = document.querySelector('#vip-table tbody');
  vipTableBody.innerHTML = '';
  
  // Ajouter un message si aucun pronostic ne répond aux critères VIP
  if (results.length === 0) {
    vipTableBody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 25px;">
          <div style="color: #6c757d; font-size: 1em; margin-bottom: 8px;">
            🔍 <strong>Aucun pronostic VIP disponible pour cette date</strong>
          </div>
          <div style="color: #868e96; font-size: 0.9em;">
            Les matchs analysés ne répondent pas aux critères stricts de sélection VIP (fiabilité ≥ 65%, probabilité de but ≥ 60%)
          </div>
        </td>
      </tr>
    `;
    return;
  }
  results.forEach(match => {
    const urlParts = match.match.match(/analysis-(.+?)-betting-tip/);
    const matchSlug = urlParts ? urlParts[1] : 'Inconnu';
    const matchName = matchSlug.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    
    // Calculer les classes de couleur pour les probabilités
    const goalProbValue = match.goalProb * 100;
    const goalProbClass = getColorClass(goalProbValue);
    
    const reliabilityValue = parseFloat(match.reliabilityScore) || 0;
    const reliabilityClass = getColorClass(reliabilityValue);
    
    // **DÉTERMINER LE VERDICT FINAL** : 0,5 but ou 1,5 buts selon l'analyse
    let verdictFinal = '';
    let verdictIcon = '';
    let verdictColor = '';
    
    const goalProb = parseFloat(match.goalProb) * 100;
    const firstHalfGoalProb = parseFloat(match.firstHalfGoalProb);
    const layProb = parseFloat(match.layProb);
    const bttsProb = parseFloat(match.bttsProb);
    const reliabilityScore = parseFloat(match.reliabilityScore);
    
    // **LOGIQUE AVANCÉE DE DÉCISION** : Basée sur l'analyse multi-dimensionnelle
    let additionalInfo = '';
    
    if (reliabilityScore >= 75 && goalProb >= 75 && firstHalfGoalProb >= 65 && layProb <= 60) {
      // 🔥 TRÈS HAUTE CONFIANCE : 1,5 buts
      verdictFinal = '1,5 buts';
      verdictIcon = '🔥';
      verdictColor = '#dc3545'; // Rouge intense
      
      // Si très haute confiance, suggérer aussi 0,5 but comme option sûre
      if (goalProb >= 80 && firstHalfGoalProb >= 70) {
        additionalInfo = '<br><small style="color: #28a745; font-size: 0.8em;">✅ 0,5 but aussi recommandé</small>';
      }
    } else if (reliabilityScore >= 68 && goalProb >= 68 && firstHalfGoalProb >= 55 && layProb <= 65) {
      // ⭐ HAUTE CONFIANCE : 1,5 buts
      verdictFinal = '1,5 buts';
      verdictIcon = '⭐';
      verdictColor = '#ff6b35'; // Orange
      
      // Si haute confiance, mentionner 0,5 but comme option sécurisée
      if (firstHalfGoalProb >= 60) {
        additionalInfo = '<br><small style="color: #28a745; font-size: 0.8em;">✅ 0,5 but option sûre</small>';
      }
    } else if (reliabilityScore >= 65 && goalProb >= 60 && firstHalfGoalProb >= 50 && layProb <= 70) {
      // ✅ CONFIANCE MODÉRÉE : 0,5 but (sécurisé)
      verdictFinal = '0,5 but';
      verdictIcon = '✅';
      verdictColor = '#28a745'; // Vert
      
      // Si conditions sont bonnes, mentionner 1,5 buts comme option plus risquée
      if (goalProb >= 65 && bttsProb >= 55) {
        additionalInfo = '<br><small style="color: #ff6b35; font-size: 0.8em;">⭐ 1,5 buts possible</small>';
      }
    } else {
      // ⚠️ PRUDENCE : 0,5 but (option la plus sûre)
      verdictFinal = '0,5 but';
      verdictIcon = '⚽';
      verdictColor = '#007bff'; // Bleu
      
      // Même en prudence, si certaines conditions sont remplies, mentionner 1,5 buts
      if (bttsProb >= 50 && goalProb >= 58) {
        additionalInfo = '<br><small style="color: #ffc107; font-size: 0.8em;">💡 1,5 buts à considérer</small>';
      }
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${matchName}</strong></td>
      <td style="color: ${verdictColor}; font-weight: bold; font-size: 1.1em;">${verdictIcon} ${verdictFinal}${additionalInfo}</td>
      <td><strong>${match.time}</strong></td>
      <td><strong>${match.correctScore}</strong></td>
      <td>${match.correctScoreProb.toFixed(2)}%</td>
      <td>${match.layProb}%</td>
      <td>${match.bttsProb.toFixed(2)}%</td>
      <td class="${goalProbClass}"><strong>${goalProbValue.toFixed(2)}%</strong></td>
      <td>${match.firstHalfGoalProb.toFixed(2)}%</td>
      <td class="${reliabilityClass}" style="font-weight: bold; font-size: 1.1em;">${reliabilityValue.toFixed(2)}%</td>
      <td>${match.date}</td>
    `;
    vipTableBody.appendChild(row);
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
        
        const layProb = 100 - item.correctScoreProb;
        
        const [home, away] = (item.correctScore || '0:0').split(':').map(Number);
        const totalGoals = home + away;
        let verdict = '';
        if (totalGoals >= 2) {
          verdict = 'over 0.5 et over 1.5';
        } else if (totalGoals === 1) {
          verdict = 'over 0.5';
        } else if (totalGoals > 1) {
          verdict = 'over 1.5';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${matchName}</td>
          <td>${verdict}</td>
          <td>${item.time || 'N/A'}</td>
          <td>${item.actualScore || 'N/A'}</td>
          <td>${item.correctScore}</td>
          <td>${item.correctScoreProb.toFixed(2)}%</td>
          <td>${layProb.toFixed(2)}%</td>
          <td>${item.bttsProb.toFixed(2)}%</td>
          <td>${item.goalProb.toFixed(2)}%</td>
          <td>${item.firstHalfGoalProb.toFixed(2)}%</td>
          <td>${item.weightedScore.toFixed(2)}%</td>
        `;
        tableBody.appendChild(row);
      });
      
      if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="11">Aucun résultat disponible pour les jours passés.</td></tr>';
      }
    })
    .catch(error => {
      console.error('Erreur lors du chargement des résultats VIP passés:', error);
      const tableBody = document.querySelector('#past-vip-table tbody');
      tableBody.innerHTML = '<tr><td colspan="11">Erreur lors du chargement des données.</td></tr>';
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