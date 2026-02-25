console.log("INDEX_MARKER=RUNNING_INDEX_TS");

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { z } from "zod";

import { migrate, pool } from "./db";
import { bootSessions, enforceMessageLimitMw, enforceSessionLimitMw } from "./boot";

import { apiKeyAuth } from "./auth";
import { requireSessionOwned } from "./session_guard";

import { startSession } from "./wa";
import { upload, filePublicUrl } from "./upload";
import { sendMediaImage, sendMediaDocument, sendMediaVideo, sendLocation } from "./wa_media";

import { listApiKeys, createApiKey, revokeApiKey } from "./api_keys";

// UI routes
import { listSessions, listConversations, listMessages, markConversationRead, streamSSE } from "./ui_routes";

// SaaS routes
import { setWebhook } from "./webhook_routes";
// Broadcast routes
import { createBroadcast, getJob, getJobItems, deleteJob } from "./broadcast_routes";
import { listBroadcastJobs, cancelBroadcast } from "./broadcast_ui_routes";
// NEW: Leads routes
import { getLeads } from "./leads_routes";

const app = express();

// ===== helpers =====
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label} (${ms}ms)`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// ===== middleware =====
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// serve uploaded files
app.use("/files", express.static(path.join(process.cwd(), "storage", "uploads")));

// ===== basic =====
app.get("/", (_req, res) => {
  res.json({ ok: true, name: process.env.APP_NAME, time: new Date().toISOString() });
});

app.get("/me", apiKeyAuth, (req: any, res: any) => {
  res.json({ ok: true, auth: req.auth });
});

// DEBUG: list registered routes (local dev only)
app.get("/__routes", (_req, res) => {
  const routes: any[] = [];
  const router = (app as any)._router || (app as any).router;
  const stack = router?.stack || [];
  for (const layer of stack) {
    if (layer?.route?.path) {
      const methods = Object.keys(layer.route.methods || {}).filter(Boolean);
      routes.push({ path: layer.route.path, methods });
    }
  }
  res.json({ ok: true, count: routes.length, routes });
});

// ===== API KEYS (dashboard) =====
app.get("/api-keys", apiKeyAuth, async (req: any, res: any) => {
  const rows = await listApiKeys(req.auth.tenantId);
  res.json({ ok: true, data: rows });
});

app.post("/api-keys", apiKeyAuth, async (req: any, res: any) => {
  const name = String(req.body?.name || "API Key").slice(0, 120);
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : null;
  const out = await createApiKey(req.auth.tenantId, req.auth.userId, name, scopes);
  res.json({ ok: true, id: out.id, apiKey: out.apiKey });
});

app.post("/api-keys/:id/revoke", apiKeyAuth, async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "invalid id" });
  const r = await revokeApiKey(req.auth.tenantId, id);
  res.json({ ok: true, affectedRows: r.affectedRows });
});

// ===== Sessions =====
app.post("/sessions/start", apiKeyAuth, enforceSessionLimitMw, async (req: any, res: any) => {
  const schema = z.object({ sessionKey: z.string().min(3).max(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const result = await startSession(parsed.data.sessionKey, {
      tenantId: req.auth.tenantId,
      userId: req.auth.userId
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== TEXT =====
app.post("/messages/send", apiKeyAuth, requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    text: z.string().min(1).max(4096)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const { sendText } = require("./wa");
    const out = await withTimeout(
      sendText(parsed.data.sessionKey, parsed.data.to, parsed.data.text),
      12000,
      "wa.sendText"
    );
    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

/** ping route to confirm media routes are loaded */
app.get("/messages/send-image/ping", (_req, res) => res.json({ ok: true, route: "send-image" }));

// ===== IMAGE =====
app.post("/messages/send-image", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    caption: z.string().max(4096).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  try {
    const url = filePublicUrl(req.file.filename);
    const result = await sendMediaImage({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      sessionKey: parsed.data.sessionKey,
      to: parsed.data.to,
      caption: parsed.data.caption || "",
      filePath: req.file.path,
      mime: req.file.mimetype,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      publicUrl: url
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== DOCUMENT =====
app.post("/messages/send-document", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    caption: z.string().max(4096).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  try {
    const url = filePublicUrl(req.file.filename);
    const result = await sendMediaDocument({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      sessionKey: parsed.data.sessionKey,
      to: parsed.data.to,
      caption: parsed.data.caption || "",
      filePath: req.file.path,
      mime: req.file.mimetype,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      publicUrl: url
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== VIDEO =====
app.post("/messages/send-video", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    caption: z.string().max(4096).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  try {
    const url = filePublicUrl(req.file.filename);
    const result = await sendMediaVideo({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      sessionKey: parsed.data.sessionKey,
      to: parsed.data.to,
      caption: parsed.data.caption || "",
      filePath: req.file.path,
      mime: req.file.mimetype,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      publicUrl: url
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== LOCATION =====
app.post("/messages/send-location", apiKeyAuth, requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().max(120).optional(),
    address: z.string().max(255).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const result = await sendLocation({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      ...parsed.data
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== SaaS routes (webhook & broadcast) =====
app.post("/webhooks/set", apiKeyAuth, (req: any, res: any) => setWebhook(req, res));

// Broadcast Routes
app.get("/broadcast/jobs", apiKeyAuth, (req:any,res:any)=>listBroadcastJobs(req,res));
app.post("/broadcast/create", apiKeyAuth, (req: any, res: any) => createBroadcast(req, res));
app.get("/broadcast/:id", apiKeyAuth, (req: any, res: any) => getJob(req, res));
app.get("/broadcast/:id/items", apiKeyAuth, (req: any, res: any) => getJobItems(req, res));
app.delete("/broadcast/:id", apiKeyAuth, (req: any, res: any) => deleteJob(req, res));
app.post("/broadcast/:id/cancel", apiKeyAuth, (req:any,res:any)=>cancelBroadcast(req,res));

// NEW: Leads Route
app.get("/leads", apiKeyAuth, (req:any,res:any)=>getLeads(req,res));

// ===== UI Read API (protected; swap to JWT later) =====
app.get("/ui/sessions", apiKeyAuth, (req: any, res: any) => listSessions(req, res));
app.get("/ui/conversations", apiKeyAuth, (req: any, res: any) => listConversations(req, res));
app.get("/ui/messages", apiKeyAuth, (req: any, res: any) => listMessages(req, res));
app.post("/ui/conversations/read", apiKeyAuth, (req: any, res: any) => markConversationRead(req, res));
app.get("/ui/stream", apiKeyAuth, (req: any, res: any) => streamSSE(req, res));

// ===== DEBUG ROUTES =====
app.post("/debug/echo", apiKeyAuth, (req: any, res: any) => {
  return res.json({ ok: true, auth: req.auth, body: req.body });
});

app.post("/debug/check-owned", apiKeyAuth, requireSessionOwned, (req: any, res: any) => {
  return res.json({ ok: true, pass: "requireSessionOwned" });
});

app.post("/debug/check-limit", apiKeyAuth, enforceMessageLimitMw, (_req: any, res: any) => {
  return res.json({ ok: true, pass: "enforceMessageLimit" });
});

// debug webhook receiver (local test)
app.post("/debug/webhook-receiver", express.json({ limit: "2mb" }), (req, res) => {
  console.log("WEBHOOK RECEIVED:", req.body);
  res.json({ ok: true });
});

// ===== DEBUG: RESET API KEY (DEV ONLY) =====
app.post("/debug/api-key/reset", async (req: any, res: any) => {
  try {
    const host = String(req.headers.host || "");
    const ra = String(req.socket?.remoteAddress || "");
    if (!(host.startsWith("localhost") || host.startsWith("127.0.0.1")) && !(ra.includes("127.0.0.1") || ra.includes("::1"))) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const schema = z.object({
      tenantId: z.number().int().positive(),
      userId: z.number().int().positive(),
      name: z.string().min(1).max(120).default("Local Key"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

    const crypto = await import("crypto");
    const raw = "live_" + crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");

    // revoke all active keys for this tenant/user
    await pool.query(
      `UPDATE api_keys SET revoked_at=NOW() WHERE tenant_id=? AND user_id=? AND revoked_at IS NULL`,
      [parsed.data.tenantId, parsed.data.userId]
    );
    await pool.query(
      `INSERT INTO api_keys(tenant_id,user_id,name,key_hash,scopes_json,created_at) VALUES(?,?,?,?,NULL,NOW())`,
      [parsed.data.tenantId, parsed.data.userId, parsed.data.name, hash]
    );

    return res.json({ ok: true, apiKey: raw });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// JSON error handler (multer/express) - MUST be last
app.use((err: any, _req: any, res: any, _next: any) => {
  const code = err?.code || "ERROR";
  const msg = err?.message || "Unknown error";
  const status = err?.statusCode || (code === "LIMIT_FILE_SIZE" ? 413 : 500);
  return res.status(status).json({ ok: false, error: msg, code });
});

async function main() {
  await migrate();
  await bootSessions();

  // workers: enable only if WORKERS=1
  if (process.env.WORKERS === "1") {
    setInterval(() => require("./webhook").processWebhookQueue().catch(() => {}), 1500);
    setInterval(() => require("./broadcast").processBroadcastQueue().catch(() => {}), 600);
  }

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`API running on ${process.env.BASE_URL || `http://localhost:${port}`}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// ===== Sessions UI routes =====
try {
  const { stopSessionRoute, getQrRoute } = require("./sessions_routes");
  app.post("/sessions/stop", apiKeyAuth, requireSessionOwned, async (req:any,res:any)=> stopSessionRoute(req,res));
  app.get("/sessions/qr", apiKeyAuth, async (req:any,res:any)=> getQrRoute(req,res));
} catch (e) {
  console.error("failed to mount sessions routes", e);
}

// ===== Push routes (PWA notifications) =====
try {
  const { getVapidKey, saveSubscription, sendTest } = require("./push_routes");
  app.get("/push/vapid-public-key", apiKeyAuth, (req:any,res:any)=>getVapidKey(req,res));
  app.post("/push/subscribe", apiKeyAuth, (req:any,res:any)=>saveSubscription(req,res));
  app.post("/push/test", apiKeyAuth, (req:any,res:any)=>sendTest(req,res));
} catch (e) {
  console.error("failed to mount push routes", e);
}

// ===== Admin routes (limits) =====
try {
  const { getTenant, updateTenantLimits } = require("./admin_routes");
  app.get("/admin/tenant", apiKeyAuth, (req:any,res:any)=>getTenant(req,res));
  app.put("/admin/tenant/limits", apiKeyAuth, (req:any,res:any)=>updateTenantLimits(req,res));
} catch (e) {
  console.error("failed to mount admin routes", e);
}

// ===== Admin Billing (Plans/Subscriptions/Payments) =====
try {
  const billing = require("./billing_routes");
  // plans
  app.get("/admin/plans", apiKeyAuth, (req:any,res:any)=>billing.adminListPlans(req,res));
  app.post("/admin/plans", apiKeyAuth, (req:any,res:any)=>billing.adminUpsertPlan(req,res));

  // tenant subscription
  app.get("/admin/tenants/:tenantId/subscription", apiKeyAuth, (req:any,res:any)=>billing.adminGetTenantSubscription(req,res));
  app.post("/admin/tenants/:tenantId/subscription", apiKeyAuth, (req:any,res:any)=>billing.adminCreateSubscription(req,res));
  app.post("/admin/tenants/:tenantId/subscription/:id/status", apiKeyAuth, (req:any,res:any)=>billing.adminSetSubscriptionStatus(req,res));

  // payments
  app.get("/admin/tenants/:tenantId/payments", apiKeyAuth, (req:any,res:any)=>billing.adminListPayments(req,res));
  app.post("/admin/tenants/:tenantId/payments", apiKeyAuth, (req:any,res:any)=>billing.adminCreatePayment(req,res));
  app.post("/admin/tenants/:tenantId/payments/:id/mark-paid", apiKeyAuth, (req:any,res:any)=>billing.adminMarkPaymentPaid(req,res));
} catch (e) {
  console.error("failed to mount admin billing routes", e);
}