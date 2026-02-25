import { pool } from "./db";
import { getSessionSock, sendText } from "./wa";
import { sendMediaImage, sendMediaDocument, sendMediaVideo, sendLocation } from "./wa_media";

let isRunning = false;

export async function processFollowUpQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    // FIX 1: Gunakan Date() dari Node.js untuk mengatasi timezone mismatch antara MySQL NOW() & Node
    const now = new Date();
    
    // FIX 2: Gunakan LEFT JOIN untuk template, agar jika template hilang/bermasalah, 
    // sistem tidak stuck di 'queued', melainkan bisa diubah statusnya jadi 'failed'.
    const [targets] = await pool.query<any[]>(
      `SELECT 
         ft.id as target_id, ft.tenant_id, ft.session_key, ft.to_number, ft.to_jid, ft.created_at as target_added_at,
         fc.trigger_condition, 
         mt.id as template_found, mt.message_type, mt.text_body, mt.media_url, mt.media_name, mt.media_mime
       FROM followup_targets ft
       JOIN followup_campaigns fc ON ft.campaign_id = fc.id
       LEFT JOIN message_templates mt ON fc.template_id = mt.id
       WHERE ft.status = 'queued' AND fc.status = 'active' AND ft.scheduled_at <= ?
       LIMIT 30`,
      [now]
    );

    if (!targets.length) {
      isRunning = false;
      return;
    }

    console.log(`[FollowUp Worker] Memproses ${targets.length} target antrean...`);

    for (const target of targets) {
      const { 
        target_id, tenant_id, session_key, to_number, to_jid, target_added_at, 
        trigger_condition, template_found, message_type, text_body, media_url 
      } = target;

      // VALIDASI 1: Cek apakah template masih ada
      if (!template_found) {
        await setFailed(target_id, "Template pesan telah dihapus atau tidak ditemukan");
        continue;
      }

      // VALIDASI 2: Cek apakah Baileys Session hidup
      const sock = getSessionSock(session_key);
      if (!sock) {
        await setFailed(target_id, `Session WA '${session_key}' tidak terhubung`);
        continue;
      }

      // CEK LOGIKA TRIGGER 'UNREPLIED'
      if (trigger_condition === 'unreplied') {
        const [replies] = await pool.query<any[]>(
          `SELECT id FROM wa_messages 
           WHERE tenant_id = ? AND remote_jid = ? AND direction = 'in' AND created_at > ? 
           LIMIT 1`,
          [tenant_id, to_jid, target_added_at]
        );

        if (replies.length > 0) {
          // Klien sudah membalas SEBELUM jadwal follow up tiba. Batalkan pengiriman.
          console.log(`[FollowUp Worker] Target ${to_number} dibatalkan karena sudah membalas.`);
          await pool.query(`UPDATE followup_targets SET status = 'canceled', last_error = 'User already replied' WHERE id = ?`, [target_id]);
          continue;
        }
      }

      // EKSEKUSI PENGIRIMAN
      try {
        let sendResult: any;

        if (message_type === 'text') {
          sendResult = await sendText(session_key, to_jid, text_body || "");
        } else if (message_type === 'image' && media_url) {
          sendResult = await sendMediaImage({ tenantId: tenant_id, userId: 1, sessionKey: session_key, to: to_jid, caption: text_body || "", publicUrl: media_url });
        } else if (message_type === 'document' && media_url) {
          sendResult = await sendMediaDocument({ tenantId: tenant_id, userId: 1, sessionKey: session_key, to: to_jid, caption: text_body || "", publicUrl: media_url });
        } else if (message_type === 'video' && media_url) {
          sendResult = await sendMediaVideo({ tenantId: tenant_id, userId: 1, sessionKey: session_key, to: to_jid, caption: text_body || "", publicUrl: media_url });
        } else if (message_type === 'location' && media_url) {
          // Asumsi format location dari frontend: "lat,lng"
          const [latStr, lngStr] = media_url.split(",");
          sendResult = await sendLocation({ tenantId: tenant_id, userId: 1, sessionKey: session_key, to: to_jid, latitude: Number(latStr), longitude: Number(lngStr) });
        } else {
          sendResult = { ok: false, error: "Tipe media tidak dikenali atau URL kosong" };
        }

        // TANDAI HASIL PENGIRIMAN
        if (sendResult?.ok) {
          await pool.query(
            `UPDATE followup_targets SET status = 'sent', sent_at = NOW(), wa_message_id = ? WHERE id = ?`,
            [sendResult.messageId || null, target_id]
          );
          console.log(`[FollowUp Worker] Berhasil kirim ke ${to_number}`);
        } else {
          await setFailed(target_id, sendResult?.error || "Gagal mengirim pesan (Unknown Error)");
        }

      } catch (err: any) {
        await setFailed(target_id, err.message);
      }
      
      // Jeda 2 detik antar kiriman (Proteksi Anti-Banned WA)
      await new Promise(res => setTimeout(res, 2000));
    }

  } catch (err) {
    console.error("[FollowUp Worker] Crash Sistem:", err);
  } finally {
    isRunning = false;
  }
}

async function setFailed(targetId: number, errorMsg: string) {
  try {
    await pool.query(`UPDATE followup_targets SET status = 'failed', last_error = ? WHERE id = ?`, [errorMsg, targetId]);
    console.log(`[FollowUp Worker] Target ${targetId} GAGAL: ${errorMsg}`);
  } catch (e) {
    // Silent catch if DB fails to update
  }
}