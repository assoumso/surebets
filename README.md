# BarakaSYT - Prédictions Football IA

Application de prédictions de football avec analyse avancée basée sur l'IA et la distribution de Poisson.

## Fonctionnalités

- 🔮 **Prédictions de score exact** avec probabilités
- 🤖 **Analyse IA** pour la probabilité de but
- 📊 **Distribution de Poisson** pour des prédictions précises
- ⭐ **Section VIP** avec matchs sélectionnés
- 📈 **Statistiques BTTS** (Both Teams To Score)
- 💾 **Export CSV** des résultats

## Stack Technique

- **Backend**: Node.js, Express
- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Scraping**: Playwright
- **Déploiement**: Vercel

## Installation Locale

```bash
# Cloner le projet
git clone [URL_DU_REPO]
cd BarakaSYT

# Installer les dépendances
npm install

# Lancer l'application
npm start
```

L'application sera accessible sur `http://localhost:3000`

## Déploiement sur Vercel

### Méthode 1: CLI Vercel (Recommandé)

1. **Installer Vercel CLI** :
   ```bash
   npm i -g vercel
   ```

2. **Se connecter à Vercel** :
   ```bash
   vercel login
   ```

3. **Déployer** :
   ```bash
   vercel --prod
   ```

### Méthode 2: Interface Web

1. **Pousser le code sur GitHub**
2. **Connecter le repo sur [vercel.com](https://vercel.com)**
3. **Déployer automatiquement**

### Configuration Requise

Le fichier `vercel.json` est déjà configuré pour le déploiement. Aucune action supplémentaire n'est nécessaire.

## Scripts NPM

- `npm start` : Lancer en production
- `npm run dev` : Mode développement
- `npm run build` : Build (simulé)

## Variables d'Environnement

Aucune variable d'environnement n'est requise pour le fonctionnement de base.

## Structure du Projet

```
BarakaSYT/
├── public/           # Fichiers statiques
│   ├── index.html   # Interface principale
│   ├── app.js       # Logique frontend
│   └── style.css    # Styles
├── server.js        # Serveur Express
├── index.js         # Scraping des données
├── results.json     # Données des matchs
├── vercel.json      # Configuration Vercel
└── package.json     # Dépendances
```

## Support

Pour toute question ou problème, ouvrez une issue sur le repository GitHub.