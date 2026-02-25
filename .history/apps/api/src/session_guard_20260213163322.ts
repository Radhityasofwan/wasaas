import { pool } from "./db";

export async function requireSessionOwned(req: any, res: any, next: any) {
  const tenantId = req.auth?.tenantId;
  const sessionKey = req.body?.sessionKey || req.query?.sessionKey || req.params?.sessionKey;

  if (!tenantId) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, user_id, session_key
     FROM wa_sessions
     WHERE session_key = ? LIMIT 1`,
    [String(sessionKey)]
  );

  if (!rows?.length) {
    // kalau startSession nanti, row akan di-create di startSession(ctx) — tapi untuk endpoint lain harus sudah ada
    return res.status(404).json({ ok: false, error: "session not found" });
  }

  if (Number(rows[0].tenant_id) !== Number(tenantId)) {
    return res.status(403).json({ ok: false, error: "forbidden: session not owned by tenant" });
  }

  next();
}
