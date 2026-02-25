import { pool } from "./db";
import crypto from "crypto";

export type AuthCtx = {
  tenantId: number;
  userId: number;
  apiKeyId: number;
  role?: string; // Tambahkan typing role agar terbaca di dashboard
  name?: string;
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

  // Hash raw key untuk dicocokkan dengan api_keys.key_hash
  const keyHash = crypto.createHash("sha256").update(raw).digest("hex");

  // Query menggabungkan data user untuk mengambil role & nama (Diperlukan oleh UI App.tsx)
  const [rows] = await pool.query<any[]>(
    `SELECT a.id, a.tenant_id, a.user_id, a.revoked_at, u.role, u.full_name
     FROM api_keys a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.key_hash = ?
     ORDER BY a.id DESC
     LIMIT 1`,
    [keyHash]
  );

  if (!rows?.length) return res.status(401).json({ ok: false, error: "invalid api key" });
  if (rows[0].revoked_at) return res.status(403).json({ ok: false, error: "api key revoked" });

  req.auth = { 
    apiKeyId: rows[0].id, 
    tenantId: rows[0].tenant_id, 
    userId: rows[0].user_id,
    role: rows[0].role,
    name: rows[0].full_name
  };
  
  return next();
}