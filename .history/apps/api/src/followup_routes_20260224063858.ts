import { Router } from "express";
import { z } from "zod";
import { pool } from "./db";

const router = Router();

// GET: List Follow Up Campaigns
router.get("/campaigns", async (req: any, res: any) => {
  try {
    const statusFilter = req.query.status;
    let query = `
      SELECT c.*, t.name as template_name 
      FROM followup_campaigns c 
      LEFT JOIN message_templates t ON c.template_id = t.id 
      WHERE c.tenant_id = ?
    `;
    const params: any[] = [req.auth.tenantId];

    if (statusFilter && statusFilter !== 'all') {
      query += ` AND c.status = ?`;
      params.push(statusFilter);
    }
    
    query += ` ORDER BY c.id DESC`;

    const [rows] = await pool.query(query, params);
    return res.json({ ok: true, data: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST: Create Campaign
router.post("/campaigns", async (req: any, res: any) => {
  const schema = z.object({
    session_key: z.string().min(1),
    name: z.string().min(1).max(160),
    template_id: z.coerce.number().positive(),
    delay_days: z.coerce.number().min(0),
    target_time: z.string(), // expected "HH:mm"
    trigger_condition: z.enum(["always", "unreplied", "unread"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { session_key, name, template_id, delay_days, target_time, trigger_condition } = parsed.data;

  try {
    // Validasi template milik tenant
    const [tplRows] = await pool.query<any[]>(`SELECT id FROM message_templates WHERE id = ? AND tenant_id = ?`, [template_id, req.auth.tenantId]);
    if (!tplRows.length) return res.status(400).json({ ok: false, error: "Template tidak ditemukan" });

    await pool.query(
      `INSERT INTO followup_campaigns 
        (tenant_id, user_id, session_key, name, template_id, delay_days, target_time, trigger_condition, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [req.auth.tenantId, req.auth.userId, session_key, name, template_id, delay_days, target_time, trigger_condition]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT: Change Campaign Status
router.put("/campaigns/:id/status", async (req: any, res: any) => {
  try {
    const { status } = req.body;
    if (!["active", "paused", "completed"].includes(status)) return res.status(400).json({ ok: false, error: "Invalid status" });
    
    await pool.query(
      `UPDATE followup_campaigns SET status = ? WHERE id = ? AND tenant_id = ?`,
      [status, req.params.id, req.auth.tenantId]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE: Delete Campaign
router.delete("/campaigns/:id", async (req: any, res: any) => {
  try {
    await pool.query(`DELETE FROM followup_campaigns WHERE id = ? AND tenant_id = ?`, [req.params.id, req.auth.tenantId]);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET: Targets in a Campaign
router.get("/campaigns/:id/targets", async (req: any, res: any) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM followup_targets WHERE campaign_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 500`,
      [req.params.id, req.auth.tenantId]
    );
    return res.json({ ok: true, data: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST: Add Targets to Campaign (From Inbox Bulk Action)
router.post("/add-targets", async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string(),
    campaignId: z.coerce.number(),
    targets: z.array(z.string()).min(1) // array of phone numbers
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { sessionKey, campaignId, targets } = parsed.data;
  const tenantId = req.auth.tenantId;

  try {
    // 1. Ambil detail campaign untuk menghitung jadwal eksekusi
    const [camps] = await pool.query<any[]>(`SELECT delay_days, target_time FROM followup_campaigns WHERE id = ? AND tenant_id = ?`, [campaignId, tenantId]);
    if (!camps.length) return res.status(404).json({ ok: false, error: "Campaign tidak ditemukan" });
    const camp = camps[0];

    // 2. Kalkulasi Tanggal Scheduled
    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + camp.delay_days);
    
    if (camp.target_time) {
      const [hh, mm] = camp.target_time.split(":");
      scheduledAt.setHours(Number(hh), Number(mm), 0, 0);
    }
    
    // Pastikan tidak di masa lalu. Jika hari H dan jam sudah lewat, geser ke besok.
    if (scheduledAt.getTime() <= now.getTime()) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    // 3. Bulk Insert Targets
    const vals = targets.map((num: string) => [
      campaignId, tenantId, sessionKey, num, num + '@s.whatsapp.net', scheduledAt, 'queued'
    ]);

    await pool.query(
      `INSERT INTO followup_targets (campaign_id, tenant_id, session_key, to_number, to_jid, scheduled_at, status) VALUES ?`,
      [vals]
    );

    return res.json({ ok: true, added: targets.length, scheduled_at: scheduledAt });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;