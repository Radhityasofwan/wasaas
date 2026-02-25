import { Router } from "express";
import { z } from "zod";
import { pool } from "./db";

const router = Router();

// GET: List Templates
router.get("/", async (req: any, res: any) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM message_templates WHERE tenant_id = ? ORDER BY id DESC`,
      [req.auth.tenantId]
    );
    return res.json({ ok: true, data: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST: Create Template
router.post("/", async (req: any, res: any) => {
  const schema = z.object({
    name: z.string().min(1).max(120),
    message_type: z.enum(["text", "image", "video", "document", "audio", "location"]),
    text_body: z.string().optional().nullable(),
    media_url: z.string().url().optional().nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { name, message_type, text_body, media_url } = parsed.data;

  try {
    await pool.query(
      `INSERT INTO message_templates (tenant_id, name, message_type, text_body, media_url, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [req.auth.tenantId, name, message_type, text_body || null, media_url || null]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE: Delete Template
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