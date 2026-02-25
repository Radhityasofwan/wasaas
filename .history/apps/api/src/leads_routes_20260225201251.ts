/**
 * ============================================================================
 * LEADS ROUTES - CRM MASTER DATA CONTROLLER
 * ============================================================================
 */

import { pool } from "./db";
import { z } from "zod";

// ============================================================================
// GET /leads (Mengambil Daftar Prospek & Statistik dengan Filter Lanjutan)
// ============================================================================
export async function getLeads(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  
  // Paginasi
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  
  // Parameter Pencarian & Filter
  const search = req.query.q || '';
  const sourceFilter = req.query.source || 'all'; 
  const statusFilter = req.query.status || 'all'; 

  let whereClause = "WHERE c.tenant_id = ?";
  let queryParams: any[] = [tenantId];

  // 1. Filter Pencarian Teks (Nama atau Nomor)
  if (search) {
    whereClause += " AND (c.phone_number LIKE ? OR c.name LIKE ?)";
    queryParams.push(`%${search}%`, `%${search}%`);
  }

  // 2. Filter Sumber Trafik (Meta Ads, Web, IG, TikTok, dll)
  if (sourceFilter !== 'all') {
    whereClause += " AND c.source = ?";
    queryParams.push(sourceFilter);
  }

  // 3. Filter Klasifikasi Suhu Prospek (Cold, Warm, Hot, Converted, Dead)
  if (statusFilter !== 'all') {
    whereClause += " AND c.status = ?";
    queryParams.push(statusFilter);
  }

  // Query Integrasi: Membaca Master Data Leads dan Agregasi Total Penyiaran (Broadcast/FollowUp)
  const query = `
    SELECT 
      c.id,
      c.phone_number as to_number,
      c.name,
      c.source,
      c.status,
      c.tags_json,
      c.last_interacted_at,
      c.created_at,
      (SELECT COUNT(id) FROM broadcast_items b WHERE b.tenant_id = c.tenant_id AND b.to_number = c.phone_number) as total_broadcasts,
      (SELECT COUNT(id) FROM followup_targets f WHERE f.tenant_id = c.tenant_id AND f.to_number = c.phone_number) as total_followups
    FROM crm_leads c
    ${whereClause}
    ORDER BY c.last_interacted_at DESC, c.id DESC
    LIMIT ? OFFSET ?
  `;

  // Duplikasi parameter untuk dieksekusi di kueri utama
  const dataParams = [...queryParams, limit, offset];

  try {
    const [rows] = await pool.query<any[]>(query, dataParams);
    
    // Hitung statistik performa global CRM (Untuk Top Dashboard Cards)
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
      total: Number(statsRows?.[0]?.total || 0),
      hot: Number(statsRows?.[0]?.hot || 0),
      warm: Number(statsRows?.[0]?.warm || 0),
      cold: Number(statsRows?.[0]?.cold || 0),
      converted: Number(statsRows?.[0]?.converted || 0)
    };

    return res.json({ 
      ok: true, 
      data: rows,
      stats
    });
  } catch (e: any) {
    console.error("Leads Route Error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/label (Menyematkan Label Kustom dari Inbox UI ke Master CRM)
// ============================================================================
export async function setLeadLabel(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  
  const schema = z.object({
    targets: z.array(z.string()).min(1),
    label: z.string().min(1),
    color: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data payload label tidak valid." });

  const tagsJson = JSON.stringify({ name: parsed.data.label, color: parsed.data.color });

  try {
    // Eksekusi Massal (Bulk Upsert)
    for (const num of parsed.data.targets) {
      const cleanNum = num.split('@')[0]; 
      
      await pool.query(
        `INSERT INTO crm_leads (tenant_id, phone_number, status, source, tags_json, last_interacted_at, created_at)
         VALUES (?, ?, 'warm', 'manual', ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE 
         tags_json = ?,
         last_interacted_at = NOW()`,
         [tenantId, cleanNum, tagsJson, tagsJson]
      );
    }
    return res.json({ ok: true, message: "Label berhasil diperbarui." });
  } catch (e: any) {
    console.error("Set Lead Label Error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/status (Ubah Suhu / Status Leads Massal & Tunggal)
// ============================================================================
export async function updateLeadStatus(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  
  const schema = z.object({
    targets: z.array(z.string()).min(1),
    status: z.enum(['cold', 'warm', 'hot', 'converted', 'dead'])
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data status tidak valid." });

  try {
    const cleanTargets = parsed.data.targets.map(t => t.split('@')[0]);
    const placeholders = cleanTargets.map(() => '?').join(',');
    
    await pool.query(
      `UPDATE crm_leads 
       SET status = ?, last_interacted_at = NOW() 
       WHERE tenant_id = ? AND phone_number IN (${placeholders})`,
      [parsed.data.status, tenantId, ...cleanTargets]
    );

    return res.json({ ok: true, message: "Suhu/Status Prospek berhasil diperbarui." });
  } catch (e: any) {
    console.error("Update Status Error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// ============================================================================
// POST /leads/delete (Hapus Data Leads Massal/Tunggal)
// ============================================================================
export async function deleteLeads(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  
  const schema = z.object({
    targets: z.array(z.string()).min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Data target hapus tidak valid." });

  try {
    const cleanTargets = parsed.data.targets.map(t => t.split('@')[0]);
    // Membuat array placeholder '?' sebanyak jumlah target
    const placeholders = cleanTargets.map(() => '?').join(',');
    
    await pool.query(
      `DELETE FROM crm_leads WHERE tenant_id = ? AND phone_number IN (${placeholders})`,
      [tenantId, ...cleanTargets]
    );

    return res.json({ ok: true, message: `${cleanTargets.length} Prospek berhasil dihapus permanen.` });
  } catch (e: any) {
    console.error("Delete Leads Error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}