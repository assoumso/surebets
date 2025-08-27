# BarakaSYT Vercel Deployment Script
# Ce script automatise le déploiement complet sur Vercel

Write-Host "🚀 BarakaSYT Vercel Deployment Script" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# Vérifier si Node.js est installé
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js n'est pas installé." -ForegroundColor Red
    Write-Host "📥 Téléchargez Node.js depuis: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Vérifier si npm est installé
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm n'est pas installé." -ForegroundColor Red
    exit 1
}

# Installer Vercel CLI si nécessaire
Write-Host "📦 Vérification de Vercel CLI..." -ForegroundColor Blue
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "📥 Installation de Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
    if (-not $?) {
        Write-Host "❌ Échec de l'installation de Vercel CLI" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Vercel CLI est installé" -ForegroundColor Green

# Installation des dépendances
Write-Host "📦 Installation des dépendances du projet..." -ForegroundColor Blue
npm install
if (-not $?) {
    Write-Host "❌ Échec de l'installation des dépendances" -ForegroundColor Red
    exit 1
}

# Test local (optionnel)
Write-Host "🧪 Test local du projet..." -ForegroundColor Blue
$testProcess = Start-Process node -ArgumentList "server.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 3

# Vérifier si le serveur local fonctionne
$test = Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet
if ($test) {
    Write-Host "✅ Serveur local fonctionne" -ForegroundColor Green
    Stop-Process -Id $testProcess.Id -Force
} else {
    Write-Host "⚠️  Serveur local non testé" -ForegroundColor Yellow
}

# Demander confirmation pour le déploiement
Write-Host ""
Write-Host "🚀 Prêt pour le déploiement sur Vercel!" -ForegroundColor Green
Write-Host ""
$confirmation = Read-Host "Voulez-vous continuer le déploiement? (y/n)"

if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "❌ Déploiement annulé" -ForegroundColor Red
    exit 0
}

# Connexion et déploiement
Write-Host "🔐 Connexion à Vercel..." -ForegroundColor Blue
try {
    Write-Host "📋 Lancement du déploiement..." -ForegroundColor Green
    npx vercel --prod
    
    if ($?) {
        Write-Host "✅ Déploiement terminé avec succès!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Votre application est maintenant accessible sur Vercel!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erreur lors du déploiement" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "📖 Pour plus d'informations, consultez DEPLOYMENT_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
pause