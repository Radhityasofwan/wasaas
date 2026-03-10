import { pool } from "./db";
import { 
  createBroadcastJob, 
  getBroadcastJob, 
  getBroadcastItems, 
  deleteBroadcastJob 
} from "./broadcast";
import { filePublicUrl } from "./upload";

function toMysqlDateTime(input?: string) {
  if (!input || !String(input).trim()) return undefined;
  const raw = String(input).trim();

  // datetime-local format from UI: YYYY-MM-DDTHH:mm[:ss]
  const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, d, hm, ss] = localMatch;
    return `${d} ${hm}:${ss || "00"}`;
  }

  // ISO timestamp (legacy payload): convert into server-local DATETIME.
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

type BroadcastMessageType = "text" | "image" | "video" | "document" | "audio" | "voice_note" | "sticker" | "location";

function normalizeBroadcastMessageType(raw: unknown): BroadcastMessageType | null {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "text" || t === "image" || t === "video" || t === "document" || t === "audio" || t === "voice_note" || t === "sticker" || t === "location") {
    return t;
  }
  return null;
}

function parseTargetsInput(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw.map(v => String(v || "").trim()).filter(Boolean);
  }

  const str = String(raw || "").trim();
  if (!str) return [];

  try {
    const arr = JSON.parse(str);
    if (Array.isArray(arr)) {
      return arr.map(v => String(v || "").trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  return str.split(/[\n,;]+/g).map(v => v.trim()).filter(Boolean);
}

// POST /broadcast (Create)
export async function createBroadcast(req: any, res: any) {
  const rawBody = req.body || {};
  const sessionKey = String(rawBody.sessionKey || "").trim();
  const nameRaw = String(rawBody.name || "").trim();
  const textRaw = String(rawBody.text || "").trim();
  const msgTypeRaw = normalizeBroadcastMessageType(rawBody.msgType || "text");
  const targets = parseTargetsInput(rawBody.targets);
  const delayMs = Number(rawBody.delayMs || 1200);
  const scheduledAtRaw = rawBody.scheduledAt ? String(rawBody.scheduledAt) : undefined;
  const templateId = Number(rawBody.templateId || 0) || null;

  if (!sessionKey) return res.status(400).json({ ok: false, error: "sessionKey wajib diisi" });
  if (!msgTypeRaw) return res.status(400).json({ ok: false, error: "msgType tidak valid" });
  if (!targets.length) return res.status(400).json({ ok: false, error: "targets kosong" });

  let msgType: BroadcastMessageType = msgTypeRaw;
  let finalText = textRaw;
  let mediaUrl = String(rawBody.mediaUrl || "").trim() || null;
  let mediaMime = String(rawBody.mediaMime || "").trim() || null;
  let mediaName = String(rawBody.mediaName || "").trim() || null;

  const latitude = Number(rawBody.latitude);
  const longitude = Number(rawBody.longitude);

  if (templateId) {
    const [tplRows] = await pool.query<any[]>(
      `SELECT id, message_type, text_body, media_url, media_mime, media_name
       FROM message_templates
       WHERE id=? AND tenant_id=?
       LIMIT 1`,
      [templateId, req.auth.tenantId]
    );
    if (!tplRows?.length) {
      return res.status(404).json({ ok: false, error: "Template tidak ditemukan." });
    }
    const tpl = tplRows[0];
    const tplType = normalizeBroadcastMessageType(tpl.message_type || "text");
    if (!tplType) {
      return res.status(400).json({ ok: false, error: "Tipe template tidak didukung untuk broadcast." });
    }
    msgType = tplType;
    if (!finalText) finalText = String(tpl.text_body || "").trim();
    if (!mediaUrl) mediaUrl = String(tpl.media_url || "").trim() || null;
    if (!mediaMime) mediaMime = String(tpl.media_mime || "").trim() || null;
    if (!mediaName) mediaName = String(tpl.media_name || "").trim() || null;
  }

  if (req.file) {
    mediaUrl = filePublicUrl(req.file.filename);
    mediaMime = String(req.file.mimetype || "application/octet-stream");
    mediaName = String(req.file.originalname || req.file.filename || "file");
  }

  if (msgType === "location" && !mediaUrl && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    mediaUrl = `${latitude},${longitude}`;
  }

  if (msgType === "text" && !finalText) {
    return res.status(400).json({ ok: false, error: "text wajib diisi untuk broadcast text." });
  }

  if (msgType !== "text" && msgType !== "location" && !mediaUrl) {
    return res.status(400).json({ ok: false, error: "Media wajib diisi (upload atau mediaUrl)." });
  }

  if (msgType === "location" && !mediaUrl) {
    return res.status(400).json({ ok: false, error: "Lokasi wajib diisi (mediaUrl lat,lng atau latitude/longitude)." });
  }

  if (msgType === "location" && mediaUrl) {
    const [latRaw, lngRaw] = String(mediaUrl).split(",");
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, error: "Format lokasi harus lat,lng yang valid." });
    }
    mediaUrl = `${lat},${lng}`;
  }

  const scheduledAt = toMysqlDateTime(scheduledAtRaw);
  if (scheduledAtRaw && !scheduledAt) {
    return res.status(400).json({ ok: false, error: "invalid scheduledAt format" });
  }

  const nameFinal = nameRaw || `Broadcast ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

  const result = await createBroadcastJob({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    sessionKey,
    name: nameFinal,
    delayMs: Number.isFinite(delayMs) ? Math.max(0, Math.min(delayMs, 60000)) : 1200,
    targets,
    text: finalText || "",
    msgType,
    scheduledAt,
    mediaPath: mediaUrl || null,
    mediaMime: mediaMime || null,
    mediaName: mediaName || null,
  });

  // Best-effort trigger agar job baru (termasuk scheduled) segera tervalidasi oleh worker.
  try {
    require("./broadcast").processBroadcastQueue().catch(() => { });
  } catch {
    /* ignore */
  }

  return res.json({ ok: true, ...result });
}

// GET /broadcast/:id (Detail Job)
export async function getJob(req: any, res: any) {
  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ ok: false, error: "invalid id" });

  const job = await getBroadcastJob(jobId, req.auth.tenantId);
  if (!job) return res.status(404).json({ ok: false, error: "not found" });

  return res.json({ ok: true, data: job });
}

// GET /broadcast/:id/items (List Nomor & Status)
export async function getJobItems(req: any, res: any) {
  const jobId = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;

  if (!jobId) return res.status(400).json({ ok: false, error: "invalid id" });

  // Validasi akses job dulu
  const job = await getBroadcastJob(jobId, req.auth.tenantId);
  if (!job) return res.status(404).json({ ok: false, error: "not found" });

  const items = await getBroadcastItems(jobId, req.auth.tenantId, limit, offset);
  return res.json({ ok: true, data: items });
}

// DELETE /broadcast/:id (Hapus Job & Items)
export async function deleteJob(req: any, res: any) {
  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ ok: false, error: "invalid id" });

  const deleted = await deleteBroadcastJob(jobId, req.auth.tenantId);
  if (!deleted) return res.status(404).json({ ok: false, error: "not found or already deleted" });

  return res.json({ ok: true, message: "broadcast deleted" });
}
