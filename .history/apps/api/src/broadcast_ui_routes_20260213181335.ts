import { pool } from "./db";

// Helper function untuk cek tabel (dari file lama Anda)
async function tableExists(name: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

// GET /broadcast/jobs
export async function listBroadcastJobs(req: any, res: any) {
  const tenantId = req.auth.tenantId;

  // Safety check
  if (!(await tableExists("broadcast_jobs"))) {
    return res.status(500).json({ ok: false, error: "broadcast_jobs table missing" });
  }

  const limit = 20;
  // Kita sertakan text_body (atau substringnya) agar list awal juga punya preview
  const [jobs] = await pool.query<any[]>(
    `SELECT 
      id, session_key, name, status, 
      total_targets, sent_count, failed_count, 
      delay_ms, LEFT(text_body, 100) as text_preview, 
      created_at, updated_at 
     FROM broadcast_jobs 
     WHERE tenant_id=? 
     ORDER BY id DESC LIMIT ?`,
    [tenantId, limit]
  );
  return res.json({ ok: true, jobs });
}

// POST /broadcast/:id/cancel
export async function cancelBroadcast(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ ok: false, error: "invalid id" });

  if (!(await tableExists("broadcast_jobs"))) {
    return res.status(500).json({ ok: false, error: "broadcast_jobs table missing" });
  }

  // best-effort: set cancelled (worker harus respect ini)
  // Ditambahkan 'paused' ke dalam list status yang bisa dicancel dan update updated_at
  const [result] = await pool.query<any>(
    `UPDATE broadcast_jobs 
     SET status='canceled', updated_at=NOW() 
     WHERE id=? AND tenant_id=? AND status IN ('queued','running','paused')`,
    [jobId, tenantId]
  );

  return res.json({ ok: true, affectedRows: result.affectedRows });
}