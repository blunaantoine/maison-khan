#!/bin/bash

# Script de configuration MAISON KHAN pour VPS
# Usage: bash setup-vps.sh

echo "=========================================="
echo "  MAISON KHAN - Configuration VPS"
echo "=========================================="

# Vérifier si on est dans le bon dossier
if [ ! -f "package.json" ]; then
    echo "❌ Erreur: Exécutez ce script depuis le dossier maison-khan"
    exit 1
fi

# Créer le fichier .env s'il n'existe pas
if [ ! -f ".env" ]; then
    echo "📝 Création du fichier .env..."
    cp .env.example .env
    echo "✅ Fichier .env créé. Modifiez-le si nécessaire: nano .env"
else
    echo "✅ Fichier .env déjà existant"
fi

# Installer les dépendances
echo ""
echo "📦 Installation des dépendances..."
bun install

# Configurer la base de données
echo ""
echo "🗄️ Configuration de la base de données..."
bun run db:push

# Créer les comptes admin
echo ""
echo "👤 Création des comptes administrateurs..."
bun run db:seed

# Compiler l'application
echo ""
echo "🔨 Compilation de l'application..."
bun run build

echo ""
echo "=========================================="
echo "  ✅ Configuration terminée!"
echo "=========================================="
echo ""
echo "📋 Comptes créés:"
echo "   Admin: technique@maison-khan.com / Khan1975@@"
echo "   Manager: manager@maisonkhan.com / Manager2024@@"
echo ""
echo "🚀 Pour démarrer l'application:"
echo "   bun run start"
echo ""
