# Script PowerShell pour créer un repository GitHub et pousser le code
# BarakaSYT - Application de prédictions football

Write-Host "🚀 Création du repository GitHub BarakaSYT..." -ForegroundColor Green

# Variables
$repoName = "BarakaSYT"
$repoDescription = "Application de prédictions football basée sur l'IA avec distribution de Poisson et analyse avancée des probabilités"

# Vérifier si GitHub CLI est installé
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "📦 Installation de GitHub CLI..." -ForegroundColor Yellow
    winget install --id GitHub.cli
    Write-Host "✅ GitHub CLI installé. Veuillez redémarrer votre terminal et relancer ce script." -ForegroundColor Green
    exit
}

# Connexion à GitHub
Write-Host "🔐 Connexion à GitHub..." -ForegroundColor Cyan
git config --global init.defaultBranch main
gh auth login

# Créer le repository
Write-Host "📁 Création du repository..." -ForegroundColor Cyan
gh repo create $repoName --public --description $repoDescription --source=. --remote=origin --push

Write-Host "✅ Repository créé avec succès!" -ForegroundColor Green
Write-Host "🌐 URL du repository: https://github.com/$(gh api user --jq '.login')/$repoName" -ForegroundColor Cyan

# Instructions alternatives sans GitHub CLI
Write-Host ""
Write-Host "📋 Instructions manuelles si GitHub CLI n'est pas disponible:" -ForegroundColor Yellow
Write-Host "1. Allez sur https://github.com/new" -ForegroundColor White
Write-Host "2. Créez un nouveau repository nommé 'BarakaSYT'" -ForegroundColor White
Write-Host "3. Copiez l'URL HTTPS du repository" -ForegroundColor White
Write-Host "4. Exécutez: git remote add origin [URL]" -ForegroundColor White
Write-Host "5. Exécutez: git push -u origin main" -ForegroundColor White