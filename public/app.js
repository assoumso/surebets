document.addEventListener('DOMContentLoaded', function() {
    // Référence aux éléments DOM
    const analyzeBtn = document.getElementById('analyze-btn');
    const dateSelector = document.getElementById('date');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('results');
    const tableBody = document.querySelector('#results-table tbody');
    const noResults = document.getElementById('no-results');
    const exportBtn = document.getElementById('export-csv');
    
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
        
        fetch('/analyze?date=' + selectedDate)
            .then(response => response.json())
            .then(data => {
                // Masquer l'indicateur de chargement
                loading.style.display = 'none';
                
                if (!Array.isArray(data)) {
                    alert('Erreur lors de l\'analyse: ' + (data.error || 'Données invalides'));
                    return;
                }
                
                // Obtenir l'heure actuelle pour filtrer les matchs non joués
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentDate = now.toISOString().split('T')[0];
                
                // Filtrer les matchs qui n'ont pas encore été joués
                const upcomingMatches = data;
                
                const filteredMatches = upcomingMatches.filter(match => (100 - match.correctScoreProb) > 80);
                
                // Trier par probabilité Lay décroissante (du plus élevé au plus faible)
                filteredMatches.sort((a, b) => {
                    const layProbA = 100 - a.correctScoreProb;
                    const layProbB = 100 - b.correctScoreProb;
                    return layProbB - layProbA;
                });
                
                if (filteredMatches.length === 0) {
                    noResults.style.display = 'block';
                } else {
                    resultsSection.style.display = 'block';
                    displayResults(filteredMatches);
                    document.getElementById('vip-btn').style.display = 'inline-block';
                }
            })
            .catch(error => {
                loading.style.display = 'none';
                alert('Erreur: ' + error.message);
            });
    });
    
    // Fonction pour afficher les résultats dans le tableau
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
                <td>${item.correctScoreProb}%</td>
                <td>${layProb}%</td>
                <td>${item.bttsProb}%</td>
                <td>${(item.goalProb * 100).toFixed(2)}%</td>
                <td>${item.firstHalfGoalProb.toFixed(2)}%</td>
                <td>${item.date}</td>
            `;
            tableBody.appendChild(row);
        });
        
        makeTableSortable();
        // Stocker data pour export
        window.currentData = data;
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
                
                // Réinitialiser l'ordre de tri pour tous les en-têtes
                headers.forEach(h => h.removeAttribute('data-order'));
                header.setAttribute('data-order', newOrder);
                
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
            
            csvContent += `"${matchName}","${item.time || 'N/A'}","${item.correctScore}","${item.correctScoreProb}%","${layProb}%","${item.bttsProb}%","${(item.goalProb * 100).toFixed(2)}%","${item.firstHalfGoalProb.toFixed(2)}%","${item.date}"\n`;
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
    
    // Gestionnaire pour le bouton VIP
    document.getElementById('vip-btn').addEventListener('click', function() {
        if (!window.currentData) return;
        const data = window.currentData;

        // Calculer un score pondéré pour l'analyse approfondie
        const weightedData = data.map(item => {
            // Convertir forme en score (W=3, D=1, L=0)
            const formScore = (form) => form.split('').reduce((acc, res) => acc + (res === 'W' ? 3 : res === 'D' ? 1 : 0), 0) / 5;
            const team1FormScore = formScore(item.team1Form || 'LLLLL');
            const team2FormScore = formScore(item.team2Form || 'LLLLL');
            const avgForm = (team1FormScore + team2FormScore) / 2;

            // Score over 2.5 moyen
            const avgOver = (item.team1Over + item.team2Over) / 2 / 100;

            // Score pondéré: 40% correctScoreProb, 20% avgForm, 20% avgOver, 10% bttsProb, 10% goalProb (AI-enhanced)
            const weightedScore = (item.correctScoreProb / 100 * 0.4) + (avgForm * 0.2) + (avgOver * 0.2) + (item.bttsProb / 100 * 0.1) + (item.goalProb * 0.1);
            return { ...item, weightedScore };
        });

        // Trier par weightedScore descendant
        weightedData.sort((a, b) => b.weightedScore - a.weightedScore);

        // Prendre top 20
        const top20 = weightedData.slice(0, 20);

        // Afficher dans le tableau VIP
        const vipTableBody = document.querySelector('#vip-table tbody');
        vipTableBody.innerHTML = '';
        top20.forEach(item => {
            const row = document.createElement('tr');
            const urlParts = item.match.match(/analysis-(.+?)-betting-tip/);
            const matchSlug = urlParts ? urlParts[1] : 'Inconnu';
            const matchName = matchSlug.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            const layProb = 100 - item.correctScoreProb;
            row.innerHTML = `
                <td>${matchName}</td>
                <td>${item.time || 'N/A'}</td>
                <td>${item.correctScore}</td>
                <td>${item.correctScoreProb}%</td>
                <td>${layProb}%</td>
                <td>${item.bttsProb}%</td>
                <td>${(item.goalProb * 100).toFixed(2)}% (AI)</td>
                <td>${item.firstHalfGoalProb.toFixed(2)}% (IA)</td>
                <td>${item.date}</td>
            `;
            vipTableBody.appendChild(row);
        });

        // Ajouter une zone de détection AI
        let aiZone = document.getElementById('ai-goal-detection');
        if (!aiZone) {
            aiZone = document.createElement('div');
            aiZone.id = 'ai-goal-detection';
            aiZone.innerHTML = '<h3>Zone de Détection AI: Probabilité de But Avancée</h3><p>Cette section utilise un algorithme AI basé sur la distribution de Poisson pour des prédictions fiables de buts.</p>';
            document.getElementById('vip-results').appendChild(aiZone);
        }

        document.getElementById('vip-results').style.display = 'block';
    });

    // Attacher l'événement à l'export button
    document.getElementById('export-csv').addEventListener('click', exportToCSV);
});