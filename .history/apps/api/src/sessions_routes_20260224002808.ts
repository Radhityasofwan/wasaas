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

  try {
    const wa = require("./wa");
    
    // 1. UNLINK DEVICE (Sangat Penting)
    // Memaksa logout akan membuat status menjadi 'logged_out', sehingga 
    // memutus siklus auto-reconnect Baileys di wa.ts yang sering membuat sesi hidup kembali.
    const sock = wa.getSession(sessionKey);
    if (sock) {
      try { await sock.logout(); } catch (e) {}
    }

    // 2. Matikan instance memory Baileys
    await wa.stopSession(sessionKey);

    // 3. JEDA KRUSIAL (Mencegah Zombie Session)
    // Kita tahan proses penghapusan DB selama 1.5 detik.
    // Ini memberi waktu bagi Baileys untuk menyelesaikan event 'close' dan 'upsert' terakhirnya.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 4. Hapus folder auth di penyimpanan lokal
    await wa.deleteSessionFolder(sessionKey);

  } catch (err) {
    console.error("Gagal membersihkan cache memori WA:", err);
  }

  // 5. Eksekusi Hapus Database (Dilakukan paling akhir agar tidak tertimpa upsert)
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