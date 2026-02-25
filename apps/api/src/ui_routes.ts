/**
 * ============================================================================
 * UI ROUTES (API ENDPOINTS) - ENTERPRISE EDITION
 * ============================================================================
 * File ini berisi kumpulan endpoint API yang dikonsumsi oleh antarmuka (Frontend)
 * Kotak Masuk (Inbox) untuk menampilkan data percakapan secara Real-Time.
 * * V.6.0 Stable Fixes:
 * - MEMBLOKIR OBROLAN GRUP (@g.us): Semua chat grup difilter dari level SQL
 * sehingga tidak tampil di Inbox, menjadikan aplikasi fokus pada Personal Chat,
 * jauh lebih ringan, dan sangat stabil.
 * - Ekstraksi `pushName` dan `participant` aman.
 * - Validasi Zod yang ketat untuk mencegah SQL Injection.
 * - JSDoc & Interfaces TypeScript untuk memudahkan pemeliharaan kode.
 * - Pagination & Cursor-based fetch untuk `listMessages`.
 * ============================================================================
 */

import { z } from "zod";
import { pool } from "./db";

// ============================================================================
// 1. TYPE DEFINITIONS & INTERFACES
// ============================================================================

/**
 * Struktur data mentah (Raw JSON) bawaan dari Baileys WhatsApp.
 * Digunakan untuk mengekstrak informasi yang tidak disimpan di kolom SQL biasa.
 */
interface RawBaileysMessage {
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
    participant?: string;
  };
  pushName?: string;
  messageTimestamp?: number | string;
  [key: string]: any;
}

/**
 * Representasi Row dari query `listConversations`.
 */
interface ConversationRow {
  chat_id: number | null;
  remote_jid: string;
  unread_count: number | null;
  contact_name: string | null;
  last_message_id: number;
  last_direction: "in" | "out";
  last_type: string;
  last_text: string | null;
  last_media_url: string | null;
  last_time: string;
  last_raw_json: string | object | null;
}

/**
 * Representasi Row dari query `listMessages`.
 */
interface MessageRow {
  id: number;
  direction: "in" | "out";
  message_type: string;
  text_body: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  media_url: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  error_text: string | null;
  created_at: string;
  raw_json: string | object | null;
}

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Memastikan variabel yang diterima adalah string.
 */
function mustString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Membersihkan dan menormalisasi nomor WhatsApp (Remote JID).
 * Mengubah format seperti "62812..." menjadi "62812...@s.whatsapp.net".
 * Jika sudah berupa grup (@g.us) atau format lengkap, biarkan saja.
 * * @param peer - Nomor telepon atau ID Grup
 */
function normalizeRemoteJid(peer: string): string {
  if (!peer) return peer;
  if (peer.includes("@")) return peer;
  return `${peer}@s.whatsapp.net`;
}

/**
 * Ekstraktor JSON yang sangat aman.
 * Menangani string JSON yang mungkin rusak atau objek yang bersarang.
 * * @param rawData - Data raw_json dari database
 */
function safeParseRawJson(rawData: string | object | null): RawBaileysMessage | null {
  if (!rawData) return null;
  if (typeof rawData === "object") return rawData as RawBaileysMessage;
  
  try {
    return JSON.parse(rawData) as RawBaileysMessage;
  } catch (err) {
    console.warn("Gagal mem-parsing raw_json di ui_routes:", err);
    return null;
  }
}

// ============================================================================
// 3. API ENDPOINTS EXPORTS
// ============================================================================

/**
 * GET /ui/sessions
 * Mengembalikan daftar sesi Baileys yang aktif untuk penyewa (Tenant) saat ini.
 */
export async function listSessions(req: any, res: any) {
  try {
    // Mengambil id, sesi, dan status dari sesi yang bersangkutan
    const [rows] = await pool.query<any[]>(
      `SELECT id, tenant_id, session_key, status, created_at, updated_at
       FROM wa_sessions
       WHERE tenant_id = ?
       ORDER BY id DESC`,
      [req.auth.tenantId]
    );

    return res.json({ ok: true, sessions: rows });
  } catch (error: any) {
    console.error("[listSessions] Error:", error);
    return res.status(500).json({ ok: false, error: "Gagal mengambil daftar sesi" });
  }
}

/**
 * GET /ui/conversations?sessionKey=...
 * Endpoint kritis: Menarik daftar sidebar kotak masuk (Inbox).
 * FIX PENTING: Grup WA (@g.us) kini diblokir total dari query ini.
 */
export async function listConversations(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64)
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey;

  try {
    /**
     * Strategi Query SQL:
     * 1. Subquery `lm` (Last Message) mencari ID pesan terbesar per `remote_jid`.
     * 2. MENGABAIKAN SELURUH GRUP: `AND remote_jid NOT LIKE '%@g.us'`
     * 3. JOIN dengan tabel `wa_messages` `m` untuk mendapatkan isi pesannya.
     * 4. LEFT JOIN dengan `wa_chats` `c` untuk mengambil `unread_count`.
     * 5. LEFT JOIN dengan `wa_contacts` `cont` untuk mengambil nama kontak.
     */
    const [rows] = await pool.query<ConversationRow[] & any[]>(
      `SELECT
          c.id AS chat_id,
          lm.remote_jid,
          c.unread_count,
          cont.display_name AS contact_name,
          m.id AS last_message_id,
          m.direction AS last_direction,
          m.message_type AS last_type,
          m.text_body AS last_text,
          m.media_url AS last_media_url,
          m.created_at AS last_time,
          m.raw_json AS last_raw_json
       FROM (
          SELECT remote_jid, MAX(id) AS last_id
          FROM wa_messages
          WHERE tenant_id = ? 
            AND session_key = ? 
            AND remote_jid NOT LIKE '%@g.us'
          GROUP BY remote_jid
       ) lm
       JOIN wa_messages m ON m.id = lm.last_id
       LEFT JOIN wa_chats c
         ON c.tenant_id = ? AND c.session_key = ? AND c.remote_jid = lm.remote_jid
       LEFT JOIN wa_contacts cont
         ON cont.tenant_id = ? AND cont.session_key = ? AND cont.jid = lm.remote_jid
       ORDER BY m.id DESC
       LIMIT 500`,
      [tenantId, sessionKey, tenantId, sessionKey, tenantId, sessionKey]
    );

    const conversations = rows.map((r) => {
      // Ekstraksi PushName dari JSON Mentah
      let pushName = null;
      if (r.last_raw_json) {
        const rawParsed = safeParseRawJson(r.last_raw_json);
        if (rawParsed && rawParsed.pushName) {
          pushName = rawParsed.pushName;
        }
      }

      return {
        chatId: r.chat_id ?? null,
        remoteJid: r.remote_jid,
        name: r.contact_name ?? null, 
        unreadCount: Number(r.unread_count ?? 0),
        lastMessage: {
          id: r.last_message_id,
          direction: r.last_direction,
          type: r.last_type,
          text: r.last_text ?? null,
          mediaUrl: r.last_media_url ?? null,
          time: r.last_time,
          pushName: pushName 
        }
      };
    });

    return res.json({ ok: true, conversations });
  } catch (error: any) {
    console.error("[listConversations] Database Error:", error);
    return res.status(500).json({ ok: false, error: "Gagal memuat percakapan" });
  }
}

/**
 * GET /ui/messages?sessionKey=...&peer=...&cursor=...&limit=...
 * Menarik riwayat gelembung obrolan untuk suatu kontak spesifik.
 * Menggunakan sistem kursor agar bisa melakukan infinite scrolling (tarik pesan lama).
 */
export async function listMessages(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64),
    peer: z.string().min(1).max(128),
    cursor: z.string().optional(), // ID Pesan sebagai patokan untuk memuat pesan yang lebih tua
    limit: z.string().optional()
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey;
  const remoteJid = normalizeRemoteJid(parsed.data.peer);

  // Pembatasan limit pagination yang rasional
  const limit = Math.max(1, Math.min(Number(parsed.data.limit || 50), 200));
  const cursorId = parsed.data.cursor ? Number(parsed.data.cursor) : null;

  const params: any[] = [tenantId, sessionKey, remoteJid];
  let cursorSql = "";
  
  if (cursorId && Number.isFinite(cursorId)) {
    cursorSql = " AND id < ? ";
    params.push(cursorId);
  }
  params.push(limit);

  try {
    const [rows] = await pool.query<MessageRow[] & any[]>(
      `SELECT
          id, direction, message_type, text_body, media_mime, media_name, media_size, media_url,
          latitude, longitude, status, error_text, created_at, raw_json
       FROM wa_messages
       WHERE tenant_id = ? AND session_key = ? AND remote_jid = ? ${cursorSql}
       ORDER BY id DESC
       LIMIT ?`,
      params
    );

    // Reversal array agar urutan kronologisnya benar untuk UI (Lama -> Baru)
    const messages = rows.reverse().map((m) => {
      let participant = null;
      let pushName = null;
      
      if (m.raw_json) {
        const rawParsed = safeParseRawJson(m.raw_json);
        if (rawParsed) {
          participant = rawParsed.key?.participant || null;
          pushName = rawParsed.pushName || null;
        }
      }

      return {
        id: m.id,
        direction: m.direction,
        type: m.message_type,
        text: m.text_body ?? null,
        media: m.media_url ? { 
          url: m.media_url, 
          mime: m.media_mime ?? null, 
          name: m.media_name ?? null, 
          size: m.media_size ?? null 
        } : null,
        location: m.latitude != null && m.longitude != null ? { 
          latitude: Number(m.latitude), 
          longitude: Number(m.longitude) 
        } : null,
        status: m.status,
        error: m.error_text ?? null,
        time: m.created_at,
        participant, 
        pushName     
      };
    });

    const nextCursor = messages.length ? String(messages[0].id) : null; 
    return res.json({ ok: true, remoteJid, messages, nextCursor });
  } catch (error: any) {
    console.error("[listMessages] Error fetching messages:", error);
    return res.status(500).json({ ok: false, error: "Gagal menarik daftar pesan" });
  }
}

/**
 * POST /ui/conversations/read
 * Menandai percakapan sebagai telah dibaca (mereset unread_count menjadi 0).
 */
export async function markConversationRead(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64),
    peer: z.string().min(1).max(128)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey;
  const remoteJid = normalizeRemoteJid(parsed.data.peer);

  try {
    // Memastikan baris chat eksis. Jika ada, reset hitungan unread-nya.
    await pool.query(
      `INSERT INTO wa_chats(tenant_id, session_key, remote_jid, chat_type, unread_count, last_message_at)
       VALUES(?, ?, ?, 'private', 0, NOW())
       ON DUPLICATE KEY UPDATE unread_count = 0`,
      [tenantId, sessionKey, remoteJid]
    );

    return res.json({ ok: true });
  } catch (error: any) {
    console.error("[markConversationRead] Error:", error);
    return res.status(500).json({ ok: false, error: "Gagal menandai telah dibaca" });
  }
}

/**
 * POST /ui/conversations/delete
 * Endpoint untuk Bulk Delete (Menghapus banyak percakapan sekaligus dari database).
 */
export async function deleteConversations(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(1).max(64),
    peers: z.array(z.string()).min(1) // Membutuhkan minimal 1 kontak target
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const tenantId = req.auth.tenantId;
  const { sessionKey, peers } = parsed.data;

  try {
    // Format JID seluruh peer
    const normalizedPeers = peers.map((p: string) => normalizeRemoteJid(p));
    
    if (normalizedPeers.length === 0) {
      return res.json({ ok: true });
    }

    // Pembuatan query dinamis (?, ?, ?) untuk clause IN SQL
    const placeholders = normalizedPeers.map(() => '?').join(',');
    const queryParams = [tenantId, sessionKey, ...normalizedPeers];

    // 1. Hapus dari daftar chat / kontak sidebar
    await pool.query(
      `DELETE FROM wa_chats 
       WHERE tenant_id = ? AND session_key = ? AND remote_jid IN (${placeholders})`,
      queryParams
    );

    // 2. Hapus detail riwayat pesan secara total (Kaskade manual)
    await pool.query(
      `DELETE FROM wa_messages 
       WHERE tenant_id = ? AND session_key = ? AND remote_jid IN (${placeholders})`,
      queryParams
    );

    return res.json({ ok: true, deleted_count: normalizedPeers.length });
  } catch (error: any) {
    console.error("[deleteConversations] Error executing bulk delete:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

/**
 * GET /ui/stream?sessionKey=...&sinceId=...
 * Sistem Server-Sent Events (SSE) untuk memberikan streaming data ringan ke client.
 * FIX: Menambahkan blokir @g.us agar notifikasi grup tidak bocor ke koneksi stream.
 */
export async function streamSSE(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().optional(),
    sinceId: z.string().optional()
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const tenantId = req.auth.tenantId;
  const sessionKey = parsed.data.sessionKey ? mustString(parsed.data.sessionKey) : null;
  let lastId = parsed.data.sinceId ? Number(parsed.data.sinceId) : 0;
  
  if (!Number.isFinite(lastId) || lastId < 0) {
    lastId = 0;
  }

  // Mengatur headers untuk mempertahankan koneksi HTTP terus terbuka
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive"
  });

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Pesan inisialisasi Handshake
  send("hello", { ok: true, time: new Date().toISOString(), message: "SSE Connection Established" });

  // Melakukan interval polling (Setiap 1 Detik)
  const interval = setInterval(async () => {
    try {
      const params: any[] = [tenantId, lastId];
      let sessionSql = "";
      
      if (sessionKey) {
        sessionSql = " AND session_key = ? ";
        params.push(sessionKey);
      }

      // Menarik data pesan terbaru dengan memfilter grup secara mutlak
      const [rows] = await pool.query<any[]>(
        `SELECT id, session_key, remote_jid, direction, message_type, text_body, media_url, status, created_at
         FROM wa_messages
         WHERE tenant_id = ? 
           AND id > ? 
           AND remote_jid NOT LIKE '%@g.us'
           ${sessionSql}
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

      // Sinyal detak jantung (Heartbeat) menjaga agar proxy/load balancer tidak mematikan koneksi idle
      send("ping", { lastId, time: Date.now() });
    } catch (e: any) {
      console.error("[streamSSE] Polling Loop Error:", e);
      send("error", { message: e?.message || String(e) });
    }
  }, 1000);

  // Bersihkan memori dan listener ketika klien memutuskan koneksi (Tutup Tab / Refresh)
  req.on("close", () => {
    clearInterval(interval);
  });
}