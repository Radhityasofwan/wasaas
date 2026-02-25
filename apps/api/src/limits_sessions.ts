import { pool } from "./db";

type LimitRow = { limit_sessions: number };

export async function enforceSessionLimit(req: any, res: any, next: any) {
  const tenantId = req.auth?.tenantId;
  if (!tenantId) return res.status(401).json({ ok: false, error: "unauthorized" });

  // sessionKey wajib di body utk start
  const sessionKey = String(req.body?.sessionKey || "");
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  // 1) Ambil limit tenant
  const [trows] = await pool.query<any[]>(
    `SELECT limit_sessions FROM tenants WHERE id=? LIMIT 1`,
    [tenantId]
  );
  const limitSessions = Number((trows?.[0] as LimitRow)?.limit_sessions ?? 1);

  // 2) Jika sessionKey sudah ada & milik tenant -> allow (idempotent)
  const [srows] = await pool.query<any[]>(
    `SELECT id, tenant_id FROM wa_sessions WHERE session_key=? LIMIT 1`,
    [sessionKey]
  );
  if (srows?.length) {
    if (Number(srows[0].tenant_id) !== Number(tenantId)) {
      return res.status(403).json({ ok: false, error: "forbidden: sessionKey already used by another tenant" });
    }
    return next();
  }

  // 3) Hitung jumlah sesi tenant yang "menghitung kuota"
  // created/connecting/connected = considered active slot
  const [countRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_sessions
     WHERE tenant_id=?
       AND status IN ('created','connecting','connected')`,
    [tenantId]
  );

  const used = Number(countRows?.[0]?.c ?? 0);

  if (used >= limitSessions) {
    return res.status(429).json({
      ok: false,
      error: "session limit reached",
      meta: { used, limit: limitSessions }
    });
  }

  next();
}
