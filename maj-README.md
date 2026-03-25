# MISE À JOUR MAISON KHAN

## 📋 Liste des modifications

### 1. Base de données (Prisma)
- Ajout du champ `isBestSeller` (boolean) aux produits
- Ajout du champ `isNew` (boolean) aux produits

### 2. Sections de la page d'accueil
- **Nouveautés** : Affiche les produits marqués "Nouveauté"
- **Best-Sellers** : Affiche les produits marqués "⭐ Best-Seller" (placé AVANT Notre Savoir-Faire)
- **Notre Savoir-Faire** : 4 étapes du savoir-faire artisanal

### 3. Administration
- **Badges & Visibilité** dans le formulaire produit :
  - Case "Nouveauté" → Affiche dans section Nouveautés
  - Case "⭐ Best-Seller" → Affiche dans section Best-Sellers
- **Image "Notre Maison"** : Possibilité de changer l'image dans l'admin

### 4. Contenu
- Titre hero vidé
- Description : "Découvrez des chaussures d'exception conçues pour celles et ceux qui recherchent l'élégance, la qualité et le raffinement..."

---

## 🚀 Instructions de mise à jour

### Option 1 : Script automatique
```bash
chmod +x mise-a-jour.sh
./mise-a-jour.sh
```

### Option 2 : Mise à jour manuelle
```bash
# 1. Mettre à jour la base de données
bunx prisma db push

# 2. Régénérer Prisma
bunx prisma generate

# 3. Redémarrer le serveur
bun run dev
```

---

## 📝 Comment utiliser les nouvelles fonctionnalités

### Marquer un produit comme Best-Seller
1. Allez dans l'Admin (cliquez sur "Chaussures de luxe" dans le footer)
2. Entrez le mot de passe : `Khan1975@@`
3. Ajoutez ou modifiez un produit
4. Cochez **"⭐ Best-Seller"** dans la section "Badges & Visibilité"
5. Le produit apparaîtra dans la section Best-Sellers

### Marquer un produit comme Nouveauté
1. Dans le même formulaire, cochez **"Nouveauté"**
2. Le produit apparaîtra dans la section Nouveautés

### Changer l'image "Notre Maison"
1. Dans l'Admin, allez à la section **"Image Notre Maison"**
2. Cliquez sur "Changer l'image"
3. Sélectionnez une image de votre atelier

---

## 🔧 Fichiers modifiés

- `prisma/schema.prisma` - Ajout des champs isBestSeller et isNew
- `src/app/page.tsx` - Sections Best-Sellers, Savoir-Faire, gestion image maison
- `src/app/api/products/route.ts` - Support des nouveaux champs
- `src/lib/db.ts` - Mise à jour du client Prisma

---

© 2026 MAISON KHAN - Chaussures de luxe artisanales / Made in Africa
