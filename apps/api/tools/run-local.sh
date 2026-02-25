#!/usr/bin/env bash
set -euo pipefail

: "${WA_KEY:?WA_KEY is required. export WA_KEY=... }"

echo "[1] Lock only latest webhook active..."
docker exec -i wa_mysql mysql -u wa_user -pwa_pass -D wa_saas -e "
UPDATE webhooks
SET is_active = CASE
  WHEN id = (SELECT id2 FROM (SELECT id AS id2 FROM webhooks WHERE tenant_id=1 ORDER BY id DESC LIMIT 1) t)
  THEN 1 ELSE 0 END
WHERE tenant_id=1;
" 2>/dev/null || true

echo "[2] Fetch active WEBHOOK_SECRET..."
WEBHOOK_SECRET="$(
  docker exec -i wa_mysql \
    mysql -u wa_user -pwa_pass -D wa_saas -N -B \
    -e "SELECT secret FROM webhooks WHERE tenant_id=1 AND is_active=1 ORDER BY id DESC LIMIT 1;" \
    2>/dev/null | tr -d '\r\n'
)"
echo "WEBHOOK_SECRET_HEAD=${WEBHOOK_SECRET:0:8}..."

echo "[3] Start receiver on :4010 (kill existing)..."
lsof -ti :4010 | xargs kill -9 2>/dev/null || true
PORT=4010 WEBHOOK_SECRET="$WEBHOOK_SECRET" node tools/webhook-receiver-verify.js
