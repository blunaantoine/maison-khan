#!/usr/bin/env bash
# ============================================================
# MAISON KHAN — Fermer la boutique au public (page « Ouverture très prochaine »)
# tout en gardant une adresse de travail pour ajouter les articles.
#
# Fermer au public + ouvrir l'adresse de travail :
#   cd /var/www/maison-khan && git pull origin fusion/dashboard+mmi && bash scripts/maintenance.sh on khanboss.duckdns.org
#   (ajoutez --mot-de-passe pour protéger aussi l'adresse de travail par un mot de passe)
#
# Rouvrir la boutique au public (l'adresse de travail reste utilisable) :
#   cd /var/www/maison-khan && bash scripts/maintenance.sh off
#
# Voir l'état actuel :
#   bash scripts/maintenance.sh status
#
# Le script :
#   - ne touche ni au code, ni à la base de données, ni au .env ;
#   - sauvegarde les fichiers nginx qu'il remplace (/root/nginx-backup/) ;
#   - vérifie la configuration avec « nginx -t » avant chaque rechargement,
#     et revient en arrière tout seul si elle est invalide.
# ============================================================
set -u

ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; }
info() { echo "→ $1"; }

# Chemins (surchargés uniquement pour les tests)
NGINX_DIR=${NGINX_DIR:-/etc/nginx}
LE_DIR=${LE_DIR:-/etc/letsencrypt/live}
ACME_ROOT=${ACME_ROOT:-/var/www/html}
APP_DIR=${APP_DIR:-/var/www/maison-khan}
PAGE_DIR=${PAGE_DIR:-/var/www/maison-khan-maintenance}
BACKUP_ROOT=${BACKUP_ROOT:-/root/nginx-backup}
APP_PORT=${APP_PORT:-3000}
SKIP_CERTBOT=${SKIP_CERTBOT:-0}
SKIP_DNS_CHECK=${SKIP_DNS_CHECK:-0}
NGINX_BIN=${NGINX_BIN:-nginx}
RELOAD_CMD=${RELOAD_CMD:-systemctl reload nginx}
IPV6=${IPV6:-1}   # 0 = ne pas écouter en IPv6 (tests uniquement)
V6_80=""; V6_443=""
[ "$IPV6" = 1 ] && { V6_80="    listen [::]:80;"; V6_443="    listen [::]:443 ssl;"; }

AVAILABLE="$NGINX_DIR/sites-available"
ENABLED="$NGINX_DIR/sites-enabled"
STATE="$NGINX_DIR/maison-khan-maintenance.state"
PUBLIC_CONF="maison-khan-fermee"   # page « Ouverture très prochaine »
WORK_CONF="maison-khan-travail"    # adresse de travail (boutique réelle)
# Fichiers nginx actuels de la boutique publique (remplacés pendant la fermeture)
PUBLIC_FILES="maison-khan maison-khan-apex"

nginx_ok() { "$NGINX_BIN" -t >/dev/null 2>&1; }
reload_nginx() { $RELOAD_CMD; }

usage() {
  echo "Usage :"
  echo "  bash scripts/maintenance.sh on <adresse-de-travail> [--mot-de-passe]"
  echo "  bash scripts/maintenance.sh off"
  echo "  bash scripts/maintenance.sh status"
  exit 1
}

# Liste « hôte certificat clé » des blocs HTTPS d'un fichier nginx
https_hosts() {
  awk '
    /server[[:space:]]*\{/ { depth=0; inside=1; ssl=0; names=""; cert=""; key="" }
    inside {
      line=$0
      if (line ~ /listen[^;]*443/) ssl=1
      if (line ~ /^[[:space:]]*server_name[[:space:]]/) { n=line; sub(/^[[:space:]]*server_name[[:space:]]+/, "", n); sub(/;.*/, "", n); names=names" "n }
      if (line ~ /^[[:space:]]*ssl_certificate[[:space:]]/) { c=line; sub(/^[[:space:]]*ssl_certificate[[:space:]]+/, "", c); sub(/;.*/, "", c); cert=c }
      if (line ~ /^[[:space:]]*ssl_certificate_key[[:space:]]/) { k=line; sub(/^[[:space:]]*ssl_certificate_key[[:space:]]+/, "", k); sub(/;.*/, "", k); key=k }
      o=gsub(/\{/, "{", line); c2=gsub(/\}/, "}", line); depth+=o-c2
      if (depth<=0 && o+c2>0) {
        if (ssl && cert!="") { m=split(names, arr, " "); for (i=1;i<=m;i++) if (arr[i]!="" && arr[i]!="_") print arr[i], cert, key }
        inside=0
      }
    }' "$1" 2>/dev/null
}

server_ips() {
  { hostname -I 2>/dev/null | tr ' ' '\n'; curl -s -m 5 https://api.ipify.org 2>/dev/null; echo; } | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | sort -u
}

write_page() {
  mkdir -p "$PAGE_DIR"
  [ -f "$APP_DIR/public/logo.png" ] && cp "$APP_DIR/public/logo.png" "$PAGE_DIR/logo.png"
  cat > "$PAGE_DIR/index.html" <<'HTML'
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>MAISON KHAN — Ouverture très prochaine</title>
<style>
  :root { --bg:#F8F6F3; --ink:#0A0A0A; --muted:#6B6560; --gold:#9C7C5C; --line:#E5E0DA; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; }
  body { background:var(--bg); color:var(--ink); font-family:Georgia, "Times New Roman", serif;
         display:flex; align-items:center; justify-content:center; padding:24px; text-align:center; }
  main { max-width:560px; }
  img { width:132px; height:auto; margin-bottom:32px; }
  .kicker { font-family:system-ui, sans-serif; font-size:12px; letter-spacing:.35em; text-transform:uppercase; color:var(--gold); margin-bottom:16px; }
  h1 { font-weight:400; font-size:clamp(28px, 6vw, 44px); line-height:1.15; margin-bottom:20px; }
  p { font-family:system-ui, sans-serif; color:var(--muted); font-size:16px; line-height:1.7; }
  hr { border:0; border-top:1px solid var(--line); width:64px; margin:28px auto; }
</style>
</head>
<body>
<main>
  <img src="/logo.png" alt="MAISON KHAN" onerror="this.remove()">
  <div class="kicker">Made in Africa</div>
  <h1>Notre boutique ouvre très prochainement</h1>
  <hr>
  <p>Nous préparons nos nouvelles collections de chaussures et accessoires de luxe.<br>
     Merci de votre patience — revenez très bientôt.</p>
</main>
</body>
</html>
HTML
  # nginx (utilisateur www-data) doit pouvoir lire la page
  chmod 755 "$PAGE_DIR"; chmod 644 "$PAGE_DIR"/* 2>/dev/null || true
}

snippet_proxy() {
  mkdir -p "$NGINX_DIR/snippets"
  cat > "$NGINX_DIR/snippets/maison-khan-proxy.conf" <<EOF
proxy_pass http://127.0.0.1:$APP_PORT;
proxy_http_version 1.1;
proxy_set_header Upgrade \$http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host \$host;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_read_timeout 90;
EOF
}

# ─────────────────────────────── ON ───────────────────────────────
do_on() {
  WORK="${1:-}"; PROTECT="${2:-}"
  WORK=$(echo "$WORK" | tr 'A-Z' 'a-z')
  echo "$WORK" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' || { bad "Adresse de travail invalide : « $WORK »"; usage; }
  [ -f "$STATE" ] && { bad "La boutique est déjà fermée au public (bash scripts/maintenance.sh status)"; exit 1; }

  echo "═══════════ FERMETURE AU PUBLIC — MAISON KHAN ═══════════"

  # 1. L'adresse de travail doit pointer vers ce serveur (sinon pas de certificat)
  if [ "$SKIP_DNS_CHECK" != 1 ]; then
    RESOLVED=$(getent ahostsv4 "$WORK" | awk '{print $1}' | sort -u)
    MATCH=""
    for ip in $(server_ips); do echo "$RESOLVED" | grep -qx "$ip" && MATCH=$ip; done
    if [ -z "$MATCH" ]; then
      bad "$WORK ne pointe pas vers ce serveur (il pointe vers : ${RESOLVED:-rien})"
      info "Adresse(s) de ce serveur : $(server_ips | tr '\n' ' ')"
      info "Corrige l'adresse IP chez DuckDNS (ou ton gestionnaire DNS), attends 1 minute, puis relance."
      exit 1
    fi
    ok "$WORK pointe bien vers ce serveur ($MATCH)"
  fi

  # 2. Domaines publics actuels + leurs certificats
  BACKUP="$BACKUP_ROOT/maintenance-$(date +%F-%H%M%S)"
  mkdir -p "$BACKUP"
  HOSTS_FILE="$BACKUP/hosts-publics.txt"; : > "$HOSTS_FILE"
  FOUND=""
  for f in $PUBLIC_FILES; do
    [ -e "$ENABLED/$f" ] || continue
    https_hosts "$ENABLED/$f" >> "$HOSTS_FILE"
    FOUND="$FOUND $f"
  done
  [ -n "$FOUND" ] || { bad "Aucun fichier nginx de la boutique publique trouvé dans $ENABLED ($PUBLIC_FILES)"; exit 1; }
  [ -s "$HOSTS_FILE" ] || { bad "Aucun domaine HTTPS trouvé dans :$FOUND"; exit 1; }
  ok "Domaines publics trouvés : $(awk '{print $1}' "$HOSTS_FILE" | sort -u | tr '\n' ' ')"

  write_page
  snippet_proxy

  # 3. Page « Ouverture très prochaine » pour les domaines publics (même certificats qu'avant)
  {
    echo "# MAISON KHAN — boutique fermée au public (scripts/maintenance.sh). Ne pas modifier à la main."
    awk '{print $1}' "$HOSTS_FILE" | sort -u | while read -r h; do
      echo "server {"
      echo "    listen 80;"
      [ -n "$V6_80" ] && echo "$V6_80"
      echo "    server_name $h;"
      echo "    location /.well-known/acme-challenge/ { root $ACME_ROOT; }"
      echo "    location / { return 301 https://\$host\$request_uri; }"
      echo "}"
    done
    while read -r h cert key; do
      echo "server {"
      echo "    listen 443 ssl;"
      [ -n "$V6_443" ] && echo "$V6_443"
      echo "    server_name $h;"
      echo "    ssl_certificate $cert;"
      echo "    ssl_certificate_key $key;"
      [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;"
      echo "    root $PAGE_DIR;"
      echo "    add_header X-Robots-Tag \"noindex\" always;"
      echo "    location = /logo.png { try_files /logo.png =404; }"
      echo "    location / { return 503; }"
      echo "    error_page 503 /index.html;"
      echo "    location = /index.html { internal; add_header Retry-After 86400 always; add_header Cache-Control \"no-store\" always; add_header X-Robots-Tag \"noindex\" always; }"
      echo "}"
    done < "$HOSTS_FILE"
  } > "$AVAILABLE/$PUBLIC_CONF"

  # 4. Adresse de travail : d'abord le port 80 seul (pour obtenir le certificat)
  WORK_CERT="$LE_DIR/$WORK/fullchain.pem"
  WORK_KEY="$LE_DIR/$WORK/privkey.pem"
  write_work_http() {
    cat > "$AVAILABLE/$WORK_CONF" <<EOF
# MAISON KHAN — adresse de travail (scripts/maintenance.sh)
server {
    listen 80;
$V6_80
    server_name $WORK;
    location /.well-known/acme-challenge/ { root $ACME_ROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
  }

  # Bascule : on retire les fichiers publics actuels (sauvegardés), on active les nouveaux
  for f in $FOUND; do cp -a "$ENABLED/$f" "$BACKUP/$f"; rm -f "$ENABLED/$f"; done
  ln -sf "$AVAILABLE/$PUBLIC_CONF" "$ENABLED/$PUBLIC_CONF"
  write_work_http
  ln -sf "$AVAILABLE/$WORK_CONF" "$ENABLED/$WORK_CONF"

  rollback() {
    rm -f "$ENABLED/$PUBLIC_CONF" "$ENABLED/$WORK_CONF"
    for f in $FOUND; do cp -a "$BACKUP/$f" "$ENABLED/$f"; done
    nginx_ok && reload_nginx
    bad "$1 — tout a été remis comme avant (rien n'a changé pour les visiteurs)."
    exit 1
  }

  nginx_ok || rollback "Configuration nginx invalide : $("$NGINX_BIN" -t 2>&1 | grep -m1 emerg)"
  reload_nginx || rollback "Rechargement de nginx impossible"
  ok "Boutique publique fermée : page « Ouverture très prochaine » active"

  # 5. Certificat de l'adresse de travail
  if [ "$SKIP_CERTBOT" != 1 ]; then
    mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
    if ! certbot certonly --webroot -w "$ACME_ROOT" -d "$WORK" -n --keep-until-expiring \
         --no-directory-hooks --deploy-hook "systemctl reload nginx" >"$BACKUP/certbot.log" 2>&1; then
      bad "Certificat impossible pour $WORK :"
      grep -E "Domain|Type|Detail" "$BACKUP/certbot.log" | head -6
      info "La boutique reste fermée au public. Corrige le DNS de $WORK puis relance :"
      info "  bash scripts/maintenance.sh off && bash scripts/maintenance.sh on $WORK"
      echo "$FOUND|$BACKUP|$WORK" > "$STATE"
      exit 1
    fi
  fi
  [ -f "$WORK_CERT" ] || { bad "Certificat introuvable : $WORK_CERT"; echo "$FOUND|$BACKUP|$WORK" > "$STATE"; exit 1; }
  ok "Certificat HTTPS de $WORK prêt"

  # 6. Mot de passe optionnel sur l'adresse de travail
  AUTH_LINES=""
  if [ "$PROTECT" = "--mot-de-passe" ]; then
    read -r -p "Nom d'utilisateur pour l'adresse de travail : " AU
    read -r -s -p "Mot de passe : " AP; echo
    [ -n "$AU" ] && [ -n "$AP" ] || { bad "Nom ou mot de passe vide"; echo "$FOUND|$BACKUP|$WORK" > "$STATE"; exit 1; }
    printf '%s:%s\n' "$AU" "$(openssl passwd -apr1 "$AP")" > "$NGINX_DIR/maison-khan-travail.htpasswd"
    # Lisible par l'utilisateur de nginx (www-data sur Ubuntu), pas par les autres
    NG_USER=$(awk '$1=="user"{gsub(";","",$2); print $2; exit}' "$NGINX_DIR/nginx.conf" 2>/dev/null)
    NG_GROUP=$(id -gn "${NG_USER:-www-data}" 2>/dev/null || echo www-data)
    chown "root:$NG_GROUP" "$NGINX_DIR/maison-khan-travail.htpasswd" 2>/dev/null || true
    chmod 640 "$NGINX_DIR/maison-khan-travail.htpasswd"
    unset AP
    AUTH_LINES="    auth_basic \"MAISON KHAN — acces reserve\";
    auth_basic_user_file $NGINX_DIR/maison-khan-travail.htpasswd;"
  fi

  # 7. Adresse de travail complète : la vraie boutique, cachée des moteurs de recherche
  cat > "$AVAILABLE/$WORK_CONF" <<EOF
# MAISON KHAN — adresse de travail (scripts/maintenance.sh)
server {
    listen 80;
$V6_80
    server_name $WORK;
    location /.well-known/acme-challenge/ { root $ACME_ROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
$V6_443
    server_name $WORK;
    ssl_certificate $WORK_CERT;
    ssl_certificate_key $WORK_KEY;
$( [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;" )
    client_max_body_size 16M;
    add_header X-Robots-Tag "noindex, nofollow" always;
$AUTH_LINES
    # Appels des prestataires de paiement / e-mail : jamais derrière le mot de passe
    location ~ ^/api/(kprimepay/webhook|paydunya/callback|paygate/callback|webhooks/resend|cron/) {
        auth_basic off;
        include $NGINX_DIR/snippets/maison-khan-proxy.conf;
    }
    location / {
        include $NGINX_DIR/snippets/maison-khan-proxy.conf;
    }
}
EOF
  if ! nginx_ok; then
    write_work_http
    nginx_ok && reload_nginx
    echo "$FOUND|$BACKUP|$WORK" > "$STATE"
    bad "Configuration de l'adresse de travail invalide : $("$NGINX_BIN" -t 2>&1 | grep -m1 emerg)"
    exit 1
  fi
  reload_nginx
  echo "$FOUND|$BACKUP|$WORK" > "$STATE"

  echo ""
  echo "═══════════ RÉSULTAT ═══════════"
  ok "Clients : la boutique affiche « Ouverture très prochaine »"
  ok "Travail : https://$WORK (boutique complète, invisible pour Google)"
  [ -n "$AUTH_LINES" ] && ok "Adresse de travail protégée par mot de passe"
  info "Connecte-toi sur https://$WORK avec ton compte admin (mot de passe, pas Google)."
  info "Pour rouvrir au public : cd $APP_DIR && bash scripts/maintenance.sh off"
  info "Sauvegarde des anciens fichiers nginx : $BACKUP"
  echo "═══════════ FIN ═══════════"
}

# ─────────────────────────────── OFF ──────────────────────────────
do_off() {
  [ -f "$STATE" ] || { info "La boutique n'est pas fermée : rien à faire."; exit 0; }
  IFS='|' read -r FOUND BACKUP WORK < "$STATE"
  echo "═══════════ RÉOUVERTURE AU PUBLIC — MAISON KHAN ═══════════"
  for f in $FOUND; do
    [ -e "$BACKUP/$f" ] || { bad "Sauvegarde introuvable : $BACKUP/$f"; exit 1; }
  done
  rm -f "$ENABLED/$PUBLIC_CONF"
  for f in $FOUND; do cp -a "$BACKUP/$f" "$ENABLED/$f"; done
  if ! nginx_ok; then
    for f in $FOUND; do rm -f "$ENABLED/$f"; done
    ln -sf "$AVAILABLE/$PUBLIC_CONF" "$ENABLED/$PUBLIC_CONF"
    bad "Configuration invalide après restauration : $("$NGINX_BIN" -t 2>&1 | grep -m1 emerg)"
    info "La boutique reste fermée. Envoie-moi ce message."
    exit 1
  fi
  reload_nginx
  rm -f "$STATE"
  ok "Boutique rouverte au public"
  [ -n "$WORK" ] && info "L'adresse de travail https://$WORK reste active (aucun impact)."
  echo "═══════════ FIN ═══════════"
}

do_status() {
  if [ -f "$STATE" ]; then
    IFS='|' read -r FOUND BACKUP WORK < "$STATE"
    ok "Boutique FERMÉE au public — adresse de travail : https://$WORK"
    info "Sauvegarde : $BACKUP"
  else
    ok "Boutique OUVERTE au public"
  fi
}

[ "$(id -u)" = 0 ] || [ "${ALLOW_NON_ROOT:-0}" = 1 ] || { bad "Lance ce script en root"; exit 1; }
case "${1:-}" in
  on)     shift; do_on "${1:-}" "${2:-}" ;;
  off)    do_off ;;
  status) do_status ;;
  *)      usage ;;
esac
