#!/usr/bin/env bash
set -euo pipefail

: "${WA_KEY:?WA_KEY is required. export WA_KEY=... }"

echo "[1] Set webhook active -> http://localhost:4010/webhook"
curl -sS -X POST "http://localhost:3001/webhooks/set" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${WA_KEY}" \
  -d '{"url":"http://localhost:4010/webhook","status":"active"}' >/dev/null

echo "[2] Lock only latest webhook active (optional safety)"
docker exec -i wa_mysql mysql -u wa_user -pwa_pass -D wa_saas -e "
UPDATE webhooks
SET is_active = CASE
  WHEN id = (SELECT id2 FROM (SELECT id AS id2 FROM webhooks WHERE tenant_id=1 ORDER BY id DESC LIMIT 1) t)
  THEN 1 ELSE 0 END
WHERE tenant_id=1;
" 2>/dev/null || true

echo "[3] Fetch active WEBHOOK_SECRET..."
WEBHOOK_SECRET="$(
  docker exec -i wa_mysql \
    mysql -u wa_user -pwa_pass -D wa_saas -N -B \
    -e "SELECT secret FROM webhooks WHERE tenant_id=1 AND is_active=1 ORDER BY id DESC LIMIT 1;" \
    2>/dev/null | tr -d '\r\n'
)"
echo "WEBHOOK_SECRET_HEAD=${WEBHOOK_SECRET:0:8}..."

echo "[4] Restart receiver on :4010"
lsof -ti :4010 | xargs kill -9 2>/dev/null || true
PORT=4010 WEBHOOK_SECRET="$WEBHOOK_SECRET" node tools/webhook-receiver-verify.js
