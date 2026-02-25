import "dotenv/config";
import crypto from "crypto";
import { pool } from "./db";

function makeApiKey() {
  // format jelas + panjang aman
  return "live_" + crypto.randomBytes(32).toString("hex"); // 64 hex chars
}

function hashKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function main() {
  const tenantId = 1;
  const userId = 1;

  const apiKey = makeApiKey();
  const keyHash = hashKey(apiKey);

  const [res] = await pool.query<any>(
    `INSERT INTO api_keys(tenant_id, user_id, name, key_hash, scopes_json)
     VALUES(?, ?, ?, ?, NULL)`,
    [tenantId, userId, "Local Key", keyHash]
  );

  console.log("API KEY CREATED ✅");
  console.log("id:", res.insertId);
  console.log("key:", apiKey);
  console.log("note: key hanya tampil sekali, simpan baik-baik.");

  process.exit(0);
}

main().catch((e) => {
  console.error("SEED FAILED:", e?.message || e);
  process.exit(1);
});
