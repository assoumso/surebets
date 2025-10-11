/**
 * Système de Sauvegarde et Rollback pour BarakaSYT
 * Permet de préserver les fonctionnalités existantes lors des améliorations
 */

const fs = require('fs');
const path = require('path');

class BackupSystem {
  constructor() {
    this.backupDir = path.join(__dirname, 'backups');
    this.ensureBackupDir();
  }

  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Crée une sauvegarde complète du système actuel
   */
  createFullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `backup_${timestamp}`);
    
    try {
      fs.mkdirSync(backupPath, { recursive: true });
      
      // Sauvegarder les fichiers critiques
      const criticalFiles = [
        'index.js',
        'data/football_data.csv',
        'public/app.js',
        'public/index.html',
        'package.json'
      ];

      criticalFiles.forEach(file => {
        const sourcePath = path.join(__dirname, file);
        const destPath = path.join(backupPath, file);
        
        if (fs.existsSync(sourcePath)) {
          // Créer le dossier de destination si nécessaire
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          
          fs.copyFileSync(sourcePath, destPath);
          console.log(`✅ Sauvegardé: ${file}`);
        }
      });

      console.log(`🎯 Sauvegarde complète créée: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde: ${error.message}`);
      throw error;
    }
  }

  /**
   * Restaure une sauvegarde spécifique
   */
  restoreBackup(backupPath) {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Sauvegarde introuvable: ${backupPath}`);
      }

      const files = this.getAllFiles(backupPath);
      files.forEach(file => {
        const relativePath = path.relative(backupPath, file);
        const destPath = path.join(__dirname, relativePath);
        
        // Créer le dossier de destination si nécessaire
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.copyFileSync(file, destPath);
      });

      console.log(`🔄 Restauration terminée depuis: ${backupPath}`);
      return true;
    } catch (error) {
      console.error(`❌ Erreur lors de la restauration: ${error.message}`);
      return false;
    }
  }

  /**
   * Liste toutes les sauvegardes disponibles
   */
  listBackups() {
    try {
      const backups = fs.readdirSync(this.backupDir)
        .filter(item => item.startsWith('backup_'))
        .map(backup => ({
          name: backup,
          path: path.join(this.backupDir, backup),
          date: fs.statSync(path.join(this.backupDir, backup)).mtime
        }))
        .sort((a, b) => b.date - a.date);

      return backups;
    } catch (error) {
      console.error(`❌ Erreur lors de la liste des sauvegardes: ${error.message}`);
      return [];
    }
  }

  getAllFiles(dir) {
    let files = [];
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        files = files.concat(this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    });
    
    return files;
  }
}

module.exports = BackupSystem;

// Utilisation en ligne de commande
if (require.main === module) {
  const backup = new BackupSystem();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'create':
      backup.createFullBackup();
      break;
    case 'list':
      const backups = backup.listBackups();
      console.log('📋 Sauvegardes disponibles:');
      backups.forEach((b, i) => {
        console.log(`${i + 1}. ${b.name} (${b.date.toLocaleString()})`);
      });
      break;
    case 'restore':
      const backupName = process.argv[3];
      if (backupName) {
        const backupPath = path.join(__dirname, 'backups', backupName);
        backup.restoreBackup(backupPath);
      } else {
        console.log('Usage: node backup_system.js restore <backup_name>');
      }
      break;
    default:
      console.log('Usage: node backup_system.js [create|list|restore <backup_name>]');
  }
}