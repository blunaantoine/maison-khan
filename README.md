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
- **IA de vision (z-ai-web-dev-sdk)** - Analyse automatique des photos produits

## ✨ Nouveautés

### 🤖 Assistant IA — Ajout de produit accéléré
Dans le formulaire d'ajout de produit, après avoir chargé la photo d'un article
(dans le formulaire de couleur), cliquez sur **« ✨ Analyser la photo »** :
l'IA détecte automatiquement la **couleur** (nom français + teinte hex exacte),
et propose un **nom**, une **description**, la **catégorie**, le **genre** et les
**tailles** adaptées. Les champs déjà remplis ne sont jamais écrasés.

### 🍪 Consentement cookies & notifications navigateur
Bannière de consentement (tout accepter / personnaliser / refuser) avec réglages
modifiables à tout moment via le bouton flottant 🍪. Si l'utilisateur accepte les
notifications, il peut activer les alertes navigateur de **suivi de commande**
(confirmée, expédiée, livrée…).

### 🩺 Endpoint de santé /api/health
Pour être prévenu **avant** vos clients d'une panne, configurez un monitoring
gratuit (UptimeRobot) sur `https://shop.maison-khan.com/api/health`
(200 = tout va bien, 503 = problème détecté).

### 🔒 Sécurité renforcée
- Rate limiting sur la connexion (anti brute-force)
- Suppression du mot de passe admin codé en dur dans le client
- Mots de passe du seed via variables d'environnement (`SEED_ADMIN_PASSWORD`)

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

Développé par **STUDIO** 🎨
