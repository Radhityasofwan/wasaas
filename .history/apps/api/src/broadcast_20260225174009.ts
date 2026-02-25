import { pool } from "./db";
import { enforceMessageLimit } from "./limits";
import { enqueueWebhook } from "./webhook";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// === API HELPERS ===
export async function getBroadcastJob(jobId: number, tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM broadcast_jobs WHERE id=? AND tenant_id=?`,
    [jobId, tenantId]
  );
  return rows?.[0] || null;
}

export async function getBroadcastItems(jobId: number, tenantId: number, limit = 100, offset = 0) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, to_number, status, sent_at, last_error, reply_status, reply_text, reply_received_at 
     FROM broadcast_items 
     WHERE job_id=? AND tenant_id=? 
     ORDER BY id ASC 
     LIMIT ? OFFSET ?`,
    [jobId, tenantId, limit, offset]
  );
  return rows;
}

export async function deleteBroadcastJob(jobId: number, tenantId: number) {
  await pool.query(
    `DELETE FROM broadcast_items WHERE job_id=? AND tenant_id=?`,
    [jobId, tenantId]
  );
  const [res] = await pool.query<any>(
    `DELETE FROM broadcast_jobs WHERE id=? AND tenant_id=?`,
    [jobId, tenantId]
  );
  return res.affectedRows > 0;
}

// === LOGIKA UTAMA REPLY TRACKING ===
export async function markBroadcastReply(originalMessageId: string, replyText: string) {
  const [res] = await pool.query<any>(
    `UPDATE broadcast_items 
     SET reply_status='replied', reply_received_at=NOW(), reply_text=?
     WHERE wa_message_id=? 
     LIMIT 1`,
    [replyText, originalMessageId]
  );
  return res.affectedRows > 0;
}

export async function handleBroadcastReply(tenantId: number, from: string, textBody: string, quotedMessageId: string | null) {
  if (!quotedMessageId) return;

  const isReply = await markBroadcastReply(quotedMessageId, textBody);
  
  if (isReply) {
    console.log(`[REPLY DETECTED] From: ${from} | Text: ${textBody} | Original ID: ${quotedMessageId}`);
    
    await enqueueWebhook(tenantId, "broadcast.reply", {
      original_message_id: quotedMessageId,
      from_number: from,
      reply_text: textBody,
      replied_at: new Date()
    });
  }
}

// === LOGIKA PEMBUATAN & PENGIRIMAN ===
export async function createBroadcastJob(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  name: string;
  delayMs: number;
  targets: string[];
  text: string;
  msgType?: string;
  scheduledAt?: string;
}) {
  const [jobRes] = await pool.query<any>(
    `INSERT INTO broadcast_jobs(
        tenant_id, user_id, session_key, name,
        message_type, text_body, delay_ms,
        scheduled_at, status, total_targets, sent_count, failed_count
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 0, 0)`,
    [
      input.tenantId,
      input.userId,
      input.sessionKey,
      input.name,
      input.msgType || 'text',
      input.text,
      input.delayMs,
      input.scheduledAt || null,
      input.targets.length
    ]
  );

  const jobId = jobRes.insertId as number;

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

// ========================================================
// 🚀 ENGINE PARSER SPINTAX & VARIABEL (Dynamic per target)
// ========================================================
function getDynamicGreeting(): string {
  const d = new Date();
  d.setHours(d.getUTCHours() + 7); // Kompensasi Paksa ke WIB (UTC+7)
  const h = d.getHours();
  
  if (h >= 3 && h < 11) return "Pagi";
  if (h >= 11 && h < 15) return "Siang";
  if (h >= 15 && h < 18) return "Sore";
  return "Malam";
}

function parseMessageMagic(rawText: string | null, targetNumber: string, targetName: string | null): string {
  if (!rawText) return "";
  
  let processed = rawText;

  const fallbackName = "Kak"; 
  const finalName = (targetName && targetName.trim() !== "") ? targetName : fallbackName;
  
  processed = processed.replace(/\{\{nama\}\}/ig, finalName);
  processed = processed.replace(/\{nama\}/ig, finalName);

  processed = processed.replace(/\{\{nomor\}\}/ig, targetNumber);
  processed = processed.replace(/\{nomor\}/ig, targetNumber);

  const salamWaktu = getDynamicGreeting();
  processed = processed.replace(/\{\{salam\}\}/ig, salamWaktu);
  processed = processed.replace(/\{salam\}/ig, salamWaktu);

  const spintaxRegex = /\{([^{}]*\|[^{}]*)\}/g;
  let match;
  while ((match = spintaxRegex.exec(processed)) !== null) {
    const options = match[1].split('|');
    const choice = options[Math.floor(Math.random() * options.length)];
    processed = processed.replace(match[0], choice);
    spintaxRegex.lastIndex = 0;
  }

  return processed;
}

// 💥 FIX: Mencegah Race Condition (Tabrakan Interval)
let isProcessingBroadcast = false;

export async function processBroadcastQueue() {
  if (isProcessingBroadcast) return; 
  isProcessingBroadcast = true; // Kunci sistem

  try {
    const { sendText } = await import("./wa"); // Lazy Import
    
    while (true) {
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
           AND (bj.scheduled_at IS NULL OR bj.scheduled_at <= NOW())
         ORDER BY bi.id ASC
         LIMIT 1`
      );

      if (!rows?.length) break;

      const row = rows[0];

      const [updateRes] = await pool.query<any>(
        `UPDATE broadcast_items
         SET status='sending', try_count=try_count+1
         WHERE id=? AND status='queued'`,
        [row.item_id]
      );

      if (updateRes.affectedRows === 0) continue;

      try {
        await pool.query(
          `UPDATE broadcast_jobs SET status='running' WHERE id=? AND status='queued'`,
          [row.job_id]
        );

        await enforceMessageLimit(row.tenant_id);

        const delay = Math.max(0, Math.min(Number(row.delay_ms || 0), 60000));
        if (delay) await sleep(delay); 

        // ========================================================
        // 🚀 INTEGRASI NAMA DARI MASTER CRM LEADS & WA CONTACTS
        // ========================================================
        let contactName = null;
        try {
          // 1. Cek di tabel Leads terlebih dahulu (Prioritas Utama CRM)
          const [leadRows] = await pool.query<any[]>(
            `SELECT name FROM crm_leads WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
            [row.tenant_id, row.to_number]
          );
          
          if (leadRows.length > 0 && leadRows[0].name) {
            contactName = leadRows[0].name;
          } else {
            // 2. Fallback cek di tabel wa_contacts
            const toJid = row.to_number.includes('@') ? row.to_number : row.to_number + '@s.whatsapp.net';
            const [contacts] = await pool.query<any[]>(
              `SELECT display_name FROM wa_contacts WHERE tenant_id = ? AND session_key = ? AND jid = ? LIMIT 1`,
              [row.tenant_id, row.session_key, toJid]
            );
            if (contacts.length > 0 && contacts[0].display_name) {
              contactName = contacts[0].display_name;
            }
          }
        } catch (e) {
          console.error("[Broadcast Worker] Gagal menarik nama kontak:", e);
        }

        // Menerapkan magic parser ke body teks pesan
        const parsedText = parseMessageMagic(row.text_body, row.to_number, contactName);

        // Eksekusi kirim pesan dengan teks yang sudah di-parse
        const result = await sendText(row.session_key, row.to_number, parsedText);

        if (result.ok) {
          await pool.query(
            `UPDATE broadcast_items SET status='sent', sent_at=NOW(), last_error=NULL, wa_message_id=? WHERE id=?`,
            [result.messageId, row.item_id]
          );
          await pool.query(`UPDATE broadcast_jobs SET sent_count=sent_count+1 WHERE id=?`, [row.job_id]);
        } else {
          await pool.query(
            `UPDATE broadcast_items SET status='failed', last_error=? WHERE id=?`,
            [result.error ?? "failed", row.item_id]
          );
          await pool.query(`UPDATE broadcast_jobs SET failed_count=failed_count+1, last_error=? WHERE id=?`, [result.error ?? "failed", row.job_id]);
        }
      } catch (err: any) {
        await pool.query(
          `UPDATE broadcast_items SET status='failed', last_error=? WHERE id=?`,
          [err?.message || "system_error", row.item_id]
        );
      }

      const [pending] = await pool.query<any[]>(
        `SELECT COUNT(*) AS c FROM broadcast_items WHERE job_id=? AND status IN ('queued','sending')`,
        [row.job_id]
      );

      if (Number(pending?.[0]?.c ?? 0) === 0) {
        await pool.query(
          `UPDATE broadcast_jobs SET status='done' WHERE id=? AND status IN ('queued','running')`,
          [row.job_id]
        );
      }
    }
  } finally {
    isProcessingBroadcast = false; 
  }
}