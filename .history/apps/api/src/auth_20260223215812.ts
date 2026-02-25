import { pool } from "./db";
import crypto from "crypto";

export type AuthCtx = {
  tenantId: number;
  userId: number;
  apiKeyId: number;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthCtx;
    }
  }
}

// Header: x-api-key: live_...
export async function apiKeyAuth(req: any, res: any, next: any) {
  const raw = String(req.header("x-api-key") || "").trim();
  if (!raw) return res.status(401).json({ ok: false, error: "missing x-api-key" });

  // hash raw key to match api_keys.key_hash
  const keyHash = crypto.createHash("sha256").update(raw).digest("hex");

  const [rows] = await pool.query<any[]>(
    `SELECT id, tenant_id, user_id, revoked_at
     FROM api_keys
     WHERE key_hash = ?
     ORDER BY id DESC
     LIMIT 1`,
    [keyHash]
  );

  if (!rows?.length) return res.status(401).json({ ok: false, error: "invalid api key" });
  if (rows[0].revoked_at) return res.status(403).json({ ok: false, error: "api key revoked" });

  req.auth = { apiKeyId: rows[0].id, tenantId: rows[0].tenant_id, userId: rows[0].user_id };
  return next();
}
