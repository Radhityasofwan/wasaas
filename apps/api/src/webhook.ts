import { pool } from "./db";
import { dispatchTenantPushNotification } from "./push_notify";

type WebhookRow = {
  id: number;
  tenant_id: number;
  user_id: number;
  url: string;
  secret: string;
  events_json: any;
  is_active: number;
};

function parseEvents(events_json: any): string[] {
  try {
    if (Array.isArray(events_json)) return events_json.map(String);
    if (typeof events_json === "string") {
      const v = JSON.parse(events_json);
      return Array.isArray(v) ? v.map(String) : [];
    }
    return [];
  } catch {
    return [];
  }
}

function shouldSend(events: string[], eventName: string) {
  if (!events?.length) return true;
  return events.includes(eventName);
}

export async function getActiveWebhook(tenantId: number): Promise<WebhookRow | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, user_id, url, secret, events_json, is_active
     FROM webhooks
     WHERE tenant_id=? AND is_active=1
     ORDER BY id DESC LIMIT 1`,
    [tenantId]
  );
  if (!rows?.length) return null;
  return rows[0] as WebhookRow;
}

export async function enqueueWebhook(tenantId: number, eventName: string, payload: any) {
  dispatchTenantPushNotification(tenantId, eventName, payload).catch((e: any) => {
    console.warn("[Push] dispatch failed:", e?.message || e);
  });

  const wh = await getActiveWebhook(tenantId);
  if (!wh) return;

  const events = parseEvents(wh.events_json);
  if (!shouldSend(events, eventName)) return;

  await pool.query(
    `INSERT INTO webhook_deliveries(webhook_id, tenant_id, event_name, payload_json, status, try_count)
     VALUES(?, ?, ?, ?, 'queued', 0)`,
    [wh.id, tenantId, eventName, JSON.stringify(payload ?? {})]
  );
}

export async function processWebhookQueue() {
  // ambil batch kecil supaya stabil
  const [rows] = await pool.query<any[]>(
    `SELECT id, webhook_id, tenant_id, event_name, payload_json, try_count
     FROM webhook_deliveries
     WHERE status='queued' AND try_count < 8
     ORDER BY id ASC
     LIMIT 10`
  );

  for (const row of rows) {
    // ambil webhook url (harus aktif)
    const [whRows] = await pool.query<any[]>(
      `SELECT url, secret, is_active
       FROM webhooks
       WHERE id=? AND tenant_id=? LIMIT 1`,
      [row.webhook_id, row.tenant_id]
    );

    if (!whRows?.length || Number(whRows[0].is_active) !== 1) {
      await pool.query(
        `UPDATE webhook_deliveries
         SET status='failed', try_count=try_count+1, response_body=?
         WHERE id=?`,
        ["webhook not active or missing", row.id]
      );
      continue;
    }

    const url = String(whRows[0].url);
    const secret = String(whRows[0].secret || "");

    // mark attempt
    await pool.query(
      `UPDATE webhook_deliveries SET try_count=try_count+1 WHERE id=?`,
      [row.id]
    );

    try {
      // body sudah json string (MySQL json biasanya keluar object/string)
      let payloadObj: any = {};
      try {
        payloadObj = typeof row.payload_json === "string"
          ? (JSON.parse(row.payload_json || "{}"))
          : (row.payload_json ?? {});
      } catch {
        payloadObj = {};
      }
      const payloadStr = JSON.stringify(payloadObj ?? {});
// OPTIONAL: signature header (biar receiver bisa verify)
      // simple HMAC SHA256 with secret
      let signature = "";
      if (secret) {
        const crypto = await import("crypto");
        signature = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
      }

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": String(row.event_name),
          "X-Webhook-Delivery-Id": String(row.id),
          "X-Webhook-Tenant": String(row.tenant_id),
          ...(secret ? { "X-Webhook-Signature": signature } : {})
        },
        body: payloadStr
      });

      const bodyText = await resp.text();
      const code = resp.status;

      if (resp.ok) {
        await pool.query(
          `UPDATE webhook_deliveries
           SET status='sent', http_status=?, response_body=?
           WHERE id=?`,
          [code, bodyText.slice(0, 2000), row.id]
        );

        await pool.query(
          `UPDATE webhooks SET last_sent_at=NOW() WHERE id=?`,
          [row.webhook_id]
        );
      } else {
        await pool.query(
          `UPDATE webhook_deliveries
           SET status='failed', http_status=?, response_body=?
           WHERE id=?`,
          [code, bodyText.slice(0, 2000), row.id]
        );
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      await pool.query(
        `UPDATE webhook_deliveries
         SET status='failed', response_body=?
         WHERE id=?`,
        [msg.slice(0, 2000), row.id]
      );
    }
  }
}
