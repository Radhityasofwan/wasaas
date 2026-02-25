import { getSessionQRState } from "./wa";
import { pool } from "./db";

// GET /sessions/qr?sessionKey=xxx
export async function getQr(req: any, res: any) {
  const sessionKey = String(req.query?.sessionKey || "").trim();
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  // status DB (buat UI)
  const [rows] = await pool.query<any[]>(
    `SELECT status, updated_at FROM wa_sessions WHERE tenant_id=? AND session_key=? LIMIT 1`,
    [req.auth.tenantId, sessionKey]
  );

  const dbStatus = rows?.[0]?.status || "unknown";
  const state = getSessionQRState(sessionKey);

  return res.json({
    ok: true,
    sessionKey,
    status: state?.status || dbStatus,
    qr: state?.qr || null,
    updatedAt: rows?.[0]?.updated_at || null
  });
}
