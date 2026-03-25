# ============================================
# MISE À JOUR MAISON KHAN - SERVEUR LWS
# ============================================
# Date : Mars 2026
# ============================================

## 📦 FICHIERS À REMPLACER SUR VOTRE SERVEUR LWS

### 1. Via FTP ou File Manager LWS :

Remplacez ces fichiers sur votre serveur :

```
/prisma/schema.prisma          → Nouveaux champs isBestSeller, isNew
/prisma/seed-demo.ts           → Script de seed
/src/lib/db.ts                 → Cache bust Prisma
/src/app/page.tsx              → Toutes les nouvelles sections
/src/app/api/products/route.ts → Support isBestSeller, isNew
/src/app/api/settings/maison-image/route.ts → Déjà existant
```

---

## 🔧 COMMANDES À EXÉCUTER VIA SSH (LWS)

Connectez-vous en SSH à votre serveur LWS puis exécutez :

```bash
cd /chemin/vers/votre/projet

# 1. Mettre à jour la base de données
bunx prisma db push

# 2. Régénérer Prisma
bunx prisma generate

# 3. Exécuter le seed
bun run prisma/seed-demo.ts

# 4. Vider le titre hero
bun -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function update() {
  await prisma.siteContent.updateMany({
    where: { key: 'hero_title' },
    data: { value: '' }
  });
  await prisma.siteContent.updateMany({
    where: { key: 'hero_title_highlight' },
    data: { value: '' }
  });
  await prisma.siteContent.updateMany({
    where: { key: 'hero_description' },
    data: { value: 'Découvrez des chaussures d\\'exception conçues pour celles et ceux qui recherchent l\\'élégance, la qualité et le raffinement. Des créations haut de gamme où chaque détail est pensé pour affirmer votre style.' }
  });
  console.log('✅ Contenu mis à jour');
  await prisma.\$disconnect();
}
update();
"

# 5. Redémarrer l'application
pm2 restart maison-khan
# ou
bun run build && bun run start
```

---

## 📋 LISTE DES MODIFICATIONS

| Fichier | Modifications |
|---------|---------------|
| `schema.prisma` | Ajout isBestSeller, isNew |
| `page.tsx` | Sections Best-Sellers, Savoir-Faire, Image Maison |
| `api/products/route.ts` | Support nouveaux champs |
| `db.ts` | Cache bust v6 |

---

## ✅ NOUVELLES FONCTIONNALITÉS

1. **Section Best-Sellers** - Affiche les produits marqués ⭐
2. **Section Notre Savoir-Faire** - 4 étapes artisanales
3. **Toggle Best-Seller** - Dans le formulaire produit
4. **Toggle Nouveauté** - Dans le formulaire produit
5. **Image Notre Maison** - Gestion dans l'admin
6. **Hero mis à jour** - Nouvelle description

---

## 🔐 ACCÈS ADMIN

- Cliquez sur "Chaussures de luxe" dans le footer
- Mot de passe : `Khan1975@@`

---

© 2026 MAISON KHAN - Chaussures de luxe artisanales / Made in Africa
