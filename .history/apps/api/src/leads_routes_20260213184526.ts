import { pool } from "./db";

// GET /leads
export async function getLeads(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const filter = req.query.filter || 'all'; // all, replied, pending

  let havingClause = "";
  if (filter === 'replied') {
    havingClause = "HAVING has_replied > 0";
  } else if (filter === 'pending') {
    havingClause = "HAVING has_replied = 0";
  }

  // Query Agregasi: Mengelompokkan berdasarkan nomor telepon
  // Menghitung berapa kali dibroadcast dan apakah pernah membalas
  const query = `
    SELECT 
      to_number,
      COUNT(id) as total_broadcasts,
      MAX(sent_at) as last_sent_at,
      MAX(reply_received_at) as last_reply_at,
      MAX(CASE WHEN reply_status = 'replied' THEN 1 ELSE 0 END) as has_replied,
      GROUP_CONCAT(DISTINCT reply_text ORDER BY reply_received_at DESC SEPARATOR ' | ') as reply_preview
    FROM broadcast_items
    WHERE tenant_id = ?
    GROUP BY to_number
    ${havingClause}
    ORDER BY has_replied DESC, last_reply_at DESC, last_sent_at DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const [rows] = await pool.query<any[]>(query, [tenantId, limit, offset]);
    
    // Hitung total untuk pagination (opsional, simple count)
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(DISTINCT to_number) as total FROM broadcast_items WHERE tenant_id = ?`, 
      [tenantId]
    );

    return res.json({ 
      ok: true, 
      data: rows,
      total: countRows?.[0]?.total || 0
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}