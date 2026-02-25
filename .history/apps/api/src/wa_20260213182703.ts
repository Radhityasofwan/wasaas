import { 
  makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto 
} from "@whiskeysockets/baileys";
import { pool } from "./db";
import fs from "fs";
import path from "path";
import pino from "pino";

// ... (Kode Session Store & Logger sama seperti sebelumnya) ...
const sessions = new Map<string, any>();
const logger = pino({ level: "silent" }); // Silent biar log bersih

// Helper Parser Konten
function parseContent(webMsg: proto.IWebMessageInfo) {
  const msg = webMsg.message;
  if (!msg) return null;

  // Unwrap tipe pesan yg membungkus (ephemeral, viewOnce)
  const content = msg.ephemeralMessage?.message || 
                  msg.viewOnceMessage?.message || 
                  msg.viewOnceMessageV2?.message || 
                  msg.documentWithCaptionMessage?.message || 
                  msg;

  if (content?.conversation) {
    return { type: "text", text: content.conversation };
  }
  if (content?.extendedTextMessage) {
    return { type: "text", text: content.extendedTextMessage.text };
  }
  if (content?.imageMessage) {
    return { 
      type: "image", 
      text: content.imageMessage.caption || null, 
      mime: content.imageMessage.mimetype 
    };
  }
  if (content?.videoMessage) {
    return { 
      type: "video", 
      text: content.videoMessage.caption || null, 
      mime: content.videoMessage.mimetype 
    };
  }
  if (content?.documentMessage) {
    return { 
      type: "document", 
      text: content.documentMessage.caption || null, 
      mime: content.documentMessage.mimetype,
      fileName: content.documentMessage.fileName 
    };
  }
  if (content?.locationMessage) {
    return {
      type: "location",
      text: null,
      latitude: content.locationMessage.degreesLatitude,
      longitude: content.locationMessage.degreesLongitude
    };
  }
  
  return { type: "unknown", text: null };
}

// ... (startSession logic connection sama seperti sebelumnya) ...

// Bagian listener pesan masuk yang diperbaiki
// sock.ev.on("messages.upsert", async (m) => { ... })
export async function handleIncomingMessage(
    sessionKey: string, 
    ctx: { tenantId: number, userId: number }, 
    msg: proto.IWebMessageInfo
) {
    if (msg.key.fromMe) return; // Skip pesan dari diri sendiri (opsional)

    const remoteJid = msg.key.remoteJid!;
    const parsed = parseContent(msg);
    if (!parsed) return;

    // 1. Pastikan Chat Ada
    await pool.query(
        `INSERT INTO wa_chats (tenant_id, session_key, remote_jid, unread_count, last_message_at)
         VALUES (?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE 
            unread_count = unread_count + 1, 
            last_message_at = NOW()`,
        [ctx.tenantId, sessionKey, remoteJid]
    );

    // 2. Simpan Pesan
    await pool.query(
        `INSERT INTO wa_messages (
            tenant_id, session_key, remote_jid, direction, wa_message_id,
            message_type, text_body, 
            media_mime, media_name, latitude, longitude,
            status, raw_json
        ) VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, 'read', ?)`,
        [
            ctx.tenantId, sessionKey, remoteJid, 
            msg.key.id,
            parsed.type, parsed.text,
            parsed.mime || null, parsed.fileName || null, 
            parsed.latitude || null, parsed.longitude || null,
            JSON.stringify(msg)
        ]
    );
    
    console.log(`[${sessionKey}] Saved ${parsed.type} from ${remoteJid}`);
}