import { pool } from "./db";

export async function stopSessionRoute(req: any, res: any) {
  const sessionKey = String(req.body?.sessionKey || "").trim();
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  // stop runtime session (baileys socket)
  try {
    const { stopSession } = require("./wa");
    await stopSession(sessionKey);
  } catch {}

  // update db (optional, biar UI kebaca)
  try {
    await pool.query(
      `UPDATE wa_sessions SET status='stopped', updated_at=NOW() WHERE tenant_id=? AND session_key=?`,
      [req.auth.tenantId, sessionKey]
    );
  } catch {}

  return res.json({ ok: true });
}

export async function deleteSessionRoute(req: any, res: any) {
  const sessionKey = String(req.body?.sessionKey || "").trim();
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  // 1. Hentikan socket & Hapus folder Auth Baileys
  try {
    const { stopSession, deleteSessionFolder } = require("./wa");
    await stopSession(sessionKey);
    await deleteSessionFolder(sessionKey);
  } catch {}

  // 2. Hapus dari database
  try {
    await pool.query(
      `DELETE FROM wa_sessions WHERE tenant_id=? AND session_key=?`,
      [req.auth.tenantId, sessionKey]
    );
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Gagal menghapus sesi dari database" });
  }

  return res.json({ ok: true });
}

export async function getQrRoute(req: any, res: any) {
  const sessionKey = String(req.query?.sessionKey || "").trim();
  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey required" });

  try {
    const { getSessionMeta } = require("./wa");
    const meta = getSessionMeta(sessionKey); // { qr?:string, status?:string, phone?:string }
    return res.json({ ok: true, sessionKey, ...meta });
  } catch (e:any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
}