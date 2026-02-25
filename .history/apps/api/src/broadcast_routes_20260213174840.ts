import { z } from "zod";
import { 
  createBroadcastJob, 
  getBroadcastJob, 
  getBroadcastItems, 
  deleteBroadcastJob 
} from "./broadcast";

// POST /broadcast (Create)
export async function createBroadcast(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    name: z.string().min(1).max(160).optional(),
    delayMs: z.number().min(0).max(60000).default(1200),
    targets: z.array(z.string().min(8).max(30)).min(1).max(5000),
    text: z.string().min(1).max(4096)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const nameFinal =
    parsed.data.name ||
    `Broadcast ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

  const result = await createBroadcastJob({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    sessionKey: parsed.data.sessionKey,
    name: nameFinal,
    delayMs: parsed.data.delayMs,
    targets: parsed.data.targets,
    text: parsed.data.text
  });

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