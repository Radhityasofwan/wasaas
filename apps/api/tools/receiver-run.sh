#!/usr/bin/env bash
set -euo pipefail

export WEBHOOK_SECRET="$(
  docker exec -i wa_mysql \
    mysql -u wa_user -pwa_pass -D wa_saas -N -B \
    -e "SELECT secret FROM webhooks WHERE tenant_id=1 AND is_active=1 ORDER BY id DESC LIMIT 1;" \
    2>/dev/null | tr -d '\r\n'
)"

echo "ACTIVE_SECRET_HEAD=${WEBHOOK_SECRET:0:8}..."
lsof -ti :4010 | xargs kill -9 2>/dev/null || true
PORT=4010 WEBHOOK_SECRET="$WEBHOOK_SECRET" node tools/webhook-receiver-verify.js
