import { pool } from "./db";
import path from "path";
import fs from "fs";
import { getSessionSock, sendText } from "./wa";
import { sendMediaImage, sendMediaDocument, sendMediaVideo, sendLocation } from "./wa_media";

let isRunning = false;

function resolveUploadFromPublicUrl(publicUrl: string) {
  // expected: https://DOMAIN/files/<filename> OR /files/<filename>
  try {
    const u = publicUrl.startsWith("http") ? new URL(publicUrl) : null;
    const pathname = u ? u.pathname : publicUrl;
    const idx = pathname.indexOf("/files/");
    if (idx === -1) return null;
    const rel = pathname.substring(idx + "/files/".length);
    if (!rel) return null;
    const filePath = path.join(process.cwd(), "storage", "uploads", rel);
    if (!fs.existsSync(filePath)) return null;
    const st = fs.statSync(filePath);
    return { filePath, fileSize: st.size, fileName: path.basename(filePath) };
  } catch {
    return null;
  }
}


// 1. ENGINE GREETING WAKTU (WIB)
function getDynamicGreeting(): string {
  const d = new Date();
  d.setHours(d.getUTCHours() + 7); // Kompensasi Paksa ke WIB (UTC+7)
  const h = d.getHours();
  
  if (h >= 3 && h < 11) return "Pagi";
  if (h >= 11 && h < 15) return "Siang";
  if (h >= 15 && h < 18) return "Sore";
  return "Malam";
}

// 2. BULLETPROOF PARSER ENGINE (VARIABEL & SPINTAX)
function parseMessageMagic(rawText: string | null, targetNumber: string, targetName: string | null): string {
  if (!rawText) return "";
  
  let processed = rawText;

  const fallbackName = "Kak"; 
  const finalName = (targetName && targetName.trim() !== "") ? targetName : fallbackName;
  
  processed = processed.replace(/\{\{nama\}\}/ig, finalName);
  processed = processed.replace(/\{nama\}/ig, finalName);

  processed = processed.replace(/\{\{nomor\}\}/ig, targetNumber);
  processed = processed.replace(/\{nomor\}/ig, targetNumber);

  const salamWaktu = getDynamicGreeting();
  processed = processed.replace(/\{\{salam\}\}/ig, salamWaktu);
  processed = processed.replace(/\{salam\}/ig, salamWaktu);

  const spintaxRegex = /\{([^{}]*\|[^{}]*)\}/g;
  let match;
  while ((match = spintaxRegex.exec(processed)) !== null) {
    const options = match[1].split('|');
    const choice = options[Math.floor(Math.random() * options.length)];
    processed = processed.replace(match[0], choice);
    spintaxRegex.lastIndex = 0;
  }

  return processed;
}

export async function processFollowUpQueue() {
  // STRICT LOCK: Jika worker masih jalan, blokir eksekusi baru.
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();
    
    // Ambil antrean target yang sudah waktunya dieksekusi (scheduled_at <= NOW)
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
      return; // Langsung lari ke blok finally
    }

    console.log(`[FollowUp Worker] Memproses ${targets.length} target antrean...`);

    for (const target of targets) {
      const {
        target_id, tenant_id, session_key, to_number, to_jid, target_added_at,
        trigger_condition, template_found, message_type, text_body, media_url,
        media_name, media_mime
      } = target;

      if (!template_found) {
        await setFailed(target_id, "Template pesan telah dihapus");
        continue;
      }

      const sock = getSessionSock(session_key);
      if (!sock) {
        await setFailed(target_id, `Sesi WA '${session_key}' terputus / offline.`);
        continue;
      }

      // Validasi balasan sebelum menembak pesan (Fitur Stop Jika Dibalas)
      if (trigger_condition === 'unreplied') {
        const [replies] = await pool.query<any[]>(
          `SELECT id FROM wa_messages 
           WHERE tenant_id = ? AND remote_jid = ? AND direction = 'in' AND created_at > ? 
           LIMIT 1`,
          [tenant_id, to_jid, target_added_at]
        );

        if (replies.length > 0) {
          console.log(`[FollowUp Worker] Batal: Target ${to_number} sudah membalas pesan sebelumnya.`);
          await pool.query(`UPDATE followup_targets SET status = 'canceled', last_error = 'User already replied' WHERE id = ?`, [target_id]);
          continue;
        }
      }

      // Mengambil Push Name / Nama Kontak
      let contactName = null;
      try {
        const [contacts] = await pool.query<any[]>(
          `SELECT display_name FROM wa_contacts WHERE tenant_id = ? AND session_key = ? AND jid = ? LIMIT 1`,
          [tenant_id, session_key, to_jid]
        );
        if (contacts.length > 0 && contacts[0].display_name) {
          contactName = contacts[0].display_name;
        }
      } catch (e) { /* ignore */ }

      // EKSEKUSI ENGINE PARSER FINAL
      const finalCaptionOrText = parseMessageMagic(text_body, to_number, contactName);

      try {
        let sendResult: any;

        // EKSEKUSI PENGIRIMAN BERDASARKAN TIPE
        if (message_type === 'text') {
          sendResult = await sendText(session_key, to_jid, finalCaptionOrText);
        } else if (message_type === 'image' && media_url) {
          {
          const resolved = resolveUploadFromPublicUrl(media_url);
          if (!resolved) throw new Error("Media file not found on server for URL: " + media_url);
          sendResult = await sendMediaImage({
            tenantId: tenant_id,
            userId: 1,
            sessionKey: session_key,
            to: to_jid,
            caption: finalCaptionOrText,
            filePath: resolved.filePath,
            mime: (media_mime || "application/octet-stream"),
            fileName: (media_name || resolved.fileName),
            fileSize: resolved.fileSize,
            publicUrl: media_url
          });
        }
        } else if (message_type === 'document' && media_url) {
          {
          const resolved = resolveUploadFromPublicUrl(media_url);
          if (!resolved) throw new Error("Media file not found on server for URL: " + media_url);
          sendResult = await sendMediaDocument({
            tenantId: tenant_id,
            userId: 1,
            sessionKey: session_key,
            to: to_jid,
            caption: finalCaptionOrText,
            filePath: resolved.filePath,
            mime: (media_mime || "application/octet-stream"),
            fileName: (media_name || resolved.fileName),
            fileSize: resolved.fileSize,
            publicUrl: media_url
          });
        }
        } else if (message_type === 'video' && media_url) {
          {
          const resolved = resolveUploadFromPublicUrl(media_url);
          if (!resolved) throw new Error("Media file not found on server for URL: " + media_url);
          sendResult = await sendMediaVideo({
            tenantId: tenant_id,
            userId: 1,
            sessionKey: session_key,
            to: to_jid,
            caption: finalCaptionOrText,
            filePath: resolved.filePath,
            mime: (media_mime || "application/octet-stream"),
            fileName: (media_name || resolved.fileName),
            fileSize: resolved.fileSize,
            publicUrl: media_url
          });
        }
        } else if (message_type === 'location' && media_url) {
          const [latStr, lngStr] = media_url.split(",");
          const lat = Number(latStr);
          const lng = Number(lngStr);
          if (isNaN(lat) || isNaN(lng)) throw new Error("Format koordinat tidak valid (lat,lng)");
          sendResult = await sendLocation({ tenantId: tenant_id, userId: 1, sessionKey: session_key, to: to_jid, latitude: lat, longitude: lng });
        } else {
          sendResult = { ok: false, error: `Format Media tidak didukung atau URL kosong (${message_type})` };
        }

        if (sendResult?.ok) {
          await pool.query(
            `UPDATE followup_targets SET status = 'sent', sent_at = NOW(), wa_message_id = ? WHERE id = ?`,
            [sendResult.messageId || null, target_id]
          );
        } else {
          await setFailed(target_id, sendResult?.error || "Gagal mengirim pesan (Unknown Error)");
        }
      } catch (err: any) {
        await setFailed(target_id, err.message);
      }
      
      // Jeda Humanizer: Tunggu 2 detik antar pesan agar tidak terdeteksi sebagai spammer
      await new Promise(res => setTimeout(res, 2000));
    }

  } catch (err) {
    console.error("[FollowUp Worker] Terjadi kesalahan kritis:", err);
  } finally {
    // APAPUN YANG TERJADI (Sukses/Error), kunci harus dilepas!
    isRunning = false;
  }
}

async function setFailed(targetId: number, errorMsg: string) {
  try {
    await pool.query(`UPDATE followup_targets SET status = 'failed', last_error = ? WHERE id = ?`, [errorMsg, targetId]);
  } catch (e) {}
}