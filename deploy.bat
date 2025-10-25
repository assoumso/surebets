@echo off
echo 🚀 Déploiement BarakaSYT sur Vercel
echo.
echo Installation de Vercel CLI...
npm install -g vercel
echo.
echo Connexion à Vercel...
vercel login
echo.
echo Déploiement en production...
vercel --prod
echo.
echo ✅ Déploiement terminé !
pause