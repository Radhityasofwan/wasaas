import { Router } from "express";
import { z } from "zod";
import { pool } from "./db";
import { upload, filePublicUrl } from "./upload";

const router = Router();

function normalizeLocationCoord(raw: string | null | undefined) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const [latRaw, lngRaw] = text.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat},${lng}`;
}

// ============================================================================
// AUTO-MIGRATION: Otomatis tambah kolom 'category' jika belum ada di DB
// ============================================================================
async function ensureSchema() {
  try {
    await pool.query(`SELECT category FROM message_templates LIMIT 1`);
  } catch (e: any) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      console.log("🛠️ Menambahkan kolom 'category' ke tabel message_templates...");
      await pool.query(`ALTER TABLE message_templates ADD COLUMN category ENUM('broadcast', 'follow_up', 'general') NOT NULL DEFAULT 'general'`);
    }
  }

  try {
    await pool.query(`SELECT media_mime FROM message_templates LIMIT 1`);
  } catch (e: any) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      await pool.query(`ALTER TABLE message_templates ADD COLUMN media_mime VARCHAR(120) NULL`);
    }
  }

  try {
    await pool.query(`SELECT media_name FROM message_templates LIMIT 1`);
  } catch (e: any) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      await pool.query(`ALTER TABLE message_templates ADD COLUMN media_name VARCHAR(255) NULL`);
    }
  }

  try {
    await pool.query(
      `ALTER TABLE message_templates
       MODIFY COLUMN message_type ENUM('text','image','video','document','audio','voice_note','sticker','location') NOT NULL DEFAULT 'text'`
    );
  } catch {
    // ignore
  }
}
ensureSchema().catch(console.error);

// ============================================================================
// GET: List Templates (Termasuk perhitungan jumlah pemakaian)
// ============================================================================
router.get("/", async (req: any, res: any) => {
  try {
    // Menghitung berapa kali template ini dipakai di followup_campaigns
    const [rows] = await pool.query(
      `SELECT mt.*, 
        (SELECT COUNT(*) FROM followup_campaigns fc WHERE fc.template_id = mt.id) as usage_count 
       FROM message_templates mt 
       WHERE mt.tenant_id = ? 
       ORDER BY mt.id DESC`,
      [req.auth.tenantId]
    );
    return res.json({ ok: true, data: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// POST: Create Template (Mendukung Upload File)
// ============================================================================
router.post("/", upload.single("file"), async (req: any, res: any) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(120),
      message_type: z.enum(["text", "image", "video", "document", "audio", "voice_note", "sticker", "location"]),
      text_body: z.string().optional().nullable(),
      media_url: z.string().optional().nullable(),
      media_mime: z.string().optional().nullable(),
      media_name: z.string().optional().nullable(),
      category: z.enum(["broadcast", "follow_up", "general"]).default("general"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

    const { name, message_type, text_body, media_url, media_mime, media_name, category } = parsed.data;

    // Tentukan URL Media (Jika ada file diunggah, gunakan filePublicUrl. Jika tidak, gunakan URL manual)
    let finalMediaUrl = media_url || null;
    let finalMediaMime = media_mime || null;
    let finalMediaName = media_name || null;
    if (req.file) {
      finalMediaUrl = filePublicUrl(req.file.filename);
      finalMediaMime = req.file.mimetype || null;
      finalMediaName = req.file.originalname || req.file.filename || null;
    }

    const bodyText = String(text_body || "").trim();
    if (message_type === "text" && !bodyText) {
      return res.status(400).json({ ok: false, error: "text_body wajib diisi untuk template text." });
    }

    if (message_type !== "text" && message_type !== "location" && !String(finalMediaUrl || "").trim()) {
      return res.status(400).json({ ok: false, error: "Template media wajib memiliki file upload atau media_url." });
    }

    if (message_type === "location") {
      const normalized = normalizeLocationCoord(finalMediaUrl);
      if (!normalized) {
        return res.status(400).json({ ok: false, error: "Template location wajib format lat,lng yang valid." });
      }
      finalMediaUrl = normalized;
      finalMediaMime = null;
      finalMediaName = finalMediaName || "Lokasi";
    }

    if (message_type === "text") {
      finalMediaUrl = null;
      finalMediaMime = null;
      finalMediaName = null;
    }

    await pool.query(
      `INSERT INTO message_templates (tenant_id, name, message_type, text_body, media_url, media_mime, media_name, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [req.auth.tenantId, name, message_type, bodyText || null, finalMediaUrl, finalMediaMime, finalMediaName, category]
    );

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("Create Template Error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// PUT: Update Template
// ============================================================================
router.put("/:id", upload.single("file"), async (req: any, res: any) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(120),
      message_type: z.enum(["text", "image", "video", "document", "audio", "voice_note", "sticker", "location"]),
      text_body: z.string().optional().nullable(),
      media_url: z.string().optional().nullable(),
      media_mime: z.string().optional().nullable(),
      media_name: z.string().optional().nullable(),
      category: z.enum(["broadcast", "follow_up", "general"]).default("general"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

    const { name, message_type, text_body, media_url, media_mime, media_name, category } = parsed.data;

    let finalMediaUrl = media_url || null;
    let finalMediaMime = media_mime || null;
    let finalMediaName = media_name || null;
    if (req.file) {
      finalMediaUrl = filePublicUrl(req.file.filename);
      finalMediaMime = req.file.mimetype || null;
      finalMediaName = req.file.originalname || req.file.filename || null;
    }

    const bodyText = String(text_body || "").trim();
    if (message_type === "text" && !bodyText) {
      return res.status(400).json({ ok: false, error: "text_body wajib diisi untuk template text." });
    }

    if (message_type !== "text" && message_type !== "location" && !String(finalMediaUrl || "").trim()) {
      return res.status(400).json({ ok: false, error: "Template media wajib memiliki file upload atau media_url." });
    }

    if (message_type === "location") {
      const normalized = normalizeLocationCoord(finalMediaUrl);
      if (!normalized) {
        return res.status(400).json({ ok: false, error: "Template location wajib format lat,lng yang valid." });
      }
      finalMediaUrl = normalized;
      finalMediaMime = null;
      finalMediaName = finalMediaName || "Lokasi";
    }

    if (message_type === "text") {
      finalMediaUrl = null;
      finalMediaMime = null;
      finalMediaName = null;
    }

    await pool.query(
      `UPDATE message_templates 
       SET name = ?, message_type = ?, text_body = ?, media_url = ?, media_mime = ?, media_name = ?, category = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [name, message_type, bodyText || null, finalMediaUrl, finalMediaMime, finalMediaName, category, req.params.id, req.auth.tenantId]
    );

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================================
// DELETE: Delete Template
// ============================================================================
router.delete("/:id", async (req: any, res: any) => {
  try {
    await pool.query(
      `DELETE FROM message_templates WHERE id = ? AND tenant_id = ?`,
      [req.params.id, req.auth.tenantId]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
