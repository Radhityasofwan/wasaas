import { getSessionSock } from "./wa";
import { pool } from "./db";

function normalizeToJid(to: string) {
  const clean = to.replace(/[^\d]/g, "");
  return clean.endsWith("@s.whatsapp.net") ? clean : `${clean}@s.whatsapp.net`;
}

async function upsertChat(tenantId: number, sessionKey: string, remoteJid: string) {
  await pool.query(
    `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at)
     VALUES(?, ?, ?, 'private', 0, NOW())
     ON DUPLICATE KEY UPDATE last_message_at=NOW()`,
    [tenantId, sessionKey, remoteJid]
  );

  const [rows] = await pool.query<any[]>(
    `SELECT id FROM wa_chats WHERE tenant_id=? AND session_key=? AND remote_jid=? LIMIT 1`,
    [tenantId, sessionKey, remoteJid]
  );

  return rows?.[0]?.id ?? null;
}

async function insertOutMessage(
  tenantId: number,
  userId: number,
  sessionKey: string,
  chatId: number | null,
  remoteJid: string,
  waMessageId: string | null,
  textBody: string,
  status: "sent" | "failed",
  errorText?: string | null
) {
  await pool.query(
    `INSERT INTO wa_messages(
      tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
      message_type, text_body, status, error_text, raw_json
     ) VALUES (?, ?, ?, ?, 'out', ?, ?, 'text', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      chat_id=COALESCE(VALUES(chat_id), chat_id),
      status=VALUES(status),
      error_text=VALUES(error_text),
      raw_json=COALESCE(VALUES(raw_json), raw_json)`,
    [
      tenantId,
      userId,
      sessionKey,
      chatId ?? null,
      remoteJid,
      waMessageId,
      textBody,
      status,
      errorText || null,
      JSON.stringify({ text: textBody })
    ]
  );
}

export async function sendText(params: { tenantId: number; userId: number; sessionKey: string; to: string; text: string }) {
  const sock = getSessionSock(params.sessionKey);
  if (!sock) return { ok: false, error: "session not running" };

  const jid = normalizeToJid(params.to);
  const chatId = await upsertChat(params.tenantId, params.sessionKey, jid);

  try {
    const res = await sock.sendMessage(jid, { text: params.text });
    const waId = (res as any)?.key?.id || null;

    await insertOutMessage(params.tenantId, params.userId, params.sessionKey, chatId, jid, waId, params.text, "sent", null);

    return { ok: true, messageId: waId };
  } catch (e: any) {
    await insertOutMessage(params.tenantId, params.userId, params.sessionKey, chatId, jid, null, params.text, "failed", e?.message || "send failed");
    return { ok: false, error: e?.message || "send failed" };
  }
}
