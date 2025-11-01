function loadPastVIPResults() {
    console.log('Chargement des résultats VIP passés...');
    
    fetch('/past-vip-results')
        .then(response => {
            if (!response.ok) {
                throw new Error('Erreur lors de la récupération des résultats VIP passés');
            }
            return response.json();
        })
        .then(data => {
            console.log('Données reçues:', data);
            const tableBody = document.querySelector('#past-vip-table tbody');
            tableBody.innerHTML = ''; // Effacer le contenu existant
            
            if (data.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="10">Aucun résultat VIP passé disponible.</td>';
                tableBody.appendChild(row);
            } else {
                data.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = '<td>' + item.match + '</td><td>' + item.date + '</td><td>' + item.time + '</td><td>' + item.actualScore + '</td><td>' + item.correctScore + '</td><td>' + item.correctScoreProb.toFixed(2) + '%</td><td>' + item.layProb.toFixed(2) + '%</td><td>' + item.bttsProb.toFixed(2) + '%</td><td>' + item.goalsProb.toFixed(2) + '%</td><td>' + item.halfTimeGoalsProb.toFixed(2) + '%</td>';
                    tableBody.appendChild(row);
                });
                
                // Rendre le tableau triable si nécessaire
                // makeTableSortable('past-vip-table');
            }
        })
        .catch(error => {
            console.error('Erreur:', error);
            const tableBody = document.querySelector('#past-vip-table tbody');
            tableBody.innerHTML = '<tr><td colspan="10">Erreur lors du chargement des résultats. Veuillez réessayer plus tard.</td></tr>';
        });
    
    console.log('Fonction loadPastVIPResults terminée.');
}

// Fonction pour rendre le tableau triable (optionnel, pour optimisation)
function makeTableSortable(tableId) {
  const table = document.querySelector(tableId);
  const headers = table.querySelectorAll('th');
  headers.forEach((header, index) => {
    header.addEventListener('click', () => {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const isAscending = header.classList.toggle('asc');
      header.classList.toggle('desc', !isAscending);
      
      rows.sort((a, b) => {
        const aText = a.children[index].textContent.trim();
        const bText = b.children[index].textContent.trim();
        return isAscending ? aText.localeCompare(bText) : bText.localeCompare(aText);
      });
      
      rows.forEach(row => table.querySelector('tbody').appendChild(row));
    });
  });
}