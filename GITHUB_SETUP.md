# 🚀 Configuration GitHub - BarakaSYT

## 📋 Méthode 1 : Script Automatique (Recommandé)

### **Étapes rapides :**
```powershell
# Dans PowerShell, exécuter :
.\create_github_repo.ps1
```

## 📋 Méthode 2 : Interface Web (Alternative)

### **Étapes détaillées :**

1. **Créer le repository sur GitHub**
   - Allez sur : https://github.com/new
   - **Repository name** : `BarakaSYT`
   - **Description** : `Application de prédictions football basée sur l'IA avec distribution de Poisson et analyse avancée des probabilités`
   - **Public** : ✅ (recommandé)
   - **README** : ❌ (déjà créé)
   - **Gitignore** : ❌ (déjà créé)
   - **License** : MIT (optionnel)

2. **Configurer le repository local**
   ```bash
   # Dans le terminal, exécuter :
   git remote add origin https://github.com/[VOTRE_USERNAME]/BarakaSYT.git
   git branch -M main
   git push -u origin main
   ```

3. **Vérifier la connexion**
   ```bash
   git remote -v
   ```

## 📁 Structure du repository

```
BarakaSYT/
├── 📁 public/           # Interface web
├── 📁 src/             # Code source
├── 📄 index.js         # Scraping et analyse
├── 📄 server.js        # Serveur Express
├── 📄 package.json     # Dépendances
├── 📄 README.md        # Documentation
├── 📄 vercel.json      # Configuration Vercel
├── 📄 netlify.toml     # Configuration Netlify
└── 📄 .gitignore       # Fichiers ignorés
```

## 🎯 URLs après déploiement

- **GitHub** : https://github.com/[VOTRE_USERNAME]/BarakaSYT
- **Vercel** : https://barakasyt.vercel.app
- **Netlify** : https://barakasyt.netlify.app

## 🔗 Commandes utiles

```bash
# Vérifier l'état Git
git status

# Ajouter des modifications
git add .
git commit -m "Description des changements"
git push

# Mettre à jour depuis GitHub
git pull origin main
```

## 📱 Déploiement automatique

Une fois le repository créé, les déploiements seront automatiques :
- **Vercel** : Connectez votre repo GitHub dans Vercel
- **Netlify** : Connectez votre repo GitHub dans Netlify
- **GitHub Pages** : Déploiement automatique depuis la branche main