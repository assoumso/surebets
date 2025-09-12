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
                const layProb = 100 - item.correctScoreProb;
                row.innerHTML = `
                    <td>${matchName}</td>
                    <td>${item.time || 'N/A'}</td>
                    <td>${item.correctScore}</td>
                    <td>${item.correctScoreProb.toFixed(2)}%</td>
                    <td>${layProb.toFixed(2)}%</td>
                    <td>${item.bttsProb.toFixed(2)}%</td>
                    <td class="${getColorClass(item.goalProb * 100)}">${(item.goalProb * 100).toFixed(2)}%</td>
                    <td>${item.firstHalfGoalProb.toFixed(2)}%</td>
                    <td>${(item.weightedScore * 100).toFixed(2)}%</td>
                    <td>${item.date}</td>
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
    document.querySelector('nav a[href="#payment"]').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('payment').style.display = 'block';
    });

    // Logique de paiement
    const stripe = Stripe('your_stripe_publishable_key'); // Remplacez par votre clé publique Stripe
    const elements = stripe.elements();
    const card = elements.create('card');
    card.mount('#card-element');

    card.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      displayError.textContent = event.error ? event.error.message : '';
    });

    const prices = {
      1: 500,
      4: 1500,
      7: 2500,
      30: 10000
    };

    function updateEndDate() {
      const startDate = document.getElementById('start-date').value;
      const days = parseInt(document.getElementById('plan-select').value);
      if (startDate && days) {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + days);
        const formattedEnd = end.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        document.getElementById('end-date').textContent = `Date de fin: ${formattedEnd}`;
      }
    }

    document.getElementById('start-date').addEventListener('change', updateEndDate);
    document.getElementById('plan-select').addEventListener('change', updateEndDate);

    document.getElementById('next-step1').addEventListener('click', () => {
      const days = document.getElementById('plan-select').value;
      const amount = prices[days] * 100; // en centimes
      document.getElementById('payment-step1').style.display = 'none';
      document.getElementById('payment-step2').style.display = 'block';
      window.paymentAmount = amount;
    });

    document.getElementById('back-step2').addEventListener('click', () => {
      document.getElementById('payment-step2').style.display = 'none';
      document.getElementById('payment-step1').style.display = 'block';
    });

    document.getElementById('payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: 'card',
        card: card,
      });
      if (error) {
        document.getElementById('card-errors').textContent = error.message;
      } else {
        const response = await fetch('/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: window.paymentAmount }),
        });
        const { clientSecret } = await response.json();
        const { error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: paymentMethod.id,
        });
        if (confirmError) {
          document.getElementById('card-errors').textContent = confirmError.message;
        } else {
          document.getElementById('payment-step2').style.display = 'none';
          document.getElementById('payment-step3').style.display = 'block';
        }
      }
    });

    document.getElementById('close-payment').addEventListener('click', () => {
      document.getElementById('payment').style.display = 'none';
    });

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
    row.innerHTML = `
      <td>${match.match}</td>
      <td>${match.time}</td>
      <td>${match.correctScore}</td>
      <td>${match.correctScoreProb.toFixed(2)}%</td>
      <td>${match.bttsProb.toFixed(2)}%</td>
      <td>${match.goalProb.toFixed(2)}%</td>
      <td>${match.firstHalfGoalProb.toFixed(2)}%</td>
      <td>${match.weightedScore.toFixed(2)}%</td>
      <td>${match.date}</td>
    `;
    vipResults.appendChild(row);
  });
}