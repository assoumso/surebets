# BarakaSYT - Prédictions de Football

Plateforme innovante d'analyse des prédictions de football pour le marché spécifique du 0,5 but dans un match.

## 🚀 Fonctionnalités Principales

- **Analyse Avancée**: Système multi-modèles combinant statistiques classiques et machine learning
- **Prédictions VIP**: Top 20 des meilleures prédictions avec scores de fiabilité
- **Interface Moderne**: Design responsive avec thème clair/sombre
- **Multi-modèles ML**: Random Forest, SVM, k-NN, Stacking, Monte Carlo
- **Export CSV**: Téléchargement des prédictions au format CSV
- **Système de Paiement**: Intégration Stripe pour les abonnements VIP

## 📊 Modèles de Prédiction

### Modèles Classiques
- Score Correct
- Lay Betting  
- BTTS (Both Teams To Score)
- Probabilité de But
- But 1ère Mi-temps

### Machine Learning
- **Random Forest**: Classification d'ensemble (3%)
- **SVM**: Support Vector Machine (3%)
- **k-NN**: k-Nearest Neighbors (3%)
- **Stacking Ensemble**: Combinaison optimisée (15%)
- **Monte Carlo**: Simulation probabiliste (12%)

📖 Pour plus de détails, voir: [PREDICTION_PIPELINE.md](PREDICTION_PIPELINE.md)

## 🛠️ Installation

### Prérequis
- Node.js 14+ 
- npm ou yarn

### Installation Rapide
```bash
# Cloner le repository
git clone [url]
cd BarakaSYT

# Installer les dépendances
npm install

# Lancer le serveur
node index.js

# Ouvrir dans le navigateur
# http://localhost:3000
```

## 📱 Utilisation

1. **Accueil**: Naviguez vers la page d'accueil
2. **Sélection Date**: Choisissez la date des matchs à analyser
3. **Lancer Analyse**: Cliquez sur "Analyser"
4. **Résultats**: Consultez les prédictions classiques
5. **VIP**: Accédez aux Top 20 prédictions VIP
6. **Exporter**: Téléchargez les résultats en CSV

## 🎯 Système de Scoring

Le score de fiabilité combine 10 modèles différents:
- Score de fiabilité global (0-100%)
- Niveau de certitude (Faible/Moyen/Haut/Très Haut)
- Détails des modèles utilisés
- Historique des performances

## 💳 Système VIP

### Abonnements Disponibles
- **1 Semaine**: 5€
- **1 Mois**: 15€
- **3 Mois**: 40€
- **1 An**: 150€

### Fonctionnalités VIP
- Accès aux 20 meilleures prédictions
- Scores de fiabilité détaillés
- Historique des résultats
- Support prioritaire

## 🔧 Configuration

### Variables d'Environnement
Créez un fichier `.env` basé sur `.env.example`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
PORT=3000
```

### Fichiers de Configuration
- `data/football_data.csv`: Données d'entraînement ML
- `vip_model_weights.json`: Poids des modèles
- `cache_*.json`: Cache des résultats

## 📊 API Endpoints

### Principaux Endpoints
- `GET /`: Page d'accueil
- `GET /analyze?date=YYYY-MM-DD`: Analyse des matchs
- `GET /analyze-vip?date=YYYY-MM-DD`: Prédictions VIP
- `POST /create-checkout-session`: Création session paiement
- `GET /past-vip-results`: Historique VIP

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Tester individuellement
node test.js
```

## 📈 Performance

- **Temps d'analyse**: ~2-3 secondes pour 50 matchs
- **Mémoire**: < 100MB
- **Scalabilité**: Supporte 500+ matchs simultanés
- **Précision**: Amélioration continue via reinforcement learning

## 🛡️ Sécurité

- Validation stricte des entrées
- Gestion robuste des erreurs
- Aucune dépendance native
- Protection contre les injections
- Chiffrement des paiements (Stripe)

## 🤝 Contribution

1. Fork le projet
2. Créez une branche (`git checkout -b feature/AmazingFeature`)
3. Commitez vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📝 License

Ce projet est sous license MIT. Voir le fichier `LICENSE` pour plus de détails.

## 📞 Support

- **Email**: support@barakasyt.com
- **Documentation**: [PREDICTION_PIPELINE.md](PREDICTION_PIPELINE.md)
- **Issues**: GitHub Issues

---

**Développé avec ❤️ par l'équipe BarakaSYT**

*Dernière mise à jour: $(date)*