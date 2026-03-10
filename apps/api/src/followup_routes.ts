import { Router } from "express";
import { z } from "zod";
import { pool } from "./db";
import { normalizeIndonesiaDigits } from "./phone_normalizer";

const router = Router();

function isValidLatLng(raw: string | null | undefined) {
  const val = String(raw || "").trim();
  if (!val) return false;
  const [latRaw, lngRaw] = val.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function triggerFollowUpWorkerSoon() {
  try {
    require("./followup_worker").processFollowUpQueue().catch(() => { });
  } catch {
    /* ignore */
  }
}

function toSqlDateTime(date: Date) {
  const yyyy = date.getFullYear();
  const mon = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mon}-${dd} ${hh}:${mm}:${ss}`;
}

function calcScheduledAt(baseNow: Date, delayDays: number, targetTime?: string | null) {
  const scheduledAt = new Date(baseNow);
  scheduledAt.setDate(scheduledAt.getDate() + Number(delayDays || 0));

  if (targetTime) {
    const [hh, mm] = String(targetTime).split(":");
    scheduledAt.setHours(Number(hh), Number(mm), 0, 0);
  }

  // Jika jatuh ke masa lalu, dorong ke hari berikutnya agar tetap future-safe.
  if (scheduledAt.getTime() <= baseNow.getTime()) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
  }

  return toSqlDateTime(scheduledAt);
}

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
    const [tplRows] = await pool.query<any[]>(
      `SELECT id, message_type, text_body, media_url
       FROM message_templates
       WHERE id = ? AND tenant_id = ?`,
      [template_id, req.auth.tenantId]
    );
    if (!tplRows.length) return res.status(400).json({ ok: false, error: "Template tidak ditemukan" });
    const tpl = tplRows[0];
    const tplType = String(tpl.message_type || "").trim().toLowerCase();
    if (tplType === "text" && !String(tpl.text_body || "").trim()) {
      return res.status(400).json({ ok: false, error: "Template text tidak memiliki isi pesan." });
    }
    if (tplType === "location" && !isValidLatLng(tpl.media_url)) {
      return res.status(400).json({ ok: false, error: "Template location harus memiliki media_url lat,lng yang valid." });
    }
    if (tplType && tplType !== "text" && tplType !== "location" && !String(tpl.media_url || "").trim()) {
      return res.status(400).json({ ok: false, error: "Template media belum memiliki file/URL media." });
    }

    await pool.query(
      `INSERT INTO followup_campaigns 
        (tenant_id, user_id, session_key, name, template_id, delay_days, target_time, trigger_condition, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [req.auth.tenantId, req.auth.userId, session_key, name, template_id, delay_days, target_time, trigger_condition]
    );
    triggerFollowUpWorkerSoon();
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
    if (status === "active") triggerFollowUpWorkerSoon();
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

// DELETE: Delete a Target
router.delete("/targets/:id", async (req: any, res: any) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM followup_targets WHERE id = ? AND tenant_id = ?`,
      [req.params.id, req.auth.tenantId]
    );
    
    // cast result to any since we need affectedRows property for type mapping
    if ((result as any).affectedRows === 0) {
       return res.status(404).json({ ok: false, error: 'Target tidak ditemukan' });
    }
    
    return res.json({ ok: true, message: 'Target berhasil dihapus' });
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
  const validTargets = Array.from(
    new Set(
      targets
        .map((t: string) => normalizeIndonesiaDigits(t))
        .filter((x): x is string => Boolean(x))
    )
  );
  if (!validTargets.length) {
    return res.status(400).json({ ok: false, error: "Tidak ada target nomor Indonesia valid (+62)." });
  }

  try {
    // 1. Ambil detail campaign untuk mengecek apakah ini bagian dari Sequence
    const [camps] = await pool.query<any[]>(
      `SELECT id, name, delay_days, target_time, trigger_condition 
       FROM followup_campaigns 
       WHERE id = ? AND tenant_id = ?`,
      [campaignId, tenantId]
    );
    if (!camps.length) return res.status(404).json({ ok: false, error: "Campaign tidak ditemukan" });

    const baseNameFull = camps[0].name;
    let targetCampaigns = [];

    // Deteksi jika pola adalah Sequence (" - Step ")
    if (baseNameFull.includes(" - Step ")) {
      const basePrefix = baseNameFull.split(" - Step ")[0];
      // Ambil SELURUH anak tangga (step 1, 2, 3...)
      const [seqCamps] = await pool.query<any[]>(
        `SELECT id, delay_days, target_time, trigger_condition 
         FROM followup_campaigns 
         WHERE name LIKE ? AND session_key = ? AND tenant_id = ? 
         ORDER BY delay_days ASC, id ASC`,
        [`${basePrefix} - Step %`, sessionKey, tenantId]
      );
      targetCampaigns = seqCamps;
    } else {
      // Jika campaign tunggal, pastikan targetCampaigns adalah Array (Bug fix!)
      targetCampaigns = [camps[0]];
    }

    let totalAdded = 0;

    const baseNow = new Date();
    // 2. Looping ke seluruh Campaign (Step) untuk mendistribusikan target
    for (const camp of targetCampaigns) {
      // Kalkulasi scheduled_at per step berdasarkan delay + target_time step.
      const scheduledAtStr = calcScheduledAt(baseNow, camp.delay_days, camp.target_time);

      // 4. Bulk Insert Targets (Aman untuk banyak nomor sekaligus)
      const vals = validTargets.map((num: string) => [
        camp.id, tenantId, sessionKey, num, num + '@s.whatsapp.net', scheduledAtStr, 'queued'
      ]);

      await pool.query(
        `INSERT INTO followup_targets (campaign_id, tenant_id, session_key, to_number, to_jid, scheduled_at, status) VALUES ?`,
        [vals]
      );
      totalAdded += validTargets.length;
    }

    triggerFollowUpWorkerSoon();
    return res.json({ ok: true, added_targets: validTargets.length, total_queued_in_sequence: totalAdded });
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
      `SELECT id, name, session_key, delay_days, target_time, trigger_condition 
       FROM followup_campaigns 
       WHERE id = ? AND tenant_id = ?`,
      [campaign_id, tenantId]
    );
    if (!camps.length) return res.status(404).json({ ok: false, error: "Campaign tidak ditemukan" });

    const selectedCamp = camps[0];
    const sessionKey = selectedCamp.session_key;
    const baseNameFull = selectedCamp.name || "";
    let targetCampaigns: any[] = [];

    if (baseNameFull.includes(" - Step ")) {
      const basePrefix = baseNameFull.split(" - Step ")[0];
      const [seqCamps] = await pool.query<any[]>(
        `SELECT id, session_key, delay_days, target_time, trigger_condition
         FROM followup_campaigns
         WHERE name LIKE ? AND session_key = ? AND tenant_id = ?
         ORDER BY delay_days ASC, id ASC`,
        [`${basePrefix} - Step %`, sessionKey, tenantId]
      );
      targetCampaigns = seqCamps;
    } else {
      targetCampaigns = [selectedCamp];
    }

    let added = 0;

    const baseNow = new Date();
    for (const rawNumber of phone_numbers) {
      const cleaned = normalizeIndonesiaDigits(rawNumber);
      if (!cleaned) continue;

      const to_jid = cleaned + '@s.whatsapp.net';
      for (const camp of targetCampaigns) {
        const [existing] = await pool.query<any[]>(
          `SELECT id FROM followup_targets WHERE campaign_id = ? AND to_jid = ? AND tenant_id = ?`,
          [camp.id, to_jid, tenantId]
        );

        if (existing.length === 0) {
          const scheduledAtStr = calcScheduledAt(baseNow, camp.delay_days, camp.target_time);
          await pool.query(
            `INSERT INTO followup_targets (campaign_id, tenant_id, session_key, to_number, to_jid, scheduled_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', NOW())`,
            [camp.id, tenantId, sessionKey, cleaned, to_jid, scheduledAtStr]
          );
          added++;
        }
      }
    }

    triggerFollowUpWorkerSoon();
    return res.json({ ok: true, added });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
