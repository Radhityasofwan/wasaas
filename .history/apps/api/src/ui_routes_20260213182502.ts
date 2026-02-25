import { z } from "zod";
import { pool } from "./db";

// Helper: Pastikan format JID selalu benar
function normalizeRemoteJid(peer: string) {
  if (!peer) return peer;
  if (peer.includes("@")) return peer;
  return `${peer}@s.whatsapp.net`;
}

// GET /ui/sessions
export async function listSessions(req: any, res: any) {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT session_key, status, phone_number 
       FROM wa_sessions 
       WHERE tenant_id=? ORDER BY created_at DESC`,
      [req.auth.tenantId]
    );
    // Inbox.tsx mengharapkan: { session_key, status }
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
    // Query yang dioptimalkan: Mengambil pesan terakhir + counter unread
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

    // Mapping sesuai tipe ConvRow di Inbox.tsx
    const conversations = rows.map((r) => ({
      chatId: null, // Tidak terlalu dipedulikan UI saat ini
      remoteJid: r.remote_jid,
      unreadCount: Number(r.unread_count),
      lastMessage: r.last_msg_id ? {
        id: r.last_msg_id,
        direction: r.direction,
        type: r.message_type,
        text: r.text_body || `[${r.message_type}]`, // Fallback text
        mediaUrl: null, // List view jarang butuh media url
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

    // Mapping sesuai tipe MsgRow di Inbox.tsx
    const messages = rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.message_type,
      text: m.text_body,
      // Penting: Inbox.tsx cek m.media?.url
      media: m.media_url ? {
        url: m.media_url,
        mime: m.media_mime,
        name: m.media_name,
        size: m.media_size
      } : null,
      // Penting: Inbox.tsx cek m.location
      location: (m.latitude !== null && m.longitude !== null) ? {
        latitude: Number(m.latitude),
        longitude: Number(m.longitude),
        name: null // Optional
      } : null,
      status: m.status,
      error: m.error_text,
      time: m.created_at
    }));

    // Reset unread count saat messages diload
    await pool.query(
      `UPDATE wa_chats SET unread_count=0 WHERE tenant_id=? AND session_key=? AND remote_jid=?`,
      [req.auth.tenantId, sessionKey, remoteJid]
    );

    return res.json({ ok: true, remoteJid, messages });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}