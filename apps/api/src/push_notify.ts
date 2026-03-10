import webpush from "web-push";
import { pool } from "./db";

type PushTarget = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushSummary = {
  ok: boolean;
  sent: number;
  total: number;
  skipped?: boolean;
  reason?: string;
};

const columnExistsCache = new Map<string, boolean>();
let vapidConfigured = false;
let vapidChecked = false;

function clipText(v: any, max = 140) {
  const text = String(v || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function normalizePhone(v: any) {
  const text = String(v || "").trim();
  if (!text) return "-";
  const base = text.includes("@") ? text.split("@")[0] : text;
  return base.replace(/[^\d+]/g, "") || base;
}

function ensureVapidConfigured() {
  if (vapidChecked) return vapidConfigured;
  vapidChecked = true;

  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subj = String(process.env.VAPID_SUBJECT || "mailto:admin@local.test").trim();

  if (!pub || !priv) {
    console.warn("[Push] VAPID key belum diset. Push notification dinonaktifkan.");
    vapidConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subj, pub, priv);
  vapidConfigured = true;
  return true;
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

async function hasPushTable() {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'push_subscriptions'`
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

type PushMessage = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

function mapEventToPushMessage(eventName: string, payload: any): PushMessage | null {
  if (eventName === "message.incoming") {
    const from = normalizePhone(payload?.from);
    const text = clipText(payload?.text || `[${String(payload?.messageType || "message").toUpperCase()}]`, 120);
    return {
      title: "Pesan Masuk",
      body: `${from}: ${text || "Pesan baru"}`,
      tag: `msg-in-${String(payload?.sessionKey || "global")}`,
      url: "/inbox",
    };
  }

  if (eventName === "session.update") {
    const status = String(payload?.status || "").toLowerCase();
    if (status !== "connected") return null;
    return {
      title: "Session Terhubung",
      body: `Session ${String(payload?.sessionKey || "-")} connected ${payload?.phone ? `(${normalizePhone(payload.phone)})` : ""}`.trim(),
      tag: `session-connected-${String(payload?.sessionKey || "unknown")}`,
      url: "/sessions",
    };
  }

  if (eventName === "broadcast.status") {
    const status = String(payload?.status || "").toLowerCase();
    if (status === "sent") {
      return {
        title: "Broadcast Terkirim",
        body: `Session ${String(payload?.sessionKey || "-")} berhasil kirim ke ${normalizePhone(payload?.to)}`,
        tag: `broadcast-sent-${String(payload?.sessionKey || "unknown")}`,
        url: "/broadcast",
      };
    }
    if (status === "read") {
      return {
        title: "Broadcast Dibaca",
        body: `Pesan broadcast dibaca oleh ${normalizePhone(payload?.to)}`,
        tag: `broadcast-read-${normalizePhone(payload?.to)}`,
        url: "/broadcast",
      };
    }
    return null;
  }

  if (eventName === "broadcast.reply") {
    return {
      title: "Broadcast Dibalas",
      body: clipText(payload?.reply_text || "Ada balasan baru", 140),
      tag: `broadcast-reply-${normalizePhone(payload?.from_number)}`,
      url: "/broadcast",
    };
  }

  if (eventName === "followup.sent") {
    return {
      title: "Auto Follow Up Terkirim",
      body: `Pesan follow up terkirim ke ${normalizePhone(payload?.to_number || payload?.to_jid)}`,
      tag: `followup-sent-${String(payload?.target_id || "target")}`,
      url: "/follow-up",
    };
  }

  if (eventName === "followup.replied") {
    return {
      title: "Auto Follow Up Dibalas",
      body: clipText(payload?.text || `Balasan dari ${normalizePhone(payload?.from)}`, 140),
      tag: `followup-replied-${normalizePhone(payload?.from)}`,
      url: "/follow-up",
    };
  }

  if (eventName === "lead.created") {
    const source = String(payload?.source || "unknown");
    const status = String(payload?.status || "cold");
    return {
      title: "Leads Masuk",
      body: `${normalizePhone(payload?.phone_number)} | Source: ${source} | Status: ${status}`,
      tag: `lead-created-${normalizePhone(payload?.phone_number)}`,
      url: "/leads",
    };
  }

  if (eventName === "system.test") {
    return {
      title: String(payload?.title || "Wasaas"),
      body: clipText(payload?.body || "Test push notification", 140),
      tag: "system-test",
      url: "/dashboard",
    };
  }

  return null;
}

async function fetchPushTargets(tenantId: number): Promise<PushTarget[]> {
  if (!(await hasPushTable())) return [];

  const hasIsActive = await hasColumn("push_subscriptions", "is_active");
  const hasP256dh = await hasColumn("push_subscriptions", "p256dh");
  const hasAuth = await hasColumn("push_subscriptions", "auth");
  const hasKeysJson = await hasColumn("push_subscriptions", "keys_json");
  const whereActive = hasIsActive ? "AND is_active=1" : "";

  if (hasP256dh && hasAuth) {
    const [rows] = await pool.query<any[]>(
      `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE tenant_id=? ${whereActive}
       ORDER BY id DESC
       LIMIT 60`,
      [tenantId]
    );
    const seen = new Set<string>();
    const out: PushTarget[] = [];
    for (const r of rows) {
      const endpoint = String(r?.endpoint || "").trim();
      const p256dh = String(r?.p256dh || "").trim();
      const auth = String(r?.auth || "").trim();
      if (!endpoint || !p256dh || !auth || seen.has(endpoint)) continue;
      seen.add(endpoint);
      out.push({ id: Number(r.id || 0), endpoint, p256dh, auth });
    }
    return out;
  }

  if (hasKeysJson) {
    const [rows] = await pool.query<any[]>(
      `SELECT id, endpoint, keys_json
       FROM push_subscriptions
       WHERE tenant_id=? ${whereActive}
       ORDER BY id DESC
       LIMIT 60`,
      [tenantId]
    );
    const seen = new Set<string>();
    const out: PushTarget[] = [];
    for (const r of rows) {
      const endpoint = String(r?.endpoint || "").trim();
      if (!endpoint || seen.has(endpoint)) continue;
      seen.add(endpoint);
      let keys: any = {};
      try {
        keys = JSON.parse(String(r?.keys_json || "{}"));
      } catch {
        keys = {};
      }
      const p256dh = String(keys?.p256dh || "").trim();
      const auth = String(keys?.auth || "").trim();
      if (!p256dh || !auth) continue;
      out.push({ id: Number(r.id || 0), endpoint, p256dh, auth });
    }
    return out;
  }

  return [];
}

async function markPushTargetInactive(id: number) {
  if (!id) return;
  if (await hasColumn("push_subscriptions", "is_active")) {
    await pool.query(`UPDATE push_subscriptions SET is_active=0 WHERE id=?`, [id]);
    return;
  }
  await pool.query(`DELETE FROM push_subscriptions WHERE id=?`, [id]);
}

export async function saveTenantPushSubscription(input: {
  tenantId: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  if (!(await hasPushTable())) {
    throw new Error("push_subscriptions table missing");
  }

  const hasP256dh = await hasColumn("push_subscriptions", "p256dh");
  const hasAuth = await hasColumn("push_subscriptions", "auth");
  const hasKeysJson = await hasColumn("push_subscriptions", "keys_json");
  const hasUserAgent = await hasColumn("push_subscriptions", "user_agent");
  const hasIsActive = await hasColumn("push_subscriptions", "is_active");

  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.p256dh || "").trim();
  const auth = String(input.auth || "").trim();
  const userAgent = String(input.userAgent || "").trim() || null;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("invalid push subscription");
  }

  const [existing] = await pool.query<any[]>(
    `SELECT id FROM push_subscriptions WHERE tenant_id=? AND endpoint=? ORDER BY id DESC LIMIT 1`,
    [input.tenantId, endpoint]
  );

  const keysJson = JSON.stringify({ p256dh, auth });

  if (existing?.length) {
    const id = Number(existing[0].id || 0);
    const updates: string[] = ["tenant_id=?", "user_id=?", "endpoint=?"];
    const params: any[] = [input.tenantId, input.userId, endpoint];

    if (hasP256dh) {
      updates.push("p256dh=?");
      params.push(p256dh);
    }
    if (hasAuth) {
      updates.push("auth=?");
      params.push(auth);
    }
    if (hasKeysJson) {
      updates.push("keys_json=?");
      params.push(keysJson);
    }
    if (hasUserAgent) {
      updates.push("user_agent=?");
      params.push(userAgent);
    }
    if (hasIsActive) {
      updates.push("is_active=1");
    }

    params.push(id);
    await pool.query(`UPDATE push_subscriptions SET ${updates.join(", ")} WHERE id=?`, params);
    return { id, created: false };
  }

  const columns = ["tenant_id", "user_id", "endpoint"];
  const values: any[] = [input.tenantId, input.userId, endpoint];

  if (hasP256dh) {
    columns.push("p256dh");
    values.push(p256dh);
  }
  if (hasAuth) {
    columns.push("auth");
    values.push(auth);
  }
  if (hasKeysJson) {
    columns.push("keys_json");
    values.push(keysJson);
  }
  if (hasUserAgent) {
    columns.push("user_agent");
    values.push(userAgent);
  }
  if (hasIsActive) {
    columns.push("is_active");
    values.push(1);
  }

  const [ins] = await pool.query<any>(
    `INSERT INTO push_subscriptions(${columns.join(",")})
     VALUES(${columns.map(() => "?").join(",")})`,
    values
  );

  return { id: Number(ins?.insertId || 0), created: true };
}

export async function dispatchTenantPushNotification(
  tenantId: number,
  eventName: string,
  payload: any
): Promise<PushSummary> {
  if (!ensureVapidConfigured()) {
    return { ok: false, sent: 0, total: 0, skipped: true, reason: "vapid_missing" };
  }

  const mapped = mapEventToPushMessage(eventName, payload);
  if (!mapped) return { ok: true, sent: 0, total: 0, skipped: true, reason: "event_filtered" };

  const targets = await fetchPushTargets(tenantId);
  if (!targets.length) return { ok: true, sent: 0, total: 0, skipped: true, reason: "no_subscriptions" };

  const notificationPayload = JSON.stringify({
    title: mapped.title,
    body: mapped.body,
    tag: mapped.tag,
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    data: {
      url: mapped.url,
      eventName,
      payload,
      at: new Date().toISOString(),
    },
  });

  let sent = 0;
  for (const t of targets) {
    try {
      await webpush.sendNotification(
        {
          endpoint: t.endpoint,
          keys: { p256dh: t.p256dh, auth: t.auth },
        } as any,
        notificationPayload,
        { TTL: 120 }
      );
      sent += 1;
    } catch (e: any) {
      const code = Number(e?.statusCode || 0);
      if (code === 404 || code === 410) {
        await markPushTargetInactive(t.id).catch(() => { });
      }
    }
  }

  return { ok: true, sent, total: targets.length };
}

