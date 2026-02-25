import webpush from "web-push";
import { pool } from "./db";

function cfg() {
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  const priv = process.env.VAPID_PRIVATE_KEY || "";
  const subj = process.env.VAPID_SUBJECT || "mailto:admin@local.test";
  if (!pub || !priv) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(subj, pub, priv);
  return { pub };
}

export async function getVapidKey(req:any,res:any) {
  const { pub } = cfg();
  return res.json({ ok:true, publicKey: pub });
}

export async function saveSubscription(req:any,res:any) {
  cfg();
  const sub = req.body?.subscription;
  if (!sub?.endpoint) return res.status(400).json({ ok:false, error:"subscription required" });

  const tenantId = req.auth.tenantId;
  const userId = req.auth.userId;

  await pool.query(
    `INSERT INTO push_subscriptions(tenant_id,user_id,endpoint,keys_json,created_at)
     VALUES(?,?,?, ?, NOW())
     ON DUPLICATE KEY UPDATE keys_json=VALUES(keys_json)`,
    [tenantId, userId, sub.endpoint, JSON.stringify(sub.keys || {})]
  );

  return res.json({ ok:true });
}

export async function sendTest(req:any,res:any) {
  cfg();
  const tenantId = req.auth.tenantId;
  const [rows] = await pool.query<any[]>(
    `SELECT endpoint, keys_json FROM push_subscriptions WHERE tenant_id=? ORDER BY id DESC LIMIT 20`,
    [tenantId]
  );

  const payload = JSON.stringify({ title:"WA SaaS", body:"Test push notification ✅" });

  let sent = 0;
  for (const r of rows) {
    const subscription = { endpoint: r.endpoint, keys: JSON.parse(r.keys_json || "{}") };
    try { await webpush.sendNotification(subscription as any, payload); sent++; } catch {}
  }

  return res.json({ ok:true, sent });
}
