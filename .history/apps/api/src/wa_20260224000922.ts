import path from "path";
import fs from "fs";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { pool } from "./db";
import { handleBroadcastReply } from "./broadcast";
import { enqueueWebhook } from "./webhook"; // FIX: Import webhook trigger

// ===== QR state (in-memory) =====
export type QrState = { qr: string | null; status: string; at: number };
const qrStateMap = new Map<string, QrState>();

export function getSessionQRState(sessionKey: string) {
  return qrStateMap.get(sessionKey) || null;
}

type SessionEntry = {
  sessionKey: string;
  sock: ReturnType<typeof makeWASocket> | null;
  status: "created" | "connecting" | "connected" | "disconnected" | "logged_out" | "error";
  ctx?: { tenantId: number; userId: number };
};

type ParsedContent = {
  type: "text" | "image" | "video" | "document" | "audio" | "location" | "sticker" | "unknown";
  text: string | null;
  // minimal media metadata (untuk tahap media berikutnya)
  mime?: string | null;
  fileName?: string | null;
};

// Mengurangi level log baileys agar tidak tumpang tindih saat multi-session
const logger = pino({ level: "warn" });
console.log("WA_PARSER_VERSION=3 (Multi-Session Auto-Reply Fix) loaded");
const sessions = new Map<string, SessionEntry>();

type SessionMeta = { status?: string; qr?: string | null; phoneNumber?: string | null; lastSeen?: number | null };
const sessionMeta = new Map<string, SessionMeta>();

export function getSessionSock(sessionKey: string) {
  const e = sessions.get(sessionKey);
  return e?.sock || null;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function storeDirFor(sessionKey: string) {
  const base = process.env.BAILEYS_STORE_DIR || "storage/baileys";
  return path.join(process.cwd(), base, sessionKey);
}

// unwrap wrapper message types: ephemeral/viewOnce/etc
function unwrapMessage(msg: any): any {
  if (!msg) return null;
  if (msg.ephemeralMessage?.message) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.viewOnceMessage?.message) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2?.message) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.documentWithCaptionMessage?.message) return unwrapMessage(msg.documentWithCaptionMessage.message);
  if (msg.editedMessage?.message) return unwrapMessage(msg.editedMessage.message);
  return msg;
}

// return null if it's not a "real content message"
function parseContent(webMsg: proto.IWebMessageInfo): ParsedContent | null {
  const raw = unwrapMessage(webMsg.message as any);
  if (!raw) return null;

  // skip protocol / receipts / reactions
  if (raw.protocolMessage) return null;
  if (raw.reactionMessage) return null;
  if (raw.messageContextInfo) {
    // keep going; sometimes actual content exists alongside context
  }

  if (raw.conversation) {
    return { type: "text", text: raw.conversation };
  }

  if (raw.extendedTextMessage?.text) {
    return { type: "text", text: raw.extendedTextMessage.text };
  }

  if (raw.imageMessage) {
    return {
      type: "image",
      text: raw.imageMessage.caption ?? null,
      mime: raw.imageMessage.mimetype ?? null,
      fileName: null
    };
  }

  if (raw.videoMessage) {
    return {
      type: "video",
      text: raw.videoMessage.caption ?? null,
      mime: raw.videoMessage.mimetype ?? null,
      fileName: null
    };
  }

  if (raw.documentMessage) {
    return {
      type: "document",
      text: raw.documentMessage.caption ?? null,
      mime: raw.documentMessage.mimetype ?? null,
      fileName: raw.documentMessage.fileName ?? null
    };
  }

  if (raw.audioMessage) {
    return { type: "audio", text: null, mime: raw.audioMessage.mimetype ?? null, fileName: null };
  }

  if (raw.locationMessage || raw.liveLocationMessage) {
    return { type: "location", text: null };
  }

  if (raw.stickerMessage) {
    return { type: "sticker", text: null, mime: raw.stickerMessage.mimetype ?? null };
  }

  // unknown content type -> ignore for now (biar inbox bersih)
  return null;
}

async function upsertSession(tenantId: number, userId: number, sessionKey: string, patch: Partial<{
  status: string;
  last_error: string | null;
  phone_number: string | null;
  wa_me_jid: string | null;
  label: string | null; // Tambahkan label untuk nama profil
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
  await pool.query(
    `UPDATE wa_sessions SET ${fields.join(", ")} WHERE tenant_id=? AND session_key=?`,
    values
  );
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

async function insertMessage(tenantId: number, userId: number, params: {
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
}

export async function startSession(sessionKey: string, ctx: { tenantId: number; userId: number }) {
  if (!ctx || !ctx.tenantId || !ctx.userId) throw new Error("startSession requires ctx {tenantId,userId}");
  if (sessions.has(sessionKey) && sessions.get(sessionKey)!.sock) {
    return { ok: true, message: "session already running" };
  }

  const dir = storeDirFor(sessionKey);
  ensureDir(dir);

  await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { status: "connecting", last_error: null });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  // Child logger untuk memisahkan stream memori tiap instance (mencegah bentrok resource)
  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ session: sessionKey })
  });

  sessions.set(sessionKey, { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, sessionKey, sock, status: "connecting" });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    // ===== capture QR for UI =====
    if ((update as any)?.qr) {
      qrStateMap.set(sessionKey, { qr: (update as any).qr, status: "qr", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), qr: (update as any).qr, status: "qr", lastSeen: Date.now() });
    }

    if ((update as any)?.connection === "open") {
      qrStateMap.set(sessionKey, { qr: null, status: "connected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), qr: null, status: "connected", lastSeen: Date.now() });
    }

    if ((update as any)?.connection === "close") {
      const prev = qrStateMap.get(sessionKey);
      qrStateMap.set(sessionKey, { qr: prev?.qr || null, status: "disconnected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey)||{}), status: "disconnected", lastSeen: Date.now() });
    }

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`\n=== SCAN THIS QR (session: ${sessionKey}) ===\n`);
      qrcode.generate(qr, { small: true });
      console.log("\nWhatsApp HP -> Linked devices -> Link a device -> scan QR\n");
    }

    if (connection === "open") {
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

      console.log(`[${sessionKey}] connected as ${me ?? "unknown"} (${waName})`);
      
      // TRIGGER WEBHOOK: session.update (Connected)
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: "connected", phone: phoneClean }).catch(()=>{});
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const finalStatus = loggedOut ? "logged_out" : "disconnected";

      sessions.set(sessionKey, { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, sessionKey, sock: null, status: finalStatus });

      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, {
        status: finalStatus,
        last_error: finalStatus,
        last_seen_at: new Date()
      });

      console.log(`[${sessionKey}] connection closed: ${finalStatus}`);
      
      // TRIGGER WEBHOOK: session.update (Disconnected)
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: finalStatus, reason: code }).catch(()=>{});

      if (loggedOut) return;

      setTimeout(() => startSession(sessionKey, ctx).catch(console.error), 1500);
    }
  });

  // ===== EVENT TRACKER UNTUK STATUS PESAN =====
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      const { key, update: msgUpdate } = update;
      if (!key.id || !key.remoteJid) continue;

      let statusStr: "sent" | "delivered" | "read" | "failed" | null = null;

      // Parsing status dari integer (proto.WebMessageInfo.Status) ke string
      if (msgUpdate.status === proto.WebMessageInfo.Status.SERVER_ACK) statusStr = "sent";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.DELIVERY_ACK) statusStr = "delivered";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.READ || msgUpdate.status === proto.WebMessageInfo.Status.PLAYED) statusStr = "read";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.ERROR) statusStr = "failed";

      if (statusStr) {
        // Update database (agar di UI Dashboard juga terupdate)
        await pool.query(
          `UPDATE wa_messages SET status=? WHERE wa_message_id=? AND tenant_id=?`,
          [statusStr, key.id, ctx.tenantId]
        );

        // TRIGGER WEBHOOK: message.status (Pelacakan Centang / Status)
        enqueueWebhook(ctx.tenantId, "message.status", {
          sessionKey,
          messageId: key.id,
          to: key.remoteJid,
          status: statusStr
        }).catch(() => {});
      }
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid || "unknown";
      const waMessageId = msg.key.id || null;

      const parsed = parseContent(msg);
      if (!parsed) {
        continue;
      }

      const chatId = await upsertChat(ctx.tenantId, sessionKey, remoteJid, remoteJid.endsWith("@g.us") ? "group" : "private");

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

      console.log(`[${sessionKey}] IN ${parsed.type} from ${remoteJid}: ${parsed.text ?? "[no text]"}`);

      // --- LOGIKA BOT AUTO REPLY INTERNAL (BULLETPROOF MULTI-SESSION) ---
      if (parsed.text && remoteJid && !remoteJid.includes('@g.us')) {
        try {
          // Logik Terminal: Mencegah Silent Fail pada proses auto-reply
          console.log(`[${sessionKey}] 🤖 Mengecek rule Auto Reply untuk pesan: "${parsed.text}"`);

          // PERBAIKAN SQL: 
          // 1. Tangani 'IS NULL' maupun string kosong ''
          // 2. Gunakan TRIM(session_key) agar tidak gagal karena masalah spasi tersembunyi
          const [rules] = await pool.query<any[]>(
            `SELECT keyword, match_type, reply_text 
             FROM auto_reply_rules 
             WHERE tenant_id=? AND is_active=1 
             AND (session_key IS NULL OR session_key = '' OR TRIM(session_key) = ?)`,
            [ctx.tenantId, sessionKey.trim()]
          );

          const txtLower = parsed.text.toLowerCase().trim();
          let matchedReply = null;

          // Cari keyword yang cocok
          for (const rule of rules) {
            const kwLower = String(rule.keyword).toLowerCase().trim();
            if (rule.match_type === 'exact' && txtLower === kwLower) matchedReply = rule.reply_text;
            else if (rule.match_type === 'contains' && txtLower.includes(kwLower)) matchedReply = rule.reply_text;
            else if (rule.match_type === 'startswith' && txtLower.startsWith(kwLower)) matchedReply = rule.reply_text;

            if (matchedReply) {
              console.log(`[${sessionKey}] ✅ Keyword Cocok! Rule: "${rule.keyword}" (${rule.match_type})`);
              break; 
            }
          }

          // Kirim balasan
          if (matchedReply) {
            console.log(`[${sessionKey}] 🚀 Mengirim balasan otomatis ke ${remoteJid}...`);
            // Berikan jeda 1.5 detik agar terlihat lebih natural
            setTimeout(async () => {
              try { 
                await sendText(sessionKey, remoteJid, matchedReply); 
                console.log(`[${sessionKey}] ✔️ Balasan terkirim ke ${remoteJid}`);
              } catch (e) { 
                console.error(`[${sessionKey}] ❌ Gagal mengirim auto reply:`, e); 
              }
            }, 1500);
          } else {
            console.log(`[${sessionKey}] ℹ️ Tidak ada keyword auto-reply yang cocok.`);
          }
        } catch (err) {
          console.error(`[${sessionKey}] ❌ Error saat memproses auto reply:`, err);
        }
      }
      // --- END LOGIKA BOT AUTO REPLY ---

      // TRIGGER WEBHOOK: message.incoming (Auto-Reply trigger)
      try {
        enqueueWebhook(ctx.tenantId, "message.incoming", {
          direction: "in",
          sessionKey,
          from: remoteJid,
          messageId: waMessageId,
          messageType: parsed.type,
          text: parsed.text ?? null
        }).catch(() => {});
      } catch (err) {
        console.error("Webhook trigger error:", err);
      }

      // --- CEK BALASAN BROADCAST ---
      const raw = unwrapMessage(msg.message);
      const quotedId = raw?.extendedTextMessage?.contextInfo?.stanzaId || 
                       raw?.imageMessage?.contextInfo?.stanzaId || 
                       raw?.videoMessage?.contextInfo?.stanzaId || 
                       raw?.documentMessage?.contextInfo?.stanzaId || null;
      
      if (quotedId) {
        await handleBroadcastReply(ctx.tenantId, remoteJid, parsed.text || "", quotedId);
      }

      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { last_seen_at: new Date() });
    }
  });

  return { ok: true };
}

export function getSession(sessionKey: string) {
  return sessions.get(sessionKey)?.sock || null;
}

export function isConnected(sessionKey: string) {
  return sessions.get(sessionKey)?.status === "connected";
}

export async function sendText(sessionKey: string, to: string, text: string) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock || null;
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(sessionKey)) return { ok: false, error: "session not connected" };

  const tenantId = Number(entry?.ctx?.tenantId || 0);
  const userId = Number(entry?.ctx?.userId || 0);
  if (!tenantId || !userId) return { ok: false, error: "session ctx missing (tenant/user)" };
  const toJid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;
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

    return { ok: false, error: e?.message || "send failed" };
  }
}

// ===== UI helpers (stable) =====
export async function stopSession(sessionKey: string) {
  try {
    const sock = getSession(sessionKey);
    if (sock) {
      // PERBAIKAN: JANGAN PANGGIL sock.logout() KARENA INI AKAN UNLINK DEVICE DI HP
      try { sock.ws.close(); } catch {}
    }
  } catch {}
  try { sessions.delete(sessionKey); } catch {}
  try { sessionMeta.delete(sessionKey); } catch {}
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

// ===== Menghapus penyimpanan lokal (auth state) =====
export async function deleteSessionFolder(sessionKey: string) {
  const dir = storeDirFor(sessionKey);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`Failed to delete session folder for ${sessionKey}:`, e);
  }
}