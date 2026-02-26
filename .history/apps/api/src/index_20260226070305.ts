console.log("INDEX_MARKER=RUNNING_INDEX_TS");

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { z } from "zod";

import { migrate, pool } from "./db";
import { bootSessions, enforceMessageLimitMw, enforceSessionLimitMw } from "./boot";

import { apiKeyAuth } from "./auth";
import { requireSessionOwned } from "./session_guard";

import { startSession } from "./wa";
import { upload, filePublicUrl } from "./upload";
import { sendMediaImage, sendMediaDocument, sendMediaVideo, sendLocation } from "./wa_media";

import apiKeysRoutes from "./api_keys_routes";
import autoReplyRoutes from "./auto_reply_routes";
import templatesRoutes from "./templates_routes";
import followupRoutes from "./followup_routes";

import {
  listSessions,
  listConversations,
  listMessages,
  markConversationRead,
  streamSSE,
  deleteConversations,
} from "./ui_routes";

import { setWebhook, getWebhook } from "./webhook_routes";

import { createBroadcast, getJob, getJobItems, deleteJob } from "./broadcast_routes";
import { listBroadcastJobs, cancelBroadcast, pauseBroadcast, resumeBroadcast } from "./broadcast_ui_routes";

import { getLeads, setLeadLabel, deleteLeads, updateLeadStatus, getTempRules, saveTempRules } from "./leads_routes";

const app = express();

// ---------- middleware ----------
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// serve uploaded files
app.use("/files", express.static(path.join(process.cwd(), "storage", "uploads")));

// ---------- helpers ----------
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

// ---------- UI dist resolver ----------
function resolveWebDist(): string | null {
  const candidates = [
    // monorepo root
    path.join(process.cwd(), "apps", "web", "dist"),
    path.join(process.cwd(), "web", "dist"),
    path.join(process.cwd(), "dist"),
    // if running from apps/api
    path.join(process.cwd(), "..", "web", "dist"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, "index.html"))) return c;
    } catch {}
  }
  return null;
}

const WEB_DIST = process.env.WEB_DIST_DIR
  ? path.resolve(process.env.WEB_DIST_DIR)
  : resolveWebDist();

// ---------- health (both legacy + api) ----------
app.get("/health", (_req, res) => {
  res.json({ ok: true, name: process.env.APP_NAME, time: new Date().toISOString() });
});

// ============================================================================
// API ROUTER (NO REWRITE /api). This prevents SPA fallback from catching API.
// ============================================================================
const api = express.Router();

// API request logger (indicator biar ketahuan kalau API kebalas HTML / salah route)
api.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const ct = String(res.getHeader("content-type") || "");
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms) ${ct}`);
  });
  next();
});

api.get("/health", (_req, res) => res.json({ ok: true }));

// ===== DEV UI AUTH BYPASS =====
// - Kalau ada x-api-key: pakai apiKeyAuth (normal)
// - Kalau local dan TIDAK ada x-api-key: bypass untuk dev
const dashboardAuthMw = (req: any, res: any, next: any) => {
  const apiKey = req.header("x-api-key");
  if (!apiKey) {
    const host = String(req.headers.host || "");
    const ra = String(req.socket?.remoteAddress || "");
    const isLocalHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const isLoopback =
      ra.includes("127.0.0.1") || ra.includes("::1") || ra.includes("::ffff:127.0.0.1");
    const isLocal = isLocalHost || isLoopback;

    if (isLocal) {
      req.auth = { tenantId: 1, userId: 1, apiKeyId: 0 };
      return next();
    }
  }
  return apiKeyAuth(req, res, next);
};

// ============================================================================
// LOGIN (API) - UI calls: POST /api/auth/login or POST /api/login
// ============================================================================
async function loginHandler(req: any, res: any) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email dan password wajib diisi." });
    }

    const [users] = await pool.query<any[]>(
      `SELECT id, tenant_id, password_hash, is_active FROM users WHERE email = ? LIMIT 1`,
      [String(email)]
    );

    if (!users.length) {
      return res.status(401).json({ ok: false, error: "Email atau password salah." });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ ok: false, error: "Akun ini telah dinonaktifkan." });
    }

    // NOTE: masih plain compare sesuai implementasi kamu saat ini
    if (String(user.password_hash) !== String(password)) {
      return res.status(401).json({ ok: false, error: "Email atau password salah." });
    }

    const crypto = await import("crypto");
    const rawKey = "live_" + crypto.randomBytes(32).toString("hex");
    const hashKey = crypto.createHash("sha256").update(rawKey).digest("hex");

    await pool.query(
      `UPDATE api_keys
       SET revoked_at=NOW()
       WHERE tenant_id=? AND user_id=? AND name='UI Session' AND revoked_at IS NULL`,
      [user.tenant_id, user.id]
    );

    await pool.query(
      `INSERT INTO api_keys(tenant_id, user_id, name, key_hash, created_at)
       VALUES(?, ?, 'UI Session', ?, NOW())`,
      [user.tenant_id, user.id, hashKey]
    );

    return res.json({ ok: true, apiKey: rawKey });
  } catch (err: any) {
    console.error("Login Error:", err);
    return res.status(500).json({ ok: false, error: "Terjadi kesalahan pada server saat proses masuk." });
  }
}

// FIX: Pendaftaran rute yang lebih aman dan komprehensif (failsafe) untuk menanggulangi
// limitasi Express 5 (path-to-regexp v8 strict matching) dan trailing slash.
api.post(["/auth/login", "/auth/login/", "/login", "/login/"], loginHandler);
app.post(["/login", "/login/", "/api/login", "/api/login/", "/api/auth/login", "/api/auth/login/"], loginHandler);

// whoami
api.get("/me", dashboardAuthMw, (req: any, res: any) => {
  res.json({ ok: true, auth: req.auth });
});

// DEBUG: list registered routes (API only)
api.get("/__routes", (_req, res) => {
  const routes: any[] = [];
  const router = (api as any).stack || [];
  for (const layer of router) {
    if (layer?.route?.path) {
      const methods = Object.keys(layer.route.methods || {}).filter(Boolean);
      routes.push({ path: "/api" + layer.route.path, methods });
    }
  }
  res.json({ ok: true, count: routes.length, routes });
});

// ===== API KEYS & MODUL UTAMA (dashboard) =====
api.use("/api-keys", dashboardAuthMw, apiKeysRoutes);
api.use("/auto-reply", dashboardAuthMw, autoReplyRoutes);
api.use("/templates", dashboardAuthMw, templatesRoutes);
api.use("/followup", dashboardAuthMw, followupRoutes);

// ===== Sessions =====
api.post("/sessions/start", dashboardAuthMw, enforceSessionLimitMw, async (req: any, res: any) => {
  const schema = z.object({ sessionKey: z.string().min(3).max(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const result = await startSession(parsed.data.sessionKey, {
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== TEXT =====
api.post("/messages/send", dashboardAuthMw, requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    text: z.string().min(1).max(4096),
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

api.get("/messages/send-image/ping", (_req, res) => res.json({ ok: true, route: "send-image" }));

// ===== IMAGE =====
api.post(
  "/messages/send-image",
  dashboardAuthMw,
  upload.single("file"),
  requireSessionOwned,
  enforceMessageLimitMw,
  async (req: any, res: any) => {
    const schema = z.object({
      sessionKey: z.string().min(3).max(64),
      to: z.string().min(8).max(30),
      caption: z.string().max(4096).optional(),
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
        publicUrl: url,
      });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "error" });
    }
  }
);

// ===== DOCUMENT =====
api.post(
  "/messages/send-document",
  dashboardAuthMw,
  upload.single("file"),
  requireSessionOwned,
  enforceMessageLimitMw,
  async (req: any, res: any) => {
    const schema = z.object({
      sessionKey: z.string().min(3).max(64),
      to: z.string().min(8).max(30),
      caption: z.string().max(4096).optional(),
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
        publicUrl: url,
      });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "error" });
    }
  }
);

// ===== VIDEO =====
api.post(
  "/messages/send-video",
  dashboardAuthMw,
  upload.single("file"),
  requireSessionOwned,
  enforceMessageLimitMw,
  async (req: any, res: any) => {
    const schema = z.object({
      sessionKey: z.string().min(3).max(64),
      to: z.string().min(8).max(30),
      caption: z.string().max(4096).optional(),
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
        publicUrl: url,
      });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "error" });
    }
  }
);

// ===== LOCATION =====
api.post("/messages/send-location", dashboardAuthMw, requireSessionOwned, enforceMessageLimitMw, async (req: any, res: any) => {
  const schema = z.object({
    sessionKey: z.string().min(3).max(64),
    to: z.string().min(8).max(30),
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().max(120).optional(),
    address: z.string().max(255).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const result = await sendLocation({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      ...parsed.data,
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "error" });
  }
});

// ===== SaaS routes (webhook & broadcast) =====
api.get("/webhooks", dashboardAuthMw, (req: any, res: any) => getWebhook(req, res));
api.post("/webhooks/set", dashboardAuthMw, (req: any, res: any) => setWebhook(req, res));

// Broadcast
api.get("/broadcast/jobs", dashboardAuthMw, (req: any, res: any) => listBroadcastJobs(req, res));
api.post("/broadcast/create", dashboardAuthMw, (req: any, res: any) => createBroadcast(req, res));
api.get("/broadcast/:id", dashboardAuthMw, (req: any, res: any) => getJob(req, res));
api.get("/broadcast/:id/items", dashboardAuthMw, (req: any, res: any) => getJobItems(req, res));
api.delete("/broadcast/:id", dashboardAuthMw, (req: any, res: any) => deleteJob(req, res));
api.post("/broadcast/:id/cancel", dashboardAuthMw, (req: any, res: any) => cancelBroadcast(req, res));
api.post("/broadcast/:id/pause", dashboardAuthMw, (req: any, res: any) => pauseBroadcast(req, res));
api.post("/broadcast/:id/resume", dashboardAuthMw, (req: any, res: any) => resumeBroadcast(req, res));

// Leads
api.get("/leads", dashboardAuthMw, (req: any, res: any) => getLeads(req, res));
api.post("/leads/label", dashboardAuthMw, (req: any, res: any) => setLeadLabel(req, res));
api.post("/leads/delete", dashboardAuthMw, (req: any, res: any) => deleteLeads(req, res));
api.post("/leads/status", dashboardAuthMw, (req: any, res: any) => updateLeadStatus(req, res));
api.get("/leads/temp-rules", dashboardAuthMw, (req: any, res: any) => getTempRules(req, res));
api.post("/leads/temp-rules", dashboardAuthMw, (req: any, res: any) => saveTempRules(req, res));

// UI Read API
api.get("/ui/sessions", dashboardAuthMw, (req: any, res: any) => listSessions(req, res));
api.get("/ui/conversations", dashboardAuthMw, (req: any, res: any) => listConversations(req, res));
api.get("/ui/messages", dashboardAuthMw, (req: any, res: any) => listMessages(req, res));
api.post("/ui/conversations/read", dashboardAuthMw, (req: any, res: any) => markConversationRead(req, res));
api.post("/ui/conversations/delete", dashboardAuthMw, (req: any, res: any) => deleteConversations(req, res));
api.get("/ui/stream", dashboardAuthMw, (req: any, res: any) => streamSSE(req, res));

// Debug
api.post("/debug/echo", dashboardAuthMw, (req: any, res: any) => {
  return res.json({ ok: true, auth: req.auth, body: req.body });
});
api.post("/debug/check-owned", dashboardAuthMw, requireSessionOwned, (_req: any, res: any) => {
  return res.json({ ok: true, pass: "requireSessionOwned" });
});
api.post("/debug/check-limit", dashboardAuthMw, enforceMessageLimitMw, (_req: any, res: any) => {
  return res.json({ ok: true, pass: "enforceMessageLimit" });
});
api.post("/debug/webhook-receiver", express.json({ limit: "2mb" }), (req, res) => {
  console.log("WEBHOOK RECEIVED:", req.body);
  res.json({ ok: true });
});

// Optional routes (sessions_routes/push/admin/billing) must be mounted BEFORE listen
try {
  const { stopSessionRoute, getQrRoute, deleteSessionRoute } = require("./sessions_routes");
  api.post("/sessions/stop", dashboardAuthMw, requireSessionOwned, async (req: any, res: any) => stopSessionRoute(req, res));
  api.post("/sessions/delete", dashboardAuthMw, requireSessionOwned, async (req: any, res: any) => deleteSessionRoute(req, res));
  api.get("/sessions/qr", dashboardAuthMw, async (req: any, res: any) => getQrRoute(req, res));
} catch (e) {
  console.error("failed to mount sessions routes", e);
}

try {
  const { getVapidKey, saveSubscription, sendTest } = require("./push_routes");
  api.get("/push/vapid-public-key", dashboardAuthMw, (req: any, res: any) => getVapidKey(req, res));
  api.post("/push/subscribe", dashboardAuthMw, (req: any, res: any) => saveSubscription(req, res));
  api.post("/push/test", dashboardAuthMw, (req: any, res: any) => sendTest(req, res));
} catch (e) {
  console.error("failed to mount push routes", e);
}

try {
  const { getTenant, getTenants, createTenant, updateTenantLimits } = require("./admin_routes");
  api.get("/admin/tenant", dashboardAuthMw, (req: any, res: any) => getTenant(req, res));
  api.get("/admin/tenants", dashboardAuthMw, (req: any, res: any) => getTenants(req, res));
  api.post("/admin/tenants", dashboardAuthMw, (req: any, res: any) => createTenant(req, res));
  api.put("/admin/tenants/:id/limits", dashboardAuthMw, (req: any, res: any) => updateTenantLimits(req, res));
} catch (e) {
  console.error("failed to mount admin routes", e);
}

try {
  const billing = require("./billing_routes");
  api.get("/admin/plans", dashboardAuthMw, (req: any, res: any) => billing.adminListPlans(req, res));
  api.post("/admin/plans", dashboardAuthMw, (req: any, res: any) => billing.adminUpsertPlan(req, res));
  api.get("/admin/tenants/:tenantId/subscription", dashboardAuthMw, (req: any, res: any) => billing.adminGetTenantSubscription(req, res));
  api.post("/admin/tenants/:tenantId/subscription", dashboardAuthMw, (req: any, res: any) => billing.adminCreateSubscription(req, res));
  api.post("/admin/tenants/:tenantId/subscription/:id/status", dashboardAuthMw, (req: any, res: any) =>
    billing.adminSetSubscriptionStatus(req, res)
  );
  api.get("/admin/tenants/:tenantId/payments", dashboardAuthMw, (req: any, res: any) => billing.adminListPayments(req, res));
  api.post("/admin/tenants/:tenantId/payments", dashboardAuthMw, (req: any, res: any) => billing.adminCreatePayment(req, res));
  api.post("/admin/tenants/:tenantId/payments/:id/mark-paid", dashboardAuthMw, (req: any, res: any) =>
    billing.adminMarkPaymentPaid(req, res)
  );
} catch (e) {
  console.error("failed to mount admin billing routes", e);
}

// Mount API router
app.use("/api", api);

// If some /api path is missing, NEVER return index.html. Return JSON 404.
app.use("/api", (_req, res) => {
  return res.status(404).json({ ok: false, error: "not_found" });
});

// ---------- UI static + SPA fallback (LAST) ----------
if (WEB_DIST) {
  // serve /assets/*, /sw.js, /manifest.webmanifest, etc
  app.use(express.static(WEB_DIST, { index: false }));

  // SPA fallback: only GET, and never /api or /files
  // PERBAIKAN: Mengubah string "*" menjadi regex /.*/ untuk support Express versi terbaru
  app.get(/.*/, (req, res, next) => {
    if (req.method !== "GET") return next();
    const p = req.path || "/";
    if (p.startsWith("/api") || p.startsWith("/files")) return next();
    return res.sendFile(path.join(WEB_DIST, "index.html"));
  });

  console.log("UI dist mounted from", WEB_DIST);
} else {
  console.warn("UI dist not found (WEB_DIST_DIR not set and resolver failed)");
}

// ---------- error handler ----------
app.use((err: any, _req: any, res: any, _next: any) => {
  const code = err?.code || "ERROR";
  const msg = err?.message || "Unknown error";
  const status = err?.statusCode || (code === "LIMIT_FILE_SIZE" ? 413 : 500);
  return res.status(status).json({ ok: false, error: msg, code });
});

// ---------- main ----------
async function main() {
  await migrate();
  await bootSessions();

  // workers: enable only if WORKERS=1
  if (process.env.WORKERS === "1") {
    setInterval(() => require("./webhook").processWebhookQueue().catch(() => {}), 1500);
    setInterval(() => require("./broadcast").processBroadcastQueue().catch(() => {}), 600);
    setInterval(() => {
      try {
        require("./followup_worker").processFollowUpQueue().catch(() => {});
      } catch {
        /* ignore */
      }
    }, 60000);
  }

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () =>
    console.log(`API running on ${process.env.BASE_URL || `http://localhost:${port}`}`)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});