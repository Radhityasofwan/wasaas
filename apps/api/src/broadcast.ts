import { pool } from "./db";
import { enforceMessageLimit } from "./limits";
import { enqueueWebhook } from "./webhook";
import { normalizeIndonesiaPhoneE164 } from "./phone_normalizer";
import { sendLocation, sendMediaByType } from "./wa_media";
import { resolveMediaAssetFromUrl } from "./media_asset_resolver";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toSqlDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const columnExistsCache = new Map<string, boolean>();
const ensuredColumns = new Set<string>();
const sessionRestartAttemptAt = new Map<string, number>();
let broadcastSchemaEnsured = false;

function messageIdVariants(messageId: string) {
  const raw = String(messageId || "").trim();
  if (!raw) return [];
  const base = raw.split(":")[0];
  return Array.from(new Set([raw, base])).filter(Boolean);
}

function buildMessageIdWhereClause() {
  return `(wa_message_id = ? OR wa_message_id = ? OR wa_message_id LIKE CONCAT(?, ':%') OR wa_message_id LIKE CONCAT(?, ':%') OR ? LIKE CONCAT(wa_message_id, ':%') OR ? LIKE CONCAT(wa_message_id, ':%'))`;
}

function normalizePhone(raw: string | null | undefined) {
  return String(raw || "").replace(/[^\d]/g, "");
}

function normalizeBroadcastMediaType(raw: string | null | undefined) {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "text" || t === "image" || t === "video" || t === "document" || t === "audio" || t === "voice_note" || t === "sticker" || t === "location") {
    return t;
  }
  return "text";
}

async function hasColumn(table: string, column: string) {
  const key = `${table}.${column}`;
  if (columnExistsCache.has(key)) return columnExistsCache.get(key) as boolean;
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  const exists = Number(rows?.[0]?.c || 0) > 0;
  columnExistsCache.set(key, exists);
  return exists;
}

async function ensureColumn(table: string, column: string, ddl: string) {
  const key = `${table}.${column}`;
  if (ensuredColumns.has(key)) return;
  const exists = await hasColumn(table, column);
  if (!exists) {
    try {
      await pool.query(ddl);
      columnExistsCache.set(key, true);
    } catch (e) {
      console.warn(`[Broadcast] Failed ensuring column ${key}:`, e);
    }
  }
  ensuredColumns.add(key);
}

async function ensureBroadcastMediaSchema() {
  if (broadcastSchemaEnsured) return;
  broadcastSchemaEnsured = true;
  try {
    await pool.query(
      `ALTER TABLE broadcast_jobs
       MODIFY COLUMN message_type
       ENUM('text','image','video','document','audio','voice_note','sticker','location')
       NOT NULL DEFAULT 'text'`
    );
  } catch (e) {
    console.warn("[Broadcast] message_type enum alter skipped:", e);
  }
}

function isSessionSocketError(msg: string | null | undefined) {
  const s = String(msg || "");
  return (
    s.includes("Session socket is not running") ||
    s.includes("Session is disconnected") ||
    s.includes("Session context missing")
  );
}

async function ensureSessionForBroadcast(tenantId: number, sessionKey: string) {
  const cooldownMs = 15000;
  const last = sessionRestartAttemptAt.get(sessionKey) || 0;
  if (Date.now() - last < cooldownMs) return false;
  sessionRestartAttemptAt.set(sessionKey, Date.now());

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT user_id FROM wa_sessions WHERE tenant_id=? AND session_key=? ORDER BY id DESC LIMIT 1`,
      [tenantId, sessionKey]
    );
    const userId = Number(rows?.[0]?.user_id || 0);
    if (!userId) return false;

    const { isConnected, startSession } = await import("./wa");
    if (isConnected(sessionKey)) return true;
    await startSession(sessionKey, { tenantId, userId });
    return true;
  } catch (e) {
    console.error(`[Broadcast Worker] Failed auto-start session ${sessionKey}:`, e);
    return false;
  }
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
  await ensureColumn(
    "broadcast_items",
    "delivery_status",
    "ALTER TABLE broadcast_items ADD COLUMN delivery_status VARCHAR(16) NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "read_at",
    "ALTER TABLE broadcast_items ADD COLUMN read_at DATETIME NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "reply_text",
    "ALTER TABLE broadcast_items ADD COLUMN reply_text TEXT NULL"
  );
  const hasDeliveryStatus = await hasColumn("broadcast_items", "delivery_status");
  const hasReadAt = await hasColumn("broadcast_items", "read_at");
  const hasReplyText = await hasColumn("broadcast_items", "reply_text");
  const deliveryStatusSelect = hasDeliveryStatus ? "delivery_status" : "NULL AS delivery_status";
  const readAtSelect = hasReadAt ? "read_at" : "NULL AS read_at";
  const replyTextSelect = hasReplyText ? "reply_text" : "NULL AS reply_text";

  const [rows] = await pool.query<any[]>(
    `WITH NormalizedItems AS (
        SELECT 
            id, to_number, status, sent_at, last_error, reply_status,
            ${deliveryStatusSelect}, ${readAtSelect}, ${replyTextSelect}, reply_received_at,
            COALESCE(
              NULLIF(
                REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),
                ''
              ),
              to_number
            ) AS number_key
        FROM broadcast_items 
        WHERE job_id=? AND tenant_id=?
    ),
    RankedItems AS (
        SELECT
            id, to_number, status, sent_at, last_error, reply_status, delivery_status, read_at, reply_text, reply_received_at,
            COUNT(*) OVER (PARTITION BY number_key) as duplicate_count,
            MAX(CASE WHEN reply_status = 'replied' THEN 1 ELSE 0 END) OVER (PARTITION BY number_key) as has_reply,
            ROW_NUMBER() OVER (
                PARTITION BY number_key 
                ORDER BY 
                    CASE WHEN reply_status = 'replied' THEN 0 ELSE 1 END,
                    COALESCE(reply_received_at, sent_at, '9999-12-31') ASC,
                    id ASC
            ) as replied_rn,
            ROW_NUMBER() OVER (
                PARTITION BY number_key 
                ORDER BY 
                    CASE
                      WHEN delivery_status = 'read' THEN 1
                      WHEN delivery_status = 'delivered' THEN 2
                      WHEN status = 'sent' THEN 3
                      WHEN status = 'failed' THEN 4
                      WHEN status = 'sending' THEN 5
                      ELSE 6
                    END,
                    COALESCE(read_at, sent_at, reply_received_at, '1970-01-01') DESC,
                    id DESC
            ) as fallback_rn
        FROM NormalizedItems
    )
    SELECT 
      id,
      to_number,
      CASE
        WHEN reply_status = 'replied' THEN 'replied'
        WHEN delivery_status = 'read' THEN 'read'
        WHEN delivery_status = 'delivered' THEN 'delivered'
        ELSE status
      END as status,
      sent_at,
      last_error,
      reply_status,
      reply_text,
      reply_received_at,
      duplicate_count
    FROM RankedItems 
    WHERE (has_reply = 1 AND reply_status = 'replied' AND replied_rn = 1)
       OR (has_reply = 0 AND fallback_rn = 1)
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
export async function markBroadcastReply(tenantId: number, originalMessageId: string, replyText: string) {
  await ensureColumn(
    "broadcast_items",
    "delivery_status",
    "ALTER TABLE broadcast_items ADD COLUMN delivery_status VARCHAR(16) NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "read_at",
    "ALTER TABLE broadcast_items ADD COLUMN read_at DATETIME NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "reply_text",
    "ALTER TABLE broadcast_items ADD COLUMN reply_text TEXT NULL"
  );
  const hasReplyText = await hasColumn("broadcast_items", "reply_text");
  const variants = messageIdVariants(originalMessageId);
  if (!variants.length) return false;
  const [raw, base] = [variants[0], variants[1] || variants[0]];
  const whereMsg = buildMessageIdWhereClause();
  const sql = hasReplyText
    ? `UPDATE broadcast_items 
       SET 
         reply_status='replied',
         reply_received_at=COALESCE(reply_received_at, NOW()),
         reply_text=CASE WHEN reply_status='replied' AND COALESCE(reply_text,'')<>'' THEN reply_text ELSE ? END,
         delivery_status='read',
         read_at=COALESCE(read_at, NOW())
       WHERE tenant_id=? AND ${whereMsg} AND reply_status='none'
       LIMIT 1`
    : `UPDATE broadcast_items 
       SET 
         reply_status='replied',
         reply_received_at=COALESCE(reply_received_at, NOW()),
         delivery_status='read',
         read_at=COALESCE(read_at, NOW())
       WHERE tenant_id=? AND ${whereMsg} AND reply_status='none'
       LIMIT 1`;
  const params = hasReplyText
    ? [replyText, tenantId, raw, base, raw, base, raw, base]
    : [tenantId, raw, base, raw, base, raw, base];
  const [res] = await pool.query<any>(sql, params);
  return res.affectedRows > 0;
}

async function markBroadcastReplyByNumber(
  tenantId: number,
  from: string,
  replyText: string
) {
  await ensureColumn(
    "broadcast_items",
    "delivery_status",
    "ALTER TABLE broadcast_items ADD COLUMN delivery_status VARCHAR(16) NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "read_at",
    "ALTER TABLE broadcast_items ADD COLUMN read_at DATETIME NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "reply_text",
    "ALTER TABLE broadcast_items ADD COLUMN reply_text TEXT NULL"
  );

  const hasReplyText = await hasColumn("broadcast_items", "reply_text");
  const fromNumber = normalizePhone(from.split("@")[0]);
  if (!fromNumber) return false;

  const whereNumber = `COALESCE(
      NULLIF(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),
        ''
      ),
      to_number
    ) = ?`;

  const sql = hasReplyText
    ? `UPDATE broadcast_items
       SET
         reply_status='replied',
         reply_received_at=COALESCE(reply_received_at, NOW()),
         reply_text=CASE WHEN reply_status='replied' AND COALESCE(reply_text,'')<>'' THEN reply_text ELSE ? END,
         delivery_status='read',
         read_at=COALESCE(read_at, NOW())
       WHERE tenant_id=?
         AND ${whereNumber}
         AND reply_status='none'
         AND status IN ('sent','sending')
         AND (delivery_status IS NULL OR delivery_status IN ('sent','delivered','read'))
         AND sent_at IS NOT NULL
         AND sent_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       ORDER BY
         CASE WHEN reply_status='none' THEN 0 ELSE 1 END ASC,
         sent_at DESC,
         id DESC
       LIMIT 1`
    : `UPDATE broadcast_items
       SET
         reply_status='replied',
         reply_received_at=COALESCE(reply_received_at, NOW()),
         delivery_status='read',
         read_at=COALESCE(read_at, NOW())
       WHERE tenant_id=?
         AND ${whereNumber}
         AND reply_status='none'
         AND status IN ('sent','sending')
         AND (delivery_status IS NULL OR delivery_status IN ('sent','delivered','read'))
         AND sent_at IS NOT NULL
         AND sent_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       ORDER BY
         CASE WHEN reply_status='none' THEN 0 ELSE 1 END ASC,
         sent_at DESC,
         id DESC
       LIMIT 1`;

  const params = hasReplyText
    ? [replyText, tenantId, fromNumber]
    : [tenantId, fromNumber];
  const [res] = await pool.query<any>(sql, params);
  return res.affectedRows > 0;
}

export async function markBroadcastReadByNumber(
  tenantId: number,
  from: string
) {
  await ensureColumn(
    "broadcast_items",
    "delivery_status",
    "ALTER TABLE broadcast_items ADD COLUMN delivery_status VARCHAR(16) NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "read_at",
    "ALTER TABLE broadcast_items ADD COLUMN read_at DATETIME NULL"
  );

  const fromNumber = normalizePhone(from.split("@")[0]);
  if (!fromNumber) return false;

  const whereNumber = `COALESCE(
      NULLIF(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),
        ''
      ),
      to_number
    ) = ?`;

  const [res] = await pool.query<any>(
    `UPDATE broadcast_items
     SET delivery_status='read', read_at=COALESCE(read_at, NOW())
     WHERE tenant_id=?
       AND ${whereNumber}
       AND status IN ('sent','sending')
       AND reply_status='none'
       AND sent_at IS NOT NULL
       AND sent_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
     ORDER BY sent_at DESC, id DESC
     LIMIT 1`,
    [tenantId, fromNumber]
  );
  return res.affectedRows > 0;
}

export async function updateBroadcastDeliveryStatus(
  tenantId: number,
  waMessageId: string,
  status: "sent" | "delivered" | "read" | "failed"
) {
  const variants = messageIdVariants(waMessageId);
  if (!variants.length) return false;
  const [raw, base] = [variants[0], variants[1] || variants[0]];
  const whereMsg = buildMessageIdWhereClause();

  await ensureColumn(
    "broadcast_items",
    "delivery_status",
    "ALTER TABLE broadcast_items ADD COLUMN delivery_status VARCHAR(16) NULL"
  );
  await ensureColumn(
    "broadcast_items",
    "read_at",
    "ALTER TABLE broadcast_items ADD COLUMN read_at DATETIME NULL"
  );

  if (status === "read") {
    const [res] = await pool.query<any>(
      `UPDATE broadcast_items
       SET delivery_status='read', read_at=COALESCE(read_at, NOW())
       WHERE tenant_id=? AND ${whereMsg}`,
      [tenantId, raw, base, raw, base, raw, base]
    );
    return res.affectedRows > 0;
  }

  if (status === "delivered") {
    const [res] = await pool.query<any>(
      `UPDATE broadcast_items
       SET delivery_status=CASE WHEN delivery_status='read' THEN 'read' ELSE 'delivered' END
       WHERE tenant_id=? AND ${whereMsg}`,
      [tenantId, raw, base, raw, base, raw, base]
    );
    return res.affectedRows > 0;
  }

  if (status === "sent") {
    const [res] = await pool.query<any>(
      `UPDATE broadcast_items
       SET delivery_status=COALESCE(delivery_status, 'sent')
       WHERE tenant_id=? AND ${whereMsg}`,
      [tenantId, raw, base, raw, base, raw, base]
    );
    return res.affectedRows > 0;
  }

  const [res] = await pool.query<any>(
    `UPDATE broadcast_items
     SET status='failed'
     WHERE tenant_id=? AND ${whereMsg} AND status <> 'failed'`,
    [tenantId, raw, base, raw, base, raw, base]
  );
  return res.affectedRows > 0;
}

export async function handleBroadcastReply(tenantId: number, from: string, textBody: string, quotedMessageId: string | null) {
  let isReply = false;
  if (quotedMessageId) {
    isReply = await markBroadcastReply(tenantId, quotedMessageId, textBody);
  }
  if (!isReply) {
    isReply = await markBroadcastReplyByNumber(tenantId, from, textBody);
  }
  
  if (isReply) {
    console.log(`[REPLY DETECTED] From: ${from} | Text: ${textBody} | Original ID: ${quotedMessageId || "-"}`);
    
    await enqueueWebhook(tenantId, "broadcast.reply", {
      original_message_id: quotedMessageId || null,
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
  mediaPath?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
}) {
  await ensureBroadcastMediaSchema();
  const normalizedScheduledAt = input.scheduledAt
    ? String(input.scheduledAt).replace("T", " ").replace("Z", "").slice(0, 19)
    : null;

  const [jobRes] = await pool.query<any>(
    `INSERT INTO broadcast_jobs(
        tenant_id, user_id, session_key, name,
        message_type, text_body, media_path, media_mime, media_name, delay_ms,
        scheduled_at, status, total_targets, sent_count, failed_count
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 0, 0)`,
    [
      input.tenantId,
      input.userId,
      input.sessionKey,
      input.name,
      input.msgType || 'text',
      input.text,
      input.mediaPath || null,
      input.mediaMime || null,
      input.mediaName || null,
      input.delayMs,
      normalizedScheduledAt,
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
    await ensureBroadcastMediaSchema();
    const { sendText } = await import("./wa"); // Lazy Import
    
    while (true) {
      const nowSql = toSqlDateTime(new Date());
      const [rows] = await pool.query<any[]>(
        `SELECT
            bi.id AS item_id,
            bi.job_id,
            bi.tenant_id,
            bi.session_key,
            bi.to_number,
            bi.status AS item_status,
            bi.try_count,
            bj.user_id AS job_user_id,
            bj.session_key AS job_session_key,
            bj.message_type,
            bj.text_body,
            bj.media_path,
            bj.media_mime,
            bj.media_name,
            bj.delay_ms,
            bj.status AS job_status
         FROM broadcast_items bi
         JOIN broadcast_jobs bj ON bj.id = bi.job_id
         WHERE bi.status='queued'
           AND bj.status IN ('queued','running')
           AND (bj.scheduled_at IS NULL OR bj.scheduled_at <= ?)
         ORDER BY COALESCE(bj.scheduled_at, '1970-01-01 00:00:00') ASC, bi.id ASC
         LIMIT 1`,
        [nowSql]
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

        await enforceMessageLimit(row.tenant_id, { userId: Number(row.job_user_id || 0) });

        const delay = Math.max(0, Math.min(Number(row.delay_ms || 0), 60000));
        if (delay) await sleep(delay); 

        // ========================================================
        // 🚀 INTEGRASI NAMA DARI MASTER CRM LEADS & WA CONTACTS
        // ========================================================
        let contactName = null;
        try {
          const normalizedLeadPhone = normalizeIndonesiaPhoneE164(row.to_number);
          const cleanDigits = normalizePhone(row.to_number);
          // 1. Cek di tabel Leads terlebih dahulu (Prioritas Utama CRM)
          const [leadRows] = normalizedLeadPhone
            ? await pool.query<any[]>(
                `SELECT name FROM crm_leads WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
                [row.tenant_id, normalizedLeadPhone]
              )
            : await pool.query<any[]>(
                `SELECT name FROM crm_leads
                 WHERE tenant_id = ?
                   AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
                 LIMIT 1`,
                [row.tenant_id, cleanDigits]
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
        const messageType = normalizeBroadcastMediaType(row.message_type);

        let result: any = null;
        if (messageType === "text") {
          result = await sendText(row.session_key, row.to_number, parsedText);
        } else if (messageType === "location") {
          const rawCoord = String(row.media_path || "").trim();
          const [latRaw, lngRaw] = rawCoord.split(",");
          const lat = Number(latRaw);
          const lng = Number(lngRaw);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new Error("Format koordinat location broadcast tidak valid (lat,lng)");
          }
          result = await sendLocation({
            tenantId: row.tenant_id,
            userId: 1,
            sessionKey: row.session_key,
            to: row.to_number,
            latitude: lat,
            longitude: lng,
            name: parsedText || undefined,
            address: row.media_name || undefined,
          });
        } else {
          if (!row.media_path) throw new Error(`Media path kosong untuk broadcast type ${messageType}`);
          const resolved = await resolveMediaAssetFromUrl(String(row.media_path));
          if (!resolved) throw new Error(`File media broadcast tidak ditemukan: ${row.media_path}`);
          result = await sendMediaByType({
            tenantId: row.tenant_id,
            userId: 1,
            sessionKey: row.session_key,
            to: row.to_number,
            mediaType: messageType as any,
            caption: parsedText,
            filePath: resolved.filePath,
            mime: String(row.media_mime || resolved.mime || "application/octet-stream"),
            fileName: String(row.media_name || resolved.fileName),
            fileSize: Number(resolved.fileSize || 0),
            publicUrl: String(row.media_path),
          });
        }

        if (result.ok) {
          await pool.query(
            `UPDATE broadcast_items SET status='sent', sent_at=NOW(), last_error=NULL, wa_message_id=? WHERE id=?`,
            [result.messageId, row.item_id]
          );
          await pool.query(`UPDATE broadcast_jobs SET sent_count=sent_count+1 WHERE id=?`, [row.job_id]);
        } else {
          if (isSessionSocketError(result.error)) {
            await ensureSessionForBroadcast(row.tenant_id, row.session_key);
            await pool.query(
              `UPDATE broadcast_items SET status='queued', last_error=? WHERE id=?`,
              [`${result.error ?? "session_unavailable"} (auto-retry)`, row.item_id]
            );
            continue;
          }

          await pool.query(
            `UPDATE broadcast_items SET status='failed', last_error=? WHERE id=?`,
            [result.error ?? "failed", row.item_id]
          );
          await pool.query(`UPDATE broadcast_jobs SET failed_count=failed_count+1, last_error=? WHERE id=?`, [result.error ?? "failed", row.job_id]);
        }
      } catch (err: any) {
        if (isSessionSocketError(err?.message)) {
          await ensureSessionForBroadcast(row.tenant_id, row.session_key);
          await pool.query(
            `UPDATE broadcast_items SET status='queued', last_error=? WHERE id=?`,
            [`${err?.message || "session_unavailable"} (auto-retry)`, row.item_id]
          );
          continue;
        }

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
