import { pool } from "./db";

export async function getTenant(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const [rows] = await pool.query<any[]>(
    `SELECT id, name, slug, is_active, limit_sessions, limit_messages_per_day
     FROM tenants WHERE id=? LIMIT 1`,
    [tenantId]
  );
  if (!rows?.length) return res.status(404).json({ ok: false, error: "tenant not found" });
  return res.json({ ok: true, tenant: rows[0] });
}

export async function updateTenantLimits(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const limit_sessions = req.body?.limit_sessions ?? null;
  const limit_messages_per_day = req.body?.limit_messages_per_day ?? null;

  // allow null or int >= 0
  function norm(v: any) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error("invalid number");
    return Math.floor(n);
  }

  let ls: number | null = null;
  let lm: number | null = null;
  try {
    ls = norm(limit_sessions);
    lm = norm(limit_messages_per_day);
  } catch {
    return res.status(400).json({ ok: false, error: "limit must be null or integer >= 0" });
  }

  await pool.query(
    `UPDATE tenants
     SET limit_sessions=?, limit_messages_per_day=?
     WHERE id=?`,
    [ls, lm, tenantId]
  );

  return res.json({ ok: true, limit_sessions: ls, limit_messages_per_day: lm });
}
