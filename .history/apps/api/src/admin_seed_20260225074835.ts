import "dotenv/config"; // WAJIB ADA: Agar file .env terbaca
import { pool } from "./db";

async function seedAdmin() {
  try {
    console.log("⏳ Menyiapkan akun Super Admin...");
    
    // Kredensial Admin Default
    const email = "admin@wa-saas.com";
    const password = "adminpassword123";

    // 1. Pastikan tenant default (Sistem) tersedia
    await pool.query(
      `INSERT IGNORE INTO tenants (id, name, slug, is_active) VALUES (1, 'System Admin', 'system-admin', 1)`
    );

    // 2. Cek apakah user admin sudah ada
    const [existing] = await pool.query<any[]>(`SELECT id FROM users WHERE email = ?`, [email]);
    
    if (existing.length > 0) {
      // Jika sudah ada, paksa reset password dan role menjadi 'admin'
      await pool.query(
        `UPDATE users SET password_hash = ?, role = 'admin', is_active = 1 WHERE email = ?`, 
        [password, email]
      );
      console.log("✅ Akun admin sudah ada. Password dan role berhasil direset ke default.");
    } else {
      // Jika belum ada, buat baru
      await pool.query(
        `INSERT INTO users (tenant_id, full_name, email, password_hash, role, is_active) 
         VALUES (1, 'Super Admin', ?, ?, 'admin', 1)`,
        [email, password]
      );
      console.log("✅ Berhasil membuat akun Super Admin baru!");
    }

    console.log(`\n🎉 Silakan Login di UI menggunakan:`);
    console.log(`Email    : ${email}`);
    console.log(`Password : ${password}\n`);
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Gagal membuat admin:", err);
    process.exit(1);
  }
}

seedAdmin();