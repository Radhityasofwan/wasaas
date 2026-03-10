import { pool } from "./db";

type LimitContext = {
  userId?: number;
  role?: string | null;
};

const DEFAULT_LIMITS = {
  sessions: 1,
  messagesDaily: 50,
  broadcastDaily: 1,
};

const columnExistsCache = new Map<string, boolean>();

function normalizeLimit(value: any, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

async function hasColumn(table: string, column: string) {
  const key = `${table}.${column}`;
  if (columnExistsCache.has(key)) return columnExistsCache.get(key) as boolean;

  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );

  const exists = Number(rows?.[0]?.c || 0) > 0;
  columnExistsCache.set(key, exists);
  return exists;
}

async function readTenantLegacyLimits(tenantId: number) {
  const selectCols: string[] = [];

  if (await hasColumn("tenants", "limit_sessions")) {
    selectCols.push("limit_sessions");
  }
  if (await hasColumn("tenants", "limit_messages_per_day")) {
    selectCols.push("limit_messages_per_day");
  }
  if (await hasColumn("tenants", "limit_broadcast_daily")) {
    selectCols.push("limit_broadcast_daily");
  }

  if (!selectCols.length) return {};

  const [rows] = await pool.query<any[]>(
    `SELECT ${selectCols.join(", ")}
     FROM tenants
     WHERE id=?
     LIMIT 1`,
    [tenantId]
  );

  return rows?.[0] || {};
}

async function isSuperadmin(ctx: LimitContext | undefined, tenantId: number) {
  const role = String(ctx?.role || "").toLowerCase();
  if (role === "admin") return true;

  const userId = Number(ctx?.userId || 0);
  if (!userId) return false;

  const [rows] = await pool.query<any[]>(
    `SELECT role
     FROM users
     WHERE id=? AND tenant_id=?
     LIMIT 1`,
    [userId, tenantId]
  );
  return String(rows?.[0]?.role || "").toLowerCase() === "admin";
}

export async function getTenantLimits(tenantId: number) {
  const [subRows] = await pool.query<any[]>(
    `SELECT
        s.id,
        s.status,
        s.limit_sessions,
        s.limit_messages_daily,
        s.limit_broadcast_daily,
        p.limit_sessions AS plan_limit_sessions,
        p.limit_messages_daily AS plan_limit_messages_daily,
        p.limit_broadcast_daily AS plan_limit_broadcast_daily
     FROM subscriptions s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.tenant_id=?
     ORDER BY
       CASE s.status
         WHEN 'active' THEN 0
         WHEN 'trial' THEN 1
         WHEN 'past_due' THEN 2
         WHEN 'canceled' THEN 3
         WHEN 'expired' THEN 4
         ELSE 5
       END ASC,
       s.id DESC
     LIMIT 1`,
    [tenantId]
  );
  const legacy = await readTenantLegacyLimits(tenantId);

  if (subRows.length) {
    const s = subRows[0];
    const limitSessions = normalizeLimit(
      s.limit_sessions ?? s.plan_limit_sessions ?? legacy.limit_sessions,
      DEFAULT_LIMITS.sessions
    );
    const limitMsgDay = normalizeLimit(
      s.limit_messages_daily ?? s.plan_limit_messages_daily ?? legacy.limit_messages_per_day,
      DEFAULT_LIMITS.messagesDaily
    );
    const limitBroadcastDay = normalizeLimit(
      s.limit_broadcast_daily ?? s.plan_limit_broadcast_daily ?? legacy.limit_broadcast_daily,
      DEFAULT_LIMITS.broadcastDaily
    );

    return { limitSessions, limitMsgDay, limitBroadcastDay, source: "subscription_snapshot" };
  }

  const [planRows] = await pool.query<any[]>(
    `SELECT limit_sessions, limit_messages_daily, limit_broadcast_daily
     FROM plans
     WHERE is_active=1
     ORDER BY id ASC
     LIMIT 1`
  );

  const p = planRows?.[0] || {};
  const limitSessions = normalizeLimit(
    legacy.limit_sessions ?? p.limit_sessions,
    DEFAULT_LIMITS.sessions
  );
  const limitMsgDay = normalizeLimit(
    legacy.limit_messages_per_day ?? p.limit_messages_daily,
    DEFAULT_LIMITS.messagesDaily
  );
  const limitBroadcastDay = normalizeLimit(
    legacy.limit_broadcast_daily ?? p.limit_broadcast_daily,
    DEFAULT_LIMITS.broadcastDaily
  );

  return { limitSessions, limitMsgDay, limitBroadcastDay, source: "plan_default" };
}

export async function enforceSessionLimit(tenantId: number, ctx?: LimitContext) {
  if (await isSuperadmin(ctx, tenantId)) return;

  const { limitSessions } = await getTenantLimits(tenantId);
  if (limitSessions <= 0) return;

  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_sessions
     WHERE tenant_id=? AND status IN ('created','connecting','connected')`,
    [tenantId]
  );

  const active = Number(rows?.[0]?.c ?? 0);
  if (active >= limitSessions) {
    throw new Error(`session limit reached: ${active}/${limitSessions}`);
  }
}

export async function enforceMessageLimit(tenantId: number, ctx?: LimitContext) {
  if (await isSuperadmin(ctx, tenantId)) return;

  const { limitMsgDay } = await getTenantLimits(tenantId);
  if (limitMsgDay <= 0) return;

  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_messages
     WHERE tenant_id=?
       AND direction='out'
       AND status IN ('queued','sent','delivered','read')
       AND created_at >= CURDATE() AND created_at < (CURDATE() + INTERVAL 1 DAY)`,
    [tenantId]
  );
  const sentToday = Number(rows?.[0]?.c ?? 0);
  if (sentToday >= limitMsgDay) {
    throw new Error(`daily message limit reached: ${sentToday}/${limitMsgDay}`);
  }
}

export async function enforceBroadcastLimit(tenantId: number, ctx?: LimitContext) {
  if (await isSuperadmin(ctx, tenantId)) return;

  const { limitBroadcastDay } = await getTenantLimits(tenantId);
  if (limitBroadcastDay <= 0) return;

  const used = await countBroadcastsToday(tenantId);
  if (used >= limitBroadcastDay) {
    throw new Error(`daily broadcast limit reached: ${used}/${limitBroadcastDay}`);
  }
}

export async function countActiveSessions(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_sessions
     WHERE tenant_id=? AND status IN ('created','connecting','connected')`,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function countMessagesToday(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_messages
     WHERE tenant_id=?
       AND direction='out'
       AND status IN ('queued','sent','delivered','read')
       AND created_at >= CURDATE() AND created_at < (CURDATE() + INTERVAL 1 DAY)`,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function countBroadcastsToday(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM broadcast_jobs
     WHERE tenant_id=?
       AND created_at >= CURDATE() AND created_at < (CURDATE() + INTERVAL 1 DAY)`,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}
