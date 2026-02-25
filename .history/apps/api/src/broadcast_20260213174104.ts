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
  // 1. Ambil 1 item queued dari job yang valid
  // Kita join untuk memastikan job induknya juga masih running/queued
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

  // 2. [CRITICAL FIX] "Claim" item ini SEBELUM sleep.
  // Update status ke 'sending' segera. Gunakan affectedRows untuk memastikan
  // tidak ada proses lain yang mengambil item yang sama di milidetik yang sama.
  const [updateRes] = await pool.query<any>(
    `UPDATE broadcast_items
     SET status='sending', try_count=try_count+1
     WHERE id=? AND status='queued'`,
    [row.item_id]
  );

  // Jika affectedRows 0, berarti item ini sudah diambil proses lain antara waktu SELECT dan UPDATE.
  // Stop di sini untuk mencegah double send.
  if (updateRes.affectedRows === 0) return;

  // --- Mulai Logika Eksekusi ---

  try {
    // Pastikan job status berubah ke running jika masih queued
    // (Query ini aman dijalankan berulang kali)
    await pool.query(
      `UPDATE broadcast_jobs
       SET status='running'
       WHERE id=? AND status='queued'`,
      [row.job_id]
    );

    // Enforce daily limit tenant
    await enforceMessageLimit(row.tenant_id);

    // 3. Delay per item (Dilakukan SETELAH status 'sending', jadi aman dari double pick)
    const delay = Math.max(0, Math.min(Number(row.delay_ms || 0), 60000));
    if (delay) await sleep(delay);

    // 4. Kirim Pesan
    const result = await sendText(row.session_key, row.to_number, row.text_body);

    if (result.ok) {
      // Sukses
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
      // Gagal Kirim
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
  } catch (err: any) {
    // Error handling level sistem (misal limit error atau crash logic)
    // Kembalikan status ke failed agar tidak stuck di 'sending' selamanya
    await pool.query(
      `UPDATE broadcast_items
       SET status='failed', last_error=?
       WHERE id=?`,
      [err?.message || "system_error", row.item_id]
    );
  }

  // 5. Cek apakah Job sudah selesai (semua item sudah diproses)
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