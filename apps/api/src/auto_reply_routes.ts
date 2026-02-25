import { Router } from "express";
import { pool } from "./db";
import { z } from "zod";

const router = Router();

// ============================================================================
// AUTO-MIGRATION: Otomatis tambah kolom 'delay_ms' jika belum ada di DB
// ============================================================================
async function ensureSchema() {
  try {
    await pool.query(`SELECT delay_ms FROM auto_reply_rules LIMIT 1`);
  } catch (e: any) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      console.log("🛠️ Menambahkan kolom 'delay_ms' ke tabel auto_reply_rules...");
      await pool.query(`ALTER TABLE auto_reply_rules ADD COLUMN delay_ms INT NOT NULL DEFAULT 2000`);
    }
  }
}
ensureSchema().catch(console.error);

// ============================================================================
// GET: List Auto Reply Rules
// ============================================================================
router.get("/", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    const [rows] = await pool.query<any[]>(
      `SELECT id, session_key, keyword, match_type, reply_text, is_active, delay_ms 
       FROM auto_reply_rules 
       WHERE tenant_id = ? 
       ORDER BY id DESC`,
      [tenantId]
    );
    res.json({ ok: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============================================================================
// POST: Create Rule
// ============================================================================
router.post("/", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    const schema = z.object({
      session_key: z.string().nullable().optional(), 
      keyword: z.string().min(1),
      match_type: z.enum(["exact", "contains", "startswith"]),
      reply_text: z.string().min(1),
      delay_ms: z.number().min(0).default(2000)
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: "Data tidak valid." });

    const targetSession = parsed.data.session_key || null;

    const [result]: any = await pool.query(
      `INSERT INTO auto_reply_rules (tenant_id, session_key, keyword, match_type, reply_text, is_active, delay_ms) 
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [tenantId, targetSession, parsed.data.keyword, parsed.data.match_type, parsed.data.reply_text, parsed.data.delay_ms]
    );
    
    res.json({ ok: true, data: { id: result.insertId } });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============================================================================
// PUT: Update Rule (Edit)
// ============================================================================
router.put("/:id", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    const id = parseInt(req.params.id);
    
    const schema = z.object({
      session_key: z.string().nullable().optional(),
      keyword: z.string().min(1),
      match_type: z.enum(["exact", "contains", "startswith"]),
      reply_text: z.string().min(1),
      delay_ms: z.number().min(0).default(2000)
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: "Data tidak valid." });

    const targetSession = parsed.data.session_key || null;

    await pool.query(
      `UPDATE auto_reply_rules 
       SET session_key = ?, keyword = ?, match_type = ?, reply_text = ?, delay_ms = ? 
       WHERE id = ? AND tenant_id = ?`,
      [targetSession, parsed.data.keyword, parsed.data.match_type, parsed.data.reply_text, parsed.data.delay_ms, id, tenantId]
    );
    
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============================================================================
// PUT: Toggle Status (Active/Inactive)
// ============================================================================
router.put("/:id/status", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    const id = parseInt(req.params.id);
    const { is_active } = req.body;
    
    await pool.query(
      `UPDATE auto_reply_rules SET is_active = ? WHERE id = ? AND tenant_id = ?`,
      [is_active ? 1 : 0, id, tenantId]
    );
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============================================================================
// DELETE: Remove Rule
// ============================================================================
router.delete("/:id", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    const id = parseInt(req.params.id);
    await pool.query(`DELETE FROM auto_reply_rules WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;