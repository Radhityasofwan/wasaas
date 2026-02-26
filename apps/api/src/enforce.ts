import { getTenantLimits, countActiveSessions, countMessagesToday } from "./limits";

export async function enforceSessionLimit(req: any, res: any, next: any) {
  const tenantId = req.auth?.tenantId;
  if (!tenantId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const lim = await getTenantLimits(tenantId);
  const active = await countActiveSessions(tenantId);

  if (active >= lim.limitSessions) {
    return res.status(429).json({
      ok: false,
      error: "session_limit_reached",
      limit: lim.limitSessions,
      active
    });
  }

  next();
}

export async function enforceMessageLimit(req: any, res: any, next: any) {
  const tenantId = req.auth?.tenantId;
  if (!tenantId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const lim = await getTenantLimits(tenantId);
  const used = await countMessagesToday(tenantId);

  if (used >= lim.limitMsgDay) {
    return res.status(429).json({
      ok: false,
      error: "message_limit_reached",
      limit: lim.limitMsgDay,
      used
    });
  }

  next();
}
