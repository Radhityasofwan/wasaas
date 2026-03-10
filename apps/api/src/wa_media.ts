import fs from "fs";
import { pool } from "./db";
import { getSessionSock, isConnected } from "./wa";
import { normalizeIndonesiaPhoneE164 } from "./phone_normalizer";

type PersistMessageType = "image" | "video" | "document" | "audio" | "location" | "sticker";
type UploadMediaType = "image" | "video" | "document" | "audio" | "voice_note" | "sticker";
type CreatedDateMode = "unknown" | "missing" | "generated" | "writable";

let createdDateMode: CreatedDateMode = "unknown";

function digitsOnly(v: string) {
  return String(v || "").replace(/[^\d]/g, "");
}

async function upsertChat(
  tenantId: number,
  sessionKey: string,
  remoteJid: string,
  chatType: "private" | "group" | "broadcast" = "private"
) {
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

async function insertOutgoing(
  tenantId: number,
  userId: number,
  params: {
    sessionKey: string;
    remoteJid: string;
    deliveryJid: string;
    waMessageId: string | null;
    messageType: PersistMessageType;
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
  }
) {
  if (createdDateMode === "unknown") {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT EXTRA
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'wa_messages'
           AND column_name = 'created_date'
         LIMIT 1`
      );
      if (!rows.length) {
        createdDateMode = "missing";
      } else {
        const extra = String(rows[0]?.EXTRA || "").toLowerCase();
        createdDateMode = extra.includes("generated") ? "generated" : "writable";
      }
    } catch {
      createdDateMode = "missing";
    }
  }

  const createdAt = new Date();
  const createdDate = createdAt.toISOString().slice(0, 10);
  const baseValues = [
    tenantId,
    userId,
    params.sessionKey,
    params.chatId ?? null,
    params.remoteJid,
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
    JSON.stringify({
      ...(params.rawJson || {}),
      delivery_jid: params.deliveryJid,
    }),
    createdAt,
  ];

  if (createdDateMode === "writable") {
    await pool.query(
      `INSERT INTO wa_messages(
        tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
        message_type, text_body, media_mime, media_name, media_size, media_url,
        latitude, longitude,
        status, error_text, raw_json, created_at, created_date
       ) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...baseValues, createdDate]
    );
    return;
  }

  await pool.query(
    `INSERT INTO wa_messages(
      tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
      message_type, text_body, media_mime, media_name, media_size, media_url,
      latitude, longitude,
      status, error_text, raw_json, created_at
     ) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    baseValues
  );
}

async function resolveSendJid(tenantId: number, sessionKey: string, to: string) {
  const input = String(to || "").trim();
  if (!input) return "";

  if (!input.includes("@")) {
    const e164 = normalizeIndonesiaPhoneE164(input);
    return e164 ? `${e164.slice(1)}@s.whatsapp.net` : `${digitsOnly(input)}@s.whatsapp.net`;
  }

  if (input.endsWith("@s.whatsapp.net")) return input;

  if (input.endsWith("@lid")) {
    const [rows] = await pool.query<any[]>(
      `SELECT phone_number
       FROM wa_contacts
       WHERE tenant_id=? AND session_key=? AND jid=?
         AND phone_number IS NOT NULL AND phone_number <> ''
       ORDER BY id DESC
       LIMIT 1`,
      [tenantId, sessionKey, input]
    );
    const mapped = normalizeIndonesiaPhoneE164(rows?.[0]?.phone_number || "");
    if (mapped) {
      return `${mapped.slice(1)}@s.whatsapp.net`;
    }
  }

  return input;
}

function buildMediaMessagePayload(input: {
  mediaType: UploadMediaType;
  buffer: Buffer;
  mime: string;
  fileName: string;
  caption?: string;
}) {
  const mediaType = input.mediaType;
  const caption = String(input.caption || "").trim() || undefined;
  const mime = String(input.mime || "application/octet-stream");
  const fileName = String(input.fileName || "").trim() || "file";

  if (mediaType === "image") {
    return { image: input.buffer, mimetype: mime, caption };
  }

  if (mediaType === "video") {
    return { video: input.buffer, mimetype: mime, caption };
  }

  if (mediaType === "document") {
    return { document: input.buffer, mimetype: mime, fileName, caption };
  }

  if (mediaType === "audio" || mediaType === "voice_note") {
    return {
      audio: input.buffer,
      mimetype: mime || "audio/ogg; codecs=opus",
      ptt: mediaType === "voice_note",
    };
  }

  if (mediaType === "sticker") {
    return { sticker: input.buffer };
  }

  throw new Error(`Unsupported media type: ${mediaType}`);
}

async function sendUploadMedia(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  mediaType: UploadMediaType;
  caption?: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}) {
  const sock = getSessionSock(input.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(input.sessionKey)) return { ok: false, error: "session not connected" };

  const requestedJid = input.to.includes("@") ? input.to : `${input.to}@s.whatsapp.net`;
  const sendJid = await resolveSendJid(input.tenantId, input.sessionKey, requestedJid);
  const chatId = await upsertChat(input.tenantId, input.sessionKey, requestedJid, "private");

  const persistMessageType: PersistMessageType = input.mediaType === "voice_note" ? "audio" : (input.mediaType as PersistMessageType);
  const textBody = input.mediaType === "voice_note"
    ? (String(input.caption || "").trim() || "[VOICE_NOTE]")
    : (String(input.caption || "").trim() || null);

  try {
    const buffer = fs.readFileSync(input.filePath);
    const payload = buildMediaMessagePayload({
      mediaType: input.mediaType,
      buffer,
      mime: input.mime,
      fileName: input.fileName,
      caption: input.caption,
    });

    const res = await sock.sendMessage(sendJid, payload as any);

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      remoteJid: requestedJid,
      deliveryJid: sendJid,
      waMessageId: res?.key?.id || null,
      messageType: persistMessageType,
      textBody,
      status: "sent",
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: {
        caption: input.caption || null,
        publicUrl: input.publicUrl,
        media_type: input.mediaType,
        ptt: input.mediaType === "voice_note",
      },
    });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    const errorText = e?.message || `send ${input.mediaType} failed`;

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      remoteJid: requestedJid,
      deliveryJid: sendJid,
      waMessageId: null,
      messageType: persistMessageType,
      textBody,
      status: "failed",
      errorText,
      chatId,
      mediaMime: input.mime,
      mediaName: input.fileName,
      mediaSize: input.fileSize,
      mediaUrl: input.publicUrl,
      rawJson: {
        error: errorText,
        media_type: input.mediaType,
        ptt: input.mediaType === "voice_note",
      },
    });
    return { ok: false, error: errorText };
  }
}

export async function sendMediaByType(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  mediaType: UploadMediaType;
  caption?: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}) {
  return sendUploadMedia(input);
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
  return sendUploadMedia({ ...input, mediaType: "image" });
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
  return sendUploadMedia({ ...input, mediaType: "document" });
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
  return sendUploadMedia({ ...input, mediaType: "video" });
}

export async function sendMediaAudio(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
  caption?: string;
}) {
  return sendUploadMedia({ ...input, mediaType: "audio" });
}

export async function sendMediaVoiceNote(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
  caption?: string;
}) {
  return sendUploadMedia({ ...input, mediaType: "voice_note" });
}

export async function sendMediaSticker(input: {
  tenantId: number;
  userId: number;
  sessionKey: string;
  to: string;
  filePath: string;
  mime: string;
  fileName: string;
  fileSize: number;
  publicUrl: string;
}) {
  return sendUploadMedia({ ...input, mediaType: "sticker" });
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
  const sock = getSessionSock(input.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };
  if (!isConnected(input.sessionKey)) return { ok: false, error: "session not connected" };

  const requestedJid = input.to.includes("@") ? input.to : `${input.to}@s.whatsapp.net`;
  const sendJid = await resolveSendJid(input.tenantId, input.sessionKey, requestedJid);
  const chatId = await upsertChat(input.tenantId, input.sessionKey, requestedJid, "private");

  try {
    const res = await sock.sendMessage(sendJid, {
      location: {
        degreesLatitude: input.latitude,
        degreesLongitude: input.longitude,
        name: input.name,
        address: input.address,
      },
    } as any);

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      remoteJid: requestedJid,
      deliveryJid: sendJid,
      waMessageId: res?.key?.id || null,
      messageType: "location",
      textBody: null,
      status: "sent",
      chatId,
      latitude: input.latitude,
      longitude: input.longitude,
      rawJson: {
        latitude: input.latitude,
        longitude: input.longitude,
        name: input.name || null,
        address: input.address || null,
      },
    });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    const errorText = e?.message || "send location failed";

    await insertOutgoing(input.tenantId, input.userId, {
      sessionKey: input.sessionKey,
      remoteJid: requestedJid,
      deliveryJid: sendJid,
      waMessageId: null,
      messageType: "location",
      textBody: null,
      status: "failed",
      errorText,
      chatId,
      latitude: input.latitude,
      longitude: input.longitude,
      rawJson: { error: errorText },
    });

    return { ok: false, error: errorText };
  }
}
