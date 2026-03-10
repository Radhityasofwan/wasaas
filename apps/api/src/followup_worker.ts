import { pool } from "./db";
import { getSessionSock, sendText } from "./wa";
import { sendLocation, sendMediaByType } from "./wa_media";
import { resolveMediaAssetFromUrl } from "./media_asset_resolver";
import { enqueueWebhook } from "./webhook";

let isRunning = false;
const sessionRestartAttemptAt = new Map<string, number>();

function toSqlDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizePhone(raw: string | null | undefined) {
  return String(raw || "").replace(/[^\d]/g, "");
}

function isSessionError(msg: string | null | undefined) {
  const s = String(msg || "");
  return (
    s.includes("Session socket is not running") ||
    s.includes("Session is disconnected") ||
    s.includes("Session context missing")
  );
}

async function ensureSessionForFollowUp(tenantId: number, sessionKey: string) {
  const cooldownMs = 15000;
  const last = sessionRestartAttemptAt.get(sessionKey) || 0;
  if (Date.now() - last < cooldownMs) return false;
  sessionRestartAttemptAt.set(sessionKey, Date.now());

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT user_id FROM wa_sessions WHERE tenant_id=? AND session_key=? ORDER BY id DESC LIMIT 1`,
      [tenantId, sessionKey]
    );
    const userId = Number(rows?.[0]?.user_id || 0);
    if (!userId) return false;

    const { isConnected, startSession } = await import("./wa");
    if (isConnected(sessionKey)) return true;
    await startSession(sessionKey, { tenantId, userId });
    return true;
  } catch (e) {
    console.error(`[FollowUp Worker] Failed auto-start session ${sessionKey}:`, e);
    return false;
  }
}

async function setQueuedRetry(targetId: number, msg: string) {
  try {
    await pool.query(
      `UPDATE followup_targets SET status = 'queued', last_error = ? WHERE id = ?`,
      [`${msg} (auto-retry)`, targetId]
    );
  } catch {}
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
    const nowSql = toSqlDateTime(now);
    console.log(`[FollowUp Worker] Waking up at ${now.toISOString()} - checking for queued targets...`);
    
    const [targets] = await pool.query<any[]>(
      `SELECT 
         ft.id as target_id, ft.tenant_id, ft.session_key, ft.to_number, ft.to_jid, ft.created_at as target_added_at, ft.scheduled_at,
         fc.id as campaign_id, fc.name as campaign_name, fc.trigger_condition, fc.status as campaign_status,
         mt.id as template_found, mt.message_type, mt.text_body, mt.media_url, mt.media_name, mt.media_mime
       FROM followup_targets ft
       JOIN followup_campaigns fc ON ft.campaign_id = fc.id
       LEFT JOIN message_templates mt ON fc.template_id = mt.id
       WHERE ft.status = 'queued' AND fc.status = 'active' AND ft.scheduled_at <= ?
       ORDER BY ft.scheduled_at ASC, ft.id ASC
       LIMIT 30`,
      [nowSql]
    );

    if (!targets.length) {
      console.log(`[FollowUp Worker] No queued targets ready for ${now.toISOString()}`);
      return; // Langsung lari ke blok finally
    }

    console.log(`[FollowUp Worker] Memproses ${targets.length} target antrean...`);

    for (const target of targets) {
      const {
        target_id, tenant_id, session_key, to_number, to_jid, target_added_at,
        campaign_id, campaign_name, trigger_condition, template_found, message_type, text_body, media_url,
        media_name, media_mime
      } = target;
      const normalizedNumber = normalizePhone(to_number);

      if (!template_found) {
        await setFailed(target_id, "Template pesan telah dihapus");
        continue;
      }

      const sock = getSessionSock(session_key);
      if (!sock) {
        await ensureSessionForFollowUp(tenant_id, session_key);
        await setQueuedRetry(target_id, `Sesi WA '${session_key}' terputus / offline.`);
        continue;
      }

      // Validasi balasan sebelum menembak pesan (Fitur Stop Jika Dibalas)
      if (trigger_condition === 'unreplied') {
        const [replies] = await pool.query<any[]>(
          `SELECT 1
           FROM (
             SELECT 1 AS x
             FROM wa_messages wm
             WHERE wm.tenant_id = ?
               AND wm.direction = 'in'
               AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(SUBSTRING_INDEX(wm.remote_jid, '@', 1), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
             LIMIT 1

             UNION ALL

             SELECT 1 AS x
             FROM broadcast_items bi
             WHERE bi.tenant_id = ?
               AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(bi.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
               AND bi.reply_status = 'replied'
             LIMIT 1

             UNION ALL

             SELECT 1 AS x
             FROM followup_targets ft2
             WHERE ft2.tenant_id = ?
               AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(ft2.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
               AND ft2.status = 'replied'
             LIMIT 1
           ) t
           LIMIT 1`,
          [tenant_id, normalizedNumber, tenant_id, normalizedNumber, tenant_id, normalizedNumber]
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
        const normalizedType = String(message_type || "text").trim().toLowerCase();
        const mediaSendableTypes = new Set(["image", "document", "video", "audio", "voice_note", "sticker"]);

        // EKSEKUSI PENGIRIMAN BERDASARKAN TIPE
        if (normalizedType === 'text') {
          sendResult = await sendText(session_key, to_jid, finalCaptionOrText);
        } else if (mediaSendableTypes.has(normalizedType) && media_url) {
          const resolved = await resolveMediaAssetFromUrl(media_url);
          if (!resolved) throw new Error("Media file not found on server for URL: " + media_url);
          sendResult = await sendMediaByType({
            tenantId: tenant_id,
            userId: 1,
            sessionKey: session_key,
            to: to_jid,
            mediaType: normalizedType as any,
            caption: finalCaptionOrText,
            filePath: resolved.filePath,
            mime: (media_mime || resolved.mime || "application/octet-stream"),
            fileName: (media_name || resolved.fileName),
            fileSize: resolved.fileSize,
            publicUrl: media_url
          });
        } else if (normalizedType === 'location' && media_url) {
          const [latStr, lngStr] = media_url.split(",");
          const lat = Number(latStr);
          const lng = Number(lngStr);
          if (isNaN(lat) || isNaN(lng)) throw new Error("Format koordinat tidak valid (lat,lng)");
          sendResult = await sendLocation({
            tenantId: tenant_id,
            userId: 1,
            sessionKey: session_key,
            to: to_jid,
            latitude: lat,
            longitude: lng,
            name: finalCaptionOrText || undefined,
            address: media_name || undefined,
          });
        } else {
          sendResult = { ok: false, error: `Format Media tidak didukung atau URL kosong (${normalizedType})` };
        }

        if (sendResult?.ok) {
          await pool.query(
            `UPDATE followup_targets SET status = 'sent', sent_at = NOW(), wa_message_id = ?, last_error = NULL WHERE id = ?`,
            [sendResult.messageId || null, target_id]
          );
          enqueueWebhook(tenant_id, "followup.sent", {
            sessionKey: session_key,
            campaign_id,
            campaign_name,
            target_id,
            to_number,
            to_jid,
            scheduled_at: target.scheduled_at,
            sent_at: new Date(),
            wa_message_id: sendResult.messageId || null,
          }).catch(() => { });
        } else {
          if (isSessionError(sendResult?.error)) {
            await ensureSessionForFollowUp(tenant_id, session_key);
            await setQueuedRetry(target_id, sendResult?.error || "Sesi offline");
            continue;
          }
          await setFailed(target_id, sendResult?.error || "Gagal mengirim pesan (Unknown Error)");
        }
      } catch (err: any) {
        if (isSessionError(err?.message)) {
          await ensureSessionForFollowUp(tenant_id, session_key);
          await setQueuedRetry(target_id, err?.message || "Sesi offline");
          continue;
        }
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
