import crypto from "crypto";
import { pool } from "./db";

export function makeApiKey() {
  return "live_" + crypto.randomBytes(32).toString("hex");
}
export function hashKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function listApiKeys(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, name, scopes_json, last_used_at, revoked_at, created_at
     FROM api_keys
     WHERE tenant_id = ?
     ORDER BY id DESC`,
    [tenantId]
  );
  return rows;
}

export async function createApiKey(tenantId: number, userId: number, name: string, scopes: any[] | null) {
  const apiKey = makeApiKey();
  const keyHash = hashKey(apiKey);
  const scopesJson = scopes?.length ? JSON.stringify(scopes) : null;

  const [res] = await pool.query<any>(
    `INSERT INTO api_keys(tenant_id, user_id, name, key_hash, scopes_json)
     VALUES(?, ?, ?, ?, ?)`,
    [tenantId, userId, name, keyHash, scopesJson]
  );

  return { id: res.insertId, apiKey };
}

export async function revokeApiKey(tenantId: number, id: number) {
  const [res] = await pool.query<any>(
    `UPDATE api_keys
     SET revoked_at = NOW()
     WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL`,
    [id, tenantId]
  );
  return { affectedRows: res.affectedRows || 0 };
}
