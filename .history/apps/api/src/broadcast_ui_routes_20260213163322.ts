import { pool } from "./db";

async function tableExists(name: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

export async function listBroadcastJobs(req: any, res: any) {
  const tenantId = req.auth.tenantId;

  if (!(await tableExists("broadcast_jobs"))) {
    return res.status(500).json({ ok: false, error: "broadcast_jobs table missing" });
  }

  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, user_id, session_key, status, delay_ms, total_targets,
            sent_count, failed_count, created_at, updated_at
     FROM broadcast_jobs
     WHERE tenant_id=?
     ORDER BY id DESC
     LIMIT 50`,
    [tenantId]
  );

  return res.json({ ok: true, jobs: rows });
}

export async function cancelBroadcast(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });

  if (!(await tableExists("broadcast_jobs"))) {
    return res.status(500).json({ ok: false, error: "broadcast_jobs table missing" });
  }

  // best-effort: set cancelled (worker harus respect ini)
  const [r] = await pool.query<any>(
    `UPDATE broadcast_jobs
     SET status='canceled', updated_at=NOW()
     WHERE tenant_id=? AND id=? AND status IN ('queued','running','paused')`,
    [tenantId, id]
  );

  return res.json({ ok: true, affectedRows: r?.affectedRows || 0 });
}
