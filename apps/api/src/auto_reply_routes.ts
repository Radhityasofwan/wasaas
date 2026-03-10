import { Router } from "express";
import { pool } from "./db";
import { z } from "zod";

const router = Router();
let schemaEnsurePromise: Promise<void> | null = null;

function isValidLatLng(raw: string | null | undefined) {
  const val = String(raw || "").trim();
  if (!val) return false;
  const [latRaw, lngRaw] = val.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

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

  try {
    await pool.query(`SELECT typing_enabled FROM auto_reply_rules LIMIT 1`);
  } catch (e: any) {
    if (e.code === "ER_BAD_FIELD_ERROR") {
      await pool.query(`ALTER TABLE auto_reply_rules ADD COLUMN typing_enabled TINYINT(1) NOT NULL DEFAULT 1`);
    }
  }

  try {
    await pool.query(`SELECT typing_ms FROM auto_reply_rules LIMIT 1`);
  } catch (e: any) {
    if (e.code === "ER_BAD_FIELD_ERROR") {
      await pool.query(`ALTER TABLE auto_reply_rules ADD COLUMN typing_ms INT UNSIGNED NULL`);
    }
  }

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT IS_NULLABLE
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'auto_reply_rules'
         AND column_name = 'reply_text'
       LIMIT 1`
    );
    const isNullable = String(rows?.[0]?.IS_NULLABLE || "").toUpperCase() === "YES";
    if (!isNullable) {
      await pool.query(`ALTER TABLE auto_reply_rules MODIFY COLUMN reply_text TEXT NULL`);
    }
  } catch {
    // ignore (fallback tetap aman karena insert/update pakai string kosong)
  }

  try {
    await pool.query(`SELECT template_id FROM auto_reply_rules LIMIT 1`);
  } catch (e: any) {
    if (e.code === "ER_BAD_FIELD_ERROR") {
      await pool.query(`ALTER TABLE auto_reply_rules ADD COLUMN template_id BIGINT UNSIGNED NULL`);
      try {
        await pool.query(
          `ALTER TABLE auto_reply_rules
           ADD CONSTRAINT fk_auto_reply_template
           FOREIGN KEY (template_id) REFERENCES message_templates(id) ON DELETE SET NULL`
        );
      } catch {
        // ignore duplicate constraint / old MySQL variants
      }
    }
  }
}
function ensureSchemaReady() {
  if (!schemaEnsurePromise) {
    schemaEnsurePromise = ensureSchema().catch((e) => {
      schemaEnsurePromise = null;
      throw e;
    });
  }
  return schemaEnsurePromise;
}
ensureSchemaReady().catch(console.error);

// ============================================================================
// GET: List Auto Reply Rules
// ============================================================================
router.get("/", async (req: any, res: any) => {
  try {
    await ensureSchemaReady();
    const tenantId = req.auth?.tenantId;
    const [rows] = await pool.query<any[]>(
      `SELECT arr.id, arr.session_key, arr.keyword, arr.match_type, arr.reply_text, arr.is_active, arr.delay_ms,
              arr.typing_enabled, arr.typing_ms,
              arr.template_id, mt.name as template_name, mt.message_type as template_type
       FROM auto_reply_rules arr
       LEFT JOIN message_templates mt ON mt.id = arr.template_id AND mt.tenant_id = arr.tenant_id
       WHERE arr.tenant_id = ? 
       ORDER BY arr.id DESC`,
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
    await ensureSchemaReady();
    const tenantId = req.auth?.tenantId;
    const schema = z.object({
      session_key: z.string().nullable().optional(), 
      keyword: z.string().min(1),
      match_type: z.enum(["exact", "contains", "startswith"]),
      reply_text: z.string().optional().nullable(),
      template_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional().nullable(),
      delay_ms: z.number().min(0).default(0),
      typing_enabled: z.boolean().optional().default(true),
      typing_ms: z.number().min(0).max(120000).optional().nullable()
    }).superRefine((val, ctx) => {
      const hasTemplate = val.template_id !== undefined && val.template_id !== null && String(val.template_id).trim() !== "";
      const hasReplyText = String(val.reply_text || "").trim().length > 0;
      if (!hasTemplate && !hasReplyText) {
        ctx.addIssue({
          code: "custom",
          message: "Isi reply_text atau pilih template media.",
          path: ["reply_text"],
        });
      }
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: "Data tidak valid." });

    const targetSession = parsed.data.session_key || null;
    const finalReplyText = String(parsed.data.reply_text || "").trim();

    const templateId = parsed.data.template_id ? Number(parsed.data.template_id) : null;

    if (templateId) {
      const [tplRows] = await pool.query<any[]>(
        `SELECT id, message_type, text_body, media_url
         FROM message_templates
         WHERE id=? AND tenant_id=?
         LIMIT 1`,
        [templateId, tenantId]
      );
      if (!tplRows.length) return res.status(400).json({ ok: false, error: "Template tidak ditemukan." });

      const tpl = tplRows[0];
      const tplType = String(tpl.message_type || "").trim().toLowerCase();
      if (tplType === "text" && !String(tpl.text_body || "").trim() && !String(parsed.data.reply_text || "").trim()) {
        return res.status(400).json({ ok: false, error: "Template text tidak memiliki isi pesan." });
      }
      if (tplType === "location" && !isValidLatLng(tpl.media_url)) {
        return res.status(400).json({ ok: false, error: "Template location harus memiliki media_url lat,lng yang valid." });
      }
      if (tplType && tplType !== "text" && tplType !== "location" && !String(tpl.media_url || "").trim()) {
        return res.status(400).json({ ok: false, error: "Template media belum memiliki file/URL media." });
      }
    }

    const [result]: any = await pool.query(
      `INSERT INTO auto_reply_rules (
        tenant_id, session_key, keyword, match_type, reply_text, template_id,
        is_active, delay_ms, typing_enabled, typing_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        tenantId,
        targetSession,
        parsed.data.keyword,
        parsed.data.match_type,
        finalReplyText,
        templateId,
        parsed.data.delay_ms,
        parsed.data.typing_enabled ? 1 : 0,
        parsed.data.typing_ms != null ? Number(parsed.data.typing_ms) : null
      ]
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
    await ensureSchemaReady();
    const tenantId = req.auth?.tenantId;
    const id = parseInt(req.params.id);
    
    const schema = z.object({
      session_key: z.string().nullable().optional(),
      keyword: z.string().min(1),
      match_type: z.enum(["exact", "contains", "startswith"]),
      reply_text: z.string().optional().nullable(),
      template_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional().nullable(),
      delay_ms: z.number().min(0).default(0),
      typing_enabled: z.boolean().optional().default(true),
      typing_ms: z.number().min(0).max(120000).optional().nullable()
    }).superRefine((val, ctx) => {
      const hasTemplate = val.template_id !== undefined && val.template_id !== null && String(val.template_id).trim() !== "";
      const hasReplyText = String(val.reply_text || "").trim().length > 0;
      if (!hasTemplate && !hasReplyText) {
        ctx.addIssue({
          code: "custom",
          message: "Isi reply_text atau pilih template media.",
          path: ["reply_text"],
        });
      }
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: "Data tidak valid." });

    const targetSession = parsed.data.session_key || null;
    const finalReplyText = String(parsed.data.reply_text || "").trim();

    const templateId = parsed.data.template_id ? Number(parsed.data.template_id) : null;
    if (templateId) {
      const [tplRows] = await pool.query<any[]>(
        `SELECT id, message_type, text_body, media_url
         FROM message_templates
         WHERE id=? AND tenant_id=?
         LIMIT 1`,
        [templateId, tenantId]
      );
      if (!tplRows.length) return res.status(400).json({ ok: false, error: "Template tidak ditemukan." });

      const tpl = tplRows[0];
      const tplType = String(tpl.message_type || "").trim().toLowerCase();
      if (tplType === "text" && !String(tpl.text_body || "").trim() && !String(parsed.data.reply_text || "").trim()) {
        return res.status(400).json({ ok: false, error: "Template text tidak memiliki isi pesan." });
      }
      if (tplType === "location" && !isValidLatLng(tpl.media_url)) {
        return res.status(400).json({ ok: false, error: "Template location harus memiliki media_url lat,lng yang valid." });
      }
      if (tplType && tplType !== "text" && tplType !== "location" && !String(tpl.media_url || "").trim()) {
        return res.status(400).json({ ok: false, error: "Template media belum memiliki file/URL media." });
      }
    }

    await pool.query(
      `UPDATE auto_reply_rules 
       SET session_key = ?, keyword = ?, match_type = ?, reply_text = ?, template_id = ?, delay_ms = ?, typing_enabled = ?, typing_ms = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        targetSession,
        parsed.data.keyword,
        parsed.data.match_type,
        finalReplyText,
        templateId,
        parsed.data.delay_ms,
        parsed.data.typing_enabled ? 1 : 0,
        parsed.data.typing_ms != null ? Number(parsed.data.typing_ms) : null,
        id,
        tenantId
      ]
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
