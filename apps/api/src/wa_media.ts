import fs from "fs";
import { pool } from "./db";
import { getSession, isConnected } from "./wa";


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

async function insertOutgoing(tenantId: number, userId: number, params: {
  sessionKey: string;
  toJid: string;
  waMessageId: string | null;
  messageType: "image" | "video" | "document" | "location";
  textBody: string | null;
  status: "sent" | "failed";
  errorText?: string | null;
  chatId?: number | null;

  mediaMime?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  mediaUrl?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  rawJson?: any;
}) {
  await pool.query(
    `INSERT INTO wa_messages(
      tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
      message_type, text_body, media_mime, media_name, media_size, media_url,
      latitude, longitude,
      status, error_text, raw_json
     ) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      userId,
      params.sessionKey,
      params.chatId ?? null,
      params.toJid,
      params.waMessageId,
      params.messageType,
      params.textBody,
      params.mediaMime ?? null,
      params.mediaName ?? null,
      params.mediaSize ?? null,
      params.mediaUrl ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      params.status,
      params.errorText ?? null,
      JSON.stringify(params.rawJson ?? {})
    ]
  );
}

function toJid(to: string) {
  return to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;
}

export async function sendMediaImage(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  caption: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}) {
  const sock = getSession(input.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(input.sessionKey)) return { ok: false, error: "session not connected" };

  const jid = toJid(input.to);
  const chatId = await upsertChat(input.tenantId, input.sessionKey, jid, "private");

  try {
    const buffer = fs.readFileSync(input.filePath);
    const res = await sock.sendMessage(jid, {
      image: buffer,
      mimetype: input.mime,
      caption: input.caption || undefined
    });

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: res?.key?.id || null,
      messageType: "image",
      textBody: input.caption || null,
      status: "sent",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: { caption: input.caption, publicUrl: input.publicUrl }
    });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: null,
      messageType: "image",
      textBody: input.caption || null,
      status: "failed",
      errorText: e?.message || "send image failed",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: { error: e?.message || String(e) }
    });
    return { ok: false, error: e?.message || "send image failed" };
  }
}

export async function sendMediaDocument(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  caption: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}) {
  const sock = getSession(input.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(input.sessionKey)) return { ok: false, error: "session not connected" };

  const jid = toJid(input.to);
  const chatId = await upsertChat(input.tenantId, input.sessionKey, jid, "private");

  try {
    const buffer = fs.readFileSync(input.filePath);
    const res = await sock.sendMessage(jid, {
      document: buffer,
      mimetype: input.mime,
      fileName: input.fileName,
      caption: input.caption || undefined
    });

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: res?.key?.id || null,
      messageType: "document",
      textBody: input.caption || null,
      status: "sent",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: { caption: input.caption, publicUrl: input.publicUrl }
    });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: null,
      messageType: "document",
      textBody: input.caption || null,
      status: "failed",
      errorText: e?.message || "send document failed",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: { error: e?.message || String(e) }
    });
    return { ok: false, error: e?.message || "send document failed" };
  }
}

export async function sendMediaVideo(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  caption: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}) {
  const sock = getSession(input.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(input.sessionKey)) return { ok: false, error: "session not connected" };

  const jid = toJid(input.to);
  const chatId = await upsertChat(input.tenantId, input.sessionKey, jid, "private");

  try {
    const buffer = fs.readFileSync(input.filePath);
    const res = await sock.sendMessage(jid, {
      video: buffer,
      mimetype: input.mime,
      caption: input.caption || undefined
    });

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: res?.key?.id || null,
      messageType: "video",
      textBody: input.caption || null,
      status: "sent",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: { caption: input.caption, publicUrl: input.publicUrl }
    });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: null,
      messageType: "video",
      textBody: input.caption || null,
      status: "failed",
      errorText: e?.message || "send video failed",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: { error: e?.message || String(e) }
    });
    return { ok: false, error: e?.message || "send video failed" };
  }
}

export async function sendLocation(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}) {
  const sock = getSession(input.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(input.sessionKey)) return { ok: false, error: "session not connected" };

  const jid = toJid(input.to);
  const chatId = await upsertChat(input.tenantId, input.sessionKey, jid, "private");

  try {
    const res = await sock.sendMessage(jid, {
      location: {
        degreesLatitude: input.latitude,
        degreesLongitude: input.longitude,
        name: input.name,
        address: input.address
      }
    } as any);

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: res?.key?.id || null,
      messageType: "location",
      textBody: null,
      status: "sent",
      chatId,
      latitude: input.latitude,
      longitude: input.longitude,
      rawJson: { latitude: input.latitude, longitude: input.longitude, name: input.name, address: input.address }
    });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      toJid: jid,
      waMessageId: null,
      messageType: "location",
      textBody: null,
      status: "failed",
      errorText: e?.message || "send location failed",
      chatId,
      latitude: input.latitude,
      longitude: input.longitude,
      rawJson: { error: e?.message || String(e) }
    });

    return { ok: false, error: e?.message || "send location failed" };
  }
}
