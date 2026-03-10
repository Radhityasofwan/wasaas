import webpush from "web-push";
import { dispatchTenantPushNotification, saveTenantPushSubscription } from "./push_notify";

function cfg() {
  const pub = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subj = String(process.env.VAPID_SUBJECT || "mailto:admin@local.test").trim();
  if (!pub || !priv) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(subj, pub, priv);
  return { pub };
}

export async function getVapidKey(req: any, res: any) {
  try {
    const { pub } = cfg();
    return res.json({ ok: true, publicKey: pub });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "failed to load vapid key" });
  }
}

export async function saveSubscription(req: any, res: any) {
  try {
    cfg();
    const sub = req.body?.subscription;
    if (!sub?.endpoint) return res.status(400).json({ ok: false, error: "subscription required" });
    if (!sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ ok: false, error: "invalid subscription keys" });
    }

    const tenantId = Number(req.auth?.tenantId || 0);
    const userId = Number(req.auth?.userId || 0);
    if (!tenantId || !userId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const out = await saveTenantPushSubscription({
      tenantId,
      userId,
      endpoint: String(sub.endpoint),
      p256dh: String(sub.keys.p256dh),
      auth: String(sub.keys.auth),
      userAgent: String(req.headers["user-agent"] || ""),
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "failed to save push subscription" });
  }
}

export async function sendTest(req: any, res: any) {
  try {
    cfg();
    const tenantId = Number(req.auth?.tenantId || 0);
    if (!tenantId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const out = await dispatchTenantPushNotification(tenantId, "system.test", {
      title: "Wasaas",
      body: "Test push notification berhasil.",
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "failed to send push test" });
  }
}
