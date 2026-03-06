#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/app}"
DOMAIN="${DOMAIN:-outfitsme.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.outfitsme.com}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?CERTBOT_EMAIL is required}"

cd "${APP_DIR}"

mkdir -p proxy letsencrypt certbot-www

cat > .env <<ENVFILE
FLASK_ENV=production
DEBUG=false
PORT=5000
CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}
DIAGNOSTICS_ENABLED=false
RATE_LIMIT_STORAGE_URI=memory://
MONTHLY_ANALYSIS_LIMIT=5
ENABLE_BEDROCK_ANALYSIS=false
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}
SUPABASE_BUCKET=${SUPABASE_BUCKET}
GEMINI_API_KEY=${GEMINI_API_KEY}
GEMINI_MODEL=${GEMINI_MODEL}
GEMINI_IMAGE_MODEL=${GEMINI_IMAGE_MODEL}
ITEM_IMAGE_MAX=3
SETTINGS_ENCRYPTION_KEY=${SETTINGS_ENCRYPTION_KEY}
DEFAULT_ANALYSIS_MODEL=${DEFAULT_ANALYSIS_MODEL}
DOCKERHUB_USERNAME=${DOCKERHUB_USERNAME}
IMAGE_TAG=${IMAGE_TAG}
ENVFILE

if [ -f "letsencrypt/live/${DOMAIN}/fullchain.pem" ] && [ -f "letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  cp proxy/nginx.ssl.conf proxy/nginx.conf
else
  cp proxy/nginx.http.conf proxy/nginx.conf
fi

docker compose pull
docker compose up -d --remove-orphans

if [ ! -f "letsencrypt/live/${DOMAIN}/fullchain.pem" ] || [ ! -f "letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  docker compose --profile certbot run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos --no-eff-email \
    -d "${DOMAIN}" -d "${WWW_DOMAIN}"

  cp proxy/nginx.ssl.conf proxy/nginx.conf
  docker compose exec -T proxy nginx -s reload
fi

cat > renew-certs.sh <<RENEW
#!/usr/bin/env bash
set -euo pipefail

cd "${APP_DIR}"
docker compose --profile certbot run --rm certbot renew --webroot -w /var/www/certbot --quiet
cp proxy/nginx.ssl.conf proxy/nginx.conf
docker compose exec -T proxy nginx -s reload
RENEW

chmod 700 renew-certs.sh

cat > /etc/cron.d/outfitme-certbot-renew <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root ${APP_DIR}/renew-certs.sh >> /var/log/outfitme-certbot-renew.log 2>&1
CRON
