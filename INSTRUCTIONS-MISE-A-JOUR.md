# ============================================
# INSTRUCTIONS DE MISE À JOUR
# MAISON KHAN - Serveur de Production
# ============================================

## ÉTAPE 1 : Mettre à jour la base de données

Exécutez ces commandes dans le terminal :

```bash
# Pousser les nouveaux champs dans la base de données
bunx prisma db push

# Régénérer le client Prisma
bunx prisma generate
```

## ÉTAPE 2 : Exécuter le seed (catégories du menu)

```bash
bun run prisma/seed-demo.ts
```

## ÉTAPE 3 : Vider le titre hero et mettre à jour la description

Allez dans l'Admin → Contenu du Site, ou exécutez via l'API :

```bash
# Vider le titre
curl -X POST http://localhost:3000/api/content \
  -H "Content-Type: application/json" \
  -d '{"key": "hero_title", "value": ""}'

curl -X POST http://localhost:3000/api/content \
  -H "Content-Type: application/json" \
  -d '{"key": "hero_title_highlight", "value": ""}'

# Mettre à jour la description
curl -X POST http://localhost:3000/api/content \
  -H "Content-Type: application/json" \
  -d '{"key": "hero_description", "value": "Découvrez des chaussures d'\''exception conçues pour celles et ceux qui recherchent l'\''élégance, la qualité et le raffinement. Des créations haut de gamme où chaque détail est pensé pour affirmer votre style."}'
```

## ÉTAPE 4 : Redémarrer le serveur

```bash
bun run dev
```

---

## 📋 RÉSUMÉ DES MODIFICATIONS

### Fichiers modifiés :
1. `prisma/schema.prisma` - Ajout isBestSeller, isNew
2. `src/app/page.tsx` - Sections Best-Sellers, Savoir-Faire, Image Maison
3. `src/app/api/products/route.ts` - Support nouveaux champs
4. `src/lib/db.ts` - Cache bust Prisma client

### Nouvelles fonctionnalités :
- ✅ Section "Best-Sellers" (affiche produits marqués ⭐)
- ✅ Section "Notre Savoir-Faire" (4 étapes)
- ✅ Toggle "Best-Seller" dans le formulaire produit
- ✅ Toggle "Nouveauté" dans le formulaire produit
- ✅ Gestion image "Notre Maison" dans l'admin
- ✅ Nouveau titre et description hero

---

© 2026 MAISON KHAN
