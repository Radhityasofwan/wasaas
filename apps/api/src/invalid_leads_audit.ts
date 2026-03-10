import { pool } from "./db";

let schemaEnsured = false;

async function ensureInvalidAuditSchema() {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_invalid_leads_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      channel VARCHAR(40) NOT NULL,
      raw_input VARCHAR(120) NOT NULL,
      reason VARCHAR(120) NOT NULL,
      source_hint VARCHAR(120) NULL,
      payload_json JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cila_tenant_created (tenant_id, created_at),
      KEY idx_cila_channel (channel),
      CONSTRAINT fk_cila_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  schemaEnsured = true;
}

export async function recordInvalidLeadSkip(input: {
  tenantId: number;
  channel: string;
  rawInput: string;
  reason: string;
  sourceHint?: string | null;
  payload?: any;
}) {
  try {
    await ensureInvalidAuditSchema();
    await pool.query(
      `INSERT INTO crm_invalid_leads_audit
        (tenant_id, channel, raw_input, reason, source_hint, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.tenantId,
        String(input.channel || "unknown").slice(0, 40),
        String(input.rawInput || "").slice(0, 120),
        String(input.reason || "invalid_phone").slice(0, 120),
        input.sourceHint ? String(input.sourceHint).slice(0, 120) : null,
        input.payload ? JSON.stringify(input.payload) : null
      ]
    );
  } catch (e) {
    console.error("[INVALID_LEADS_AUDIT] failed to record:", e);
  }
}

export async function listInvalidLeadSkips(req: any, res: any) {
  const tenantId = req.auth.tenantId;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const channel = String(req.query.channel || "").trim();
  const reason = String(req.query.reason || "").trim();

  try {
    await ensureInvalidAuditSchema();

    let where = "WHERE tenant_id = ?";
    const params: any[] = [tenantId];
    if (channel) {
      where += " AND channel = ?";
      params.push(channel);
    }
    if (reason) {
      where += " AND reason = ?";
      params.push(reason);
    }

    const [rows] = await pool.query<any[]>(
      `SELECT id, channel, raw_input, reason, source_hint, payload_json, created_at
       FROM crm_invalid_leads_audit
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [summaryRows] = await pool.query<any[]>(
      `SELECT channel, reason, COUNT(*) as total
       FROM crm_invalid_leads_audit
       ${where}
       GROUP BY channel, reason
       ORDER BY total DESC
       LIMIT 100`,
      params
    );

    return res.json({ ok: true, data: rows, summary: summaryRows, paging: { limit, offset } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || "failed to load invalid leads audit" });
  }
}
