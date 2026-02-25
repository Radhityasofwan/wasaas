/**
 * ============================================================================
 * WA.TS - CORE BAILEYS ENGINE (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini menangani seluruh koneksi dan siklus hidup WhatsApp Web (Baileys).
 * * * V.8.2 Ultimate CRM Edition:
 * - [FIX] Sinyal Composing (Sedang Mengetik) anti-crash pada target @lid.
 * - [NEW] Engine Parser terintegrasi penuh ke Auto Reply (Support {{nama}}, dll).
 * - Traffic Attribution Engine (Melacak sumber Meta Ads, Web, dll).
 * - Auto-Inject ke crm_leads (Warm Leads).
 * - Hard Drop Group Traffic untuk menghemat 80% RAM/CPU.
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

export type QrState = { 
  qr: string | null; 
  status: string; 
  at: number;
};
const qrStateMap = new Map<string, QrState>();

export function getSessionQRState(sessionKey: string): QrState | null {
  return qrStateMap.get(sessionKey) || null;
}

export type SessionEntry = {
  sessionKey: string;
  sock: ReturnType<typeof makeWASocket> | null;
  status: "created" | "connecting" | "connected" | "disconnected" | "logged_out" | "error";
  ctx?: { tenantId: number; userId: number };
};

export type ParsedContent = {
  type: "text" | "image" | "video" | "document" | "audio" | "location" | "sticker" | "unknown";
  text: string | null;
  mime?: string | null;
  fileName?: string | null;
};

const logger = pino({ level: "warn" });
console.log("WA_PARSER_VERSION=8.2 (Enterprise CRM Edition + Stable Typing) loaded");

const sessions = new Map<string, SessionEntry>();

export type SessionMeta = { 
  status?: string; 
  qr?: string | null; 
  phoneNumber?: string | null; 
  lastSeen?: number | null; 
};
const sessionMeta = new Map<string, SessionMeta>();

export function getSessionSock(sessionKey: string) {
  const e = sessions.get(sessionKey);
  return e?.sock || null;
}

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
// 2. FILESYSTEM & PARSER ENGINE UTILITIES
// ============================================================================

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
      console.log(`[${sessionKey}] 🗑️ Local storage directory deleted securely.`);
    }
  } catch (e) {
    console.error(`[${sessionKey}] ❌ Failed to delete session folder:`, e);
  }
}

function getDynamicGreeting(): string {
  const d = new Date();
  d.setHours(d.getUTCHours() + 7); 
  const h = d.getHours();
  
  if (h >= 3 && h < 11) return "Pagi";
  if (h >= 11 && h < 15) return "Siang";
  if (h >= 15 && h < 18) return "Sore";
  return "Malam";
}

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

// ============================================================================
// 3. MESSAGE PARSER EXTRACTOR
// ============================================================================

function unwrapMessage(msg: any): any {
  if (!msg) return null;
  if (msg.ephemeralMessage?.message) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.viewOnceMessage?.message) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2?.message) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.documentWithCaptionMessage?.message) return unwrapMessage(msg.documentWithCaptionMessage.message);
  if (msg.editedMessage?.message) return unwrapMessage(msg.editedMessage.message);
  return msg;
}

function parseContent(webMsg: proto.IWebMessageInfo): ParsedContent | null {
  const raw = unwrapMessage(webMsg.message as any);
  if (!raw) return null;

  if (raw.protocolMessage) return null;
  if (raw.reactionMessage) return null;

  if (raw.conversation) return { type: "text", text: raw.conversation };
  if (raw.extendedTextMessage?.text) return { type: "text", text: raw.extendedTextMessage.text };
  
  if (raw.imageMessage) return { type: "image", text: raw.imageMessage.caption ?? null, mime: raw.imageMessage.mimetype ?? null, fileName: null };
  if (raw.videoMessage) return { type: "video", text: raw.videoMessage.caption ?? null, mime: raw.videoMessage.mimetype ?? null, fileName: null };
  if (raw.documentMessage) return { type: "document", text: raw.documentMessage.caption ?? null, mime: raw.documentMessage.mimetype ?? null, fileName: raw.documentMessage.fileName ?? null };
  if (raw.audioMessage) return { type: "audio", text: null, mime: raw.audioMessage.mimetype ?? null, fileName: null };
  if (raw.locationMessage || raw.liveLocationMessage) return { type: "location", text: null };
  if (raw.stickerMessage) return { type: "sticker", text: null, mime: raw.stickerMessage.mimetype ?? null };

  return null;
}

// ============================================================================
// 4. DATABASE TRANSACTIONS
// ============================================================================

async function upsertSession(tenantId: number, userId: number, sessionKey: string, patch: Partial<{
  status: string;
  last_error: string | null;
  phone_number: string | null;
  wa_me_jid: string | null;
  label: string | null;
  last_seen_at: Date | null;
}>) {
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
  
  await pool.query(`UPDATE wa_sessions SET ${fields.join(", ")} WHERE tenant_id=? AND session_key=?`, values);
}

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
      tenantId, userId, params.sessionKey, params.chatId ?? null,
      params.direction, params.remoteJid, params.waMessageId, params.messageType,
      params.textBody, params.mediaMime ?? null, params.mediaName ?? null,
      params.status, params.errorText ?? null, JSON.stringify(params.rawJson)
    ]
  );

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
 * Modul pemrosesan Auto Reply Rules dengan Typing Indicator anti-crash.
 */
async function processAutoReply(tenantId: number, sessionKey: string, remoteJid: string, text: string) {
  try {
    let rules: any[] = [];
    
    try {
      [rules] = await pool.query<any[]>(
        `SELECT keyword, match_type, reply_text, delay_ms 
         FROM auto_reply_rules 
         WHERE tenant_id=? AND is_active=1 
         AND (session_key IS NULL OR session_key = '' OR TRIM(session_key) = ?)`,
        [tenantId, sessionKey.trim()]
      );
    } catch (e: any) {
      // Fallback aman
      [rules] = await pool.query<any[]>(
        `SELECT keyword, match_type, reply_text, 2000 as delay_ms 
         FROM auto_reply_rules 
         WHERE tenant_id=? AND is_active=1 
         AND (session_key IS NULL OR session_key = '' OR TRIM(session_key) = ?)`,
        [tenantId, sessionKey.trim()]
      );
    }

    if (!rules || rules.length === 0) return;

    const txtLower = text.toLowerCase().trim();
    let matchedRule = null;

    for (const rule of rules) {
      const kwLower = String(rule.keyword).toLowerCase().trim();
      if (rule.match_type === 'exact' && txtLower === kwLower) matchedRule = rule;
      else if (rule.match_type === 'contains' && txtLower.includes(kwLower)) matchedRule = rule;
      else if (rule.match_type === 'startswith' && txtLower.startsWith(kwLower)) matchedRule = rule;

      if (matchedRule) {
        console.log(`[${sessionKey}] 🤖 Auto-Reply Matched: "${rule.keyword}"`);
        break; 
      }
    }

    if (matchedRule) {
      const delay = matchedRule.delay_ms || 2000;
      const sock = getSessionSock(sessionKey);
      
      // Sinyal Mengetik (Dibungkus try catch agar tidak crash pada @lid atau unmapped JID)
      if (sock) {
         try {
           await sock.sendPresenceUpdate('composing', remoteJid);
         } catch (err) {
           console.warn(`[${sessionKey}] Sinyal composing diabaikan untuk target ${remoteJid}`);
         }
      }
      
      setTimeout(async () => {
        try { 
          if (sock) {
             try { await sock.sendPresenceUpdate('paused', remoteJid); } catch(e){}
          }
          
          // Mengambil nama kontak untuk Variables Engine
          let contactName = null;
          try {
            const cleanNumber = remoteJid.split("@")[0];
            const [leadRows] = await pool.query<any[]>(
              `SELECT name FROM crm_leads WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
              [tenantId, cleanNumber]
            );
            if (leadRows.length > 0 && leadRows[0].name) {
              contactName = leadRows[0].name;
            } else {
              const toJid = remoteJid.includes('@') ? remoteJid : remoteJid + '@s.whatsapp.net';
              const [contacts] = await pool.query<any[]>(
                `SELECT display_name FROM wa_contacts WHERE tenant_id = ? AND session_key = ? AND jid = ? LIMIT 1`,
                [tenantId, sessionKey, toJid]
              );
              if (contacts.length > 0 && contacts[0].display_name) {
                contactName = contacts[0].display_name;
              }
            }
          } catch (e) { /* ignore */ }

          // Mengeksekusi parser agar auto reply mendukung spintax & {{nama}}
          const parsedReply = parseMessageMagic(matchedRule.reply_text, remoteJid.split("@")[0], contactName);
          
          await sendText(sessionKey, remoteJid, parsedReply); 
        } catch (e) { 
          console.error(`[${sessionKey}] ❌ Auto Reply Send Failed to ${remoteJid}:`, e); 
        }
      }, delay); 
    }
  } catch (err) {
    console.error(`[${sessionKey}] ❌ Auto Reply Engine Error:`, err);
  }
}

/**
 * Modul pemrosesan Auto Follow Up Target.
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

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, 
    logger: logger.child({ session: sessionKey }),
    markOnlineOnConnect: true,
    browser: ["WA SaaS Enterprise", "Chrome", "110.0.0"],
    syncFullHistory: false 
  });

  sessions.set(sessionKey, { 
    ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, 
    sessionKey, 
    sock, 
    status: "connecting" 
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrStateMap.set(sessionKey, { qr, status: "qr", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), qr, status: "qr", lastSeen: Date.now() });
      console.log(`\n[${sessionKey}] === SCAN THIS QR CODE (OR VIEW IN DASHBOARD) ===\n`);
      qrcode.generate(qr, { small: true });
    }

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
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: "connected", phone: phoneClean }).catch(()=>{});
    }

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

      if (loggedOut) {
        console.log(`[${sessionKey}] 🛑 Session was logged out by user. Halting auto-reconnect.`);
        return;
      }

      console.log(`[${sessionKey}] 🔄 Attempting auto-reconnect in 3 seconds...`);
      setTimeout(() => startSession(sessionKey, ctx).catch(console.error), 3000);
    }
  });

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
          await pool.query(
            `UPDATE wa_messages SET status=? WHERE wa_message_id=? AND tenant_id=?`,
            [statusStr, key.id, ctx.tenantId]
          );

          if (statusStr === "read" || statusStr === "delivered") {
            await pool.query(
              `UPDATE followup_targets SET status=? 
               WHERE wa_message_id=? AND tenant_id=? AND status NOT IN ('replied', 'failed', 'canceled')`,
              [statusStr, key.id, ctx.tenantId]
            );
          }

          enqueueWebhook(ctx.tenantId, "message.status", {
            sessionKey, messageId: key.id, to: key.remoteJid, status: statusStr
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
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      try {
        if (msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid || "unknown";
        const waMessageId = msg.key.id || null;

        if (remoteJid === "status@broadcast" || remoteJid.includes("@broadcast") || remoteJid.includes("@newsletter")) {
          continue;
        }

        const isGroup = remoteJid.endsWith("@g.us");
        if (isGroup) continue; 

        const parsed = parseContent(msg);
        if (!parsed) continue; 
        
        const chatId = await upsertChat(ctx.tenantId, sessionKey, remoteJid, "private");

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

        // ====================================================================
        // [NEW CRM ENGINE] TRAFFIC SOURCE TRACKING & LEADS GENERATION
        // ====================================================================
        const raw = unwrapMessage(msg.message);
        const txtLower = (parsed.text || "").toLowerCase();
        let leadSource = 'organic';

        const quotedId = 
          raw?.extendedTextMessage?.contextInfo?.stanzaId || 
          raw?.imageMessage?.contextInfo?.stanzaId || 
          raw?.videoMessage?.contextInfo?.stanzaId || 
          raw?.documentMessage?.contextInfo?.stanzaId || null;

        const adReply = raw?.extendedTextMessage?.contextInfo?.adReply;

        let isBroadcastReply = false;
        let isFollowUpReply = false;
        
        if (quotedId) {
           const [bcCheck] = await pool.query<any[]>(`SELECT id FROM broadcast_items WHERE wa_message_id = ? LIMIT 1`, [quotedId]);
           if (bcCheck && bcCheck.length > 0) {
               isBroadcastReply = true;
           } else {
               const [fuCheck] = await pool.query<any[]>(`SELECT id FROM followup_targets WHERE wa_message_id = ? LIMIT 1`, [quotedId]);
               if (fuCheck && fuCheck.length > 0) {
                   isFollowUpReply = true;
               }
           }
        }

        if (adReply) {
           leadSource = 'meta_ads';
        } else if (isBroadcastReply) {
           leadSource = 'broadcast_reply';
        } else if (isFollowUpReply) {
           leadSource = 'followup_reply';
        } else if (txtLower.includes('dari web') || txtLower.includes('dari landing page') || txtLower.includes('dari website')) {
           leadSource = 'web';
        } else if (txtLower.includes('dari ig') || txtLower.includes('dari instagram')) {
           leadSource = 'ig';
        } else if (txtLower.includes('dari tiktok') || txtLower.includes('dari fyp')) {
           leadSource = 'tiktok';
        } else if (txtLower.includes('dari fb') || txtLower.includes('dari facebook')) {
           leadSource = 'facebook';
        } else if (txtLower.includes('dari threads')) {
           leadSource = 'threads';
        }

        const cleanNumber = remoteJid.split("@")[0];

        await pool.query(
          `INSERT INTO crm_leads (tenant_id, phone_number, name, source, status, last_interacted_at, created_at)
           VALUES (?, ?, ?, ?, 'warm', NOW(), NOW())
           ON DUPLICATE KEY UPDATE 
           name = COALESCE(?, name),
           last_interacted_at = NOW()`,
          [ctx.tenantId, cleanNumber, pushName, leadSource, pushName]
        );

        // ====================================================================

        await insertMessage(ctx.tenantId, ctx.userId, {
          sessionKey, direction: "in", remoteJid, waMessageId: msg.key.id,
          messageType: parsed.type, textBody: parsed.text, mediaMime: parsed.mime ?? null,
          mediaName: parsed.fileName ?? null, rawJson: msg, status: "sent", chatId
        });

        const logPreview = parsed.text ? (parsed.text.length > 30 ? parsed.text.substring(0, 30) + "..." : parsed.text) : "[Media/File]";
        console.log(`[${sessionKey}] 📨 INCOMING ${parsed.type.toUpperCase()} from ${remoteJid}: ${logPreview}`);

        // 4. Modul Eksekusi Paralel Latar Belakang
        if (quotedId && isBroadcastReply) {
          await handleBroadcastReply(ctx.tenantId, remoteJid, parsed.text || "", quotedId);
        }

        await processFollowUpRepliedTrigger(ctx.tenantId, sessionKey, remoteJid);

        if (parsed.text) {
          await processAutoReply(ctx.tenantId, sessionKey, remoteJid, parsed.text);
        }

        try {
          enqueueWebhook(ctx.tenantId, "message.incoming", {
            direction: "in", sessionKey, from: remoteJid, messageId: waMessageId, messageType: parsed.type, text: parsed.text ?? null
          }).catch(() => {});
        } catch (hookErr) {
          console.error(`[${sessionKey}] ❌ Webhook trigger error:`, hookErr);
        }

        await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { last_seen_at: new Date() });

      } catch (errLoop) {
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

export async function stopSession(sessionKey: string) {
  try { 
    const sock = getSessionSock(sessionKey);
    if (sock) sock.ws.close(); 
  } catch (e) {
    console.warn(`[${sessionKey}] ⚠️ Error closing websocket:`, e);
  }
  
  try { sessions.delete(sessionKey); } catch {}
  try { sessionMeta.delete(sessionKey); } catch {}
  console.log(`[${sessionKey}] 🛑 Session stopped and flushed from memory.`);
}

// ============================================================================
// 8. OUTBOUND MESSAGE ACTIONS (SENDING)
// ============================================================================

export async function sendText(sessionKey: string, to: string, text: string) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock || null;
  
  if (!sock) return { ok: false, error: "Session socket is not running" };
  if (!isConnected(sessionKey)) return { ok: false, error: "Session is disconnected" };

  const tenantId = Number(entry?.ctx?.tenantId || 0);
  const userId = Number(entry?.ctx?.userId || 0);
  
  if (!tenantId || !userId) {
    return { ok: false, error: "Session context missing (tenant/user data corrupted)" };
  }
  
  const toJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  const chatId = await upsertChat(tenantId, sessionKey, toJid, "private");

  try {
    const res = await sock.sendMessage(toJid, { text });

    await insertMessage(tenantId, userId, {
      sessionKey, direction: "out", remoteJid: toJid, waMessageId: res?.key?.id || null,
      messageType: "text", textBody: text, rawJson: { text }, status: "sent", chatId
    });

    await upsertSession(tenantId, userId, sessionKey, { last_seen_at: new Date() });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    console.error(`[${sessionKey}] ❌ Failed to send text to ${toJid}:`, e);
    
    await insertMessage(tenantId, userId, {
      sessionKey, direction: "out", remoteJid: toJid, waMessageId: null,
      messageType: "text", textBody: text, rawJson: { text, error: e?.message || String(e) },
      status: "failed", errorText: e?.message || "send failed", chatId
    });

    return { ok: false, error: e?.message || "Send operation failed" };
  }
}