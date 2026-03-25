#!/bin/bash

# Script de déploiement MAISON KHAN
# Usage: ./deploy.sh

set -e

echo "🚀 Déploiement MAISON KHAN..."
echo "=============================="

# Aller au dossier du projet
cd /var/www/maison-khan

# Sauvegarder la base de données
echo "📦 Sauvegarde de la base de données..."
cp db/custom.db db/custom.db.backup 2>/dev/null || true

# Tirer les dernières modifications
echo "📥 Récupération des modifications..."
git fetch origin
git reset --hard origin/master

# Restaurer la base de données
echo "📦 Restauration de la base de données..."
cp db/custom.db.backup db/custom.db 2>/dev/null || true

# Installer les dépendances
echo "📚 Installation des dépendances..."
bun install

# Générer le client Prisma
echo "🔧 Génération Prisma..."
bun run db:generate

# Construire le projet
echo "🏗️ Construction du projet..."
bun run build

# Redémarrer le service
echo "🔄 Redémarrage du serveur..."
pm2 restart maison-khan

echo "=============================="
echo "✅ Déploiement terminé avec succès !"
echo "🌐 https://maison-khan.com"
