#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/app}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-/etc/outfitsme/app.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-/etc/outfitsme/deploy.env}"

if [ ! -f "${RUNTIME_ENV_FILE}" ]; then
  echo "Missing runtime env file: ${RUNTIME_ENV_FILE}" >&2
  exit 1
fi

if [ ! -f "${DEPLOY_ENV_FILE}" ]; then
  echo "Missing deploy env file: ${DEPLOY_ENV_FILE}" >&2
  exit 1
fi

set -a
source "${RUNTIME_ENV_FILE}"
source "${DEPLOY_ENV_FILE}"
set +a

DOMAIN="${DOMAIN:?DOMAIN is required}"
WWW_DOMAIN="${WWW_DOMAIN:?WWW_DOMAIN is required}"
APP_URL="${APP_URL:-https://${DOMAIN}}"
NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-${APP_URL}}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?CERTBOT_EMAIL is required}"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:?DOCKERHUB_USERNAME is required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"

mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

for required_path in compose.yaml proxy/nginx.http.conf proxy/nginx.ssl.conf; do
  if [ ! -f "${required_path}" ]; then
    echo "Missing deploy asset: ${APP_DIR}/${required_path}" >&2
    exit 1
  fi
done

mkdir -p proxy letsencrypt certbot-www

compose_cmd=(docker compose --env-file "${DEPLOY_ENV_FILE}")

render_nginx_config() {
  local template_path="$1"
  python3 - <<PY
from pathlib import Path
content = Path("${template_path}").read_text()
content = content.replace("__DOMAIN__", "${DOMAIN}")
content = content.replace("__WWW_DOMAIN__", "${WWW_DOMAIN}")
Path("proxy/nginx.conf").write_text(content)
PY
}

if [ -f "letsencrypt/live/${DOMAIN}/fullchain.pem" ] && [ -f "letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  render_nginx_config proxy/nginx.ssl.conf
else
  render_nginx_config proxy/nginx.http.conf
fi

"${compose_cmd[@]}" pull
"${compose_cmd[@]}" up -d --remove-orphans
"${compose_cmd[@]}" exec -T proxy nginx -s reload

if [ ! -f "letsencrypt/live/${DOMAIN}/fullchain.pem" ] || [ ! -f "letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  "${compose_cmd[@]}" --profile certbot run --rm certbot certonly \
    --webroot -w /var/www/certbot \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos --no-eff-email \
    -d "${DOMAIN}" -d "${WWW_DOMAIN}"

  render_nginx_config proxy/nginx.ssl.conf
  "${compose_cmd[@]}" exec -T proxy nginx -s reload
fi

cat > renew-certs.sh <<RENEW
#!/usr/bin/env bash
set -euo pipefail

cd "${APP_DIR}"
docker compose --env-file "${DEPLOY_ENV_FILE}" --profile certbot run --rm certbot renew --webroot -w /var/www/certbot --quiet
python3 - <<PY
from pathlib import Path
content = Path("proxy/nginx.ssl.conf").read_text()
content = content.replace("__DOMAIN__", "${DOMAIN}")
content = content.replace("__WWW_DOMAIN__", "${WWW_DOMAIN}")
Path("proxy/nginx.conf").write_text(content)
PY
docker compose --env-file "${DEPLOY_ENV_FILE}" exec -T proxy nginx -s reload
RENEW

chmod 700 renew-certs.sh

cat > /etc/cron.d/outfitme-certbot-renew <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root ${APP_DIR}/renew-certs.sh >> /var/log/outfitme-certbot-renew.log 2>&1
CRON
