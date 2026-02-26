import { pool } from "./db";

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  return { start, end };
}

export async function getTenantLimits(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT limit_sessions, limit_messages_per_day
     FROM tenants WHERE id=? LIMIT 1`,
    [tenantId]
  );

  const limitSessions = Number(rows?.[0]?.limit_sessions ?? 1);
  const limitMsgDay = Number(rows?.[0]?.limit_messages_per_day ?? 50);

  return { limitSessions, limitMsgDay };
}

export async function enforceSessionLimit(tenantId: number) {
  const { limitSessions } = await getTenantLimits(tenantId);

  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_sessions
     WHERE tenant_id=? AND status IN ('connected','connecting')`,
    [tenantId]
  );

  const active = Number(rows?.[0]?.c ?? 0);
  if (active >= limitSessions) {
    throw new Error(`session limit reached: ${active}/${limitSessions}`);
  }
}

export async function enforceMessageLimit(tenantId: number) {
  const { limitMsgDay } = await getTenantLimits(tenantId);
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_messages
     WHERE tenant_id=? AND direction='out' AND status='sent'
       AND created_at >= CURDATE() AND created_at < (CURDATE() + INTERVAL 1 DAY)`,
    [tenantId]
  );
const sentToday = Number(rows?.[0]?.c ?? 0);
  if (sentToday >= limitMsgDay) {
    throw new Error(`daily message limit reached: ${sentToday}/${limitMsgDay}`);
  }
}

export async function countActiveSessions(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_sessions
     WHERE tenant_id=? AND status IN ('connected','connecting')`,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function countMessagesToday(tenantId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM wa_messages
     WHERE tenant_id=? AND direction='out' AND status='sent'
       AND created_at >= CURDATE() AND created_at < (CURDATE() + INTERVAL 1 DAY)`,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}
