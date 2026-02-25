import { z } from "zod";
import { createBroadcastJob } from "./broadcast";

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
