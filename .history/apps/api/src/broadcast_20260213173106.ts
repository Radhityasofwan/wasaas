import { pool } from "./db";
import { sendText } from "./wa";
import { enforceMessageLimit } from "./limits";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function createBroadcastJob(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  name: string;
  delayMs: number;
  targets: string[];
  text: string;
}) {
  const [jobRes] = await pool.query<any>(
    `INSERT INTO broadcast_jobs(
        tenant_id, user_id, session_key, name,
        message_type, text_body, delay_ms,
        status, total_targets, sent_count, failed_count
     ) VALUES(?, ?, ?, ?, 'text', ?, ?, 'queued', ?, 0, 0)`,
    [
      input.tenantId,
      input.userId,
      input.sessionKey,
      input.name,
      input.text,
      input.delayMs,
      input.targets.length
    ]
  );

  const jobId = jobRes.insertId as number;

  // bulk insert items (WAJIB include session_key karena NOT NULL)
  if (input.targets.length) {
    const values = input.targets.map((t) => [
      jobId,
      input.tenantId,
      input.sessionKey,
      t
    ]);

    await pool.query(
      `INSERT INTO broadcast_items(job_id, tenant_id, session_key, to_number)
       VALUES ${values.map(() => "(?,?,?,?)").join(",")}`,
      values.flat()
    );
  }

  return { jobId };
}

export async function processBroadcastQueue() {
  // ambil 1 item queued dari job yang boleh jalan
  const [rows] = await pool.query<any[]>(
    `SELECT
        bi.id AS item_id,
        bi.job_id,
        bi.tenant_id,
        bi.session_key,
        bi.to_number,
        bi.status AS item_status,
        bi.try_count,
        bj.session_key AS job_session_key,
        bj.text_body,
        bj.delay_ms,
        bj.status AS job_status
     FROM broadcast_items bi
     JOIN broadcast_jobs bj ON bj.id = bi.job_id
     WHERE bi.status='queued'
       AND bj.status IN ('queued','running')
     ORDER BY bi.id ASC
     LIMIT 1`
  );

  if (!rows?.length) return;

  const row = rows[0];

  // pastikan job berubah ke running (tanpa started_at karena kolomnya tidak ada)
  await pool.query(
    `UPDATE broadcast_jobs
     SET status='running'
     WHERE id=? AND status='queued'`,
    [row.job_id]
  );

  // enforce daily limit tenant
  await enforceMessageLimit(row.tenant_id);

  // delay per item
  const delay = Math.max(0, Math.min(Number(row.delay_ms || 0), 60000));
  if (delay) await sleep(delay);

  // mark sending + increment try_count
  await pool.query(
    `UPDATE broadcast_items
     SET status='sending', try_count=try_count+1
     WHERE id=? AND status='queued'`,
    [row.item_id]
  );

  // kirim
  const result = await sendText(row.session_key, row.to_number, row.text_body);

  if (result.ok) {
    await pool.query(
      `UPDATE broadcast_items
       SET status='sent', sent_at=NOW(), last_error=NULL
       WHERE id=?`,
      [row.item_id]
    );
    await pool.query(
      `UPDATE broadcast_jobs
       SET sent_count=sent_count+1
       WHERE id=?`,
      [row.job_id]
    );
  } else {
    await pool.query(
      `UPDATE broadcast_items
       SET status='failed', last_error=?
       WHERE id=?`,
      [result.error ?? "failed", row.item_id]
    );
    await pool.query(
      `UPDATE broadcast_jobs
       SET failed_count=failed_count+1, last_error=?
       WHERE id=?`,
      [result.error ?? "failed", row.job_id]
    );
  }

  // kalau tidak ada queued/sending lagi => done
  const [pending] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM broadcast_items
     WHERE job_id=? AND status IN ('queued','sending')`,
    [row.job_id]
  );

  if (Number(pending?.[0]?.c ?? 0) === 0) {
    await pool.query(
      `UPDATE broadcast_jobs
       SET status='done'
       WHERE id=? AND status IN ('queued','running')`,
      [row.job_id]
    );
  }
}
