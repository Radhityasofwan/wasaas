import { z } from "zod";
import { pool } from "./db";

// Helper: Normalize Phone Number to JID
function normalizeRemoteJid(peer: string) {
  if (!peer) return peer;
  if (peer.includes("@")) return peer;
  return `${peer}@s.whatsapp.net`;
}

// GET /ui/sessions
export async function listSessions(req: any, res: any) {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT session_key, status, phone_number, created_at
       FROM wa_sessions
       WHERE tenant_id=?
       ORDER BY created_at DESC`,
      [req.auth.tenantId]
    );
    return res.json({ ok: true, sessions: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// GET /ui/conversations?sessionKey=...
export async function listConversations(req: any, res: any) {
  const schema = z.object({ sessionKey: z.string().min(1) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid sessionKey" });

  const { sessionKey } = parsed.data;
  const tenantId = req.auth.tenantId;

  try {
    // Ambil list chat + pesan terakhir
    const [rows] = await pool.query<any[]>(
      `SELECT
          c.remote_jid,
          COALESCE(c.unread_count, 0) as unread_count,
          m.id AS last_msg_id,
          m.direction,
          m.message_type,
          m.text_body,
          m.created_at
       FROM wa_chats c
       LEFT JOIN wa_messages m ON c.remote_jid = m.remote_jid AND m.id = (
          SELECT MAX(id) FROM wa_messages 
          WHERE tenant_id=c.tenant_id AND session_key=c.session_key AND remote_jid=c.remote_jid
       )
       WHERE c.tenant_id=? AND c.session_key=?
       ORDER BY m.id DESC
       LIMIT 100`,
      [tenantId, sessionKey]
    );

    const conversations = rows.map((r) => ({
      chatId: null,
      remoteJid: r.remote_jid,
      unreadCount: Number(r.unread_count),
      lastMessage: r.last_msg_id ? {
        id: r.last_msg_id,
        direction: r.direction,
        type: r.message_type,
        text: r.text_body || `[${r.message_type}]`,
        mediaUrl: null,
        time: r.created_at
      } : null
    }));

    return res.json({ ok: true, conversations });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// GET /ui/messages?sessionKey=...&peer=...
export async function listMessages(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1),
    peer: z.string().min(1),
    limit: z.string().optional()
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Invalid params" });

  const { sessionKey, peer } = parsed.data;
  const remoteJid = normalizeRemoteJid(peer);
  const limit = Number(parsed.data.limit || 50);

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT
          id, direction, message_type, text_body, 
          media_url, media_mime, media_name, media_size,
          latitude, longitude, status, error_text, created_at
       FROM wa_messages
       WHERE tenant_id=? AND session_key=? AND remote_jid=?
       ORDER BY id DESC
       LIMIT ?`,
      [req.auth.tenantId, sessionKey, remoteJid, limit]
    );

    const messages = rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.message_type,
      text: m.text_body,
      media: m.media_url ? {
        url: m.media_url,
        mime: m.media_mime,
        name: m.media_name,
        size: m.media_size
      } : null,
      location: (m.latitude !== null && m.longitude !== null) ? {
        latitude: Number(m.latitude),
        longitude: Number(m.longitude)
      } : null,
      status: m.status,
      error: m.error_text,
      time: m.created_at
    }));

    // Reset unread count
    await pool.query(
      `UPDATE wa_chats SET unread_count=0 WHERE tenant_id=? AND session_key=? AND remote_jid=?`,
      [req.auth.tenantId, sessionKey, remoteJid]
    );

    return res.json({ ok: true, remoteJid, messages });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// POST /ui/conversations/read
export async function markConversationRead(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1),
    peer: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false });

  const remoteJid = normalizeRemoteJid(parsed.data.peer);
  await pool.query(
    `UPDATE wa_chats SET unread_count=0 WHERE tenant_id=? AND session_key=? AND remote_jid=?`,
    [req.auth.tenantId, parsed.data.sessionKey, remoteJid]
  );
  return res.json({ ok: true });
}

// SSE Stream (Realtime Polling)
export async function streamSSE(req: any, res: any) {
  const { sessionKey, sinceId } = req.query;
  const tenantId = req.auth.tenantId;
  let lastId = Number(sinceId || 0);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const send = (evt: string, data: any) => {
    res.write(`event: ${evt}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const interval = setInterval(async () => {
    try {
        const queryParams: any[] = [tenantId, lastId];
        let sql = `SELECT id, session_key, remote_jid, direction, message_type, text_body, media_url, status, created_at 
                   FROM wa_messages WHERE tenant_id=? AND id > ?`;
        
        if (sessionKey) {
            sql += ` AND session_key=?`;
            queryParams.push(sessionKey);
        }
        sql += ` ORDER BY id ASC LIMIT 20`;

        const [rows] = await pool.query<any[]>(sql, queryParams);
        
        for (const r of rows) {
            lastId = Math.max(lastId, r.id);
            send("message", {
                id: r.id,
                sessionKey: r.session_key,
                remoteJid: r.remote_jid,
                direction: r.direction,
                type: r.message_type,
                text: r.text_body,
                mediaUrl: r.media_url,
                status: r.status,
                time: r.created_at
            });
        }
    } catch (e) {
        // silent fail
    }
  }, 1000);

  req.on("close", () => clearInterval(interval));
}