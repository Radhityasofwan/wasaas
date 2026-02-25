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

// ===== QR state =====
export type QrState = { qr: string | null; status: string; at: number };
const qrStateMap = new Map<string, QrState>();
const sessions = new Map<string, any>();
const sessionMeta = new Map<string, any>();

// Logger silent biar terminal bersih
const logger = pino({ level: "silent" });

// ===== Helpers =====
export function getSessionSock(sessionKey: string) {
  return sessions.get(sessionKey)?.sock || null;
}
export function getSessionQRState(sessionKey: string) {
  return qrStateMap.get(sessionKey) || null;
}
export function isConnected(sessionKey: string) {
  return sessions.get(sessionKey)?.status === "connected";
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}
function storeDirFor(sessionKey: string) {
  const base = process.env.BAILEYS_STORE_DIR || "storage/baileys";
  return path.join(process.cwd(), base, sessionKey);
}

// ===== Parser =====
function unwrapMessage(msg: any): any {
  if (!msg) return null;
  return msg.ephemeralMessage?.message || 
         msg.viewOnceMessage?.message || 
         msg.viewOnceMessageV2?.message || 
         msg.documentWithCaptionMessage?.message || 
         msg;
}

function parseContent(webMsg: proto.IWebMessageInfo) {
  const raw = unwrapMessage(webMsg.message);
  if (!raw) return null;

  if (raw.conversation) return { type: "text", text: raw.conversation };
  if (raw.extendedTextMessage?.text) return { type: "text", text: raw.extendedTextMessage.text };
  
  if (raw.imageMessage) return { type: "image", text: raw.imageMessage.caption, mime: raw.imageMessage.mimetype };
  if (raw.videoMessage) return { type: "video", text: raw.videoMessage.caption, mime: raw.videoMessage.mimetype };
  if (raw.documentMessage) return { type: "document", text: raw.documentMessage.caption, mime: raw.documentMessage.mimetype, fileName: raw.documentMessage.fileName };
  if (raw.locationMessage) return { type: "location", text: null, latitude: raw.locationMessage.degreesLatitude, longitude: raw.locationMessage.degreesLongitude };
  
  return null;
}

// ===== Database Ops =====
async upsertChat(tenantId: number, sessionKey: string, remoteJid: string, type = "private") {
    await pool.query(
        `INSERT INTO wa_chats (tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at)
         VALUES (?, ?, ?, ?, 0, NOW())
         ON DUPLICATE KEY UPDATE last_message_at=NOW()`,
        [tenantId, sessionKey, remoteJid, type]
    );
    const [rows] = await pool.query<any[]>(`SELECT id FROM wa_chats WHERE tenant_id=? AND session_key=? AND remote_jid=?`, [tenantId, sessionKey, remoteJid]);
    return rows?.[0]?.id || null;
}

async function insertMessage(tenantId: number, userId: number, params: any) {
    await pool.query(
        `INSERT INTO wa_messages (
          tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
          message_type, text_body, media_mime, media_name, status, error_text, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status=VALUES(status)`,
        [
            tenantId, userId, params.sessionKey, params.chatId, params.direction, params.remoteJid, params.waMessageId,
            params.messageType, params.textBody, params.mediaMime, params.mediaName, params.status, params.errorText, 
            JSON.stringify(params.rawJson)
        ]
    );
}

// ===== Core Functions =====
export async function startSession(sessionKey: string, ctx: { tenantId: number; userId: number }) {
  if (sessions.has(sessionKey)) return { ok: true, message: "already running" };

  const dir = storeDirFor(sessionKey);
  ensureDir(dir);
  
  // DB Update: Connecting
  await pool.query(`INSERT INTO wa_sessions(tenant_id, user_id, session_key, status) VALUES(?,?,?,'connecting') ON DUPLICATE KEY UPDATE status='connecting'`, [ctx.tenantId, ctx.userId, sessionKey]);

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, logger });
  sessions.set(sessionKey, { sock, ctx, status: "connecting" });

  sock.ev.on("creds.update", saveCreds);
  
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;
    
    if (qr) {
        qrStateMap.set(sessionKey, { qr, status: "qr", at: Date.now() });
        console.log(`[${sessionKey}] QR Code received`);
    }

    if (connection === "open") {
        qrStateMap.set(sessionKey, { qr: null, status: "connected", at: Date.now() });
        sessions.set(sessionKey, { sock, ctx, status: "connected" });
        await pool.query(`UPDATE wa_sessions SET status='connected', last_seen_at=NOW() WHERE session_key=?`, [sessionKey]);
        console.log(`[${sessionKey}] Connected`);
    }

    if (connection === "close") {
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        
        sessions.set(sessionKey, { sock: null, ctx, status: "disconnected" });
        await pool.query(`UPDATE wa_sessions SET status=?, last_error=? WHERE session_key=?`, [shouldReconnect ? 'disconnected' : 'logged_out', String(code), sessionKey]);
        
        console.log(`[${sessionKey}] Closed. Reconnect: ${shouldReconnect}`);
        if (shouldReconnect) setTimeout(() => startSession(sessionKey, ctx), 2000);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;
    for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        const remoteJid = msg.key.remoteJid!;
        const parsed = parseContent(msg);
        if (!parsed) continue;

        const chatId = await upsertChat(ctx.tenantId, sessionKey, remoteJid, remoteJid.includes("@g.us") ? "group" : "private");
        
        // Update Unread
        await pool.query(`UPDATE wa_chats SET unread_count = unread_count + 1 WHERE id=?`, [chatId]);

        await insertMessage(ctx.tenantId, ctx.userId, {
            sessionKey, chatId, direction: "in", remoteJid, 
            waMessageId: msg.key.id, messageType: parsed.type, 
            textBody: parsed.text, mediaMime: parsed.mime, mediaName: parsed.fileName,
            rawJson: msg, status: "read"
        });

        // Broadcast Check & Webhook (Optional simplifikasi)
        if (handleBroadcastReply) {
             // Logic broadcast reply...
        }
        console.log(`[${sessionKey}] Msg from ${remoteJid}: ${parsed.type}`);
    }
  });

  return { ok: true };
}

export async function sendText(sessionKey: string, to: string, text: string) {
    const entry = sessions.get(sessionKey);
    if (!entry?.sock) return { ok: false, error: "Session not found" };
    
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    const chatId = await upsertChat(entry.ctx.tenantId, sessionKey, jid);
    
    try {
        const res = await entry.sock.sendMessage(jid, { text });
        await insertMessage(entry.ctx.tenantId, entry.ctx.userId, {
            sessionKey, chatId, direction: "out", remoteJid: jid,
            waMessageId: res?.key?.id, messageType: "text", textBody: text,
            status: "sent", rawJson: { text }
        });
        return { ok: true, messageId: res?.key?.id };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

export async function stopSession(sessionKey: string) {
    sessions.get(sessionKey)?.sock?.end(undefined);
    sessions.delete(sessionKey);
    qrStateMap.delete(sessionKey);
}