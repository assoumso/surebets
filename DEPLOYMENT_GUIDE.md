# 🚀 Guide Complet de Déploiement BarakaSYT

## 📋 Prérequis

### 1. Installation de Node.js et npm
- Téléchargez et installez [Node.js LTS](https://nodejs.org/)
- Vérifiez l'installation : `node --version` et `npm --version`

### 2. Compte Vercel
- Créez un compte gratuit sur [vercel.com](https://vercel.com)
- Connectez-vous avec GitHub, GitLab ou email

## 🔧 Étape 1 : Préparation du projet

### Installation des dépendances
```bash
cd C:\xampp\htdocs\BarakaSYT
npm install
```

### Test local
```bash
npm start
```

## 🎯 Étape 2 : Déploiement avec Vercel CLI (Méthode recommandée)

### Installation de Vercel CLI
```bash
npm install -g vercel
```

### Connexion à Vercel
```bash
vercel login
```
- Suivez les instructions dans le navigateur
- Autorisez l'accès à votre compte

### Premier déploiement
```bash
vercel
```

### Questions que Vercel va poser :
1. **Set up and deploy?** → `Y`
2. **Which scope?** → Sélectionnez votre compte
3. **Link to existing project?** → `N`
4. **Project name?** → `barakasyt` (ou personnalisez)
5. **Directory?** → `./` (appuyez sur Entrée)
6. **Override settings?** → `N` (les fichiers de config sont déjà prêts)

### Déploiement en production
```bash
vercel --prod
```

## 🌐 Étape 3 : Déploiement via GitHub (Méthode alternative)

### 1. Initialiser Git et GitHub
```bash
git init
git add .
git commit -m "Initial commit - BarakaSYT football predictions"
```

### 2. Créer un repository GitHub
- Allez sur [github.com/new](https://github.com/new)
- Créez un nouveau repository nommé `barakasyt`
- Ne PAS initialiser avec README (déjà présent)

### 3. Pousser le code
```bash
git remote add origin https://github.com/VOTRE_USERNAME/barakasyt.git
git push -u origin main
```

### 4. Connecter à Vercel
- Allez sur [vercel.com/dashboard](https://vercel.com/dashboard)
- Cliquez sur "New Project"
- Importez depuis GitHub
- Sélectionnez `barakasyt`
- Cliquez sur "Deploy"

## 🔄 Étape 4 : Mises à jour automatiques

### Avec CLI
```bash
# Après chaque modification
git add .
git commit -m "Description des changements"
git push origin main
vercel --prod
```

### Avec GitHub (auto)
- Les push sur `main` déclenchent automatiquement le déploiement

## 📊 Étape 5 : Vérification du déploiement

### URL de production
- CLI : Affichée dans le terminal après `vercel --prod`
- GitHub : `https://barakasyt-[username].vercel.app`

### Test des fonctionnalités
1. **Page d'accueil** : `/`
2. **API analyse** : `/analyze?date=2024-12-01`
3. **Fichiers statiques** : `/app.js`, `/style.css`

## 🛠️ Configuration avancée

### Variables d'environnement (si nécessaire)
```bash
vercel env add
```

### Domaine personnalisé
```bash
vercel domains add votre-domaine.com
```

## 📱 Commandes utiles

### Vérifier le statut
```bash
vercel ls
```

### Logs en temps réel
```bash
vercel logs
```

### Supprimer un déploiement
```bash
vercel rm barakasyt
```

## 🚨 Résolution des problèmes

### Erreur "Command not found"
```bash
npm install -g vercel
```

### Erreur de build
- Vérifiez `package.json` contient toutes les dépendances
- Assurez-vous que `vercel.json` est présent

### Erreur de port
- Le fichier `server.js` utilise déjà `process.env.PORT || 3000`

## 🎉 Félicitations !

Après le déploiement réussi, votre application sera accessible à :
`https://barakasyt-[votre-nom].vercel.app`

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs : `vercel logs`
2. Consultez la [documentation Vercel](https://vercel.com/docs)
3. Ouvrez une issue sur GitHub

## 🔄 Mise à jour continue

Pour mettre à jour votre application :
1. Faites vos modifications localement
2. Testez avec `npm start`
3. Déployez avec `vercel --prod`