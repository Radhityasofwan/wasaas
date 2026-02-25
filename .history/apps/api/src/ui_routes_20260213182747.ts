import { z } from "zod";
import { pool } from "./db";

/**
 * UI Read APIs (API-key protected for now).
 * Later: swap apiKeyAuth -> JWT middleware.
 */

function mustString(v: any) {
  return typeof v === "string" ? v : "";
}

function normalizeRemoteJid(peer: string) {
  // accept: 62xxx or 62xxx@s.whatsapp.net or group jid
  if (!peer) return peer;
  if (peer.includes("@")) return peer;
  return `${peer}@s.whatsapp.net`;
}

// GET /ui/sessions
export async function listSessions(req: any, res: any) {
  // minimal fields to avoid schema mismatch
  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, session_key, status, created_at, updated_at
     FROM wa_sessions
     WHERE tenant_id=?
     ORDER BY id DESC`,
    [req.auth.tenantId]
  );

  return res.json({ ok: true, sessions: rows });
}

// GET /ui/conversations?sessionKey=...
export async function listConversations(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64)
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey;

  /**
   * Strategy:
   * 1) subquery per remote_jid -> last message id
   * 2) join wa_messages for last payload
   * 3) join wa_chats for unread_count + chat id
   */
  const [rows] = await pool.query<any[]>(
    `SELECT
        c.id AS chat_id,
        c.remote_jid,
        c.unread_count,
        m.id AS last_message_id,
        m.direction AS last_direction,
        m.message_type AS last_type,
        m.text_body AS last_text,
        m.media_url AS last_media_url,
        m.created_at AS last_time
     FROM (
        SELECT remote_jid, MAX(id) AS last_id
        FROM wa_messages
        WHERE tenant_id=? AND session_key=?
        GROUP BY remote_jid
     ) lm
     JOIN wa_messages m ON m.id = lm.last_id
     LEFT JOIN wa_chats c
       ON c.tenant_id=? AND c.session_key=? AND c.remote_jid = lm.remote_jid
     ORDER BY m.id DESC
     LIMIT 500`,
    [tenantId, sessionKey, tenantId, sessionKey]
  );

  // fallback unread_count jika wa_chats belum ada row
  const conversations = rows.map((r) => ({
    chatId: r.chat_id ?? null,
    remoteJid: r.remote_jid,
    unreadCount: Number(r.unread_count ?? 0),
    lastMessage: {
      id: r.last_message_id,
      direction: r.last_direction,
      type: r.last_type,
      text: r.last_text ?? null,
      mediaUrl: r.last_media_url ?? null,
      time: r.last_time
    }
  }));

  return res.json({ ok: true, conversations });
}

// GET /ui/messages?sessionKey=...&peer=...&cursor=...&limit=...
export async function listMessages(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64),
    peer: z.string().min(1).max(128),
    cursor: z.string().optional(), // message id (numeric) cursor, fetch older
    limit: z.string().optional()
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey;
  const remoteJid = normalizeRemoteJid(parsed.data.peer);

  const limit = Math.max(1, Math.min(Number(parsed.data.limit || 50), 200));
  const cursorId = parsed.data.cursor ? Number(parsed.data.cursor) : null;

  const params: any[] = [tenantId, sessionKey, remoteJid];
  let cursorSql = "";
  if (cursorId && Number.isFinite(cursorId)) {
    cursorSql = " AND id < ? ";
    params.push(cursorId);
  }
  params.push(limit);

  const [rows] = await pool.query<any[]>(
    `SELECT
        id, direction, message_type, text_body, media_mime, media_name, media_size, media_url,
        latitude, longitude, status, error_text, created_at
     FROM wa_messages
     WHERE tenant_id=? AND session_key=? AND remote_jid=? ${cursorSql}
     ORDER BY id DESC
     LIMIT ?`,
    params
  );

  // return ascending order for UI
  const messages = rows.reverse().map((m) => ({
    id: m.id,
    direction: m.direction,
    type: m.message_type,
    text: m.text_body ?? null,
    media: m.media_url
      ? {
          url: m.media_url,
          mime: m.media_mime ?? null,
          name: m.media_name ?? null,
          size: m.media_size ?? null
        }
      : null,
    location:
      m.latitude != null && m.longitude != null
        ? { latitude: Number(m.latitude), longitude: Number(m.longitude) }
        : null,
    status: m.status,
    error: m.error_text ?? null,
    time: m.created_at
  }));

  const nextCursor = messages.length ? String(messages[0].id) : null; // first is oldest in this batch
  return res.json({ ok: true, remoteJid, messages, nextCursor });
}

// POST /ui/conversations/read  { sessionKey, peer }
export async function markConversationRead(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64),
    peer: z.string().min(1).max(128)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey;
  const remoteJid = normalizeRemoteJid(parsed.data.peer);

  // ensure chat row exists, then reset unread
  await pool.query(
    `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at)
     VALUES(?, ?, ?, 'private', 0, NOW())
     ON DUPLICATE KEY UPDATE unread_count=0`,
    [tenantId, sessionKey, remoteJid]
  );

  return res.json({ ok: true });
}

/**
 * SSE stream: GET /ui/stream?sessionKey=...&sinceId=...
 * - stable for shared hosting
 * - polling DB every 1s, push new messages
 */
export async function streamSSE(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().optional(),
    sinceId: z.string().optional()
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey ? mustString(parsed.data.sessionKey) : null;
  let lastId = parsed.data.sinceId ? Number(parsed.data.sinceId) : 0;
  if (!Number.isFinite(lastId) || lastId < 0) lastId = 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send("hello", { ok: true, time: new Date().toISOString() });

  const interval = setInterval(async () => {
    try {
      const params: any[] = [tenantId, lastId];
      let sessionSql = "";
      if (sessionKey) {
        sessionSql = " AND session_key=? ";
        params.push(sessionKey);
      }

      const [rows] = await pool.query<any[]>(
        `SELECT id, session_key, remote_jid, direction, message_type, text_body, media_url, status, created_at
         FROM wa_messages
         WHERE tenant_id=? AND id > ? ${sessionSql}
         ORDER BY id ASC
         LIMIT 50`,
        params
      );

      for (const r of rows) {
        lastId = Math.max(lastId, Number(r.id));
        send("message", {
          id: r.id,
          sessionKey: r.session_key,
          remoteJid: r.remote_jid,
          direction: r.direction,
          type: r.message_type,
          text: r.text_body ?? null,
          mediaUrl: r.media_url ?? null,
          status: r.status,
          time: r.created_at
        });
      }

      // keep-alive ping
      send("ping", { lastId, time: Date.now() });
    } catch (e: any) {
      send("error", { message: e?.message || String(e) });
    }
  }, 1000);

  req.on("close", () => {
    clearInterval(interval);
  });
}
