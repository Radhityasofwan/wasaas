/**
 * ============================================================================
 * LEADS ROUTES - CRM MASTER DATA CONTROLLER
 * ============================================================================
 * V.2.0 - Mendukung Smart Temperature Engine Fleksibel (Multi-Choice)
 */

import { pool } from "./db";
import { z } from "zod";

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
      c.id, c.phone_number as to_number, c.name, c.source, c.status, c.tags_json, c.last_interacted_at, c.created_at,
      (SELECT COUNT(id) FROM broadcast_items b WHERE b.tenant_id = c.tenant_id AND b.to_number = c.phone_number) as total_broadcasts,
      (SELECT COUNT(id) FROM followup_targets f WHERE f.tenant_id = c.tenant_id AND f.to_number = c.phone_number) as total_followups
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
    for (const num of parsed.data.targets) {
      const cleanNum = num.split('@')[0]; 
      await pool.query(
        `INSERT INTO crm_leads (tenant_id, phone_number, status, source, tags_json, last_interacted_at, created_at)
         VALUES (?, ?, 'warm', 'manual', ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE tags_json = ?, last_interacted_at = NOW()`,
         [tenantId, cleanNum, tagsJson, tagsJson]
      );
    }
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
    const cleanTargets = parsed.data.targets.map(t => t.split('@')[0]);
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
    const cleanTargets = parsed.data.targets.map(t => t.split('@')[0]);
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