#!/usr/bin/env bash
# ============================================================
# MAISON KHAN — Activation de la connexion Apple (une seule commande)
#
# Usage (sur le VPS) :
#   cd /var/www/maison-khan && bash scripts/enable-apple.sh
#
# PRÉPARATION (5 min, compte Apple Developer requis — 99 $/an) :
#   https://developer.apple.com → Certificates, Identifiers & Profiles
#
#   1. IDENTIFIERS → bouton + → « Services IDs » → Continue
#        - Description : Maison Khan Web
#        - Identifier  : com.maisonkhan.web   ← C'EST LE « CLIENT ID »
#      Puis ouvre ce Services ID → coche « Sign in with Apple » → Configure :
#        - Primary App ID : (choisis l'app Maison Khan si tu en as une,
#          sinon crée d'abord un App ID classique)
#        - Domains     : shop.maison-khan.com
#        - Return URLs : https://shop.maison-khan.com/api/auth/apple/callback
#      → Continue → Save → (Apple peut demander à vérifier le domaine :
#         télécharge le fichier .txt et je te dirai où le placer)
#
#   2. KEYS → bouton + → nom : « Maison Khan Apple »
#        - Coche « Sign in with Apple » → Configure → sélectionne le
#          Services ID ci-dessus → Continue → Register
#        - NOTE LE « KEY ID » (10 caractères)
#        - Télécharge le fichier .p8 (TÉLÉCHARGEABLE UNE SEULE FOIS !)
#          → transfère-le sur le VPS, ex. : /tmp/AuthKey_XXXXXXXXXX.p8
#
#   3. TEAM ID : en haut à droite du site Apple Developer → Account
#      Details → « Team ID » (10 caractères)
#
# Le script écrit les 4 valeurs dans .env, redémarre l'app et vérifie
# que le bouton « Continuer avec Apple » devient actif.
# ============================================================

ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; }
info() { echo "→ $1"; }

echo "═══════════ ACTIVATION CONNEXION APPLE ═══════════"
cd /var/www/maison-khan || { bad "Dossier /var/www/maison-khan introuvable"; exit 1; }

echo ""
echo "Réponds aux 4 questions (ou Ctrl+C pour annuler) :"
echo ""

read -r -p "1/4  Services ID (ex. com.maisonkhan.web) : " CLIENT_ID
read -r -p "2/4  Team ID (10 caractères) : " TEAM_ID
read -r -p "3/4  Key ID (10 caractères) : " KEY_ID
echo "4/4  Clé privée : chemin du fichier .p8 transféré sur le VPS"
echo "     (ex. /tmp/AuthKey_XXXXXXXXXX.p8), OU colle la clé sur une"
echo "     seule ligne en remplaçant les sauts de ligne par \\n :"
read -r -e -p "     Clé ou chemin : " PRIVATE_KEY

# ── Validations ──
[ -n "$CLIENT_ID" ] || { bad "Services ID vide"; exit 1; }
[ "${#TEAM_ID}" -eq 10 ] || { bad "Team ID invalide : il fait exactement 10 caractères"; exit 1; }
[ "${#KEY_ID}" -eq 10 ] || { bad "Key ID invalide : il fait exactement 10 caractères"; exit 1; }

# Chemin de fichier .p8 → lire le contenu
if [ -f "$PRIVATE_KEY" ]; then
  PRIVATE_KEY=$(cat "$PRIVATE_KEY")
  ok "Clé lue depuis le fichier .p8"
fi

echo "$PRIVATE_KEY" | grep -q "PRIVATE KEY" || {
  bad "Clé privée invalide : elle doit contenir « -----BEGIN PRIVATE KEY----- »"
  info "Ouvre le fichier .p8 avec un éditeur de texte et copie tout son contenu"
  exit 1
}

# ── Écriture dans .env (dédoublonnée, comme update.sh) ──
touch .env
[ -n "$(tail -c 1 .env)" ] && echo >> .env
for PAIRE in "APPLE_CLIENT_ID:$CLIENT_ID" "APPLE_TEAM_ID:$TEAM_ID" "APPLE_KEY_ID:$KEY_ID"; do
  VAR="${PAIRE%%:*}"
  VAL="${PAIRE#*:}"
  grep -v "^${VAR}=" .env > .env.tmp
  printf '%s=%s\n' "$VAR" "$VAL" >> .env.tmp
  mv .env.tmp .env
done
# Clé privée : sauts de ligne échappés en \n pour tenir sur une ligne
grep -v "^APPLE_PRIVATE_KEY=" .env > .env.tmp
printf '%s\n' "APPLE_PRIVATE_KEY=$(printf '%s' "$PRIVATE_KEY" | tr '\n' '\\n')" >> .env.tmp
mv .env.tmp .env
ok "Les 4 identifiants Apple sont écrits dans .env"

# ── Redémarrage de l'application ──
info "Redémarrage de l'application..."
pm2 restart maison-khan >/dev/null 2>&1 || pm2 start bun --name maison-khan -- run start >/dev/null 2>&1
sleep 5
pm2 save >/dev/null 2>&1

# ── Vérification finale ──
STATUS=$(curl -s -m 5 http://localhost:3000/api/auth/apple/status 2>/dev/null)
if echo "$STATUS" | grep -q '"configured":true'; then
  ok "BOUTON APPLE ACTIF — « Continuer avec Apple » apparaît maintenant sur la boutique"
  echo ""
  echo "🎉 Dernière étape côté Apple : vérifie dans Certificates, Identifiers &"
  echo "   Profiles → ton Services ID → Sign in with Apple → Configure que le"
  echo "   Return URL est exactement :"
  echo "   https://shop.maison-khan.com/api/auth/apple/callback"
  echo ""
  echo "   Puis teste sur https://shop.maison-khan.com (Ctrl+F5) → Connexion."
  echo "   Si Apple affiche « invalid_client », le Services ID ou le Return URL"
  echo "   est mal saisi côté Apple Developer."
else
  bad "Le bouton Apple n'est pas encore actif"
  info "Logs à m'envoyer : pm2 logs maison-khan --lines 30 --nostream"
fi
echo "═══════════ FIN ═══════════"
