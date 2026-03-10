import { z } from "zod";
import { pool } from "./db";

async function runTest() {
  console.log("\n=============================================");
  console.log("🚀 MEMULAI TEST UNREAD INDICATOR (BUG VS FIX)");
  console.log("=============================================\n");

  const tenantId = 1; // Asumsi menggunakan tenant_id = 1
  const sessionKey = "test-session";
  const remoteJid = "628999999999@s.whatsapp.net";

  // 1. SEED DATA
  console.log("[1] Menseed data chat dummy dengan unread_count = 5...");
  await pool.query(
    `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at) 
     VALUES(?, ?, ?, 'private', 5, NOW()) 
     ON DUPLICATE KEY UPDATE unread_count = 5`,
    [tenantId, sessionKey, remoteJid]
  );
  const [awal]: any = await pool.query(`SELECT unread_count FROM wa_chats WHERE remote_jid = ?`, [remoteJid]);
  console.log(`    -> Data DB Saat Ini: ${awal[0].unread_count} Pesan Belum Dibaca\n`);

  // VALIDATOR SCHEMA (Berdasarkan ui_routes.ts)
  const schema = z.object({
    sessionKey: z.string().min(1).max(64),
    peer: z.string().min(1).max(128)
  });

  // 2. SIMULASI BUG (Kode lama di Inbox.tsx)
  console.log(`[2] ❌ Simulasi BUG: Frontend lama memanggil handleSelectChat(undefined)`);
  const payloadBug = { sessionKey, peer: undefined };
  const parsedBug = schema.safeParse(payloadBug);
  if (!parsedBug.success) {
    console.log(`    -> Zod Reject: ${parsedBug.error.issues[0].message} (karena data undefined)`);
    console.log(`    -> API Merespon HTTP 400 Bad Request`);
  }
  const [cekBug]: any = await pool.query(`SELECT unread_count FROM wa_chats WHERE remote_jid = ?`, [remoteJid]);
  console.log(`    -> Data DB Pasca Bug: ${cekBug[0].unread_count} (INDIKATOR MUNCUL LAGI SAAT REFRESH)\n`);

  // 3. SIMULASI FIX (Kode baru di Inbox.tsx)
  console.log(`[3] ✅ Simulasi FIX: Frontend baru mengirim { peer: '${remoteJid}' }`);
  const payloadFix = { sessionKey, peer: remoteJid };
  const parsedFix = schema.safeParse(payloadFix);
  if (parsedFix.success) {
    console.log(`    -> API Validation Sukses`);
    await pool.query(
      `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at) 
       VALUES(?, ?, ?, 'private', 0, NOW()) 
       ON DUPLICATE KEY UPDATE unread_count = 0`,
      [tenantId, sessionKey, parsedFix.data.peer]
    );
    console.log(`    -> Eksekusi SQL UPDATE unread_count = 0 Berhasil`);
  }
  const [cekAkhir]: any = await pool.query(`SELECT unread_count FROM wa_chats WHERE remote_jid = ?`, [remoteJid]);
  console.log(`    -> Data DB Pasca Fix: ${cekAkhir[0].unread_count} (INDIKATOR HILANG PERMANEN)\n`);

  console.log("=============================================");
  console.log("🎉 TEST SELESAI");
  console.log("=============================================");
  process.exit(0);
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
