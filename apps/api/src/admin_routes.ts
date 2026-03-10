import { pool } from "./db";

// ============================================================================
// 1. GET ALL TENANTS & THEIR SUBSCRIPTIONS
// ============================================================================
export async function getTenants(req: any, res: any) {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT 
        t.id as tenant_id, t.name as tenant_name, t.is_active as tenant_active, t.created_at,
        u.email as owner_email, u.full_name as owner_name,
        s.id as sub_id, s.status as sub_status, s.limit_sessions, s.limit_messages_daily, s.limit_broadcast_daily,
        p.name as plan_name, p.code as plan_code
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       LEFT JOIN (
         SELECT s1.*
         FROM subscriptions s1
         INNER JOIN (
           SELECT
             tenant_id,
             COALESCE(
               MAX(CASE WHEN status IN ('active','trial','past_due') THEN id END),
               MAX(id)
             ) AS latest_id
           FROM subscriptions
           GROUP BY tenant_id
         ) sx ON sx.latest_id = s1.id
       ) s ON s.tenant_id = t.id
       LEFT JOIN plans p ON p.id = s.plan_id
       ORDER BY t.id DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ============================================================================
// 2. CREATE NEW TENANT (Klien Baru)
// ============================================================================
export async function createTenant(req: any, res: any) {
  let connection; 
  
  try {
    const { name, email, password, plan_id } = req.body || {};
    
    if (!name || !email || !password) {
      throw new Error("Data Nama, Email, dan Password wajib diisi.");
    }

    connection = await pool.getConnection(); 
    await connection.beginTransaction();
    
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const [tRes]: any = await connection.query(
      `INSERT INTO tenants (name, slug, is_active) VALUES (?, ?, 1)`,
      [name, slug]
    );
    const tenantId = tRes.insertId;

    const [uRes]: any = await connection.query(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role, is_active) 
       VALUES (?, ?, ?, ?, 'owner', 1)`,
      [tenantId, name + ' Admin', email, password]
    );

    const [pRows]: any = await connection.query(`SELECT * FROM plans WHERE id = ? LIMIT 1`, [plan_id]);
    if (!pRows?.length) throw new Error("Plan/Paket tidak ditemukan");
    const plan = pRows[0];

    await connection.query(
      `INSERT INTO subscriptions (tenant_id, plan_id, status, start_at, limit_sessions, limit_messages_daily, limit_broadcast_daily, limit_contacts)
       VALUES (?, ?, 'active', NOW(), ?, ?, ?, ?)`,
      [tenantId, plan_id, plan.limit_sessions, plan.limit_messages_daily, plan.limit_broadcast_daily, plan.limit_contacts]
    );

    await connection.commit();
    res.json({ ok: true, message: "Klien berhasil dibuat" });
  } catch (error: any) {
    if (connection) await connection.rollback();
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
}

// ============================================================================
// 3. UPDATE TENANT SUBSCRIPTION & LIMITS
// ============================================================================
export async function updateTenantLimits(req: any, res: any) {
  try {
    const tenantId = Number(req.params.id);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid tenant id" });
    }

    const { 
      plan_id, 
      sub_status, 
      limit_sessions, 
      limit_messages_daily, 
      limit_broadcast_daily 
    } = req.body;

    const nextPlanId =
      plan_id === undefined || plan_id === null || String(plan_id).trim() === ""
        ? null
        : Number(plan_id);
    const nextStatus = sub_status === undefined || sub_status === null || String(sub_status).trim() === ""
      ? null
      : String(sub_status).trim();

    const sessions = Number(limit_sessions);
    const messagesDaily = Number(limit_messages_daily);
    const broadcastDaily = Number(limit_broadcast_daily);

    if (nextPlanId !== null && (!Number.isFinite(nextPlanId) || nextPlanId <= 0)) {
      return res.status(400).json({ ok: false, error: "invalid plan_id" });
    }

    if (
      !Number.isFinite(sessions) || sessions < 0 ||
      !Number.isFinite(messagesDaily) || messagesDaily < 0 ||
      !Number.isFinite(broadcastDaily) || broadcastDaily < 0
    ) {
      return res.status(400).json({ ok: false, error: "invalid limits value" });
    }

    if (nextStatus) {
      const allowed = new Set(["trial", "active", "past_due", "canceled", "expired"]);
      if (!allowed.has(nextStatus)) {
        return res.status(400).json({ ok: false, error: "invalid subscription status" });
      }
    }

    const [subs] = await pool.query<any[]>(
      `SELECT id
       FROM subscriptions
       WHERE tenant_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [tenantId]
    );
    
    if (subs?.length > 0) {
      await pool.query(
        `UPDATE subscriptions 
         SET plan_id = COALESCE(?, plan_id), 
             status = COALESCE(?, status), 
             limit_sessions = ?, 
             limit_messages_daily = ?, 
             limit_broadcast_daily = ?
         WHERE tenant_id = ? AND id = ?`,
        [nextPlanId, nextStatus, sessions, messagesDaily, broadcastDaily, tenantId, Number(subs[0].id)]
      );
    } else {
      let initialPlanId = nextPlanId;
      if (!initialPlanId) {
        const [planRows] = await pool.query<any[]>(
          `SELECT id FROM plans WHERE is_active=1 ORDER BY id ASC LIMIT 1`
        );
        initialPlanId = Number(planRows?.[0]?.id || 1);
      }

      await pool.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, start_at, limit_sessions, limit_messages_daily, limit_broadcast_daily)
         VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
        [tenantId, initialPlanId, nextStatus || 'trial', sessions, messagesDaily, broadcastDaily]
      );
    }

    res.json({ ok: true, message: "Limits and subscription updated successfully" });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ============================================================================
// 4. GET SINGLE TENANT (Untuk backward compatibility)
// ============================================================================
export async function getTenant(req: any, res: any) {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const [rows] = await pool.query<any[]>(`SELECT * FROM tenants WHERE id = ? LIMIT 1`, [tenantId]);
    res.json({ ok: true, data: rows[0] || null });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
