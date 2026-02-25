import { pool } from "./db";
import crypto from "crypto";
import { z } from "zod";

/**
 * Contract:
 * POST /webhooks/set
 * Header: x-api-key
 * Body: { url: string, status: "active"|"inactive" }
 *
 * DB schema actual:
 * webhooks(tenant_id,user_id,url,secret,events_json,is_active,last_sent_at,created_at)
 */
export async function setWebhook(req: any, res: any) {
  const schema = z.object({
    url: z.string().url().max(500),
    status: z.enum(["active", "inactive"]).default("active"),
    // optional: allow client set events; default common ones
    events: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const tenantId = Number(req.auth?.tenantId || 0);
  const userId = Number(req.auth?.userId || 0);
  if (!tenantId || !userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const url = parsed.data.url.trim();
  const isActive = parsed.data.status === "active" ? 1 : 0;

  const events = parsed.data.events?.length
    ? parsed.data.events
    : ["message.incoming", "message.status", "session.update", "broadcast.status"];

  // reuse secret if same url exists for tenant
  const [exist] = await pool.query<any[]>(
    `SELECT id, secret FROM webhooks WHERE tenant_id=? AND url=? ORDER BY id DESC LIMIT 1`,
    [tenantId, url]
  );

  const secret = exist?.length
    ? String(exist[0].secret)
    : crypto.randomBytes(32).toString("hex");

  let webhookId: number;

  if (exist?.length) {
    webhookId = Number(exist[0].id);
    await pool.query(
      `UPDATE webhooks
       SET user_id=?, secret=?, events_json=?, is_active=?
       WHERE id=? AND tenant_id=?`,
      [userId, secret, JSON.stringify(events), isActive, webhookId, tenantId]
    );
  } else {
    const [ins]: any = await pool.query(
      `INSERT INTO webhooks(tenant_id, user_id, url, secret, events_json, is_active)
       VALUES(?,?,?,?,?,?)`,
      [tenantId, userId, url, secret, JSON.stringify(events), isActive]
    );
    webhookId = Number(ins.insertId);
  }

  // if activating, ensure only one active (latest) for tenant
  if (isActive === 1) {
    await pool.query(
      `UPDATE webhooks SET is_active=0 WHERE tenant_id=? AND id<>?`,
      [tenantId, webhookId]
    );
    await pool.query(
      `UPDATE webhooks SET is_active=1 WHERE tenant_id=? AND id=?`,
      [tenantId, webhookId]
    );
  }

  return res.json({
    ok: true,
    id: webhookId,
    url,
    is_active: isActive,
    secret_head: secret.slice(0, 8),
    events,
  });
}
