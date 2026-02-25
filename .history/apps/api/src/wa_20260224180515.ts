/**
 * ============================================================================
 * WA.TS - CORE BAILEYS ENGINE (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini menangani seluruh koneksi dan siklus hidup WhatsApp Web (Baileys).
 * * V.5.0 Stable Release:
 * - Fix Bug Penimpaan Nama Grup (Group PushName Overwrite Fix)
 * - Auto-Increment Unread Count untuk Sinkronisasi UI Inbox Real-Time
 * - Modular Event Handlers (Pemisahan fungsi agar mudah di-maintain)
 * - Graceful Error Handling (Mencegah crash aplikasi secara keseluruhan)
 * - JSDoc & Strict Typing untuk dokumentasi internal.
 * ============================================================================
 */

import path from "path";
import fs from "fs";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto,
  ConnectionState
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { pool } from "./db";
import { handleBroadcastReply } from "./broadcast";
import { enqueueWebhook } from "./webhook";

// ============================================================================
// 1. GLOBAL STATE & INTERFACES
// ============================================================================

/**
 * State QR In-Memory untuk ditangkap oleh Endpoint UI /sessions/qr
 */
export type QrState = { 
  qr: string | null; 
  status: string; 
  at: number;
};
const qrStateMap = new Map<string, QrState>();

export function getSessionQRState(sessionKey: string): QrState | null {
  return qrStateMap.get(sessionKey) || null;
}

/**
 * Representasi instance socket untuk tiap sesi yang berjalan.
 */
export type SessionEntry = {
  sessionKey: string;
  sock: ReturnType<typeof makeWASocket> | null;
  status: "created" | "connecting" | "connected" | "disconnected" | "logged_out" | "error";
  ctx?: { tenantId: number; userId: number };
};

/**
 * Representasi Metadata pesan yang telah di-parse dari buffer mentah Baileys.
 */
export type ParsedContent = {
  type: "text" | "image" | "video" | "document" | "audio" | "location" | "sticker" | "unknown";
  text: string | null;
  mime?: string | null;
  fileName?: string | null;
};

// Logger Baileys (level warn untuk mencegah log tumpang tindih di terminal)
const logger = pino({ level: "warn" });
console.log("WA_PARSER_VERSION=5 (Enterprise Multi-Session & Inbox Sync) loaded");

// Map Penyimpanan Session Aktif
const sessions = new Map<string, SessionEntry>();

/**
 * Metadata tambahan untuk UI/UX Sesi
 */
export type SessionMeta = { 
  status?: string; 
  qr?: string | null; 
  phoneNumber?: string | null; 
  lastSeen?: number | null; 
};
const sessionMeta = new Map<string, SessionMeta>();

/**
 * Mendapatkan instance socket aktif berdasarkan session_key.
 */
export function getSessionSock(sessionKey: string) {
  const e = sessions.get(sessionKey);
  return e?.sock || null;
}

/**
 * Mendapatkan status metadata sesi.
 */
export function getSessionMeta(sessionKey: string) {
  const m = sessionMeta.get(sessionKey) || {};
  return {
    status: m.status || "unknown",
    qr: m.qr || null,
    phoneNumber: m.phoneNumber || null,
    lastSeen: m.lastSeen || null
  };
}

// ============================================================================
// 2. FILESYSTEM UTILITIES
// ============================================================================

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function storeDirFor(sessionKey: string) {
  const base = process.env.BAILEYS_STORE_DIR || "storage/baileys";
  return path.join(process.cwd(), base, sessionKey);
}

export async function deleteSessionFolder(sessionKey: string) {
  const dir = storeDirFor(sessionKey);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[${sessionKey}] Local storage directory deleted.`);
    }
  } catch (e) {
    console.error(`Failed to delete session folder for ${sessionKey}:`, e);
  }
}

// ============================================================================
// 3. MESSAGE PARSER ENGINE
// ============================================================================

/**
 * Membuka bungkus (unwrap) tipe pesan kompleks seperti ephemeral (pesan sementara), 
 * view once, atau edited message untuk mendapatkan isi aslinya.
 */
function unwrapMessage(msg: any): any {
  if (!msg) return null;
  if (msg.ephemeralMessage?.message) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.viewOnceMessage?.message) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2?.message) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.documentWithCaptionMessage?.message) return unwrapMessage(msg.documentWithCaptionMessage.message);
  if (msg.editedMessage?.message) return unwrapMessage(msg.editedMessage.message);
  return msg;
}

/**
 * Engine utama pengubah objek protobuf Baileys menjadi struktur JSON 
 * yang mudah dimengerti oleh sistem database SaaS.
 */
function parseContent(webMsg: proto.IWebMessageInfo): ParsedContent | null {
  const raw = unwrapMessage(webMsg.message as any);
  if (!raw) return null;

  // Abaikan pesan sistem/protokol
  if (raw.protocolMessage) return null;
  if (raw.reactionMessage) return null;

  // 1. Pesan Teks Standar
  if (raw.conversation) {
    return { type: "text", text: raw.conversation };
  }

  // 2. Pesan Teks Extended (Forwarded / Link / Formatting)
  if (raw.extendedTextMessage?.text) {
    return { type: "text", text: raw.extendedTextMessage.text };
  }

  // 3. Gambar
  if (raw.imageMessage) {
    return {
      type: "image",
      text: raw.imageMessage.caption ?? null,
      mime: raw.imageMessage.mimetype ?? null,
      fileName: null
    };
  }

  // 4. Video
  if (raw.videoMessage) {
    return {
      type: "video",
      text: raw.videoMessage.caption ?? null,
      mime: raw.videoMessage.mimetype ?? null,
      fileName: null
    };
  }

  // 5. Dokumen
  if (raw.documentMessage) {
    return {
      type: "document",
      text: raw.documentMessage.caption ?? null,
      mime: raw.documentMessage.mimetype ?? null,
      fileName: raw.documentMessage.fileName ?? null
    };
  }

  // 6. Audio / Voice Note
  if (raw.audioMessage) {
    return { 
      type: "audio", 
      text: null, 
      mime: raw.audioMessage.mimetype ?? null, 
      fileName: null 
    };
  }

  // 7. Lokasi
  if (raw.locationMessage || raw.liveLocationMessage) {
    return { type: "location", text: null };
  }

  // 8. Stiker
  if (raw.stickerMessage) {
    return { 
      type: "sticker", 
      text: null, 
      mime: raw.stickerMessage.mimetype ?? null 
    };
  }

  return null;
}

// ============================================================================
// 4. DATABASE TRANSACTIONS
// ============================================================================

/**
 * Menyimpan / Memperbarui Status Session ke Database.
 */
async function upsertSession(tenantId: number, userId: number, sessionKey: string, patch: Partial<{
  status: string;
  last_error: string | null;
  phone_number: string | null;
  wa_me_jid: string | null;
  label: string | null;
  last_seen_at: Date | null;
}>) {
  // Pastikan baris sesi sudah dibuat di tabel
  await pool.query(
    `INSERT INTO wa_sessions(tenant_id, user_id, session_key, status)
     VALUES(?, ?, ?, 'created')
     ON DUPLICATE KEY UPDATE session_key=session_key`,
    [tenantId, userId, sessionKey]
  );

  const fields: string[] = [];
  const values: any[] = [];

  const map: Record<string, any> = {
    status: patch.status,
    last_error: patch.last_error,
    phone_number: patch.phone_number,
    wa_me_jid: patch.wa_me_jid,
    label: patch.label,
    last_seen_at: patch.last_seen_at
  };

  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "undefined") continue;
    fields.push(`${k}=?`);
    values.push(v);
  }

  if (fields.length === 0) return;

  values.push(tenantId);
  values.push(sessionKey);
  
  await pool.query(
    `UPDATE wa_sessions SET ${fields.join(", ")} WHERE tenant_id=? AND session_key=?`,
    values
  );
}

/**
 * Membuat Obrolan (Thread) Baru / Mengupdate waktu obrolan terakhir.
 */
async function upsertChat(tenantId: number, sessionKey: string, remoteJid: string, chatType: "private" | "group" | "broadcast" = "private") {
  await pool.query(
    `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at)
     VALUES(?, ?, ?, ?, 0, NOW())
     ON DUPLICATE KEY UPDATE last_message_at=NOW()`,
    [tenantId, sessionKey, remoteJid, chatType]
  );

  const [rows] = await pool.query<any[]>(
    `SELECT id FROM wa_chats WHERE tenant_id=? AND session_key=? AND remote_jid=? LIMIT 1`,
    [tenantId, sessionKey, remoteJid]
  );

  return rows?.[0]?.id ?? null;
}

/**
 * Meyimpan Pesan Masuk / Keluar ke Database.
 * FIX PENTING: Menambahkan Hitungan Unread Count jika pesan masuk (direction = in).
 */
export async function insertMessage(tenantId: number, userId: number, params: {
  sessionKey: string;
  direction: "in" | "out";
  remoteJid: string;
  waMessageId: string | null;
  messageType: ParsedContent["type"];
  textBody: string | null;
  rawJson: any;
  status: "sent" | "failed";
  errorText?: string | null;
  chatId?: number | null;
  mediaMime?: string | null;
  mediaName?: string | null;
}) {
  // 1. Simpan Pesan ke Tabel wa_messages
  await pool.query(
    `INSERT INTO wa_messages(
      tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
      message_type, text_body, media_mime, media_name,
      status, error_text, raw_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      chat_id=COALESCE(VALUES(chat_id), chat_id),
      text_body=COALESCE(VALUES(text_body), text_body),
      media_mime=COALESCE(VALUES(media_mime), media_mime),
      media_name=COALESCE(VALUES(media_name), media_name),
      status=VALUES(status),
      error_text=VALUES(error_text),
      raw_json=COALESCE(VALUES(raw_json), raw_json)`,
    [
      tenantId,
      userId,
      params.sessionKey,
      params.chatId ?? null,
      params.direction,
      params.remoteJid,
      params.waMessageId,
      params.messageType,
      params.textBody,
      params.mediaMime ?? null,
      params.mediaName ?? null,
      params.status,
      params.errorText ?? null,
      JSON.stringify(params.rawJson)
    ]
  );

  // 2. LOGIKA UNREAD COUNT UI INBOX (BUG FIX)
  // Hanya tambahkan notifikasi unread jika pesan berasal dari klien (arah 'in')
  if (params.direction === 'in') {
     await pool.query(
       `UPDATE wa_chats SET unread_count = unread_count + 1 
        WHERE tenant_id = ? AND session_key = ? AND remote_jid = ?`,
       [tenantId, params.sessionKey, params.remoteJid]
     );
  }
}

// ============================================================================
// 5. CORE BUSINESS LOGIC MODULES (EVENT HANDLERS)
// ============================================================================

/**
 * Modul terpisah untuk menangani Auto Reply Rules.
 * Dibungkus dengan Try-Catch untuk memastikan pesan yang gagal dibalas
 * tidak merusak alur penerimaan pesan utama.
 */
async function processAutoReply(tenantId: number, sessionKey: string, remoteJid: string, text: string) {
  try {
    const [rules] = await pool.query<any[]>(
      `SELECT keyword, match_type, reply_text 
       FROM auto_reply_rules 
       WHERE tenant_id=? AND is_active=1 
       AND (session_key IS NULL OR session_key = '' OR TRIM(session_key) = ?)`,
      [tenantId, sessionKey.trim()]
    );

    if (!rules || rules.length === 0) return;

    const txtLower = text.toLowerCase().trim();
    let matchedReply = null;

    for (const rule of rules) {
      const kwLower = String(rule.keyword).toLowerCase().trim();
      if (rule.match_type === 'exact' && txtLower === kwLower) matchedReply = rule.reply_text;
      else if (rule.match_type === 'contains' && txtLower.includes(kwLower)) matchedReply = rule.reply_text;
      else if (rule.match_type === 'startswith' && txtLower.startsWith(kwLower)) matchedReply = rule.reply_text;

      if (matchedReply) {
        console.log(`[${sessionKey}] ✅ Auto-Reply Triggered by Keyword: "${rule.keyword}"`);
        break; 
      }
    }

    if (matchedReply) {
      // Delay organik untuk menghindari banned
      setTimeout(async () => {
        try { 
          await sendText(sessionKey, remoteJid, matchedReply!); 
        } catch (e) { 
          console.error(`[${sessionKey}] ❌ Failed to send auto reply to ${remoteJid}:`, e); 
        }
      }, 1500);
    }
  } catch (err) {
    console.error(`[${sessionKey}] ❌ Auto Reply Processing Error:`, err);
  }
}

/**
 * Modul terpisah untuk menandai target Follow Up jika pelanggan telah membalas.
 */
async function processFollowUpRepliedTrigger(tenantId: number, sessionKey: string, remoteJid: string) {
  try {
    const cleanNumber = remoteJid.split("@")[0];
    await pool.query(
      `UPDATE followup_targets SET status='replied' 
       WHERE tenant_id=? AND session_key=? AND to_number=? AND status IN ('queued', 'sent', 'delivered', 'read')`,
      [tenantId, sessionKey, cleanNumber]
    );
  } catch (err) {
    console.error(`[${sessionKey}] Failed to update Follow Up status:`, err);
  }
}

// ============================================================================
// 6. MAIN SOCKET INITIALIZATION
// ============================================================================

export async function startSession(sessionKey: string, ctx: { tenantId: number; userId: number }) {
  if (!ctx || !ctx.tenantId || !ctx.userId) throw new Error("startSession requires ctx {tenantId,userId}");
  
  if (sessions.has(sessionKey) && sessions.get(sessionKey)!.sock) {
    return { ok: true, message: "Session is already active." };
  }

  const dir = storeDirFor(sessionKey);
  ensureDir(dir);

  await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { status: "connecting", last_error: null });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  console.log(`[${sessionKey}] Booting Baileys v${version.join(".")} (Latest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ session: sessionKey }),
    markOnlineOnConnect: true,
    browser: ["WA SaaS Enterprise", "Chrome", "110.0.0"]
  });

  // Daftarkan sesi ke memori global
  sessions.set(sessionKey, { 
    ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, 
    sessionKey, 
    sock, 
    status: "connecting" 
  });

  // --------------------------------------------------------------------------
  // EVENT: CREDENTIALS UPDATE
  // --------------------------------------------------------------------------
  sock.ev.on("creds.update", saveCreds);

  // --------------------------------------------------------------------------
  // EVENT: CONNECTION UPDATE
  // --------------------------------------------------------------------------
  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // Handle QR Generation
    if (qr) {
      qrStateMap.set(sessionKey, { qr, status: "qr", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), qr, status: "qr", lastSeen: Date.now() });
      
      console.log(`\n=== SCAN THIS QR CODE FOR SESSION: ${sessionKey} ===\n`);
      qrcode.generate(qr, { small: true });
    }

    // Handle Open Connection
    if (connection === "open") {
      qrStateMap.set(sessionKey, { qr: null, status: "connected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), qr: null, status: "connected", lastSeen: Date.now() });
      
      const me = sock.user?.id ?? null;
      const phoneClean = me ? me.split(":")[0].split("@")[0] : null;
      const waName = sock.user?.name ?? null;

      sessions.set(sessionKey, { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, sessionKey, sock, status: "connected" });

      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, {
        status: "connected",
        wa_me_jid: me,
        phone_number: phoneClean,
        label: waName,
        last_seen_at: new Date(),
        last_error: null
      });

      console.log(`[${sessionKey}] ✅ Connected Successfully as ${phoneClean} (${waName})`);
      
      // Memicu webhook notifikasi status (Asinkronus aman)
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: "connected", phone: phoneClean }).catch(()=>{});
    }

    // Handle Disconnection / Retries
    if (connection === "close") {
      const prev = qrStateMap.get(sessionKey);
      qrStateMap.set(sessionKey, { qr: prev?.qr || null, status: "disconnected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), status: "disconnected", lastSeen: Date.now() });

      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const finalStatus = loggedOut ? "logged_out" : "disconnected";

      sessions.set(sessionKey, { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, sessionKey, sock: null, status: finalStatus });

      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, {
        status: finalStatus,
        last_error: finalStatus,
        last_seen_at: new Date()
      });

      console.warn(`[${sessionKey}] ⚠️ Connection Closed. Reason: ${finalStatus} (Code: ${code})`);
      
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: finalStatus, reason: code }).catch(()=>{});

      // Jangan reconnect jika di-logout manual dari device
      if (loggedOut) {
        console.log(`[${sessionKey}] Session was logged out. Halting auto-reconnect.`);
        return;
      }

      // Auto-reconnect Backoff
      console.log(`[${sessionKey}] Attempting auto-reconnect in 3 seconds...`);
      setTimeout(() => startSession(sessionKey, ctx).catch(console.error), 3000);
    }
  });

  // --------------------------------------------------------------------------
  // EVENT: MESSAGE STATUS (READ/DELIVERED/ACK)
  // --------------------------------------------------------------------------
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      const { key, update: msgUpdate } = update;
      if (!key.id || !key.remoteJid) continue;

      let statusStr: "sent" | "delivered" | "read" | "failed" | null = null;

      if (msgUpdate.status === proto.WebMessageInfo.Status.SERVER_ACK) statusStr = "sent";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.DELIVERY_ACK) statusStr = "delivered";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.READ || msgUpdate.status === proto.WebMessageInfo.Status.PLAYED) statusStr = "read";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.ERROR) statusStr = "failed";

      if (statusStr) {
        try {
          // 1. UPDATE MESSAGES STATUS (Untuk Sinkronasi Tanda Centang UI Inbox)
          await pool.query(
            `UPDATE wa_messages SET status=? WHERE wa_message_id=? AND tenant_id=?`,
            [statusStr, key.id, ctx.tenantId]
          );

          // 2. UPDATE TARGET FOLLOW UP (Tandai jika Read/Delivered agar tracking jalan)
          if (statusStr === "read" || statusStr === "delivered") {
            await pool.query(
              `UPDATE followup_targets SET status=? 
               WHERE wa_message_id=? AND tenant_id=? AND status NOT IN ('replied', 'failed', 'canceled')`,
              [statusStr, key.id, ctx.tenantId]
            );
          }

          // Trigger Webhook Notifikasi Baca
          enqueueWebhook(ctx.tenantId, "message.status", {
            sessionKey,
            messageId: key.id,
            to: key.remoteJid,
            status: statusStr
          }).catch(() => {});
          
        } catch (dbErr) {
          console.error(`[${sessionKey}] Error updating message status:`, dbErr);
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // EVENT: INCOMING MESSAGES (MESSAGES.UPSERT)
  // --------------------------------------------------------------------------
  sock.ev.on("messages.upsert", async (m) => {
    // Kita hanya memproses pesan notify (pesan rill), abaikan pesan append/sync
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      try {
        // Abaikan pesan yang kita kirim sendiri dari perangkat
        if (msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid || "unknown";
        const waMessageId = msg.key.id || null;

        // Filter Spam & Sistem: Abaikan update status WhatsApp, Broadcast List, dll
        if (
          remoteJid === "status@broadcast" || 
          remoteJid.includes("@broadcast") || 
          remoteJid.includes("@newsletter")
        ) {
          continue;
        }

        const parsed = parseContent(msg);
        if (!parsed) continue; // Pesan protokol tidak dikenali

        const isGroup = remoteJid.endsWith("@g.us");
        
        // 1. Catat Obrolan (Untuk Tampil di Sidebar Inbox)
        const chatId = await upsertChat(
          ctx.tenantId, 
          sessionKey, 
          remoteJid, 
          isGroup ? "group" : "private"
        );

        // 2. FIX PENTING BUG GRUP: JANGAN TIMPA NAMA GRUP DENGAN PUSHNAME ANGGOTA
        let contactName = msg.pushName || null;
        if (isGroup) {
          // Jika pesan berasal dari grup, kita MENGABAIKAN pushName pengirimnya.
          // Dengan memberi nilai NULL, fungsi COALESCE di SQL tidak akan menimpa 
          // nama grup yang sudah tersimpan sebelumnya.
          contactName = null;
        }

        // Simpan / Perbarui Nama Kontak
        await pool.query(
          `INSERT INTO wa_contacts (tenant_id, session_key, jid, display_name, last_message_at, created_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE 
           display_name = COALESCE(?, display_name),
           last_message_at = NOW()`,
          [ctx.tenantId, sessionKey, remoteJid, contactName, contactName]
        );

        // 3. Masukkan Detail Pesan ke DB (dan Otomatis Update Unread Count)
        await insertMessage(ctx.tenantId, ctx.userId, {
          sessionKey,
          direction: "in",
          remoteJid,
          waMessageId: msg.key.id,
          messageType: parsed.type,
          textBody: parsed.text,
          mediaMime: parsed.mime ?? null,
          mediaName: parsed.fileName ?? null,
          rawJson: msg,
          status: "sent", // Pesan diterima, status "sent" ke UI untuk ditandai masuk
          chatId
        });

        // Logging Inbox Activity
        const logPreview = parsed.text 
          ? (parsed.text.length > 30 ? parsed.text.substring(0, 30) + "..." : parsed.text)
          : "[Media]";
        console.log(`[${sessionKey}] 📨 INCOMING ${parsed.type.toUpperCase()} from ${remoteJid}: ${logPreview}`);

        // 4. Modul Eksekusi Paralel (Follow Up, Auto Reply, Webhook, Broadcast Reply)
        
        // A. Update Sistem Follow Up
        await processFollowUpRepliedTrigger(ctx.tenantId, sessionKey, remoteJid);

        // B. Cek Auto Reply (Hanya untuk pesan teks dan obrolan pribadi)
        if (parsed.text && !isGroup) {
          await processAutoReply(ctx.tenantId, sessionKey, remoteJid, parsed.text);
        }

        // C. Trigger Webhook Masuk
        try {
          enqueueWebhook(ctx.tenantId, "message.incoming", {
            direction: "in",
            sessionKey,
            from: remoteJid,
            messageId: waMessageId,
            messageType: parsed.type,
            text: parsed.text ?? null
          }).catch(() => {});
        } catch (hookErr) {
          console.error(`[${sessionKey}] Webhook trigger error:`, hookErr);
        }

        // D. Tangani Balasan Broadcast (Tracking konversi broadcast)
        const raw = unwrapMessage(msg.message);
        const quotedId = 
          raw?.extendedTextMessage?.contextInfo?.stanzaId || 
          raw?.imageMessage?.contextInfo?.stanzaId || 
          raw?.videoMessage?.contextInfo?.stanzaId || 
          raw?.documentMessage?.contextInfo?.stanzaId || null;
        
        if (quotedId) {
          await handleBroadcastReply(ctx.tenantId, remoteJid, parsed.text || "", quotedId);
        }

        // 5. Update Last Seen Sesi
        await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { last_seen_at: new Date() });

      } catch (errLoop) {
        // Mencegah satu pesan error merusak seluruh batch loop pesan
        console.error(`[${sessionKey}] ❌ CRITICAL ERROR IN MESSAGE PROCESSING LOOP:`, errLoop);
      }
    }
  });

  return { ok: true, message: "Engine started successfully" };
}

// ============================================================================
// 7. SESSION MANAGEMENT ACTIONS
// ============================================================================

export function isConnected(sessionKey: string) {
  return sessions.get(sessionKey)?.status === "connected";
}

/**
 * Menghentikan dan memutuskan sesi Baileys.
 */
export async function stopSession(sessionKey: string) {
  try { 
    const sock = getSessionSock(sessionKey);
    if (sock) {
      sock.ws.close(); 
    }
  } catch (e) {
    console.warn(`[${sessionKey}] Error closing websocket:`, e);
  }
  
  // Hapus dari memori lokal
  try { sessions.delete(sessionKey); } catch {}
  try { sessionMeta.delete(sessionKey); } catch {}
  
  console.log(`[${sessionKey}] Session stopped and flushed from memory.`);
}

// ============================================================================
// 8. OUTBOUND MESSAGE ACTIONS (SENDING)
// ============================================================================

/**
 * Mengirim pesan Teks sederhana keluar (Outbound).
 */
export async function sendText(sessionKey: string, to: string, text: string) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock || null;
  
  // Validasi Koneksi
  if (!sock) return { ok: false, error: "Session socket is not running" };
  if (!isConnected(sessionKey)) return { ok: false, error: "Session is disconnected" };

  const tenantId = Number(entry?.ctx?.tenantId || 0);
  const userId = Number(entry?.ctx?.userId || 0);
  
  if (!tenantId || !userId) {
    return { ok: false, error: "Session context missing (tenant/user data corrupted)" };
  }
  
  // FIX KRUSIAL: Pengecekan Preservasi Format JID
  // Jika string target sudah memiliki '@' (seperti @g.us untuk grup atau @lid), biarkan apa adanya.
  const toJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  
  const chatId = await upsertChat(tenantId, sessionKey, toJid, "private");

  try {
    const res = await sock.sendMessage(toJid, { text });

    await insertMessage(tenantId, userId, {
      sessionKey,
      direction: "out",
      remoteJid: toJid,
      waMessageId: res?.key?.id || null,
      messageType: "text",
      textBody: text,
      rawJson: { text },
      status: "sent",
      chatId
    });

    await upsertSession(tenantId, userId, sessionKey, { last_seen_at: new Date() });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    console.error(`[${sessionKey}] ❌ Failed to send text to ${toJid}:`, e);
    
    await insertMessage(tenantId, userId, {
      sessionKey,
      direction: "out",
      remoteJid: toJid,
      waMessageId: null,
      messageType: "text",
      textBody: text,
      rawJson: { text, error: e?.message || String(e) },
      status: "failed",
      errorText: e?.message || "send failed",
      chatId
    });

    return { ok: false, error: e?.message || "Send operation failed" };
  }
}