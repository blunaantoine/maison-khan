# MAISON KHAN - Site E-commerce

Site e-commerce de luxe pour MAISON KHAN - Chaussures artisanales made in Africa.

## 🚀 Installation

### Prérequis
- Node.js 18+ ou Bun
- SQLite3

### Étapes d'installation

```bash
# 1. Installer les dépendances
bun install

# 2. Configurer l'environnement
cp .env.example .env
# Éditez le fichier .env avec vos valeurs

# 3. Initialiser la base de données
bun run db:push

# 4. Lancer le serveur de développement
bun run dev
```

## 📁 Structure du projet

```
├── src/
│   ├── app/              # Pages et API Next.js
│   ├── components/       # Composants React
│   ├── hooks/           # Hooks personnalisés
│   └── lib/             # Utilitaires
├── prisma/              # Schéma et seeds
├── public/              # Fichiers statiques
└── db/                  # Base de données SQLite
```

## 🔧 Scripts disponibles

- `bun run dev` - Serveur de développement
- `bun run build` - Build de production
- `bun run lint` - Vérification ESLint
- `bun run db:push` - Mise à jour de la base de données

## 🌐 Déploiement

Voir `deploy-vps.sh` pour les instructions de déploiement sur VPS.

## 📧 Contact

- WhatsApp: +228 70 16 67 67
- Email: contact@maison-khan.com
- Adresse: Lomé, Togo
