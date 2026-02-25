import { Router } from "express";
import { z } from "zod";
import { pool } from "./db";
import { upload, filePublicUrl } from "./upload";

const router = Router();

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
      message_type: z.enum(["text", "image", "video", "document", "audio", "location"]),
      text_body: z.string().optional().nullable(),
      media_url: z.string().optional().nullable(),
      category: z.enum(["broadcast", "follow_up", "general"]).default("general"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

    const { name, message_type, text_body, media_url, category } = parsed.data;

    // Tentukan URL Media (Jika ada file diunggah, gunakan filePublicUrl. Jika tidak, gunakan URL manual)
    let finalMediaUrl = media_url || null;
    if (req.file) {
      finalMediaUrl = filePublicUrl(req.file.filename);
    }

    await pool.query(
      `INSERT INTO message_templates (tenant_id, name, message_type, text_body, media_url, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [req.auth.tenantId, name, message_type, text_body || null, finalMediaUrl, category]
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
      message_type: z.enum(["text", "image", "video", "document", "audio", "location"]),
      text_body: z.string().optional().nullable(),
      media_url: z.string().optional().nullable(),
      category: z.enum(["broadcast", "follow_up", "general"]).default("general"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

    const { name, message_type, text_body, media_url, category } = parsed.data;

    let finalMediaUrl = media_url || null;
    if (req.file) {
      finalMediaUrl = filePublicUrl(req.file.filename);
    }

    await pool.query(
      `UPDATE message_templates 
       SET name = ?, message_type = ?, text_body = ?, media_url = ?, category = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [name, message_type, text_body || null, finalMediaUrl, category, req.params.id, req.auth.tenantId]
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