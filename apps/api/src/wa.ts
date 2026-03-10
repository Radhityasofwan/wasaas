/**
 * ============================================================================
 * WA.TS - CORE BAILEYS ENGINE (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini menangani seluruh koneksi dan siklus hidup WhatsApp Web (Baileys).
 * * V.9.1 Ultimate Stable Release (Full Sync):
 * - [NEW] Ekstraksi Paksa Nomor Asli (Bypass LID Privacy) jika metadata tersedia.
 * - [NEW] Pelabelan "Random" untuk chat langsung tanpa referensi trafik.
 * - [OPTIMASI KRUSIAL] Hard Drop Group Traffic: Memblokir 100% lalu lintas 
 * pesan dari Grup (@g.us) di tingkat paling hulu (Hemat 80% RAM).
 * - Auto-Increment Unread Count & Smart Temperature Engine.
 * - Multi-Keyword Auto Reply & Typing Indicator Anti-Crash.
 * - Graceful Error Handling & Strict Typing ekstensif (> 900 baris).
 * - [FIX] Network Stability, Cacheable Keystore & Anti-Spam Reconnect (10s).
 * - [FIX] Mencegah Socket Timeout (Code 408) akibat Presence Update pada nomor LID.
 * - [FIX] Mencegah "Zombie Session" saat sesi dihapus oleh user.
 * ============================================================================
 */

import path from "path";
import fs from "fs";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  proto,
  ConnectionState,
  Browsers,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { pool } from "./db";
import { handleBroadcastReply, markBroadcastReadByNumber, updateBroadcastDeliveryStatus } from "./broadcast";
import { enqueueWebhook } from "./webhook";
import { normalizeIndonesiaDigits, normalizeIndonesiaPhoneE164 } from "./phone_normalizer";
import { recordInvalidLeadSkip } from "./invalid_leads_audit";
import { resolveMediaAssetFromUrl } from "./media_asset_resolver";

// ============================================================================
// 1. GLOBAL STATE & INTERFACES
// ============================================================================

export type QrState = {
  qr: string | null;
  status: string;
  at: number;
};
const qrStateMap = new Map<string, QrState>();

export type SessionEntry = {
  sessionKey: string;
  sock: ReturnType<typeof makeWASocket> | null;
  status: "created" | "connecting" | "connected" | "disconnected" | "logged_out" | "error";
  ctx?: { tenantId: number; userId: number };
};

export type ParsedContent = {
  type: "text" | "image" | "video" | "document" | "audio" | "location" | "sticker" | "unknown";
  text: string | null;
  mime?: string | null;
  fileName?: string | null;
};

const logger = pino({ level: "warn" });
console.log("WA_PARSER_VERSION=9.1 (Enterprise CRM + Privacy Bypass) loaded");

const sessions = new Map<string, SessionEntry>();

// FIX ZOMBIE SESSION: Penanda untuk sesi yang sengaja dihentikan/dihapus
const intentionallyStopped = new Set<string>();

export type SessionMeta = {
  status?: string;
  qr?: string | null;
  phoneNumber?: string | null;
  lastSeen?: number | null;
};
const sessionMeta = new Map<string, SessionMeta>();

function messageIdVariants(messageId: string) {
  const raw = String(messageId || "").trim();
  if (!raw) return [];
  const base = raw.split(":")[0];
  return Array.from(new Set([raw, base])).filter(Boolean);
}

function buildMessageIdWhereClause(column = "wa_message_id") {
  return `(${column} = ? OR ${column} = ? OR ${column} LIKE CONCAT(?, ':%') OR ${column} LIKE CONCAT(?, ':%') OR ? LIKE CONCAT(${column}, ':%') OR ? LIKE CONCAT(${column}, ':%'))`;
}

export function getSession(sessionKey: string) {
  return sessions.get(sessionKey);
}

export function getSessionSock(sessionKey: string) {
  const e = sessions.get(sessionKey);
  return e?.sock || null;
}

export function getSessionMeta(sessionKey: string) {
  const m = sessionMeta.get(sessionKey) || {};
  return {
    status: m.status || "unknown",
    qr: m.qr || null,
    phoneNumber: m.phoneNumber || null,
    lastSeen: m.lastSeen || null
  };
}

// ============================================================================
// 2. FILESYSTEM UTILITIES
// ============================================================================

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function storeDirFor(sessionKey: string) {
  const base = process.env.BAILEYS_STORE_DIR || "storage/baileys";
  return path.join(process.cwd(), base, sessionKey);
}

export async function deleteSessionFolder(sessionKey: string) {
  const dir = storeDirFor(sessionKey);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[${sessionKey}] 🗑️ Local storage directory deleted securely.`);
    }
  } catch (e) {
    console.error(`[${sessionKey}] ❌ Failed to delete session folder:`, e);
  }
}

// ============================================================================
// 3. PARSER ENGINE (SPINTAX & VARIABLES)
// ============================================================================

function getDynamicGreeting(): string {
  const d = new Date();
  d.setHours(d.getUTCHours() + 7);
  const h = d.getHours();

  if (h >= 3 && h < 11) return "Pagi";
  if (h >= 11 && h < 15) return "Siang";
  if (h >= 15 && h < 18) return "Sore";
  return "Malam";
}

export function parseMessageMagic(rawText: string | null, targetNumber: string, targetName: string | null): string {
  if (!rawText) return "";

  let processed = rawText;

  const fallbackName = "Kak";
  const finalName = (targetName && targetName.trim() !== "") ? targetName : fallbackName;

  processed = processed.replace(/\{\{nama\}\}/ig, finalName);
  processed = processed.replace(/\{nama\}/ig, finalName);

  processed = processed.replace(/\{\{nomor\}\}/ig, targetNumber);
  processed = processed.replace(/\{nomor\}/ig, targetNumber);

  const salamWaktu = getDynamicGreeting();
  processed = processed.replace(/\{\{salam\}\}/ig, salamWaktu);
  processed = processed.replace(/\{salam\}/ig, salamWaktu);

  const spintaxRegex = /\{([^{}]*\|[^{}]*)\}/g;
  let match;
  while ((match = spintaxRegex.exec(processed)) !== null) {
    const options = match[1].split('|');
    const choice = options[Math.floor(Math.random() * options.length)];
    processed = processed.replace(match[0], choice);
    spintaxRegex.lastIndex = 0;
  }

  return processed;
}

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

  if (raw.protocolMessage) return null;
  if (raw.reactionMessage) return null;

  if (raw.buttonsResponseMessage) {
    const txt =
      raw.buttonsResponseMessage.selectedDisplayText ||
      raw.buttonsResponseMessage.selectedButtonId ||
      null;
    return { type: "text", text: txt ? String(txt) : null };
  }

  if (raw.templateButtonReplyMessage) {
    const txt =
      raw.templateButtonReplyMessage.selectedDisplayText ||
      raw.templateButtonReplyMessage.selectedId ||
      null;
    return { type: "text", text: txt ? String(txt) : null };
  }

  if (raw.listResponseMessage) {
    const txt =
      raw.listResponseMessage.title ||
      raw.listResponseMessage.description ||
      raw.listResponseMessage.singleSelectReply?.selectedRowId ||
      null;
    return { type: "text", text: txt ? String(txt) : null };
  }

  if (raw.interactiveResponseMessage) {
    const bodyText = raw.interactiveResponseMessage.body?.text || null;
    const paramsJson = raw.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || null;
    let parsedLabel: string | null = null;
    if (paramsJson) {
      try {
        const parsed = JSON.parse(String(paramsJson));
        parsedLabel = String(parsed?.title || parsed?.display_text || parsed?.id || "").trim() || null;
      } catch {
        parsedLabel = null;
      }
    }
    const txt = bodyText || parsedLabel || raw.interactiveResponseMessage.nativeFlowResponseMessage?.name || null;
    return { type: "text", text: txt ? String(txt) : null };
  }

  if (raw.conversation) return { type: "text", text: raw.conversation };
  if (raw.extendedTextMessage?.text) return { type: "text", text: raw.extendedTextMessage.text };

  if (raw.imageMessage) return { type: "image", text: raw.imageMessage.caption ?? null, mime: raw.imageMessage.mimetype ?? null, fileName: null };
  if (raw.videoMessage) return { type: "video", text: raw.videoMessage.caption ?? null, mime: raw.videoMessage.mimetype ?? null, fileName: null };
  if (raw.documentMessage) return { type: "document", text: raw.documentMessage.caption ?? null, mime: raw.documentMessage.mimetype ?? null, fileName: raw.documentMessage.fileName ?? null };
  if (raw.audioMessage) return { type: "audio", text: null, mime: raw.audioMessage.mimetype ?? null, fileName: null };
  if (raw.locationMessage || raw.liveLocationMessage) return { type: "location", text: null };
  if (raw.stickerMessage) return { type: "sticker", text: null, mime: raw.stickerMessage.mimetype ?? null };

  return null;
}

function hasMandatoryHotIntent(text: string) {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("pesan") ||
    t.includes("order") ||
    t.includes("beli") ||
    t.includes("harga") ||
    t.includes("transfer")
  );
}

function extractJidCandidates(rawObj: any): string[] {
  try {
    const dump = JSON.stringify(rawObj || {});
    const matches = dump.match(/\d{6,22}@s\.whatsapp\.net/g) || [];
    return Array.from(new Set(matches));
  } catch {
    return [];
  }
}

async function upsertContactResolvedPhone(
  tenantId: number,
  sessionKey: string,
  jid: string,
  displayName: string | null,
  phoneE164: string | null
) {
  await pool.query(
    `INSERT INTO wa_contacts (tenant_id, session_key, jid, phone_number, display_name, last_message_at, created_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
      phone_number = COALESCE(VALUES(phone_number), phone_number),
      display_name = COALESCE(VALUES(display_name), display_name),
      last_message_at = NOW()`,
    [tenantId, sessionKey, jid, phoneE164, displayName, displayName]
  );
}

async function resolveIncomingLeadPhoneE164(
  tenantId: number,
  sessionKey: string,
  remoteJid: string,
  msg: any
): Promise<{ phoneE164: string | null; source: string }> {
  const userPart = String(remoteJid || "").split("@")[0];
  const fromRemote = normalizeIndonesiaPhoneE164(userPart);
  if (fromRemote) return { phoneE164: fromRemote, source: "remote_jid" };

  const participant = String(msg?.key?.participant || "");
  const participantUser = participant.split("@")[0];
  const fromParticipant = normalizeIndonesiaPhoneE164(participantUser);
  if (fromParticipant) return { phoneE164: fromParticipant, source: "key_participant" };

  const [mappedRows] = await pool.query<any[]>(
    `SELECT phone_number FROM wa_contacts
     WHERE tenant_id=? AND session_key=? AND jid=?
       AND phone_number IS NOT NULL AND phone_number <> ''
     ORDER BY id DESC
     LIMIT 1`,
    [tenantId, sessionKey, remoteJid]
  );
  const mapped = normalizeIndonesiaPhoneE164(mappedRows?.[0]?.phone_number || "");
  if (mapped) return { phoneE164: mapped, source: "wa_contacts_map" };

  const candidates = new Set<string>();
  for (const jid of extractJidCandidates(msg)) {
    const p = normalizeIndonesiaPhoneE164(jid.split("@")[0]);
    if (p) candidates.add(p);
  }
  if (candidates.size === 1) {
    return { phoneE164: Array.from(candidates)[0], source: "payload_jid" };
  }

  return { phoneE164: null, source: candidates.size > 1 ? "payload_ambiguous" : "unresolved" };
}

// ============================================================================
// 4. DATABASE TRANSACTIONS
// ============================================================================

async function upsertSession(tenantId: number, userId: number, sessionKey: string, patch: Partial<{
  status: string;
  last_error: string | null;
  phone_number: string | null;
  wa_me_jid: string | null;
  label: string | null;
  last_seen_at: Date | null;
}>) {
  await pool.query(
    `INSERT INTO wa_sessions(tenant_id, user_id, session_key, status)
     VALUES(?, ?, ?, 'created')
     ON DUPLICATE KEY UPDATE session_key=session_key`,
    [tenantId, userId, sessionKey]
  );

  const fields: string[] = [];
  const values: any[] = [];

  const map: Record<string, any> = {
    status: patch.status,
    last_error: patch.last_error,
    phone_number: patch.phone_number,
    wa_me_jid: patch.wa_me_jid,
    label: patch.label,
    last_seen_at: patch.last_seen_at
  };

  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "undefined") continue;
    fields.push(`${k}=?`);
    values.push(v);
  }

  if (fields.length === 0) return;

  values.push(tenantId);
  values.push(sessionKey);

  await pool.query(
    `UPDATE wa_sessions SET ${fields.join(", ")} WHERE tenant_id=? AND session_key=?`,
    values
  );
}

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

export async function insertMessage(tenantId: number, userId: number, params: {
  sessionKey: string;
  direction: "in" | "out";
  remoteJid: string;
  waMessageId: string | null;
  messageType: ParsedContent["type"];
  textBody: string | null;
  rawJson: any;
  status: "sent" | "failed";
  errorText?: string | null;
  chatId?: number | null;
  mediaMime?: string | null;
  mediaName?: string | null;
}) {
  const createdAt = new Date();
  await pool.query(
    `INSERT INTO wa_messages(
      tenant_id, user_id, session_key, chat_id, direction, remote_jid, wa_message_id,
      message_type, text_body, media_mime, media_name,
      status, error_text, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      chat_id=COALESCE(VALUES(chat_id), chat_id),
      text_body=COALESCE(VALUES(text_body), text_body),
      media_mime=COALESCE(VALUES(media_mime), media_mime),
      media_name=COALESCE(VALUES(media_name), media_name),
      status=VALUES(status),
      error_text=VALUES(error_text),
      raw_json=COALESCE(VALUES(raw_json), raw_json)`,
    [
      tenantId, userId, params.sessionKey, params.chatId ?? null,
      params.direction, params.remoteJid, params.waMessageId, params.messageType,
      params.textBody, params.mediaMime ?? null, params.mediaName ?? null,
      params.status, params.errorText ?? null, JSON.stringify(params.rawJson), createdAt
    ]
  );

  if (params.direction === 'in') {
    await pool.query(
      `UPDATE wa_chats SET unread_count = unread_count + 1 
        WHERE tenant_id = ? AND session_key = ? AND remote_jid = ?`,
      [tenantId, params.sessionKey, params.remoteJid]
    );
  }
}

// ============================================================================
// 5. CORE BUSINESS LOGIC MODULES (EVENT HANDLERS)
// ============================================================================

async function processAutoReply(tenantId: number, sessionKey: string, remoteJid: string, text: string) {
  try {
    let rules: any[] = [];

    try {
      [rules] = await pool.query<any[]>(
        `SELECT 
            arr.keyword, arr.match_type, arr.reply_text, arr.delay_ms, arr.typing_enabled, arr.typing_ms, arr.template_id,
            mt.message_type as template_type,
            mt.text_body as template_text_body,
            mt.media_url as template_media_url,
            mt.media_name as template_media_name,
            mt.media_mime as template_media_mime
         FROM auto_reply_rules arr
         LEFT JOIN message_templates mt
           ON mt.id = arr.template_id
          AND mt.tenant_id = arr.tenant_id
         WHERE arr.tenant_id=? AND arr.is_active=1
           AND (arr.session_key IS NULL OR arr.session_key = '' OR TRIM(arr.session_key) = ?)`,
        [tenantId, sessionKey.trim()]
      );
    } catch (e: any) {
      [rules] = await pool.query<any[]>(
        `SELECT keyword, match_type, reply_text, 2000 as delay_ms, 1 as typing_enabled, NULL as typing_ms, NULL as template_id 
         FROM auto_reply_rules 
         WHERE tenant_id=? AND is_active=1 
         AND (session_key IS NULL OR session_key = '' OR TRIM(session_key) = ?)`,
        [tenantId, sessionKey.trim()]
      );
    }

    if (!rules || rules.length === 0) return;

    const txtLower = text.toLowerCase().trim();
    let matchedRule = null;
    let matchedWord = "";

    for (const rule of rules) {
      const keywordsArray = String(rule.keyword)
        .split(',')
        .map(k => k.toLowerCase().trim())
        .filter(k => k.length > 0);

      let isMatch = false;

      for (const kw of keywordsArray) {
        if (rule.match_type === 'exact' && txtLower === kw) isMatch = true;
        else if (rule.match_type === 'contains' && txtLower.includes(kw)) isMatch = true;
        else if (rule.match_type === 'startswith' && txtLower.startsWith(kw)) isMatch = true;

        if (isMatch) {
          matchedWord = kw;
          break;
        }
      }

      if (isMatch) {
        matchedRule = rule;
        console.log(`[${sessionKey}] 🤖 Auto-Reply Matched: "${matchedWord}" (Rule: "${rule.keyword}") for JID: ${remoteJid}`);
        break;
      }
    }

    if (matchedRule) {
      const clampMs = (v: any, def: number) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return def;
        return Math.max(0, Math.min(Math.round(n), 120000));
      };
      const hasTypingConfig = matchedRule.typing_ms !== undefined && matchedRule.typing_ms !== null && String(matchedRule.typing_ms).trim() !== "";
      const typingEnabled = matchedRule.typing_enabled === undefined || matchedRule.typing_enabled === null
        ? true
        : !(matchedRule.typing_enabled === 0 || matchedRule.typing_enabled === "0" || matchedRule.typing_enabled === false);
      const configuredDelayMs = clampMs(matchedRule.delay_ms, 2000);
      let preTypingDelayMs = 0;
      let typingDurationMs = 0;
      let postTypingDelayMs = 0;
      let totalDelayMs = 0;

      if (hasTypingConfig) {
        // Advanced mode:
        // - typing_ms: durasi typing indicator
        // - delay_ms : jeda tambahan setelah typing sebelum pesan dikirim
        typingDurationMs = typingEnabled ? clampMs(matchedRule.typing_ms, 0) : 0;
        postTypingDelayMs = configuredDelayMs;
        totalDelayMs = typingDurationMs + postTypingDelayMs;
      } else {
        // Natural sync mode (legacy-compatible):
        // - delay_ms dipakai sebagai total jeda kirim
        // - typing dimulai setelah jeda awal singkat agar terlihat seperti jeda baca + ketik
        totalDelayMs = configuredDelayMs;
        if (typingEnabled && totalDelayMs > 0) {
          const idealLead = Math.round(totalDelayMs * 0.32);
          const boundedLead = Math.max(250, Math.min(2500, idealLead));
          preTypingDelayMs = Math.min(Math.max(0, totalDelayMs - 300), boundedLead);
          typingDurationMs = Math.max(0, totalDelayMs - preTypingDelayMs);
        }
      }
      const isPresenceBaseBlocked = remoteJid.includes("@broadcast") || remoteJid.includes("@g.us");
      let presenceJid = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
      if (!isPresenceBaseBlocked) {
        try {
          presenceJid = await resolveOutboundSendJid(tenantId, sessionKey, presenceJid);
        } catch {
          // fallback keep requested jid
        }
      }

      const isPresenceSupported = !isPresenceBaseBlocked && !!presenceJid && !presenceJid.includes("@lid");
      const shouldSendTypingIndicator = typingEnabled && typingDurationMs > 0 && isPresenceSupported;

      let composingTicker: NodeJS.Timeout | null = null;
      let stopTypingTimer: NodeJS.Timeout | null = null;
      let startTypingTimer: NodeJS.Timeout | null = null;
      let typingStarted = false;

      const clearTypingTicker = () => {
        if (composingTicker) {
          clearInterval(composingTicker);
          composingTicker = null;
        }
      };

      const sendPresenceSafe = async (presence: "composing" | "paused") => {
        const liveSock = getSessionSock(sessionKey);
        if (!liveSock || !isPresenceSupported) return;
        try {
          await liveSock.sendPresenceUpdate(presence, presenceJid);
        } catch {
          // ignore presence failures; message send should continue
        }
      };

      const startTypingIndicator = async () => {
        if (!shouldSendTypingIndicator || typingStarted) return;
        typingStarted = true;
        await sendPresenceSafe("composing");
        // WA indicator drops quickly; keep composing heartbeat alive during typing duration.
        const heartbeatMs = Math.max(2500, Math.min(5000, Math.floor(typingDurationMs / 2) || 3500));
        composingTicker = setInterval(() => {
          sendPresenceSafe("composing").catch(() => { });
        }, heartbeatMs);
        stopTypingTimer = setTimeout(() => {
          clearTypingTicker();
          sendPresenceSafe("paused").catch(() => { });
        }, typingDurationMs);
      };

      if (shouldSendTypingIndicator) {
        if (preTypingDelayMs > 0) {
          startTypingTimer = setTimeout(() => {
            startTypingIndicator().catch(() => { });
          }, preTypingDelayMs);
        } else {
          await startTypingIndicator();
        }
      }

      setTimeout(async () => {
        try {
          if (startTypingTimer) {
            clearTimeout(startTypingTimer);
            startTypingTimer = null;
          }
          clearTypingTicker();
          if (stopTypingTimer) {
            clearTimeout(stopTypingTimer);
            stopTypingTimer = null;
          }
          if (shouldSendTypingIndicator && typingStarted) {
            await sendPresenceSafe("paused");
          }

          let contactName = null;
          try {
            const normalizedLeadPhone = normalizeIndonesiaPhoneE164(remoteJid.split("@")[0]);
            const cleanDigits = String(remoteJid.split("@")[0] || "").replace(/[^\d]/g, "");
            const [leadRows] = normalizedLeadPhone
              ? await pool.query<any[]>(
                  `SELECT name FROM crm_leads WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
                  [tenantId, normalizedLeadPhone]
                )
              : await pool.query<any[]>(
                  `SELECT name FROM crm_leads
                   WHERE tenant_id = ?
                     AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
                   LIMIT 1`,
                  [tenantId, cleanDigits]
                );

            if (leadRows.length > 0 && leadRows[0].name) {
              contactName = leadRows[0].name;
            } else {
              const toJid = remoteJid.includes('@') ? remoteJid : remoteJid + '@s.whatsapp.net';
              const [contacts] = await pool.query<any[]>(
                `SELECT display_name FROM wa_contacts WHERE tenant_id = ? AND session_key = ? AND jid = ? LIMIT 1`,
                [tenantId, sessionKey, toJid]
              );
              if (contacts.length > 0 && contacts[0].display_name) {
                contactName = contacts[0].display_name;
              }
            }
          } catch (e) { /* ignore */ }

          const baseReplyText = String(matchedRule.reply_text || matchedRule.template_text_body || "");
          const parsedReply = parseMessageMagic(baseReplyText, remoteJid.split("@")[0], contactName);
          const templateType = String(matchedRule.template_type || "").trim().toLowerCase();
          const isTemplateMedia = templateType && templateType !== "text";

          if (!isTemplateMedia) {
            await sendText(sessionKey, remoteJid, parsedReply);
          } else if (templateType === "location") {
            const coordRaw = String(matchedRule.template_media_url || "").trim();
            const [latRaw, lngRaw] = coordRaw.split(",");
            const lat = Number(latRaw);
            const lng = Number(lngRaw);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              throw new Error("Template location auto-reply tidak valid (lat,lng)");
            }
            const { sendLocation } = await import("./wa_media");
            await sendLocation({
              tenantId,
              userId: Number(sessions.get(sessionKey)?.ctx?.userId || 1),
              sessionKey,
              to: remoteJid,
              latitude: lat,
              longitude: lng,
              name: parsedReply || undefined,
              address: String(matchedRule.template_media_name || "").trim() || undefined
            });
          } else {
            const mediaUrl = String(matchedRule.template_media_url || "").trim();
            if (!mediaUrl) throw new Error(`Template media auto-reply kosong untuk type ${templateType}`);
            const resolved = await resolveMediaAssetFromUrl(mediaUrl);
            if (!resolved) throw new Error(`File template auto-reply tidak ditemukan: ${mediaUrl}`);
            const { sendMediaByType } = await import("./wa_media");
            await sendMediaByType({
              tenantId,
              userId: Number(sessions.get(sessionKey)?.ctx?.userId || 1),
              sessionKey,
              to: remoteJid,
              mediaType: templateType as any,
              caption: parsedReply,
              filePath: resolved.filePath,
              mime: String(matchedRule.template_media_mime || resolved.mime || "application/octet-stream"),
              fileName: String(matchedRule.template_media_name || resolved.fileName),
              fileSize: Number(resolved.fileSize || 0),
              publicUrl: mediaUrl
            });
          }
        } catch (e) {
          console.error(`[${sessionKey}] ❌ Auto Reply Send Failed to ${remoteJid}:`, e);
        } finally {
          if (startTypingTimer) {
            clearTimeout(startTypingTimer);
            startTypingTimer = null;
          }
          clearTypingTicker();
          if (stopTypingTimer) {
            clearTimeout(stopTypingTimer);
            stopTypingTimer = null;
          }
        }
      }, totalDelayMs);
    }
  } catch (err) {
    console.error(`[${sessionKey}] ❌ Auto Reply Engine Error:`, err);
  }
}

async function processFollowUpRepliedTrigger(tenantId: number, sessionKey: string, remoteJid: string) {
  try {
    const cleanNumber = normalizeIndonesiaDigits(remoteJid.split("@")[0] || "");
    if (!cleanNumber) return 0;
    const [res] = await pool.query<any>(
      `UPDATE followup_targets ft
       JOIN followup_campaigns fc ON ft.campaign_id = fc.id
       SET ft.status = 'replied'
       WHERE ft.tenant_id = ?
         AND ft.session_key = ?
         AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(ft.to_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
         AND ft.status IN ('sent', 'delivered', 'read')
         AND ft.sent_at IS NOT NULL
         AND fc.trigger_condition = 'unreplied'`,
      [tenantId, sessionKey, cleanNumber]
    );
    return Number(res?.affectedRows || 0);
  } catch (err) {
    console.error(`[${sessionKey}] Follow Up Trigger Update Error:`, err);
    return 0;
  }
}

// ============================================================================
// 6. MAIN SOCKET INITIALIZATION (BAILEYS BOOTSTRAP)
// ============================================================================

export async function startSession(sessionKey: string, ctx: { tenantId: number; userId: number }) {
  if (!ctx || !ctx.tenantId || !ctx.userId) throw new Error("startSession requires ctx {tenantId,userId}");

  if (sessions.has(sessionKey) && sessions.get(sessionKey)!.sock) {
    return { ok: true, message: "Session is already active in memory." };
  }

  const dir = storeDirFor(sessionKey);
  ensureDir(dir);

  await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { status: "connecting", last_error: null });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[${sessionKey}] 🚀 Booting Baileys v${version.join(".")} (Latest: ${isLatest})`);

  const sockLogger = logger.child({ session: sessionKey });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, sockLogger),
    },
    printQRInTerminal: false,
    logger: sockLogger,
    browser: Browsers.macOS('Desktop'),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => {
      return { conversation: "Pesan" };
    }
  });

  sessions.set(sessionKey, {
    ctx: { tenantId: ctx.tenantId, userId: ctx.userId },
    sessionKey,
    sock,
    status: "connecting"
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrStateMap.set(sessionKey, { qr, status: "qr", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey) || {}), qr, status: "qr", lastSeen: Date.now() });
      console.log(`\n[${sessionKey}] === SCAN THIS QR CODE (OR VIEW IN DASHBOARD) ===\n`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      qrStateMap.set(sessionKey, { qr: null, status: "connected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey) || {}), qr: null, status: "connected", lastSeen: Date.now() });

      const me = sock.user?.id ?? null;
      const phoneClean = me ? me.split(":")[0].split("@")[0] : null;
      const waName = sock.user?.name ?? null;

      sessions.set(sessionKey, { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, sessionKey, sock, status: "connected" });

      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, {
        status: "connected",
        wa_me_jid: me,
        phone_number: phoneClean,
        label: waName,
        last_seen_at: new Date(),
        last_error: null
      });

      console.log(`[${sessionKey}] ✅ Connected Successfully as +${phoneClean} (${waName})`);
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: "connected", phone: phoneClean }).catch(() => { });
    }

    if (connection === "close") {
      const prev = qrStateMap.get(sessionKey);
      qrStateMap.set(sessionKey, { qr: prev?.qr || null, status: "disconnected", at: Date.now() });
      sessionMeta.set(sessionKey, { ...(sessionMeta.get(sessionKey) || {}), status: "disconnected", lastSeen: Date.now() });

      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const finalStatus = loggedOut ? "logged_out" : "disconnected";

      sessions.set(sessionKey, { ctx: { tenantId: ctx.tenantId, userId: ctx.userId }, sessionKey, sock: null, status: finalStatus });

      await upsertSession(ctx.tenantId, ctx.userId, sessionKey, {
        status: finalStatus,
        last_error: finalStatus,
        last_seen_at: new Date()
      });

      // FIX ZOMBIE SESSION: Cegat auto-reconnect jika sesi ini sedang dihapus oleh pengguna
      if (intentionallyStopped.has(sessionKey)) {
        console.log(`[${sessionKey}] 🛑 Session was intentionally stopped (Deleted by User). Halting auto-reconnect.`);
        intentionallyStopped.delete(sessionKey); // Bersihkan flag
        return;
      }

      console.warn(`[${sessionKey}] ⚠️ Connection Closed. Reason: ${finalStatus} (Code: ${code})`);
      enqueueWebhook(ctx.tenantId, "session.update", { sessionKey, status: finalStatus, reason: code }).catch(() => { });

      if (loggedOut) {
        console.log(`[${sessionKey}] 🛑 Session was logged out by user. Halting auto-reconnect.`);
        return;
      }

      console.log(`[${sessionKey}] 🔄 Attempting auto-reconnect in 10 seconds...`);
      setTimeout(() => startSession(sessionKey, ctx).catch(console.error), 10000);
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      const { key, update: msgUpdate } = update;
      if (!key.id || !key.remoteJid) continue;

      let statusStr: "sent" | "delivered" | "read" | "failed" | null = null;

      if (msgUpdate.status === proto.WebMessageInfo.Status.SERVER_ACK) statusStr = "sent";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.DELIVERY_ACK) statusStr = "delivered";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.READ || msgUpdate.status === proto.WebMessageInfo.Status.PLAYED) statusStr = "read";
      else if (msgUpdate.status === proto.WebMessageInfo.Status.ERROR) statusStr = "failed";

      if (statusStr) {
        try {
          const variants = messageIdVariants(key.id);
          const rawId = variants[0] || key.id;
          const baseId = variants[1] || rawId;
          const whereMsg = buildMessageIdWhereClause("wa_message_id");

          await pool.query(
            `UPDATE wa_messages SET status=? WHERE tenant_id=? AND ${whereMsg}`,
            [statusStr, ctx.tenantId, rawId, baseId, rawId, baseId, rawId, baseId]
          );

          if (statusStr === "read" || statusStr === "delivered") {
            await pool.query(
              `UPDATE followup_targets SET status=? 
               WHERE tenant_id=? AND ${whereMsg} AND status NOT IN ('replied', 'failed', 'canceled')`,
              [statusStr, ctx.tenantId, rawId, baseId, rawId, baseId, rawId, baseId]
            );
          }

          const isBroadcastUpdated = await updateBroadcastDeliveryStatus(
            ctx.tenantId,
            key.id,
            statusStr
          );

          if (isBroadcastUpdated) {
            enqueueWebhook(ctx.tenantId, "broadcast.status", {
              sessionKey,
              messageId: key.id,
              to: key.remoteJid,
              status: statusStr,
              updated_at: new Date()
            }).catch(() => { });
          }

          enqueueWebhook(ctx.tenantId, "message.status", {
            sessionKey, messageId: key.id, to: key.remoteJid, status: statusStr
          }).catch(() => { });

        } catch (dbErr) {
          console.error(`[${sessionKey}] ❌ Error updating message status:`, dbErr);
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // EVENT: INCOMING MESSAGES (MESSAGES.UPSERT)
  // --------------------------------------------------------------------------
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      try {
        if (msg.key.fromMe) continue;

        // ====================================================================
        // [FIX] EKSTRAKSI NOMOR ASLI DARI LID (PRIVACY BYPASS)
        // Meta sering menyembunyikan nomor dalam format 75123456@lid
        // Kita paksa cari nomor asli di participant jika memungkinkan.
        // ====================================================================
        let remoteJid = msg.key.remoteJid || "unknown";

        if (remoteJid === "status@broadcast" || remoteJid.includes("@broadcast") || remoteJid.includes("@newsletter")) {
          continue;
        }

        const isGroup = remoteJid.endsWith("@g.us");
        if (isGroup) continue;

        const parsed = parseContent(msg);
        if (!parsed) continue;

        const pushName = msg.pushName || null;
        const resolvedLead = await resolveIncomingLeadPhoneE164(ctx.tenantId, sessionKey, remoteJid, msg);
        const normalizedLeadPhone = resolvedLead.phoneE164;
        const normalizedLeadDigits = normalizedLeadPhone ? normalizedLeadPhone.slice(1) : null;
        const effectiveJidForPhone = normalizedLeadDigits ? `${normalizedLeadDigits}@s.whatsapp.net` : remoteJid;
        const chatId = await upsertChat(ctx.tenantId, sessionKey, remoteJid, "private");

        await upsertContactResolvedPhone(ctx.tenantId, sessionKey, remoteJid, pushName, normalizedLeadPhone);
        if (normalizedLeadDigits) {
          await upsertContactResolvedPhone(ctx.tenantId, sessionKey, `${normalizedLeadDigits}@s.whatsapp.net`, pushName, normalizedLeadPhone);
        }

        // ====================================================================
        // [NEW CRM ENGINE] TRAFFIC SOURCE TRACKING (WITH AD CAMPAIGN NAME)
        // ====================================================================
        const raw = unwrapMessage(msg.message);
        const txtLower = (parsed.text || "").toLowerCase();

        const quotedId =
          raw?.extendedTextMessage?.contextInfo?.stanzaId ||
          raw?.imageMessage?.contextInfo?.stanzaId ||
          raw?.videoMessage?.contextInfo?.stanzaId ||
          raw?.documentMessage?.contextInfo?.stanzaId || null;

        const adReply = raw?.extendedTextMessage?.contextInfo?.adReply || null;

        let isBroadcastReply = false;
        let isFollowUpReply = false;

        if (quotedId) {
          const quotedBase = String(quotedId).split(":")[0];
          const whereMsg = buildMessageIdWhereClause("wa_message_id");
          const [bcCheck] = await pool.query<any[]>(
            `SELECT id 
             FROM broadcast_items 
             WHERE tenant_id=? 
               AND ${whereMsg}
             LIMIT 1`,
            [ctx.tenantId, quotedId, quotedBase, quotedId, quotedBase, quotedId, quotedBase]
          );
          if (bcCheck && bcCheck.length > 0) {
            isBroadcastReply = true;
          } else {
            const [fuCheck] = await pool.query<any[]>(
              `SELECT id FROM followup_targets WHERE tenant_id=? AND ${whereMsg} LIMIT 1`,
              [ctx.tenantId, quotedId, quotedBase, quotedId, quotedBase, quotedId, quotedBase]
            );
            if (fuCheck && fuCheck.length > 0) {
              isFollowUpReply = true;
            }
          }
        }

        // Tentukan Sumber Trafik (Default = 'random')
        let leadSource = 'random';

        if (adReply) {
          const adName = adReply.title || adReply.body || 'Iklan';
          leadSource = `meta_ads|${adName}`;
        } else if (isBroadcastReply) {
          leadSource = 'broadcast_reply';
        } else if (isFollowUpReply) {
          leadSource = 'followup_reply';
        } else if (txtLower.includes('dari web') || txtLower.includes('dari landing page') || txtLower.includes('dari website')) {
          leadSource = 'web';
        } else if (txtLower.includes('dari ig') || txtLower.includes('dari instagram') || txtLower.includes('instagram dm') || txtLower.includes('dm ig') || txtLower.includes('ig dm')) {
          leadSource = 'ig';
        } else if (txtLower.includes('dari tiktok') || txtLower.includes('dari fyp')) {
          leadSource = 'tiktok';
        } else if (txtLower.includes('dari fb') || txtLower.includes('dari facebook')) {
          leadSource = 'meta_ads|Facebook';
        }

        // --------------------------------------------------------------------
        // [FLEXIBLE SMART ENGINE] Penentuan Suhu Otomatis berdasarkan Rule CS
        // --------------------------------------------------------------------
        let autoStatus = 'cold';
        let tempRules = null;

        try {
          const [ruleRows] = await pool.query<any[]>(`SELECT * FROM crm_temp_rules WHERE tenant_id = ? LIMIT 1`, [ctx.tenantId]);
          if (ruleRows.length > 0) tempRules = ruleRows[0];
        } catch (e) { }

        if (tempRules) {
          let isWarm = false;
          try {
            const baseSource = leadSource.split('|')[0];
            const warmSourcesArray = JSON.parse(tempRules.warm_sources || "[]");
            if (warmSourcesArray.includes(baseSource)) isWarm = true;

            const warmWords = tempRules.warm_keywords ? tempRules.warm_keywords.split(',').map((w: string) => w.toLowerCase().trim()) : [];
            for (const ww of warmWords) {
              if (ww && txtLower.includes(ww)) { isWarm = true; break; }
            }
          } catch (e) { }

          let isHot = false;
          try {
            const baseSource = leadSource.split('|')[0];
            const hotSourcesArray = JSON.parse(tempRules.hot_sources || "[]");
            if (hotSourcesArray.includes(baseSource)) isHot = true;

            const hotWords = tempRules.hot_keywords ? tempRules.hot_keywords.split(',').map((w: string) => w.toLowerCase().trim()) : [];
            for (const hw of hotWords) {
              if (hw && txtLower.includes(hw)) { isHot = true; break; }
            }
          } catch (e) { }

          if (hasMandatoryHotIntent(txtLower)) {
            isHot = true;
          }

          if (isHot || isBroadcastReply || isFollowUpReply) {
            autoStatus = 'hot';
          } else if (isWarm) {
            autoStatus = 'warm';
          }
        } else {
          autoStatus = 'cold';
          if (adReply || leadSource !== 'random' && leadSource !== 'organic') autoStatus = 'warm';
          if (isBroadcastReply || isFollowUpReply || hasMandatoryHotIntent(txtLower)) autoStatus = 'hot';
        }

        if (normalizedLeadPhone) {
          const [leadUpsert]: any = await pool.query(
            `INSERT INTO crm_leads (tenant_id, phone_number, name, source, status, last_interacted_at, created_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE 
             name = COALESCE(?, name),
             source = CASE WHEN source = 'manual' OR source = 'organic' OR source = 'random' THEN ? ELSE source END,
             status = CASE 
                        WHEN status = 'converted' THEN 'converted'
                        WHEN status = 'dead' THEN 'dead'
                        ELSE ? 
                      END,
             last_interacted_at = NOW()`,
            [ctx.tenantId, normalizedLeadPhone, pushName, leadSource, autoStatus, pushName, leadSource, autoStatus]
          );

          if (Number(leadUpsert?.affectedRows || 0) === 1) {
            enqueueWebhook(ctx.tenantId, "lead.created", {
              sessionKey,
              phone_number: normalizedLeadPhone,
              name: pushName || null,
              source: leadSource,
              status: autoStatus,
              created_at: new Date(),
            }).catch(() => { });
          }
        } else {
          console.warn(`[${sessionKey}] Skip CRM lead upsert due to unresolved number: ${remoteJid}`);
          await recordInvalidLeadSkip({
            tenantId: ctx.tenantId,
            channel: "wa.incoming",
            rawInput: String(remoteJid.split("@")[0] || remoteJid),
            reason: remoteJid.includes("@lid") ? "unresolved_lid" : "invalid_indonesia_phone",
            sourceHint: leadSource,
            payload: {
              sessionKey,
              remoteJid,
              resolver_source: resolvedLead.source,
              quotedId: quotedId || null,
              hasAdReply: !!adReply
            }
          });
        }

        // ====================================================================

        await insertMessage(ctx.tenantId, ctx.userId, {
          sessionKey, direction: "in", remoteJid, waMessageId: msg.key.id,
          messageType: parsed.type, textBody: parsed.text, mediaMime: parsed.mime ?? null,
          mediaName: parsed.fileName ?? null, rawJson: msg, status: "sent", chatId
        });

        const logPreview = parsed.text ? (parsed.text.length > 30 ? parsed.text.substring(0, 30) + "..." : parsed.text) : "[Media/File]";
        console.log(`[${sessionKey}] 📨 INCOMING ${parsed.type.toUpperCase()} from ${remoteJid}: ${logPreview}`);

        await markBroadcastReadByNumber(ctx.tenantId, effectiveJidForPhone);

        const replyBody = (parsed.text && parsed.text.trim())
          ? parsed.text.trim()
          : `[${String(parsed.type || "unknown").toUpperCase()}]`;
        await handleBroadcastReply(ctx.tenantId, effectiveJidForPhone, replyBody, quotedId);

        const followUpRepliedCount = await processFollowUpRepliedTrigger(ctx.tenantId, sessionKey, effectiveJidForPhone);
        if (followUpRepliedCount > 0) {
          enqueueWebhook(ctx.tenantId, "followup.replied", {
            sessionKey,
            from: effectiveJidForPhone,
            quoted_message_id: quotedId || null,
            text: replyBody,
            replied_at: new Date(),
            matched_targets: followUpRepliedCount,
          }).catch(() => { });
        }

        if (parsed.text) {
          await processAutoReply(ctx.tenantId, sessionKey, remoteJid, parsed.text);
        }

        try {
          enqueueWebhook(ctx.tenantId, "message.incoming", {
            direction: "in", sessionKey, from: remoteJid, messageId: msg.key.id, messageType: parsed.type, text: parsed.text ?? null
          }).catch(() => { });
        } catch (hookErr) {
          console.error(`[${sessionKey}] ❌ Webhook trigger error:`, hookErr);
        }

        await upsertSession(ctx.tenantId, ctx.userId, sessionKey, { last_seen_at: new Date() });

      } catch (errLoop) {
        console.error(`[${sessionKey}] ❌ CRITICAL ERROR IN MESSAGE PROCESSING LOOP:`, errLoop);
      }
    }
  });

  return { ok: true, message: "Engine started successfully" };
}

// ============================================================================
// 7. SESSION MANAGEMENT ACTIONS
// ============================================================================

export function isConnected(sessionKey: string) {
  return sessions.get(sessionKey)?.status === "connected";
}

export async function stopSession(sessionKey: string) {
  // FIX ZOMBIE SESSION: Tambahkan session ini ke daftar hitam agar tidak di-reconnect otomatis
  intentionallyStopped.add(sessionKey);

  try {
    const sock = getSessionSock(sessionKey);
    if (sock) sock.ws.close();
  } catch (e) {
    console.warn(`[${sessionKey}] ⚠️ Error closing websocket:`, e);
  }

  // FIX ZOMBIE SESSION: Pastikan semua state yang ada di memory terkait session ini dihapus bersih
  try { sessions.delete(sessionKey); } catch { }
  try { sessionMeta.delete(sessionKey); } catch { }
  try { qrStateMap.delete(sessionKey); } catch { }
  console.log(`[${sessionKey}] 🛑 Session stopped and flushed from memory.`);
}

// ============================================================================
// 8. OUTBOUND MESSAGE ACTIONS (SENDING)
// ============================================================================

async function resolveOutboundSendJid(tenantId: number, sessionKey: string, requestedJid: string) {
  const input = String(requestedJid || "").trim();
  if (!input) return input;

  if (!input.includes("@")) {
    const e164 = normalizeIndonesiaPhoneE164(input);
    return e164 ? `${e164.slice(1)}@s.whatsapp.net` : `${input}@s.whatsapp.net`;
  }

  if (input.endsWith("@s.whatsapp.net")) {
    return input;
  }

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

function buildTemplateMessagePayload(
  payload: {
    body?: string;
  }
) {
  const body = String(payload.body || "").trim();
  if (!body) return { error: "Template message body kosong" };
  return { message: { text: body } };
}

function buildNativeFlowInteractiveContent(
  payload: {
    kind: "buttons" | "quick_reply" | "list" | "cta";
    body?: string;
    footer?: string;
    title?: string;
    buttonText?: string;
    buttons?: string[];
    sections?: any[];
    ctaUrlLabel?: string;
    ctaUrl?: string;
    ctaCallLabel?: string;
    ctaCallNumber?: string;
  }
) {
  const kind = payload.kind;
  const body = String(payload.body || "").trim();
  const footer = String(payload.footer || "").trim();
  const title = String(payload.title || "").trim();
  const now = Date.now();

  if (!body) return { error: "body wajib diisi untuk pesan interactive." };

  const nativeButtons: any[] = [];

  if (kind === "buttons" || kind === "quick_reply") {
    const btns = (payload.buttons || []).map(b => String(b || "").trim()).filter(Boolean).slice(0, 3);
    if (btns.length === 0) return { error: "body dan minimal 1 button wajib diisi" };

    nativeButtons.push(
      ...btns.map((label, i) => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: label,
          id: `${kind}_${now}_${i}`
        })
      }))
    );
  }
  else if (kind === "list") {
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    if (!payload.buttonText || sections.length === 0) {
      return { error: "body, buttonText, dan sections wajib diisi untuk list message" };
    }
    const normalizedSections = sections.map((section: any, sectionIdx: number) => ({
      title: String(section?.title || "").trim() || "Pilihan",
      rows: (section?.rows || []).map((row: any, rowIdx: number) => ({
        title: String(row?.title || "").trim() || `Opsi ${rowIdx + 1}`,
        description: String(row?.description || "").trim() || undefined,
        id: String(row?.rowId || `row_${now}_${sectionIdx}_${rowIdx}`)
      }))
    }));
    nativeButtons.push({
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: String(payload.buttonText || "Pilih"),
        sections: normalizedSections
      })
    });
  }
  else if (kind === "cta") {
    const urlLabel = String(payload.ctaUrlLabel || "").trim();
    const url = String(payload.ctaUrl || "").trim();
    const callLabel = String(payload.ctaCallLabel || "").trim();
    const callNumber = String(payload.ctaCallNumber || "").trim();

    if (url && urlLabel) {
      nativeButtons.push({
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: urlLabel,
          url,
          merchant_url: url
        })
      });
    }

    if (callNumber && callLabel) {
      nativeButtons.push({
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          display_text: callLabel,
          id: callNumber,
          phone_number: callNumber
        })
      });
    }

    if (nativeButtons.length === 0) {
      return { error: "body dan minimal satu CTA (URL/Call) wajib diisi" };
    }
  }
  else {
    return { error: "Jenis interactive tidak didukung untuk native flow." };
  }

  if (nativeButtons.length === 0) {
    return { error: "Interactive button tidak valid." };
  }

  const interactive: any = {
    body: { text: body },
    nativeFlowMessage: {
      buttons: nativeButtons,
      messageVersion: 1
    }
  };

  if (footer) {
    interactive.footer = { text: footer };
  }

  if (title) {
    interactive.header = {
      title,
      hasMediaAttachment: false
    };
  }

  return {
    message: {
      interactiveMessage: proto.Message.InteractiveMessage.create(interactive)
    }
  };
}

function buildNativeFlowRelayNodes(isPrivateChat: boolean) {
  const nodes: any[] = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [
            {
              tag: "native_flow",
              attrs: { v: "9", name: "mixed" }
            }
          ]
        }
      ]
    }
  ];

  if (isPrivateChat) {
    nodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  }

  return nodes;
}

function buildRelayInteractiveContent(
  payload: {
    kind: "buttons" | "quick_reply" | "list" | "cta" | "template";
    body?: string;
    footer?: string;
    title?: string;
    buttonText?: string;
    buttons?: string[];
    sections?: any[];
    ctaUrlLabel?: string;
    ctaUrl?: string;
    ctaCallLabel?: string;
    ctaCallNumber?: string;
  }
) {
  const kind = payload.kind;
  const body = String(payload.body || "").trim();
  const footer = String(payload.footer || "").trim();
  const now = Date.now();

  if (kind === "buttons" || kind === "quick_reply") {
    const btns = (payload.buttons || []).map(b => String(b || "").trim()).filter(Boolean).slice(0, 3);
    if (!body || btns.length === 0) return null;
    return {
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: body,
          hydratedFooterText: footer || undefined,
          hydratedButtons: btns.map((label, i) => ({
            index: i + 1,
            quickReplyButton: {
              displayText: label,
              id: `${kind}_${now}_${i}`
            }
          }))
        }
      }
    };
  }

  if (kind === "list") {
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    if (!body || !payload.buttonText || sections.length === 0) return null;
    return {
      listMessage: {
        title: String(payload.title || "").trim() || undefined,
        description: body,
        buttonText: String(payload.buttonText || "Pilih"),
        footerText: footer || undefined,
        listType: 1,
        sections: sections.map((section: any, sectionIdx: number) => ({
          title: String(section?.title || "").trim() || "Pilihan",
          rows: (section?.rows || []).map((row: any, rowIdx: number) => ({
            title: String(row?.title || "").trim() || `Opsi ${rowIdx + 1}`,
            description: String(row?.description || "").trim() || undefined,
            rowId: String(row?.rowId || `row_${now}_${sectionIdx}_${rowIdx}`)
          }))
        }))
      }
    };
  }

  if (kind === "cta") {
    const hydratedButtons: any[] = [];
    if (payload.ctaUrl && payload.ctaUrlLabel) {
      hydratedButtons.push({
        index: hydratedButtons.length + 1,
        urlButton: {
          displayText: String(payload.ctaUrlLabel),
          url: String(payload.ctaUrl)
        }
      });
    }
    if (payload.ctaCallNumber && payload.ctaCallLabel) {
      hydratedButtons.push({
        index: hydratedButtons.length + 1,
        callButton: {
          displayText: String(payload.ctaCallLabel),
          phoneNumber: String(payload.ctaCallNumber)
        }
      });
    }
    if (!body || hydratedButtons.length === 0) return null;
    return {
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: body,
          hydratedFooterText: footer || undefined,
          hydratedButtons
        }
      }
    };
  }

  return null;
}

function buildRelayLegacyButtonsContent(
  payload: {
    kind: "buttons" | "quick_reply";
    body?: string;
    footer?: string;
    buttons?: string[];
  }
) {
  const kind = payload.kind;
  const body = String(payload.body || "").trim();
  const footer = String(payload.footer || "").trim();
  const now = Date.now();
  const btns = (payload.buttons || []).map(b => String(b || "").trim()).filter(Boolean).slice(0, 3);
  if (!body || btns.length === 0) return null;
  return {
    buttonsMessage: {
      contentText: body,
      footerText: footer || undefined,
      headerType: 1,
      buttons: btns.map((label, i) => ({
        type: 1,
        buttonId: `${kind}_${now}_${i}`,
        buttonText: { displayText: label }
      }))
    }
  };
}

export async function sendText(sessionKey: string, to: string, text: string) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock || null;

  if (!sock) return { ok: false, error: "Session socket is not running" };
  if (!isConnected(sessionKey)) return { ok: false, error: "Session is disconnected" };

  const tenantId = Number(entry?.ctx?.tenantId || 0);
  const userId = Number(entry?.ctx?.userId || 0);

  if (!tenantId || !userId) {
    return { ok: false, error: "Session context missing (tenant/user data corrupted)" };
  }

  const requestedJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  const sendJid = await resolveOutboundSendJid(tenantId, sessionKey, requestedJid);
  const chatId = await upsertChat(tenantId, sessionKey, requestedJid, "private");

  try {
    const res = await sock.sendMessage(sendJid, { text });

    await insertMessage(tenantId, userId, {
      sessionKey, direction: "out", remoteJid: requestedJid, waMessageId: res?.key?.id || null,
      messageType: "text", textBody: text, rawJson: { text, delivery_jid: sendJid }, status: "sent", chatId
    });

    await upsertSession(tenantId, userId, sessionKey, { last_seen_at: new Date() });

    return { ok: true, messageId: res?.key?.id || null };
  } catch (e: any) {
    console.error(`[${sessionKey}] Failed to send text to ${sendJid}:`, e);

    await insertMessage(tenantId, userId, {
      sessionKey, direction: "out", remoteJid: requestedJid, waMessageId: null,
      messageType: "text", textBody: text, rawJson: { text, delivery_jid: sendJid, error: e?.message || String(e) },
      status: "failed", errorText: e?.message || "send failed", chatId
    });

    return { ok: false, error: e?.message || "Send operation failed" };
  }
}

export async function sendInteractive(
  sessionKey: string,
  to: string,
  payload: {
    kind: "buttons" | "quick_reply" | "list" | "cta" | "template";
    body?: string;
    footer?: string;
    title?: string;
    buttonText?: string;
    buttons?: string[];
    sections?: any[];
    ctaUrlLabel?: string;
    ctaUrl?: string;
    ctaCallLabel?: string;
    ctaCallNumber?: string;
  }
) {
  const entry = sessions.get(sessionKey);
  const sock = entry?.sock || null;

  if (!sock) return { ok: false, error: "Session socket is not running" };
  if (!isConnected(sessionKey)) return { ok: false, error: "Session is disconnected" };

  const tenantId = Number(entry?.ctx?.tenantId || 0);
  const userId = Number(entry?.ctx?.userId || 0);
  if (!tenantId || !userId) {
    return { ok: false, error: "Session context missing (tenant/user data corrupted)" };
  }

  const requestedJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  const sendJid = await resolveOutboundSendJid(tenantId, sessionKey, requestedJid);
  const chatId = await upsertChat(tenantId, sessionKey, requestedJid, "private");

  try {
    const kind = payload.kind;
    const body = String(payload.body || "").trim();
    const logText = body || `[INTERACTIVE:${String(kind || "template").toUpperCase()}]`;

    let rendered: any = null;
    let sendMode: "sendMessage" | "relay_native_flow" | "relay_legacy" | "relay_legacy_buttons" = "sendMessage";
    let messageId: string | null = null;
    let relayMeta: any = null;
    let relayAttempts: string[] = [];

    const relayContent = async (
      content: any,
      mode: "relay_native_flow" | "relay_legacy" | "relay_legacy_buttons",
      extraOptions?: any
    ) => {
      const waMsg = generateWAMessageFromContent(
        sendJid,
        content as any,
        { userJid: sock.user?.id as string | undefined }
      );
      await sock.relayMessage(sendJid, waMsg.message as proto.IMessage, {
        messageId: waMsg.key.id,
        ...(extraOptions || {})
      });
      messageId = waMsg?.key?.id || null;
      sendMode = mode;
      rendered = content;
      relayMeta = extraOptions || null;
    };

    if (kind === "template") {
      const builtTemplate = buildTemplateMessagePayload(payload);
      if (builtTemplate.error) return { ok: false, error: builtTemplate.error };
      const res = await sock.sendMessage(sendJid, builtTemplate.message as any);
      messageId = res?.key?.id || null;
      sendMode = "sendMessage";
      rendered = builtTemplate.message;
    } else {
      const nativeFlow = buildNativeFlowInteractiveContent({
        kind,
        body: payload.body,
        footer: payload.footer,
        title: payload.title,
        buttonText: payload.buttonText,
        buttons: payload.buttons,
        sections: payload.sections,
        ctaUrlLabel: payload.ctaUrlLabel,
        ctaUrl: payload.ctaUrl,
        ctaCallLabel: payload.ctaCallLabel,
        ctaCallNumber: payload.ctaCallNumber,
      });
      const legacyContent = buildRelayInteractiveContent(payload);
      const isPrivateChat = !String(sendJid || "").endsWith("@g.us");

      const attempts: Array<{
        label: string;
        content: any;
        mode: "relay_native_flow" | "relay_legacy" | "relay_legacy_buttons";
        extraOptions?: any;
      }> = [];

      const legacyFallbackEnabled = String(process.env.WA_INTERACTIVE_LEGACY_FALLBACK || "").trim() === "1";

      // Stable-first: native flow + relay nodes adalah jalur yang paling konsisten terkirim/terbaca.
      if (!nativeFlow.error) {
        attempts.push({
          label: "native_nodes",
          content: nativeFlow.message,
          mode: "relay_native_flow",
          extraOptions: { additionalNodes: buildNativeFlowRelayNodes(isPrivateChat) }
        });
        // Safety retry: jalur native tanpa additional nodes jika server reject extension node.
        attempts.push({
          label: "native_plain",
          content: nativeFlow.message,
          mode: "relay_native_flow",
        });
      }

      if (legacyFallbackEnabled) {
        if (kind === "buttons" || kind === "quick_reply") {
          const legacyButtons = buildRelayLegacyButtonsContent({
            kind,
            body: payload.body,
            footer: payload.footer,
            buttons: payload.buttons
          });
          if (legacyButtons) {
            attempts.push({
              label: "legacy_buttons",
              content: legacyButtons,
              mode: "relay_legacy_buttons"
            });
          }
        }

        if (legacyContent) {
          attempts.push({
            label: "legacy_relay",
            content: legacyContent,
            mode: "relay_legacy"
          });
        }
      }

      if (attempts.length === 0) {
        return { ok: false, error: nativeFlow.error || "Payload interactive tidak valid." };
      }
      relayAttempts = attempts.map(a => a.label);

      let lastErr: any = null;
      for (const attempt of attempts) {
        try {
          await relayContent(attempt.content, attempt.mode, attempt.extraOptions);
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
        }
      }

      if (!messageId) {
        throw lastErr || new Error(nativeFlow.error || "Interactive relay failed");
      }
    }

    await insertMessage(tenantId, userId, {
      sessionKey, direction: "out", remoteJid: requestedJid, waMessageId: messageId,
      messageType: "text",
      textBody: logText,
      rawJson: { interactive: payload, rendered, transport: sendMode, relay_meta: relayMeta, relay_attempts: relayAttempts, delivery_jid: sendJid },
      status: "sent",
      chatId
    });

    await upsertSession(tenantId, userId, sessionKey, { last_seen_at: new Date() });
    return { ok: true, messageId };
  } catch (e: any) {
    const kind = String(payload.kind || "template");
    const errorText = String(e?.message || e || "");
    await insertMessage(tenantId, userId, {
      sessionKey, direction: "out", remoteJid: requestedJid, waMessageId: null,
      messageType: "text",
      textBody: String(payload.body || "").trim() || `[INTERACTIVE:${String(kind).toUpperCase()}]`,
      rawJson: { interactive: payload, delivery_jid: sendJid, error: errorText },
      status: "failed", errorText: errorText || "interactive send failed", chatId
    });
    return { ok: false, error: errorText || "Send operation failed" };
  }
}






