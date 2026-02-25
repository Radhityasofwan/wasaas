// ... existing code ...
// ============================================================================
// 4. CREATE NEW TENANT (Klien Baru)
// ============================================================================
router.post("/tenants", async (req: any, res: any) => {
  let connection; // Pindahkan variabel connection ke luar agar bisa diakses oleh catch/finally
  
  try {
    const { name, email, password, plan_id } = req.body || {};
    
    // Validasi sederhana
    if (!name || !email || !password) {
      throw new Error("Data Nama, Email, dan Password wajib diisi.");
    }

    connection = await pool.getConnection(); // Gunakan transaction agar aman
    await connection.beginTransaction();
    
    // 1. Buat Tenant (Perusahaan)
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const [tRes]: any = await connection.query(
      `INSERT INTO tenants (name, slug, is_active) VALUES (?, ?, 1)`,
      [name, slug]
    );
    const tenantId = tRes.insertId;

    // 2. Buat User (Owner/Pemilik Tenant)
    // Catatan: Di production, gunakan library 'bcrypt' untuk meng-hash password
    const [uRes]: any = await connection.query(
      `INSERT INTO users (tenant_id, full_name, email, password_hash, role, is_active) 
       VALUES (?, ?, ?, ?, 'owner', 1)`,
      [tenantId, name + ' Admin', email, password]
    );

    // 3. Ambil data limit default dari Paket (Plan) yang dipilih
    const [pRows]: any = await connection.query(`SELECT * FROM plans WHERE id = ? LIMIT 1`, [plan_id]);
    if (!pRows?.length) throw new Error("Plan/Paket tidak ditemukan");
    const plan = pRows[0];

    // 4. Buat Subscription (Langganan) & Set Limit
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
});

export default router;