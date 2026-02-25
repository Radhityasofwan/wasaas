#!/usr/bin/env bash
set -euo pipefail

: "${WA_KEY:?WA_KEY env missing}"

API="http://localhost:3001"
RECEIVER_URL="http://localhost:4010/webhook"

echo "[1] Set webhook -> ${RECEIVER_URL}"
curl -sS -X POST "${API}/webhooks/set" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${WA_KEY}" \
  -d "{\"url\":\"${RECEIVER_URL}\",\"status\":\"active\"}" >/dev/null

echo "[2] Fetch active secret..."
WEBHOOK_SECRET="$(
  docker exec -i wa_mysql \
    mysql -u wa_user -pwa_pass -D wa_saas -N -B \
    -e "SELECT secret FROM webhooks WHERE tenant_id=1 AND is_active=1 ORDER BY id DESC LIMIT 1;" \
    2>/dev/null | tr -d '\r\n'
)"

if [ -z "${WEBHOOK_SECRET}" ]; then
  echo "❌ WEBHOOK_SECRET empty (db query failed?)" >&2
  exit 1
fi

echo "ACTIVE_SECRET_HEAD=${WEBHOOK_SECRET:0:8}..."

echo "[3] Restart receiver on :4010"
lsof -ti :4010 | xargs kill -9 2>/dev/null || true
PORT=4010 WEBHOOK_SECRET="${WEBHOOK_SECRET}" node tools/webhook-receiver-verify.js
