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
// Import fungsi penanganan reply
import { handleBroadcastReply } from "./broadcast";

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
  mime?: string | null;
  fileName?: string | null;
};

const logger = pino({ level: "info" });
console.log("WA_PARSER_VERSION=FINAL_FIX loaded");
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

// Helper untuk membuka struktur pesan WA yang berlapis
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

  // skip protocol / receipts / reactions
  if (raw.protocolMessage) return null;
  if (raw.reactionMessage) return null;

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
  return null;
}

async function upsertSession(tenantId: number, userId: number, sessionKey: string, patch: Partial<{ status: string; last_error: string | null; phone_number: string | null; wa_me_jid: string | null; last_seen_at: Date | null; }>) {
  await pool.query(
    `INSERT INTO wa_sessions(tenant_id, user_id, session_key, status) VALUES(?, ?, ?, 'created') ON DUPLICATE KEY UPDATE session_key=session_key`,
    [tenantId, userId, sessionKey]
  );
  // ... (sisa logika update sama)
  const fields: string[] = [];
  const values: any[] = [];
  const map: Record<string, any> = { status: patch.status, last_error: patch.last_error, phone_number: patch.phone_number, wa_me_jid: patch.wa_me_jid, last_seen_at: patch.last_seen_at };
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
    `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at) VALUES(?, ?, ?, ?, 0, NOW()) ON DUPLICATE KEY UPDATE last_message_at=NOW()`,
    [tenantId, sessionKey, remoteJid, chatType]
  );
  const [rows] = await pool.query<any[]>(`SELECT id FROM wa_chats WHERE tenant_id=? AND session_key=? AND remote_jid=? LIMIT 1`, [tenantId, sessionKey, remoteJid]);
  return rows?.[0]?.id ?? null;
}

async function insertMessage(tenantId: number, userId: number, params: any) {
  await pool.query(
    `INSERT INTO wa_messages(tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id, message_type, text_body, media_mime, media_name, status, error_text, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE chat_id=VALUES(chat_id), text_body=VALUES(text_body), status=VALUES(status)`,
    [tenantId, userId, params.sessionKey, params.chatId ?? null, params.direction, params.remoteJid, params.waMessageId, params.messageType, params.textBody, params.mediaMime, params.mediaName, params.status, params.errorText, JSON.stringify(params.rawJson)]
  );
}

export async function startSession(sessionKey: string, ctx: { tenantId: number; userId: number }) {
  if (!ctx || !ctx.tenantId || !ctx.userId) throw new Error("startSession requires ctx");
  if (sessions.has(sessionKey) && sessions.get(sessionKey)!.sock) return { ok: true, message: "session running" };

  const dir = storeDirFor(sessionKey);
  ensureDir(dir);
  await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { status: "connecting", last_error: null });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, logger });
  sessions.set(sessionKey, { ctx, sessionKey, sock, status: "connecting" });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    if ((update as any)?.qr) {
      qrStateMap.set(sessionKey, { qr: (update as any).qr, status: "qr", at: Date.now() });
    }
    if (update.connection === "open") {
      const me = sock.user?.id;
      sessions.set(sessionKey, { ctx, sessionKey, sock, status: "connected" });
      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { status: "connected", wa_me_jid: me, phone_number: me?.split("@")[0], last_seen_at: new Date() });
      console.log(`[${sessionKey}] CONNECTED`);
    }
    if (update.connection === "close") {
      const shouldReconnect = (update.lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startSession(sessionKey, ctx).catch(() => {});
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid || "unknown";
      const parsed = parseContent(msg);
      
      // Jika pesan tidak bisa diparsing (misal system message), skip
      if (!parsed) continue;

      const chatId = await upsertChat(ctx.tenantId, sessionKey, remoteJid, remoteJid.endsWith("@g.us") ? "group" : "private");

      // Simpan pesan masuk ke Inbox
      await insertMessage(ctx.tenantId, ctx.userId, {
        sessionKey,
        direction: "in",
        remoteJid,
        waMessageId: msg.key.id,
        messageType: parsed.type,
        textBody: parsed.text,
        mediaMime: parsed.mime,
        mediaName: parsed.fileName,
        rawJson: msg,
        status: "sent",
        chatId
      });

      // --- [FITUR UTAMA: DETEKSI REPLY BROADCAST] ---
      // Kita buka message mentah untuk mencari contextInfo (quoted message)
      const raw = unwrapMessage(msg.message);
      const quotedId = raw?.extendedTextMessage?.contextInfo?.stanzaId || 
                       raw?.imageMessage?.contextInfo?.stanzaId || 
                       raw?.videoMessage?.contextInfo?.stanzaId || 
                       raw?.documentMessage?.contextInfo?.stanzaId || null;

      if (quotedId) {
        // Jika ada ID pesan yang dibalas, kirim ke module broadcast untuk dicek
        console.log(`[DEBUG] Incoming Reply from ${remoteJid} quoting msgID: ${quotedId}`);
        await handleBroadcastReply(ctx.tenantId, remoteJid, parsed.text || "[media]", quotedId);
      } else {
        // console.log(`[DEBUG] Incoming Message (No Reply Context)`);
      }
      // ---------------------------------------------

      // Webhook standard
      try {
        const { enqueueWebhook } = require("./webhook");
        enqueueWebhook(ctx.tenantId, "message.incoming", { direction: "in", sessionKey, from: remoteJid, text: parsed.text }).catch(() => {});
      } catch {}
    }
  });

  return { ok: true };
}

export function getSession(sessionKey: string) { return sessions.get(sessionKey)?.sock || null; }
export function isConnected(sessionKey: string) { return sessions.get(sessionKey)?.status === "connected"; }

export async function sendText(sessionKey: string, to: string, text: string) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock;
  if (!sock) return { ok: false, error: "no session" };

  const toJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  try {
    const res = await sock.sendMessage(toJid, { text });
    return { ok: true, messageId: res?.key?.id };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ... UI Helpers (stopSession, getSessionMeta) tetap sama ...
export async function stopSession(sessionKey: string) {
  try { sessions.get(sessionKey)?.sock?.end(undefined); } catch {}
  sessions.delete(sessionKey);
}
export function getSessionMeta(sessionKey: string) {
  const m = sessionMeta.get(sessionKey) || {};
  return { status: m.status || "unknown", qr: m.qr };
}