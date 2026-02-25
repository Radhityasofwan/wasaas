import { pool } from "./db";

async function hasColumn(table: string, col: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [table, col]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function addColumn(table: string, ddl: string) {
  await pool.query(`ALTER TABLE ${table} ${ddl}`);
}

export async function migrateLimits() {
  // wa_sessions: add tenant_id,user_id,status
  if (!(await hasColumn("wa_sessions", "tenant_id"))) {
    await addColumn("wa_sessions", "ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id");
    await pool.query(`CREATE INDEX idx_wa_sessions_tenant_id ON wa_sessions(tenant_id)`);
  }
  if (!(await hasColumn("wa_sessions", "user_id"))) {
    await addColumn("wa_sessions", "ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER tenant_id");
    await pool.query(`CREATE INDEX idx_wa_sessions_user_id ON wa_sessions(user_id)`);
  }
  if (!(await hasColumn("wa_sessions", "status"))) {
    await addColumn("wa_sessions", "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER session_key");
    await pool.query(`CREATE INDEX idx_wa_sessions_status ON wa_sessions(status)`);
  }

  // wa_messages: add tenant_id,user_id,created_date for daily counting
  if (!(await hasColumn("wa_messages", "tenant_id"))) {
    await addColumn("wa_messages", "ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id");
    await pool.query(`CREATE INDEX idx_wa_messages_tenant_id ON wa_messages(tenant_id)`);
  }
  if (!(await hasColumn("wa_messages", "user_id"))) {
    await addColumn("wa_messages", "ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER tenant_id");
    await pool.query(`CREATE INDEX idx_wa_messages_user_id ON wa_messages(user_id)`);
  }
  if (!(await hasColumn("wa_messages", "created_date"))) {
    await addColumn("wa_messages", "ADD COLUMN created_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED");
    await pool.query(`CREATE INDEX idx_wa_messages_tenant_date ON wa_messages(tenant_id, created_date)`);
  }

  // tenants override limits (optional)
  if (!(await hasColumn("tenants", "limit_sessions"))) {
    await addColumn("tenants", "ADD COLUMN limit_sessions INT NULL");
  }
  if (!(await hasColumn("tenants", "limit_messages_per_day"))) {
    await addColumn("tenants", "ADD COLUMN limit_messages_per_day INT NULL");
  }

  // plans limits (kalau belum ada)
  if (!(await hasColumn("plans", "limit_sessions"))) {
    await addColumn("plans", "ADD COLUMN limit_sessions INT NOT NULL DEFAULT 1");
  }
  if (!(await hasColumn("plans", "limit_messages_per_day"))) {
    await addColumn("plans", "ADD COLUMN limit_messages_per_day INT NOT NULL DEFAULT 50");
  }
}
