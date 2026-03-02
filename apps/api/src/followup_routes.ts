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
    target_time: z.string(),
    trigger_condition: z.enum(["always", "unreplied", "unread"]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { session_key, name, template_id, delay_days, target_time, trigger_condition } = parsed.data;

  try {
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

// POST: Add Targets to Campaign (Sequence / Bulk Handle)
router.post("/add-targets", async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string(),
    campaignId: z.coerce.number(),
    targets: z.array(z.string()).min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { sessionKey, campaignId, targets } = parsed.data;
  const tenantId = req.auth.tenantId;

  try {
    // 1. Ambil detail campaign untuk mengecek apakah ini bagian dari Sequence
    const [camps] = await pool.query<any[]>(`SELECT id, name, delay_days, target_time FROM followup_campaigns WHERE id = ? AND tenant_id = ?`, [campaignId, tenantId]);
    if (!camps.length) return res.status(404).json({ ok: false, error: "Campaign tidak ditemukan" });

    const baseNameFull = camps[0].name;
    let targetCampaigns = [];

    // Deteksi jika pola adalah Sequence (" - Step ")
    if (baseNameFull.includes(" - Step ")) {
      const basePrefix = baseNameFull.split(" - Step ")[0];
      // Ambil SELURUH anak tangga (step 1, 2, 3...)
      const [seqCamps] = await pool.query<any[]>(
        `SELECT id, delay_days, target_time FROM followup_campaigns WHERE name LIKE ? AND session_key = ? AND tenant_id = ? ORDER BY delay_days ASC`,
        [`${basePrefix} - Step %`, sessionKey, tenantId]
      );
      targetCampaigns = seqCamps;
    } else {
      // Jika campaign tunggal, pastikan targetCampaigns adalah Array (Bug fix!)
      targetCampaigns = [camps[0]];
    }

    let totalAdded = 0;

    // 2. Looping ke seluruh Campaign (Step) untuk mendistribusikan target
    for (const camp of targetCampaigns) {
      // Kalkulasi Tanggal Scheduled
      const now = new Date();
      const scheduledAt = new Date(now);
      scheduledAt.setDate(scheduledAt.getDate() + camp.delay_days);

      if (camp.target_time) {
        const [hh, mm] = camp.target_time.split(":");
        scheduledAt.setHours(Number(hh), Number(mm), 0, 0);
      }

      // Pastikan tidak mengeksekusi di masa lalu
      if (scheduledAt.getTime() <= now.getTime()) {
        scheduledAt.setDate(scheduledAt.getDate() + 1);
      }

      // 3. Bulk Insert Targets (Aman untuk banyak nomor sekaligus)
      const vals = targets.map((num: string) => [
        camp.id, tenantId, sessionKey, num, num + '@s.whatsapp.net', scheduledAt, 'queued'
      ]);

      await pool.query(
        `INSERT INTO followup_targets (campaign_id, tenant_id, session_key, to_number, to_jid, scheduled_at, status) VALUES ?`,
        [vals]
      );
      totalAdded += targets.length;
    }

    return res.json({ ok: true, added_targets: targets.length, total_queued_in_sequence: totalAdded });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST: Manual Trigger Worker
router.post("/trigger-worker", async (req: any, res: any) => {
  try {
    require("./followup_worker").processFollowUpQueue().catch(() => { });
    return res.json({ ok: true, message: "Worker triggered" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST: Manual Leads Input
router.post("/leads/manual", async (req: any, res: any) => {
  const schema = z.object({
    campaign_id: z.coerce.number(),
    phone_numbers: z.array(z.string()).min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const { campaign_id, phone_numbers } = parsed.data;
  const tenantId = req.auth.tenantId;

  try {
    const [camps] = await pool.query<any[]>(
      `SELECT id, session_key, delay_days, target_time FROM followup_campaigns WHERE id = ? AND tenant_id = ?`,
      [campaign_id, tenantId]
    );
    if (!camps.length) return res.status(404).json({ ok: false, error: "Campaign tidak ditemukan" });

    const camp = camps[0];
    const sessionKey = camp.session_key;

    // Calculate scheduledAt
    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + camp.delay_days);

    if (camp.target_time) {
      const [hh, mm] = camp.target_time.split(":");
      scheduledAt.setHours(Number(hh), Number(mm), 0, 0);
    }

    if (scheduledAt.getTime() <= now.getTime()) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    let added = 0;

    for (const rawNumber of phone_numbers) {
      let cleaned = rawNumber.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
      }

      // Basic validation length, minimum WhatsApp number logic
      if (!cleaned.startsWith('62') || cleaned.length < 8) continue;

      const to_jid = cleaned + '@s.whatsapp.net';

      const [existing] = await pool.query<any[]>(
        `SELECT id FROM followup_targets WHERE campaign_id = ? AND to_jid = ? AND tenant_id = ?`,
        [camp.id, to_jid, tenantId]
      );

      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO followup_targets (campaign_id, tenant_id, session_key, to_number, to_jid, scheduled_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', NOW())`,
          [camp.id, tenantId, sessionKey, cleaned, to_jid, scheduledAt]
        );
        added++;
      }
    }

    return res.json({ ok: true, added });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;