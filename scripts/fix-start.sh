#!/usr/bin/env bash
# ============================================================
# MAISON KHAN — Réparation express du serveur de production
# Usage (une seule ligne) :
#   cd /var/www/maison-khan && bash scripts/fix-start.sh
# Répare : serveur web arrêté, application plantée, PM2,
#          swap manquant, doublons MISTRAL dans le .env
# Sûr : ne touche ni à la base de données, ni au code
# ============================================================

ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; }
info() { echo "→ $1"; }

echo "═══════════ RÉPARATION MAISON KHAN ═══════════"
cd /var/www/maison-khan || { bad "Dossier /var/www/maison-khan introuvable"; exit 1; }

# ── 1. Nettoyage .env : dédoublonner les clés MISTRAL ──
# (les collages dans la console web ont pu créer des doublons)
for VAR in MISTRAL_API_KEY MISTRAL_VISION_MODEL; do
  N=$(grep -c "^${VAR}=" .env 2>/dev/null || true)
  if [ "${N:-0}" -gt 1 ]; then
    VAL=$(grep "^${VAR}=" .env | tail -n1)
    grep -v "^${VAR}=" .env > .env.tmp && printf '%s\n' "$VAL" >> .env.tmp && mv .env.tmp .env
    info "$VAR : doublon nettoyé dans .env"
  fi
done

# ── 2. Serveur web (nginx / caddy / apache) ──
for s in nginx caddy apache2; do
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "^${s}\.service"; then
    if [ "$(systemctl is-active "$s" 2>/dev/null)" = "active" ]; then
      ok "$s tourne déjà"
    else
      if systemctl start "$s" 2>/dev/null; then
        ok "$s était arrêté → redémarré"
      else
        bad "$s refuse de démarrer"
      fi
    fi
  fi
done

# ── 3. Application boutique ──
info "Redémarrage de l'application maison-khan..."
pm2 restart maison-khan >/dev/null 2>&1
sleep 4
if ! curl -s -m 4 http://localhost:3000/api/health >/dev/null 2>&1; then
  info "Toujours muet → recréation propre du processus..."
  pm2 delete maison-khan >/dev/null 2>&1
  pm2 start bun --name maison-khan -- run start >/dev/null 2>&1
  sleep 6
fi
pm2 save >/dev/null 2>&1 && info "pm2 save OK (l'app redémarrera après un reboot du VPS)"

# ── 4. Swap anti-crash (si absent et disque suffisant) ──
if ! swapon --show 2>/dev/null | grep -q .; then
  AVAIL_GB=$(df --output=avail -BG / 2>/dev/null | tail -n1 | tr -dc '0-9')
  if [ -n "${AVAIL_GB:-}" ] && [ "$AVAIL_GB" -ge 4 ]; then
    if fallocate -l 2G /swapfile 2>/dev/null; then
      chmod 600 /swapfile
      mkswap /swapfile >/dev/null 2>&1
      swapon /swapfile 2>/dev/null
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
      ok "Swap 2 Go créé (le serveur ne tuera plus ses apps faute de RAM)"
    else
      info "Swap non créé (fallocate a échoué)"
    fi
  else
    info "Swap non créé (seulement ${AVAIL_GB:-?} Go libres sur le disque)"
  fi
else
  ok "Swap déjà présent"
fi

# ── 5. Vérification finale ──
echo ""
echo "═══════════ RÉSULTAT ═══════════"
if curl -s -m 5 http://localhost:3000/api/health >/dev/null 2>&1; then
  ok "APPLICATION — la boutique répond"
else
  bad "APPLICATION — ne répond toujours pas"
  info "Logs à m'envoyer : pm2 logs maison-khan --lines 30 --nostream"
fi
CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://shop.maison-khan.com 2>/dev/null)
CODE=${CODE:-000}
case "$CODE" in
  200|301|302|307|308)
    ok "SITE WEB — https://shop.maison-khan.com répond (HTTP $CODE)"
    echo ""
    echo "🎉 C'EST RÉPARÉ ! Rafraîchis ton navigateur (Ctrl+F5)"
    ;;
  *)
    bad "SITE WEB — shop.maison-khan.com : HTTP $CODE (ou pas de réponse)"
    info "Envoie-moi une capture d'écran de tout cet écran"
    ;;
esac
echo "═══════════ FIN ═══════════"
