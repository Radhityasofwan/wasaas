import { pool } from "./db";

async function getUserRole(tenantId: number, userId: number): Promise<"admin" | "owner" | "member"> {
  const [u] = await pool.query<any[]>(
    `SELECT role FROM users WHERE tenant_id=? AND id=? LIMIT 1`,
    [tenantId, userId]
  );
  return (u?.[0]?.role || "member") as any;
}

export async function requireSessionOwned(req: any, res: any, next: any) {
  const tenantId = Number(req.auth?.tenantId || 0);
  const userId = Number(req.auth?.userId || 0);
  const sessionKey = req.body?.sessionKey || req.query?.sessionKey || req.params?.sessionKey;

  if (!tenantId || !userId) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, user_id, session_key
     FROM wa_sessions
     WHERE session_key = ? LIMIT 1`,
    [String(sessionKey)]
  );

  if (!rows?.length) {
    return res.status(404).json({ ok: false, error: "session not found" });
  }

  if (Number(rows[0].tenant_id) !== tenantId) {
    return res.status(403).json({ ok: false, error: "forbidden: session not owned by tenant" });
  }

  // admin/owner can access any session in tenant
  const role = await getUserRole(tenantId, userId);
  if (role === "admin" || role === "owner") return next();

  // members only their own session
  if (Number(rows[0].user_id) !== userId) {
    return res.status(403).json({ ok: false, error: "forbidden: session not owned by user" });
  }

  next();
}