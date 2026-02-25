import { pool } from "./db";

// GET /leads
export async function getLeads(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const filter = req.query.filter || 'all'; // all, replied, pending
  const search = req.query.q || '';

  let havingClause = "";
  if (filter === 'replied') {
    havingClause = "HAVING has_replied > 0";
  } else if (filter === 'pending') {
    havingClause = "HAVING has_replied = 0";
  }

  let whereSearch = "";
  let queryParams: any[] = [tenantId];

  // Fitur Pencarian Nomor
  if (search) {
    whereSearch = " AND to_number LIKE ? ";
    queryParams.push(`%${search}%`);
  }

  queryParams.push(limit, offset);

  // Query Agregasi: Mengelompokkan berdasarkan nomor telepon
  const query = `
    SELECT 
      to_number,
      COUNT(id) as total_broadcasts,
      MAX(sent_at) as last_sent_at,
      MAX(reply_received_at) as last_reply_at,
      MAX(CASE WHEN reply_status = 'replied' THEN 1 ELSE 0 END) as has_replied,
      GROUP_CONCAT(DISTINCT reply_text SEPARATOR ' | ') as reply_preview
    FROM broadcast_items
    WHERE tenant_id = ? ${whereSearch}
    GROUP BY to_number
    ${havingClause}
    ORDER BY has_replied DESC, last_reply_at DESC, last_sent_at DESC
    LIMIT ? OFFSET ?
  `;

  try {
    const [rows] = await pool.query<any[]>(query, queryParams);
    
    // Hitung statistik global tenant untuk dasbor UI (Performa)
    const [statsRows] = await pool.query<any[]>(
      `SELECT 
        COUNT(DISTINCT to_number) as total,
        COUNT(DISTINCT CASE WHEN reply_status = 'replied' THEN to_number END) as hot
       FROM broadcast_items 
       WHERE tenant_id = ?`, 
      [tenantId]
    );

    const total = statsRows?.[0]?.total || 0;
    const hot = statsRows?.[0]?.hot || 0;
    const cold = total - hot;

    return res.json({ 
      ok: true, 
      data: rows,
      stats: { total, hot, cold }
    });
  } catch (e: any) {
    console.error("Leads Route Error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}