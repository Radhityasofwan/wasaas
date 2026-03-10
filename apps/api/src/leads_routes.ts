/**
 * ============================================================================
 * LEADS ROUTES - CRM MASTER DATA CONTROLLER
 * ============================================================================
 * V.2.0 - Mendukung Smart Temperature Engine Fleksibel (Multi-Choice)
 */

import { pool } from "./db";
import { z } from "zod";
import { normalizeIndonesiaPhoneE164 } from "./phone_normalizer";
import { recordInvalidLeadSkip } from "./invalid_leads_audit";

// ============================================================================
// AUTO-MIGRATION: Tabel Pengaturan Suhu Pintar (Smart Temperature Rules)
// ============================================================================
async function ensureTempRulesSchema() {
  try {
    // Cek apakah tabel dan kolom baru sudah ada
    await pool.query(`SELECT hot_sources, warm_keywords FROM crm_temp_rules LIMIT 1`);
  } catch (e: any) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      console.log("🛠️ Membuat tabel crm_temp_rules...");
      await pool.query(`
        CREATE TABLE crm_temp_rules (
          tenant_id INT PRIMARY KEY,
          hot_keywords TEXT,
          hot_sources TEXT,
          warm_keywords TEXT,
          warm_sources TEXT,
          cold_days INT DEFAULT 7,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
    } else if (e.code === 'ER_BAD_FIELD_ERROR') {
      console.log("🛠️ Menambahkan kolom fleksibilitas baru ke crm_temp_rules...");
      try { await pool.query(`ALTER TABLE crm_temp_rules ADD COLUMN hot_sources TEXT`); } catch(err){}
      try { await pool.query(`ALTER TABLE crm_temp_rules ADD COLUMN warm_keywords TEXT`); } catch(err){}
    }
  }
}
ensureTempRulesSchema().catch(console.error);

async function normalizeExistingLeadPhones() {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, phone_number FROM crm_leads LIMIT 100000`
    );
    if (!rows.length) return;

    let updated = 0;
    let deleted = 0;
    for (const r of rows) {
      const current = String(r.phone_number || "");
      const normalized = normalizeIndonesiaPhoneE164(current);
      if (!normalized) {
        await pool.query(`DELETE FROM crm_leads WHERE id = ?`, [r.id]);
        deleted++;
        continue;
      }
      if (normalized !== current) {
        try {
          await pool.query(`UPDATE crm_leads SET phone_number = ? WHERE id = ?`, [normalized, r.id]);
          updated++;
        } catch (e: any) {
          if (e?.code === "ER_DUP_ENTRY") {
            await pool.query(`DELETE FROM crm_leads WHERE id = ?`, [r.id]);
            deleted++;
          } else {
            throw e;
          }
        }
      }
    }
    if (updated || deleted) {
      console.log(`[LEADS] Normalized existing phones: updated=${updated}, deleted_invalid=${deleted}`);
    }
  } catch (e) {
    console.error("[LEADS] normalizeExistingLeadPhones failed:", e);
  }
}
normalizeExistingLeadPhones().catch(console.error);

function messageIdVariants(messageId: string) {
  const raw = String(messageId || "").trim();
  if (!raw) return [];
  const base = raw.split(":")[0];
  return Array.from(new Set([raw, base])).filter(Boolean);
}

function buildMessageIdWhereClause(column = "wa_message_id") {
  return `(${column} = ? OR ${column} = ? OR ${column} LIKE CONCAT(?, ':%') OR ${column} LIKE CONCAT(?, ':%') OR ? LIKE CONCAT(${column}, ':%') OR ? LIKE CONCAT(${column}, ':%'))`;
}

function splitKeywords(csv: string | null | undefined) {
  return String(csv || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseSourcesArray(raw: any, fallback: string[]) {
  try {
    const arr = JSON.parse(String(raw || "[]"));
    if (Array.isArray(arr)) return arr.map((x: any) => String(x).toLowerCase());
    return fallback;
  } catch {
    return fallback;
  }
}

function hasMandatoryHotIntent(text: string) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("pesan") ||
    t.includes("order") ||
    t.includes("beli") ||
    t.includes("harga") ||
    t.includes("transfer")
  );
}

async function isQuotedFromTable(tenantId: number, table: "broadcast_items" | "followup_targets", quotedMessageId: string) {
  const variants = messageIdVariants(quotedMessageId);
  if (!variants.length) return false;
  const raw = variants[0];
  const base = variants[1] || raw;
  const whereMsg = buildMessageIdWhereClause("wa_message_id");
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM ${table} WHERE tenant_id=? AND ${whereMsg} LIMIT 1`,
    [tenantId, raw, base, raw, base, raw, base]
  );
  return rows.length > 0;
}

// ============================================================================
// GET /leads/temp-rules (Ambil Pengaturan Suhu)
// ============================================================================
export async function getTempRules(req: any, res: any) {
  try {
    const [rows] = await pool.query<any[]>(`SELECT * FROM crm_temp_rules WHERE tenant_id = ?`, [req.auth.tenantId]);
    if (rows.length === 0) {
      // Default jika belum pernah diatur
      return res.json({ 
        ok: true, 
        data: { 
          hot_keywords: "pesan, order, beli, harga, transfer", 
          hot_sources: '["broadcast_reply", "followup_reply"]',
          warm_keywords: "tanya, info, halo",
          warm_sources: '["meta_ads", "web", "ig", "tiktok"]', 
          cold_days: 7 
        } 
      });
    }
    return res.json({ ok: true, data: rows[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/temp-rules (Simpan Pengaturan Suhu oleh CS)
// ============================================================================
export async function saveTempRules(req: any, res: any) {
  const schema = z.object({
    hot_keywords: z.string(),
    hot_sources: z.string(), // Array JSON stringified
    warm_keywords: z.string(),
    warm_sources: z.string(), // Array JSON stringified
    cold_days: z.number().min(1).max(365)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data pengaturan tidak valid." });

  try {
    await pool.query(
      `INSERT INTO crm_temp_rules (tenant_id, hot_keywords, hot_sources, warm_keywords, warm_sources, cold_days) 
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       hot_keywords = VALUES(hot_keywords),
       hot_sources = VALUES(hot_sources),
       warm_keywords = VALUES(warm_keywords),
       warm_sources = VALUES(warm_sources),
       cold_days = VALUES(cold_days)`,
      [
        req.auth.tenantId, 
        parsed.data.hot_keywords, 
        parsed.data.hot_sources,
        parsed.data.warm_keywords,
        parsed.data.warm_sources, 
        parsed.data.cold_days
      ]
    );
    return res.json({ ok: true, message: "Pengaturan Suhu Otomatis berhasil disimpan." });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// GET /leads (Mengambil Daftar Prospek & Statistik dengan Filter Lanjutan)
// ============================================================================
export async function getLeads(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  
  const search = req.query.q || '';
  const sourceFilter = req.query.source || 'all'; 
  const statusFilter = req.query.status || 'all'; 

  let whereClause = "WHERE c.tenant_id = ?";
  let queryParams: any[] = [tenantId];

  if (search) {
    whereClause += " AND (c.phone_number LIKE ? OR c.name LIKE ?)";
    queryParams.push(`%${search}%`, `%${search}%`);
  }
  if (sourceFilter !== 'all') {
    whereClause += " AND c.source LIKE ?"; // Pakai LIKE untuk mendukung meta_ads|Nama_Campaign
    queryParams.push(`${sourceFilter}%`);
  }
  if (statusFilter !== 'all') {
    whereClause += " AND c.status = ?";
    queryParams.push(statusFilter);
  }

  const query = `
    SELECT 
      c.id,
      c.name,
      c.phone_number,
      c.phone_number as to_number,
      c.source,
      c.source as source_traffic,
      c.status,
      c.status as temperature,
      c.tags_json,
      c.created_at,
      c.last_interacted_at,
      c.last_interacted_at as last_active_at,
      (
        SELECT COUNT(id) 
        FROM broadcast_items b 
        WHERE b.tenant_id = c.tenant_id
          AND (
            CASE
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
              ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
            END
          ) = (
            CASE
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
              ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
            END
          )
      ) as total_broadcasts,
      (
        SELECT COUNT(id) 
        FROM followup_targets f 
        WHERE f.tenant_id = c.tenant_id
          AND (
            CASE
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
              ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
            END
          ) = (
            CASE
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
              ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
            END
          )
      ) as total_followups,
      (
        (
          SELECT COUNT(id) 
          FROM broadcast_items b 
          WHERE b.tenant_id = c.tenant_id
            AND (
              CASE
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
                ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(b.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              END
            ) = (
              CASE
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
                ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              END
            )
        ) +
        (
          SELECT COUNT(id) 
          FROM followup_targets f 
          WHERE f.tenant_id = c.tenant_id
            AND (
              CASE
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
                ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(f.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              END
            ) = (
              CASE
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '0' THEN CONCAT('62', SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2))
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 2) = '62' THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
                WHEN LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 1) = '8' THEN CONCAT('62', REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))
                ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
              END
            )
        )
      ) as interaction_count
    FROM crm_leads c
    ${whereClause}
    ORDER BY c.last_interacted_at DESC, c.id DESC
    LIMIT ? OFFSET ?
  `;

  const dataParams = [...queryParams, limit, offset];

  try {
    const [rows] = await pool.query<any[]>(query, dataParams);
    
    const [statsRows] = await pool.query<any[]>(
      `SELECT 
        COUNT(id) as total,
        SUM(CASE WHEN status = 'hot' THEN 1 ELSE 0 END) as hot,
        SUM(CASE WHEN status = 'warm' THEN 1 ELSE 0 END) as warm,
        SUM(CASE WHEN status = 'cold' THEN 1 ELSE 0 END) as cold,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
       FROM crm_leads 
       WHERE tenant_id = ?`, 
      [tenantId]
    );

    const stats = {
      total: Number(statsRows?.[0]?.total || 0), hot: Number(statsRows?.[0]?.hot || 0),
      warm: Number(statsRows?.[0]?.warm || 0), cold: Number(statsRows?.[0]?.cold || 0),
      converted: Number(statsRows?.[0]?.converted || 0)
    };

    return res.json({ ok: true, data: rows, stats });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/label
// ============================================================================
export async function setLeadLabel(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const schema = z.object({ targets: z.array(z.string()).min(1), label: z.string().min(1), color: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data payload label tidak valid." });

  const tagsJson = JSON.stringify({ name: parsed.data.label, color: parsed.data.color });

  try {
    let applied = 0;
    for (const num of parsed.data.targets) {
      const normalized = normalizeIndonesiaPhoneE164(String(num || "").split("@")[0]);
      if (!normalized) {
        await recordInvalidLeadSkip({
          tenantId,
          channel: "leads.label",
          rawInput: String(num || ""),
          reason: "invalid_indonesia_phone",
          sourceHint: "manual_label"
        });
        continue;
      }
      await pool.query(
        `INSERT INTO crm_leads (tenant_id, phone_number, status, source, tags_json, last_interacted_at, created_at)
         VALUES (?, ?, 'warm', 'manual', ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE tags_json = ?, last_interacted_at = NOW()`,
         [tenantId, normalized, tagsJson, tagsJson]
      );
      applied++;
    }
    if (!applied) return res.status(400).json({ ok: false, error: "Tidak ada nomor Indonesia valid (+62) untuk disimpan." });
    return res.json({ ok: true, message: "Label berhasil diperbarui." });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/status
// ============================================================================
export async function updateLeadStatus(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const schema = z.object({ targets: z.array(z.string()).min(1), status: z.enum(['cold', 'warm', 'hot', 'converted', 'dead']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data status tidak valid." });

  try {
    const cleanTargets = parsed.data.targets
      .map(t => normalizeIndonesiaPhoneE164(String(t || "").split("@")[0]))
      .filter((x): x is string => Boolean(x));
    if (!cleanTargets.length) return res.status(400).json({ ok: false, error: "Nomor target tidak valid. Gunakan format +62xxxxxxxxxx." });
    const placeholders = cleanTargets.map(() => '?').join(',');
    
    await pool.query(
      `UPDATE crm_leads SET status = ?, last_interacted_at = NOW() WHERE tenant_id = ? AND phone_number IN (${placeholders})`,
      [parsed.data.status, tenantId, ...cleanTargets]
    );
    return res.json({ ok: true, message: "Suhu/Status Prospek berhasil diperbarui." });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/delete
// ============================================================================
export async function deleteLeads(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const schema = z.object({ targets: z.array(z.string()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data target hapus tidak valid." });

  try {
    const cleanTargets = parsed.data.targets
      .map(t => normalizeIndonesiaPhoneE164(String(t || "").split("@")[0]))
      .filter((x): x is string => Boolean(x));
    if (!cleanTargets.length) return res.status(400).json({ ok: false, error: "Nomor target tidak valid. Gunakan format +62xxxxxxxxxx." });
    const placeholders = cleanTargets.map(() => '?').join(',');
    
    await pool.query(
      `DELETE FROM crm_leads WHERE tenant_id = ? AND phone_number IN (${placeholders})`,
      [tenantId, ...cleanTargets]
    );
    return res.json({ ok: true, message: `${cleanTargets.length} Prospek berhasil dihapus permanen.` });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/debug/classify
// Debug helper untuk QA: simulasi klasifikasi source + temperature tanpa simpan data.
// ============================================================================
export async function debugClassifyLead(req: any, res: any) {
  const schema = z.object({
    text: z.string().optional().default(""),
    quoted_message_id: z.string().optional().nullable(),
    ad_title: z.string().optional().nullable(),
    ad_body: z.string().optional().nullable(),
    source_hint: z.enum(["meta_ads", "ig", "tiktok", "web", "random", "broadcast_reply", "followup_reply"]).optional().nullable(),
    existing_status: z.enum(["cold", "warm", "hot", "converted", "dead"]).optional().nullable()
  });

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const tenantId = req.auth.tenantId;
  const text = String(parsed.data.text || "");
  const txtLower = text.toLowerCase();
  const adTitle = String(parsed.data.ad_title || "");
  const adBody = String(parsed.data.ad_body || "");
  const quotedMessageId = parsed.data.quoted_message_id || null;
  const existingStatus = parsed.data.existing_status || null;

  let isBroadcastReply = false;
  let isFollowupReply = false;
  if (quotedMessageId) {
    isBroadcastReply = await isQuotedFromTable(tenantId, "broadcast_items", quotedMessageId);
    if (!isBroadcastReply) {
      isFollowupReply = await isQuotedFromTable(tenantId, "followup_targets", quotedMessageId);
    }
  }

  let leadSource = "random";
  if (adTitle || adBody || parsed.data.source_hint === "meta_ads") {
    const adName = adTitle || adBody || "Iklan";
    leadSource = `meta_ads|${adName}`;
  } else if (isBroadcastReply || parsed.data.source_hint === "broadcast_reply") {
    leadSource = "broadcast_reply";
  } else if (isFollowupReply || parsed.data.source_hint === "followup_reply") {
    leadSource = "followup_reply";
  } else if (parsed.data.source_hint === "web" || txtLower.includes("dari web") || txtLower.includes("dari landing page") || txtLower.includes("dari website")) {
    leadSource = "web";
  } else if (parsed.data.source_hint === "ig" || txtLower.includes("dari ig") || txtLower.includes("dari instagram") || txtLower.includes("instagram dm") || txtLower.includes("dm ig") || txtLower.includes("ig dm")) {
    leadSource = "ig";
  } else if (parsed.data.source_hint === "tiktok" || txtLower.includes("dari tiktok") || txtLower.includes("dari fyp")) {
    leadSource = "tiktok";
  }

  const [ruleRows] = await pool.query<any[]>(`SELECT * FROM crm_temp_rules WHERE tenant_id=? LIMIT 1`, [tenantId]);
  const rules = ruleRows?.[0] || null;

  const hotSources = parseSourcesArray(rules?.hot_sources, ["broadcast_reply", "followup_reply"]);
  const warmSources = parseSourcesArray(rules?.warm_sources, ["meta_ads", "web", "ig", "tiktok"]);
  const hotKeywords = splitKeywords(rules?.hot_keywords || "pesan, order, beli, harga, transfer");
  const warmKeywords = splitKeywords(rules?.warm_keywords || "tanya, info, halo");
  const baseSource = leadSource.split("|")[0].toLowerCase();

  const reasons: string[] = [];
  if (isBroadcastReply) reasons.push("quoted_message_matches_broadcast");
  if (isFollowupReply) reasons.push("quoted_message_matches_followup");
  if (hotSources.includes(baseSource)) reasons.push("source_in_hot_sources");
  if (warmSources.includes(baseSource)) reasons.push("source_in_warm_sources");

  const hitHotKeywords = hotKeywords.filter(k => txtLower.includes(k));
  const hitWarmKeywords = warmKeywords.filter(k => txtLower.includes(k));
  if (hitHotKeywords.length) reasons.push(`hot_keywords:${hitHotKeywords.join("|")}`);
  if (hitWarmKeywords.length) reasons.push(`warm_keywords:${hitWarmKeywords.join("|")}`);

  const mandatoryHot = hasMandatoryHotIntent(txtLower);
  if (mandatoryHot) reasons.push("mandatory_hot_intent");

  let autoStatus: "cold" | "warm" | "hot" | "converted" | "dead" = "cold";
  if (existingStatus === "converted" || existingStatus === "dead") {
    autoStatus = existingStatus;
    reasons.push("preserve_terminal_status");
  } else {
    const isHot = mandatoryHot || hitHotKeywords.length > 0 || hotSources.includes(baseSource) || isBroadcastReply || isFollowupReply;
    const isWarm = hitWarmKeywords.length > 0 || warmSources.includes(baseSource);
    if (isHot) autoStatus = "hot";
    else if (isWarm) autoStatus = "warm";
    else autoStatus = "cold";
  }

  return res.json({
    ok: true,
    input: parsed.data,
    classification: {
      source: leadSource,
      source_base: baseSource,
      temperature: autoStatus
    },
    matched: {
      is_broadcast_reply: isBroadcastReply,
      is_followup_reply: isFollowupReply,
      mandatory_hot_intent: mandatoryHot,
      hot_keywords: hitHotKeywords,
      warm_keywords: hitWarmKeywords,
      hot_sources: hotSources,
      warm_sources: warmSources
    },
    reasons
  });
}
