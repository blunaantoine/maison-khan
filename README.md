# MAISON KHAN - E-commerce de Luxe

Boutique en ligne de chaussures et accessoires de luxe artisanaux, Made in Africa.

## 🏠 À propos

MAISON KHAN est une marque de chaussures et accessoires de luxe, confectionnés artisanalement à Lomé, Togo. Notre site e-commerce permet aux clients de découvrir et d'acheter nos créations en ligne.

## ✨ Fonctionnalités

### 🛍️ Boutique
- Catalogue de chaussures et accessoires
- Filtrage par catégorie, genre et type
- Pages produit détaillées avec sélection de couleur et taille
- Gestion des stocks en temps réel

### 🛒 Panier & Commande
- Panier persistant
- Checkout en 3 étapes (infos, livraison, paiement)
- Géolocalisation pour la livraison

### 💳 Paiement Mobile Money
- **Moov Money (Flooz)** - Réseau FLOOZ
- **T-Money (Togocel)** - Réseau TMONEY
- Intégration PayGate pour paiements sécurisés

### 👤 Compte Client
- Inscription / Connexion
- Historique des commandes
- Gestion des adresses
- Suivi des paiements

### 🔧 Administration
- Gestion des produits (CRUD)
- Gestion des commandes
- Gestion des utilisateurs
- Configuration du site (logo, images)

## 🚀 Technologies

- **Next.js 16** - Framework React
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Prisma** - ORM SQLite
- **PayGate** - Paiement Mobile Money

## 📦 Installation

```bash
# Installer les dépendances
bun install

# Configurer la base de données
bun run db:push

# Lancer le serveur de développement
bun run dev
```

## ⚙️ Configuration

Créer un fichier `.env` avec :

```env
DATABASE_URL=file:./db/custom.db
PAYGATE_AUTH_TOKEN=votre_token_paygate
PAYGATE_BASE_URL=https://paygateglobal.com/api/v1
NEXT_PUBLIC_BASE_URL=https://maison-khan.com
```

## 📞 Contact

- **WhatsApp** : +228 70 16 67 67
- **Instagram** : @maisonkhan7
- **TikTok** : @maison..khan7
- **Facebook** : Maison KHAN

---

Développé par **VISIBLE STUDIO** 🎨
