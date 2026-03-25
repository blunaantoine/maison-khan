#!/bin/bash

# ============================================
# SCRIPT DE MISE À JOUR MAISON KHAN
# ============================================
# Ce script met à jour le serveur avec toutes
# les dernières modifications.
# ============================================

echo "🚀 Début de la mise à jour MAISON KHAN..."
echo ""

# 1. Mettre à jour le schéma Prisma
echo "📦 Mise à jour du schéma de base de données..."
bunx prisma db push --accept-data-loss

# 2. Régénérer le client Prisma
echo "📦 Régénération du client Prisma..."
bunx prisma generate

# 3. Exécuter le seed pour les catégories du menu
echo "📦 Création des catégories du menu..."
bun run prisma/seed-demo.ts

# 4. Mettre à jour le contenu du site
echo "📦 Mise à jour du contenu du site..."
bun -e "
async function updateContent() {
  const contents = [
    // Hero - Vider le titre
    { key: 'hero_title', value: '' },
    { key: 'hero_title_highlight', value: '' },
    { key: 'hero_description', value: 'Découvrez des chaussures d\\'exception conçues pour celles et ceux qui recherchent l\\'élégance, la qualité et le raffinement. Des créations haut de gamme où chaque détail est pensé pour affirmer votre style.' }
  ];
  
  for (const content of contents) {
    await fetch('http://localhost:3000/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content)
    });
    console.log('✅ ' + content.key + ' mis à jour');
  }
  console.log('✅ Contenu du site mis à jour');
}
updateContent();
"

echo ""
echo "✅ ============================================"
echo "✅ MISE À JOUR TERMINÉE AVEC SUCCÈS !"
echo "✅ ============================================"
echo ""
echo "📝 Résumé des modifications :"
echo "   - Ajout des champs isBestSeller et isNew aux produits"
echo "   - Section Best-Sellers (affiche produits marqués ⭐)"
echo "   - Section Notre Savoir-Faire (4 étapes artisanales)"
echo "   - Gestion de l'image 'Notre Maison' dans l'admin"
echo "   - Nouveau titre et description de la page d'accueil"
echo ""
echo "🔄 Redémarrez votre serveur avec: bun run dev"
echo ""
