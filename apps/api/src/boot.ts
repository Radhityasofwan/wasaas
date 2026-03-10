import { pool } from "./db";
import { startSession } from "./wa";

export async function bootSessions() {
  // boot semua session yang statusnya masih nyambung / terakhir known
  const [rows] = await pool.query<any[]>(
    `SELECT session_key, tenant_id, user_id, status
     FROM wa_sessions
     WHERE status IN ('connecting','connected')
     ORDER BY id ASC`
  );

  for (const r of rows) {
    try {
      await startSession(String(r.session_key), {
        tenantId: Number(r.tenant_id),
        userId: Number(r.user_id)
      });
      console.log("booted session:", r.session_key);
    } catch (e: any) {
      console.log("failed to boot session:", r.session_key, e?.message || e);
    }
  }
}


// ===== LIMIT MIDDLEWARE WRAPPERS =====
export async function enforceMessageLimitMw(req: any, res: any, next: any) {
  try {
    const { enforceMessageLimit } = require("./limits");
    const tenantId = Number(req?.auth?.tenantId || 0);
    const userId = Number(req?.auth?.userId || 0);
    const role = String(req?.auth?.role || "");
    if (!tenantId) return res.status(401).json({ ok: false, error: "missing tenant auth" });

    await enforceMessageLimit(tenantId, { userId, role });
    return next();
  } catch (e: any) {
    const msg = String(e?.message || e);
    // limit -> 429
    if (msg.includes("daily message limit reached")) {
      return res.status(429).json({ ok: false, error: msg });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}

export async function enforceSessionLimitMw(req: any, res: any, next: any) {
  try {
    const { enforceSessionLimit } = require("./limits");
    const tenantId = Number(req?.auth?.tenantId || 0);
    const userId = Number(req?.auth?.userId || 0);
    const role = String(req?.auth?.role || "");
    if (!tenantId) return res.status(401).json({ ok: false, error: "missing tenant auth" });

    await enforceSessionLimit(tenantId, { userId, role });
    return next();
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("session limit reached")) {
      return res.status(429).json({ ok: false, error: msg });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}

export async function enforceBroadcastLimitMw(req: any, res: any, next: any) {
  try {
    const { enforceBroadcastLimit } = require("./limits");
    const tenantId = Number(req?.auth?.tenantId || 0);
    const userId = Number(req?.auth?.userId || 0);
    const role = String(req?.auth?.role || "");
    if (!tenantId) return res.status(401).json({ ok: false, error: "missing tenant auth" });

    await enforceBroadcastLimit(tenantId, { userId, role });
    return next();
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("daily broadcast limit reached")) {
      return res.status(429).json({ ok: false, error: msg });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}
