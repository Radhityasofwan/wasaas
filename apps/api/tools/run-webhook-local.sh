#!/usr/bin/env bash
set -euo pipefail

: "${WA_KEY:?WA_KEY not set. export WA_KEY=... dulu}"

API_BASE="${API_BASE:-http://localhost:3001}"
RECEIVER_PORT="${RECEIVER_PORT:-4010}"
RECEIVER_URL="http://localhost:${RECEIVER_PORT}/webhook"

echo "1) Set webhook -> ${RECEIVER_URL}"
curl -sS -X POST "${API_BASE}/webhooks/set" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${WA_KEY}" \
  -d "{\"url\":\"${RECEIVER_URL}\",\"status\":\"active\"}" | jq

echo "2) Deactivate older webhooks (tenant_id=1) keep latest"
docker exec -i wa_mysql mysql -u wa_user -pwa_pass -D wa_saas -e \
"UPDATE webhooks
 SET is_active = CASE WHEN id = (SELECT id2 FROM (SELECT id AS id2 FROM webhooks WHERE tenant_id=1 ORDER BY id DESC LIMIT 1) t) THEN 1 ELSE 0 END
 WHERE tenant_id=1;" >/dev/null 2>&1

echo "3) Get active secret (strip newlines)"
WEBHOOK_SECRET="$(
  docker exec -i wa_mysql \
    mysql -u wa_user -pwa_pass -D wa_saas -N -B \
    -e "SELECT secret FROM webhooks WHERE tenant_id=1 AND is_active=1 ORDER BY id DESC LIMIT 1;" \
    2>/dev/null | tr -d '\r\n'
)"
echo "WEBHOOK_SECRET_HEAD=${WEBHOOK_SECRET:0:8}... LEN=$(echo -n "$WEBHOOK_SECRET" | wc -c)"

echo "4) Run receiver on :${RECEIVER_PORT}"
lsof -ti :"${RECEIVER_PORT}" | xargs kill -9 2>/dev/null || true
PORT="${RECEIVER_PORT}" WEBHOOK_SECRET="${WEBHOOK_SECRET}" node tools/webhook-receiver-verify.js
