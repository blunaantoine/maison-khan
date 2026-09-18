#!/usr/bin/env bash
# ============================================================
# MAISON KHAN — Mise à jour + activation Google (une seule ligne)
#
# Usage 1 — déployer les nouveautés ET activer la connexion Google :
#   cd /var/www/maison-khan && git pull && bash scripts/update.sh ID_CLIENT SECRET_CLIENT
#
# Usage 2 — redéployer seulement (sans toucher à Google) :
#   cd /var/www/maison-khan && git pull && bash scripts/update.sh
#
# Le script :
#   1. Écrit GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET dans .env (si fournis)
#   2. Crée le swap anti-crash si absent (le build est gourmand en RAM)
#   3. Arrête l'app (libère la mémoire — évite le crash pendant le build)
#   4. Reconstruit l'application (bun run build)
#   5. Redémarre l'app + pm2 save
#   6. Vérifie la boutique, le bouton Google et le site web
#
# Sûr : ne touche ni à la base de données, ni au code.
# ============================================================

ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; }
info() { echo "→ $1"; }

echo "═══════════ MISE À JOUR MAISON KHAN ═══════════"
cd /var/www/maison-khan || { bad "Dossier /var/www/maison-khan introuvable"; exit 1; }

# ── 1. Identifiants Google dans .env (si fournis en arguments) ──
if [ -n "${1:-}" ] && [ -n "${2:-}" ]; then
  touch .env
  # S'assurer que .env se termine par une nouvelle ligne
  [ -n "$(tail -c 1 .env)" ] && echo >> .env
  # Écrire chaque variable (remplace l'ancienne valeur, dédoublonne si besoin)
  for PAIRE in "GOOGLE_CLIENT_ID:$1" "GOOGLE_CLIENT_SECRET:$2"; do
    VAR="${PAIRE%%:*}"
    VAL="${PAIRE#*:}"
    grep -v "^${VAR}=" .env > .env.tmp
    printf '%s=%s\n' "$VAR" "$VAL" >> .env.tmp
    mv .env.tmp .env
  done
  ok "Connexion Google configurée dans .env"
else
  info "Aucun identifiant Google fourni → configuration actuelle conservée"
fi

# ── 2. Backup de la base + mise à jour du schéma (nouvelles tables) ──
info "Sauvegarde de la base de données..."
if [ -f db/custom.db ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 db/custom.db ".backup 'db/custom.db.backup'" 2>/dev/null && ok "Base sauvegardée (db/custom.db.backup)"
  else
    cp db/custom.db db/custom.db.backup 2>/dev/null && ok "Base sauvegardée (copie simple)"
  fi
fi
info "Mise à jour du schéma de la base (nouvelles tables si besoin)..."
if bun run db:push > /tmp/mk-dbpush.log 2>&1; then
  ok "Schéma de la base à jour"
else
  bad "Mise à jour du schéma échouée — la base sauvegardée est conservée"
  info "Détails : tail -20 /tmp/mk-dbpush.log — envoie-les si tu bloques"
fi

# ── 3. Swap anti-crash pendant le build (créé seulement s'il manque) ──
if ! swapon --show 2>/dev/null | grep -q .; then
  if fallocate -l 2G /swapfile 2>/dev/null; then
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null 2>&1
    swapon /swapfile >/dev/null 2>&1
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Swap 2 Go créé (protection mémoire pendant le build)"
  else
    info "Swap non créé (pas critique, on continue)"
  fi
else
  ok "Swap déjà présent"
fi

# ── 4. Construction de la nouvelle version ──
info "Arrêt de l'app pour libérer la mémoire..."
pm2 stop maison-khan >/dev/null 2>&1
info "Construction de la nouvelle version (2 à 4 minutes, patiente sans fermer la page)..."
if bun run build > /tmp/mk-build.log 2>&1; then
  ok "Nouvelle version construite"
else
  bad "Build échoué — l'ancienne version est relancée"
  info "Détails de l'erreur : tail -40 /tmp/mk-build.log"
  pm2 restart maison-khan >/dev/null 2>&1 || pm2 start bun --name maison-khan -- run start >/dev/null 2>&1
  pm2 save >/dev/null 2>&1
  exit 1
fi

# ── 5. Redémarrage de l'application ──
pm2 restart maison-khan >/dev/null 2>&1
sleep 5
if ! curl -s -m 5 http://localhost:3000/api/health >/dev/null 2>&1; then
  info "Processus muet → recréation propre..."
  pm2 delete maison-khan >/dev/null 2>&1
  pm2 start bun --name maison-khan -- run start >/dev/null 2>&1
  sleep 6
fi
pm2 save >/dev/null 2>&1 && info "pm2 save OK (l'app redémarrera après un reboot du VPS)"

# ── 6. Vérifications finales ──
echo ""
echo "═══════════ RÉSULTAT ═══════════"
if curl -s -m 5 http://localhost:3000/api/health >/dev/null 2>&1; then
  ok "APPLICATION — la boutique répond"
else
  bad "APPLICATION — ne répond pas"
  info "Logs à m'envoyer : pm2 logs maison-khan --lines 30 --nostream"
fi

STATUS=$(curl -s -m 5 http://localhost:3000/api/auth/google/status 2>/dev/null)
if echo "$STATUS" | grep -q '"configured":true'; then
  ok "GOOGLE — le bouton « Continuer avec Google » est actif"
  echo "   ↳ Vérifie dans Google Cloud Console → Identifiants → ton ID client :"
  echo "     l'URI de redirection autorisée doit être :"
  echo "     https://shop.maison-khan.com/api/auth/google/callback"
else
  info "GOOGLE — pas encore configuré sur ce serveur (bouton masqué)"
fi

CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://shop.maison-khan.com 2>/dev/null)
CODE=${CODE:-000}
case "$CODE" in
  200|301|302|307|308)
    ok "SITE WEB — https://shop.maison-khan.com répond (HTTP $CODE)"
    echo ""
    echo "🎉 MISE À JOUR TERMINÉE ! Rafraîchis ton navigateur (Ctrl+F5)"
    ;;
  *)
    bad "SITE WEB — shop.maison-khan.com : HTTP $CODE (ou pas de réponse)"
    info "Envoie-moi une capture d'écran de tout cet écran"
    ;;
esac
echo "═══════════ FIN ═══════════"
