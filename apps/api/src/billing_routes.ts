import { pool } from "./db";
import { z } from "zod";

function n(v: any, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

export async function adminListPlans(req: any, res: any) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, code, name, price_monthly, currency,
            limit_sessions, limit_messages_daily, limit_broadcast_daily, limit_contacts,
            feature_api, feature_webhook, feature_inbox, feature_broadcast, feature_media,
            is_active, created_at, updated_at
     FROM plans
     ORDER BY id DESC`
  );
  res.json({ ok: true, plans: rows });
}

export async function adminUpsertPlan(req: any, res: any) {
  const schema = z.object({
    id: z.number().int().positive().optional(),
    code: z.string().min(2).max(40),
    name: z.string().min(1).max(120),
    price_monthly: z.number().int().min(0).default(0),
    currency: z.string().min(1).max(8).default("IDR"),

    limit_sessions: z.number().int().min(0).default(1),
    limit_messages_daily: z.number().int().min(0).default(50),
    limit_broadcast_daily: z.number().int().min(0).default(1),
    limit_contacts: z.number().int().min(0).default(1000),

    feature_api: z.number().int().min(0).max(1).default(1),
    feature_webhook: z.number().int().min(0).max(1).default(1),
    feature_inbox: z.number().int().min(0).max(1).default(1),
    feature_broadcast: z.number().int().min(0).max(1).default(1),
    feature_media: z.number().int().min(0).max(1).default(1),

    is_active: z.number().int().min(0).max(1).default(1),
  });

  const parsed = schema.safeParse({
    ...req.body,
    price_monthly: n(req.body?.price_monthly, 0),
    limit_sessions: n(req.body?.limit_sessions, 1),
    limit_messages_daily: n(req.body?.limit_messages_daily, 50),
    limit_broadcast_daily: n(req.body?.limit_broadcast_daily, 1),
    limit_contacts: n(req.body?.limit_contacts, 1000),
    feature_api: n(req.body?.feature_api, 1),
    feature_webhook: n(req.body?.feature_webhook, 1),
    feature_inbox: n(req.body?.feature_inbox, 1),
    feature_broadcast: n(req.body?.feature_broadcast, 1),
    feature_media: n(req.body?.feature_media, 1),
    is_active: n(req.body?.is_active, 1),
  });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const d = parsed.data;

  if (!d.id) {
    // insert + isi juga kolom legacy limit_messages_per_day (biar kompatibel)
    const [r] = await pool.query<any>(
      `INSERT INTO plans(
        code,name,price_monthly,currency,
        limit_sessions,limit_messages_daily,limit_broadcast_daily,limit_contacts,
        feature_api,feature_webhook,feature_inbox,feature_broadcast,feature_media,
        is_active,limit_messages_per_day
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.code, d.name, d.price_monthly, d.currency,
        d.limit_sessions, d.limit_messages_daily, d.limit_broadcast_daily, d.limit_contacts,
        d.feature_api, d.feature_webhook, d.feature_inbox, d.feature_broadcast, d.feature_media,
        d.is_active, d.limit_messages_daily
      ]
    );
    return res.json({ ok: true, id: r.insertId });
  } else {
    const [r] = await pool.query<any>(
      `UPDATE plans SET
        code=?, name=?, price_monthly=?, currency=?,
        limit_sessions=?, limit_messages_daily=?, limit_broadcast_daily=?, limit_contacts=?,
        feature_api=?, feature_webhook=?, feature_inbox=?, feature_broadcast=?, feature_media=?,
        is_active=?, limit_messages_per_day=?
      WHERE id=?`,
      [
        d.code, d.name, d.price_monthly, d.currency,
        d.limit_sessions, d.limit_messages_daily, d.limit_broadcast_daily, d.limit_contacts,
        d.feature_api, d.feature_webhook, d.feature_inbox, d.feature_broadcast, d.feature_media,
        d.is_active, d.limit_messages_daily,
        d.id
      ]
    );
    return res.json({ ok: true, affectedRows: r.affectedRows || 0 });
  }
}

export async function adminGetTenantSubscription(req: any, res: any) {
  const tenantId = Number(req.params.tenantId);
  if (!tenantId) return res.status(400).json({ ok: false, error: "invalid tenantId" });

  const [rows] = await pool.query<any[]>(
    `SELECT s.*,
            p.code AS plan_code, p.name AS plan_name, p.price_monthly, p.currency
     FROM subscriptions s
     LEFT JOIN plans p ON p.id=s.plan_id
     WHERE s.tenant_id=?
     ORDER BY s.id DESC
     LIMIT 1`,
    [tenantId]
  );

  res.json({ ok: true, subscription: rows[0] || null });
}

export async function adminCreateSubscription(req: any, res: any) {
  const tenantId = Number(req.params.tenantId);
  const planId = Number(req.body?.plan_id);
  if (!tenantId) return res.status(400).json({ ok: false, error: "invalid tenantId" });
  if (!planId) return res.status(400).json({ ok: false, error: "invalid plan_id" });

  // ambil plan snapshot limits
  const [pRows] = await pool.query<any[]>(
    `SELECT id, limit_sessions, limit_messages_daily, limit_broadcast_daily, limit_contacts
     FROM plans WHERE id=? AND is_active=1 LIMIT 1`,
    [planId]
  );
  if (!pRows.length) return res.status(400).json({ ok: false, error: "plan not found / inactive" });

  const p = pRows[0];
  const startAt = new Date();
  const startStr = startAt.toISOString().slice(0, 19).replace("T", " ");

  const [r] = await pool.query<any>(
    `INSERT INTO subscriptions(
      tenant_id, plan_id, status, start_at,
      limit_sessions, limit_messages_daily, limit_broadcast_daily, limit_contacts
    ) VALUES (?,?, 'trial', ?, ?, ?, ?, ?)`,
    [tenantId, planId, startStr, p.limit_sessions, p.limit_messages_daily, p.limit_broadcast_daily, p.limit_contacts]
  );

  res.json({ ok: true, id: r.insertId });
}

export async function adminSetSubscriptionStatus(req: any, res: any) {
  const tenantId = Number(req.params.tenantId);
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  const allowed = new Set(["trial", "active", "past_due", "canceled", "expired"]);
  if (!tenantId || !id) return res.status(400).json({ ok: false, error: "invalid params" });
  if (!allowed.has(status)) return res.status(400).json({ ok: false, error: "invalid status" });

  const [r] = await pool.query<any>(
    `UPDATE subscriptions SET status=?, updated_at=NOW() WHERE tenant_id=? AND id=?`,
    [status, tenantId, id]
  );

  res.json({ ok: true, affectedRows: r.affectedRows || 0 });
}

export async function adminListPayments(req: any, res: any) {
  const tenantId = Number(req.params.tenantId);
  if (!tenantId) return res.status(400).json({ ok: false, error: "invalid tenantId" });

  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, subscription_id, provider, provider_ref, amount, currency, status, paid_at, created_at
     FROM payments
     WHERE tenant_id=?
     ORDER BY id DESC
     LIMIT 200`,
    [tenantId]
  );

  res.json({ ok: true, payments: rows });
}

export async function adminCreatePayment(req: any, res: any) {
  const tenantId = Number(req.params.tenantId);
  if (!tenantId) return res.status(400).json({ ok: false, error: "invalid tenantId" });

  const schema = z.object({
    subscription_id: z.number().int().positive().optional(),
    provider: z.enum(["manual","midtrans","xendit","other"]).default("manual"),
    provider_ref: z.string().max(120).optional(),
    amount: z.number().int().min(0).default(0),
    currency: z.string().min(1).max(8).default("IDR"),
    status: z.enum(["pending","paid","failed","refunded","expired"]).default("pending"),
    meta_json: z.any().optional()
  });

  const parsed = schema.safeParse({
    ...req.body,
    amount: n(req.body?.amount, 0),
  });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  const d = parsed.data;

  const paidAt = d.status === "paid" ? new Date().toISOString().slice(0,19).replace("T"," ") : null;

  const [r] = await pool.query<any>(
    `INSERT INTO payments(tenant_id, subscription_id, provider, provider_ref, amount, currency, status, paid_at, meta_json)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      tenantId,
      d.subscription_id || null,
      d.provider,
      d.provider_ref || null,
      d.amount,
      d.currency,
      d.status,
      paidAt,
      d.meta_json ? JSON.stringify(d.meta_json) : null
    ]
  );

  res.json({ ok: true, id: r.insertId });
}

export async function adminMarkPaymentPaid(req: any, res: any) {
  const tenantId = Number(req.params.tenantId);
  const id = Number(req.params.id);
  if (!tenantId || !id) return res.status(400).json({ ok: false, error: "invalid params" });

  // only localhost for dev
  const host = String(req.headers.host || "");
  const ra = String(req.socket?.remoteAddress || "");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1") || ra.includes("127.0.0.1") || ra.includes("::1");
  if (!isLocal) return res.status(403).json({ ok: false, error: "forbidden" });

  // set payment paid
  const [r] = await pool.query<any>(
    `UPDATE payments SET status='paid', paid_at=NOW() WHERE tenant_id=? AND id=?`,
    [tenantId, id]
  );

  // kalau payment terkait subscription → aktifkan subscription
  const [p] = await pool.query<any[]>(
    `SELECT subscription_id FROM payments WHERE tenant_id=? AND id=? LIMIT 1`,
    [tenantId, id]
  );
  const sid = p?.[0]?.subscription_id;
  if (sid) {
    await pool.query(
      `UPDATE subscriptions SET status='active', updated_at=NOW() WHERE tenant_id=? AND id=?`,
      [tenantId, sid]
    );
  }

  res.json({ ok: true, affectedRows: r.affectedRows || 0, subscriptionActivated: !!sid });
}
