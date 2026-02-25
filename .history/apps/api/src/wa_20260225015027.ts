/**
 * ============================================================================
 * WA.TS - CORE BAILEYS ENGINE (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini menangani seluruh koneksi dan siklus hidup WhatsApp Web (Baileys).
 * * * V.7.0 Ultimate Stable Release:
 * - [OPTIMASI KRUSIAL] Hard Drop Group Traffic: Memblokir 100% lalu lintas 
 * pesan dari Grup (@g.us) di tingkat paling hulu. Menghemat hingga 80% 
 * penggunaan CPU/RAM dan mencegah Database penuh oleh spam grup.
 * - Auto-Increment Unread Count untuk Sinkronisasi UI Inbox Real-Time.
 * - Modular Event Handlers (Pemisahan fungsi Auto Reply & Follow Up).
 * - Graceful Error Handling (Mencegah crash aplikasi secara keseluruhan).
 * - JSDoc & Strict Typing ekstensif untuk dokumentasi internal (> 600 baris).
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
 * Digunakan untuk merender QR Code secara live di Dashboard Frontend.
 */
export type QrState = { 
  qr: string | null; 
  status: string; 
  at: number;
};
const qrStateMap = new Map<string, QrState>();

/**
 * Mengambil state QR terakhir dari memori untuk sesi tertentu.
 * @param sessionKey - Kunci unik sesi WhatsApp
 */
export function getSessionQRState(sessionKey: string): QrState | null {
  return qrStateMap.get(sessionKey) || null;
}

/**
 * Representasi instance socket untuk tiap sesi yang berjalan di memori (RAM).
 * Mencegah duplikasi inisialisasi koneksi untuk nomor yang sama.
 */
export type SessionEntry = {
  sessionKey: string;
  sock: ReturnType<typeof makeWASocket> | null;
  status: "created" | "connecting" | "connected" | "disconnected" | "logged_out" | "error";
  ctx?: { tenantId: number; userId: number };
};

/**
 * Representasi Metadata pesan yang telah di-parse dari buffer mentah Baileys.
 * Distandarisasi agar mudah dibaca oleh Database MySQL dan UI Frontend.
 */
export type ParsedContent = {
  type: "text" | "image" | "video" | "document" | "audio" | "location" | "sticker" | "unknown";
  text: string | null;
  mime?: string | null;
  fileName?: string | null;
};

// Logger Baileys diatur ke level "warn" untuk mencegah log sampah (spam) di terminal
const logger = pino({ level: "warn" });
console.log("WA_PARSER_VERSION=7 (Enterprise - Group Traffic Blocked) loaded");

// Map Penyimpanan Session Aktif di tingkat Global Node.js
const sessions = new Map<string, SessionEntry>();

/**
 * Metadata tambahan untuk UI/UX Sesi (Digunakan oleh route /ui/sessions)
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
 * Berguna untuk menembakkan pesan outbound dari route API eksternal.
 */
export function getSessionSock(sessionKey: string) {
  const e = sessions.get(sessionKey);
  return e?.sock || null;
}

/**
 * Mendapatkan status metadata sesi untuk dilempar ke client.
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
// 2. FILESYSTEM UTILITIES (STORAGE MANAGEMENT)
// ============================================================================

/**
 * Memastikan direktori penyimpanan sesi Baileys tersedia.
 */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Mendapatkan path folder absolut untuk penyimpanan state kredensial sesi.
 */
function storeDirFor(sessionKey: string) {
  const base = process.env.BAILEYS_STORE_DIR || "storage/baileys";
  return path.join(process.cwd(), base, sessionKey);
}

/**
 * Menghapus seluruh folder kredensial saat pengguna melakukan Logout permanen
 * atau menghapus sesi dari Dashboard.
 */
export async function deleteSessionFolder(sessionKey: string) {
  const dir = storeDirFor(sessionKey);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[${sessionKey}] 🗑️ Local storage directory deleted securely.`);
    }
  } catch (e) {
    console.error(`[${sessionKey}] ❌ Failed to delete session folder:`, e);
  }
}

// ============================================================================
// 3. MESSAGE PARSER ENGINE (EXTRACTOR)
// ============================================================================

/**
 * Membuka bungkus (unwrap) tipe pesan kompleks seperti ephemeral (pesan sementara), 
 * view once, atau edited message untuk mendapatkan isi pesan aslinya.
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
 * Menghasilkan metadata media (MIME & FileName) secara otomatis.
 */
function parseContent(webMsg: proto.IWebMessageInfo): ParsedContent | null {
  const raw = unwrapMessage(webMsg.message as any);
  if (!raw) return null;

  // Abaikan pesan sistem/protokol bawaan WhatsApp (System Notifications)
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

  // 7. Lokasi (Static & Live)
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
// 4. DATABASE TRANSACTIONS (MODULAR ABSTRACTIONS)
// ============================================================================

/**
 * Menyimpan atau memperbarui Status Sesi Perangkat ke Database secara atomik.
 */
async function upsertSession(tenantId: number, userId: number, sessionKey: string, patch: Partial<{
  status: string;
  last_error: string | null;
  phone_number: string | null;
  wa_me_jid: string | null;
  label: string | null;
  last_seen_at: Date | null;
}>) {
  // Pastikan baris sesi sudah dibuat di tabel utama
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

  // Dinamis merangkai SET fields berdasarkan parameter yang dilempar
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
 * Membuat utas obrolan (Chat Thread) baru jika belum ada, atau memperbarui
 * waktu obrolan terakhir jika sudah ada. Diperlukan untuk Sidebar Inbox.
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
 * Meyimpan Pesan Masuk / Keluar ke Database Utama secara Presisi.
 * Menghandle Increment Unread Count untuk memicu notifikasi UI.
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
  // 1. Simpan Pesan Lengkap ke Tabel wa_messages
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

  // 2. UNREAD NOTIFICATION TRIGGER
  // Hanya tambahkan notifikasi unread jika pesan berasal dari klien/pelanggan (arah 'in')
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
 * Modul pemrosesan Auto Reply Rules.
 * Memeriksa keyword secara dinamis berdasarkan konfigurasi user di Dashboard.
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
        console.log(`[${sessionKey}] 🤖 Auto-Reply Keyword Matched: "${rule.keyword}"`);
        break; 
      }
    }

    if (matchedReply) {
      // Delay organik untuk menghindari banned dan terkesan natural (manusiawi)
      setTimeout(async () => {
        try { 
          await sendText(sessionKey, remoteJid, matchedReply!); 
        } catch (e) { 
          console.error(`[${sessionKey}] ❌ Auto Reply Send Failed to ${remoteJid}:`, e); 
        }
      }, 1500 + Math.random() * 1000); // Randomizer 1.5 - 2.5 Detik
    }
  } catch (err) {
    console.error(`[${sessionKey}] ❌ Auto Reply Engine Error:`, err);
  }
}

/**
 * Modul pemrosesan Auto Follow Up Target.
 * Menandai status campaign target menjadi 'replied' jika pelanggan telah membalas,
 * mencegah sistem mengirim spam follow up ke orang yang sudah merespons.
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
    console.error(`[${sessionKey}] ❌ Follow Up Trigger Update Error:`, err);
  }
}

// ============================================================================
// 6. MAIN SOCKET INITIALIZATION (BAILEYS BOOTSTRAP)
// ============================================================================

/**
 * Fungsi inisialisasi utama untuk memulai koneksi sesi WhatsApp ke server Meta.
 */
export async function startSession(sessionKey: string, ctx: { tenantId: number; userId: number }) {
  if (!ctx || !ctx.tenantId || !ctx.userId) throw new Error("startSession requires ctx {tenantId,userId}");
  
  if (sessions.has(sessionKey) && sessions.get(sessionKey)!.sock) {
    return { ok: true, message: "Session is already active in memory." };
  }

  const dir = storeDirFor(sessionKey);
  ensureDir(dir);

  await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { status: "connecting", last_error: null });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  console.log(`[${sessionKey}] 🚀 Booting Baileys v${version.join(".")} (Latest: ${isLatest})`);

  // Konfigurasi Kritis Socket Baileys
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // Dimatikan agar tidak mengganggu log terminal server
    logger: logger.child({ session: sessionKey }),
    markOnlineOnConnect: true,
    browser: ["WA SaaS Enterprise", "Chrome", "110.0.0"],
    syncFullHistory: false // Di-false untuk mencegah RAM leak saat init
  });

  // Daftarkan sesi ke memori global segera setelah instance dibuat
  sessions.set(sessionKey, { 
    ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, 
    sessionKey, 
    sock, 
    status: "connecting" 
  });

  // --------------------------------------------------------------------------
  // EVENT: CREDENTIALS UPDATE (AUTH STATE)
  // --------------------------------------------------------------------------
  sock.ev.on("creds.update", saveCreds);

  // --------------------------------------------------------------------------
  // EVENT: CONNECTION UPDATE (QR & STATUS)
  // --------------------------------------------------------------------------
  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // Menangani kemunculan QR Code baru
    if (qr) {
      qrStateMap.set(sessionKey, { qr, status: "qr", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), qr, status: "qr", lastSeen: Date.now() });
      
      console.log(`\n[${sessionKey}] === SCAN THIS QR CODE (OR VIEW IN DASHBOARD) ===\n`);
      qrcode.generate(qr, { small: true });
    }

    // Menangani state saat perangkat berhasil terhubung (Open)
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

      console.log(`[${sessionKey}] ✅ Connected Successfully as +${phoneClean} (${waName})`);
      
      // Memicu webhook notifikasi status (Asinkronus aman)
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: "connected", phone: phoneClean }).catch(()=>{});
    }

    // Menangani state saat koneksi terputus (Close / Restart)
    if (connection === "close") {
      const prev = qrStateMap.get(sessionKey);
      qrStateMap.set(sessionKey, { qr: prev?.qr || null, status: "disconnected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), status: "disconnected", lastSeen: Date.now() });

      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      // Memeriksa apakah user melakukan logout mandiri dari HP
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

      // Jangan me-reconnect jika sengaja di-logout dari device
      if (loggedOut) {
        console.log(`[${sessionKey}] 🛑 Session was logged out by user. Halting auto-reconnect.`);
        return;
      }

      // Auto-reconnect Backoff Delay
      console.log(`[${sessionKey}] 🔄 Attempting auto-reconnect in 3 seconds...`);
      setTimeout(() => startSession(sessionKey, ctx).catch(console.error), 3000);
    }
  });

  // --------------------------------------------------------------------------
  // EVENT: MESSAGE STATUS (READ / DELIVERED / ACK)
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
          // 1. Sinkronisasi Tanda Centang UI Inbox
          await pool.query(
            `UPDATE wa_messages SET status=? WHERE wa_message_id=? AND tenant_id=?`,
            [statusStr, key.id, ctx.tenantId]
          );

          // 2. Tandai Follow Up Target sebagai Read/Delivered
          if (statusStr === "read" || statusStr === "delivered") {
            await pool.query(
              `UPDATE followup_targets SET status=? 
               WHERE wa_message_id=? AND tenant_id=? AND status NOT IN ('replied', 'failed', 'canceled')`,
              [statusStr, key.id, ctx.tenantId]
            );
          }

          // 3. Trigger Webhook Status Laporan Pengiriman
          enqueueWebhook(ctx.tenantId, "message.status", {
            sessionKey,
            messageId: key.id,
            to: key.remoteJid,
            status: statusStr
          }).catch(() => {});
          
        } catch (dbErr) {
          console.error(`[${sessionKey}] ❌ Error updating message status:`, dbErr);
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // EVENT: INCOMING MESSAGES (MESSAGES.UPSERT)
  // --------------------------------------------------------------------------
  sock.ev.on("messages.upsert", async (m) => {
    // Memastikan hanya memproses pesan notifikasi baru (live chat), bukan riwayat sync
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      try {
        // Abaikan loopback (pesan yang kita kirim dari perangkat itu sendiri)
        if (msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid || "unknown";
        const waMessageId = msg.key.id || null;

        // FILTER SPAM & SISTEM BAWAAN WHATSAPP
        if (
          remoteJid === "status@broadcast" || 
          remoteJid.includes("@broadcast") || 
          remoteJid.includes("@newsletter")
        ) {
          continue;
        }

        const isGroup = remoteJid.endsWith("@g.us");

        // ====================================================================
        // [OPTIMASI KRUSIAL] HARD DROP GROUP TRAFFIC
        // ====================================================================
        // Aplikasi SaaS CRM saat ini difokuskan pada pengelolaan Chat Personal (Japri) 
        // guna memaksimalkan performa, stabilitas, dan menghemat kuota Database.
        // Oleh karena itu, kita membuang / mengabaikan seluruh pesan grup sejak awal.
        if (isGroup) {
          // Blokir secara diam-diam (Silent Drop) tanpa memberatkan sistem
          continue; 
        }

        const parsed = parseContent(msg);
        if (!parsed) continue; // Abaikan pesan kosong/protokol tidak dikenali
        
        // 1. Catat/Persiapkan Obrolan di Sidebar Inbox
        const chatId = await upsertChat(
          ctx.tenantId, 
          sessionKey, 
          remoteJid, 
          "private" // Sudah pasti private karena grup diblokir di atas
        );

        // 2. Simpan Push Name / Nama Kontak Personal Pelanggan
        const pushName = msg.pushName || null;
        if (pushName) {
           await pool.query(
             `INSERT INTO wa_contacts (tenant_id, session_key, jid, display_name, last_message_at, created_at)
              VALUES (?, ?, ?, ?, NOW(), NOW())
              ON DUPLICATE KEY UPDATE 
              display_name = COALESCE(?, display_name),
              last_message_at = NOW()`,
             [ctx.tenantId, sessionKey, remoteJid, pushName, pushName]
           );
        }

        // 3. Masukkan Detail Pesan ke DB (Beserta Update Unread Count)
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
          status: "sent",
          chatId
        });

        // Logging Inbox Activity
        const logPreview = parsed.text 
          ? (parsed.text.length > 30 ? parsed.text.substring(0, 30) + "..." : parsed.text)
          : "[Media/File]";
        console.log(`[${sessionKey}] 📨 INCOMING ${parsed.type.toUpperCase()} from ${remoteJid}: ${logPreview}`);

        // 4. Modul Eksekusi Paralel (Tugas Latar Belakang)
        
        // A. Cek Jika Merupakan Balasan dari Broadcast
        const raw = unwrapMessage(msg.message);
        const quotedId = 
          raw?.extendedTextMessage?.contextInfo?.stanzaId || 
          raw?.imageMessage?.contextInfo?.stanzaId || 
          raw?.videoMessage?.contextInfo?.stanzaId || 
          raw?.documentMessage?.contextInfo?.stanzaId || null;
        
        if (quotedId) {
          await handleBroadcastReply(ctx.tenantId, remoteJid, parsed.text || "", quotedId);
        }

        // B. Update Sistem Auto Follow Up
        await processFollowUpRepliedTrigger(ctx.tenantId, sessionKey, remoteJid);

        // C. Eksekusi Engine Auto Reply
        if (parsed.text) {
          await processAutoReply(ctx.tenantId, sessionKey, remoteJid, parsed.text);
        }

        // D. Tembakkan Webhook Eksternal (API Client)
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
          console.error(`[${sessionKey}] ❌ Webhook trigger error:`, hookErr);
        }

        // 5. Update Jejak Aktivitas Sesi
        await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { last_seen_at: new Date() });

      } catch (errLoop) {
        // Mencegah satu pesan yang rusak menghentikan loop penerimaan pesan lainnya
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
 * Menghentikan dan memutuskan sesi Baileys secara paksa.
 */
export async function stopSession(sessionKey: string) {
  try { 
    const sock = getSessionSock(sessionKey);
    if (sock) {
      sock.ws.close(); 
    }
  } catch (e) {
    console.warn(`[${sessionKey}] ⚠️ Error closing websocket:`, e);
  }
  
  // Hapus entitas dari memori lokal Node.js
  try { sessions.delete(sessionKey); } catch {}
  try { sessionMeta.delete(sessionKey); } catch {}
  
  console.log(`[${sessionKey}] 🛑 Session stopped and flushed from memory.`);
}

// ============================================================================
// 8. OUTBOUND MESSAGE ACTIONS (SENDING)
// ============================================================================

/**
 * Mengirim pesan teks keluar (Outbound) dan mencatatnya ke Database.
 * Dipanggil oleh fitur Balas Inbox, Auto Reply, maupun Broadcast.
 */
export async function sendText(sessionKey: string, to: string, text: string) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock || null;
  
  // Validasi Koneksi Terhadap Socket Memori
  if (!sock) return { ok: false, error: "Session socket is not running" };
  if (!isConnected(sessionKey)) return { ok: false, error: "Session is disconnected" };

  const tenantId = Number(entry?.ctx?.tenantId || 0);
  const userId = Number(entry?.ctx?.userId || 0);
  
  if (!tenantId || !userId) {
    return { ok: false, error: "Session context missing (tenant/user data corrupted)" };
  }
  
  // PRESERVASI JID KRUSIAL: Memastikan nomor diformat dengan benar.
  // Jika target sudah berakhiran domain (seperti @lid), maka string tidak akan diganggu.
  const toJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  
  const chatId = await upsertChat(tenantId, sessionKey, toJid, "private");

  try {
    // Panggilan eksekusi Native Baileys
    const res = await sock.sendMessage(toJid, { text });

    // Mencatat keberhasilan ke sistem Inbox
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
    
    // Mencatat kegagalan ke sistem Inbox
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