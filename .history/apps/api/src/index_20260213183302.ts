console.log("INDEX_MARKER=RUNNING_INDEX_TS");

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { z } from "zod";

import { migrate } from "./db";
import { bootSessions, enforceMessageLimitMw, enforceSessionLimitMw } from "./boot";
import { apiKeyAuth } from "./auth";
import { requireSessionOwned } from "./session_guard";
import { startSession } from "./wa";
import { upload } from "./upload";

// ===== IMPORTS ROUTE HANDLERS (CLEAN ARCHITECTURE) =====
import { 
  handleSendText, 
  handleSendLocation, 
  handleSendMedia 
} from "./message_routes";

import { 
  listSessions, 
  listConversations, 
  listMessages, 
  markConversationRead, 
  streamSSE 
} from "./ui_routes";

// ... Import SaaS Routes lainnya (Broadcast, API Keys, dll) ...
import { listApiKeys, createApiKey, revokeApiKey } from "./api_keys";
import { setWebhook } from "./webhook_routes";
import { createBroadcast, getJob, getJobItems, deleteJob } from "./broadcast_routes";
import { listBroadcastJobs, cancelBroadcast } from "./broadcast_ui_routes";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/files", express.static(path.join(process.cwd(), "storage", "uploads")));

app.get("/", (_req, res) => res.json({ ok: true, name: "WA API" }));
app.get("/me", apiKeyAuth, (req: any, res: any) => res.json({ ok: true, auth: req.auth }));

// ===== SESSIONS =====
app.post("/sessions/start", apiKeyAuth, enforceSessionLimitMw, async (req: any, res: any) => {
  try {
    const result = await startSession(req.body.sessionKey, {
      tenantId: req.auth.tenantId,
      userId: req.auth.userId
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===== MESSAGES (Menggunakan message_routes.ts) =====
app.post("/messages/send", apiKeyAuth, requireSessionOwned, enforceMessageLimitMw, handleSendText);
app.post("/messages/send-location", apiKeyAuth, requireSessionOwned, enforceMessageLimitMw, handleSendLocation);

// Upload endpoint (Image/Video/Document handled by single handler)
app.post("/messages/send-media", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, handleSendMedia);

// Compatibility Routes (Jika frontend lama memanggil spesifik)
app.post("/messages/send-image", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, (req, res) => {
    req.body.kind = "image"; // Force kind
    handleSendMedia(req, res);
});
app.post("/messages/send-document", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, (req, res) => {
    req.body.kind = "document";
    handleSendMedia(req, res);
});
app.post("/messages/send-video", apiKeyAuth, upload.single("file"), requireSessionOwned, enforceMessageLimitMw, (req, res) => {
    req.body.kind = "video";
    handleSendMedia(req, res);
});

// ===== UI ROUTES =====
app.get("/ui/sessions", apiKeyAuth, listSessions);
app.get("/ui/conversations", apiKeyAuth, listConversations);
app.get("/ui/messages", apiKeyAuth, listMessages);
app.post("/ui/conversations/read", apiKeyAuth, markConversationRead);
app.get("/ui/stream", apiKeyAuth, streamSSE);

// ===== SAAS & ADMIN ROUTES =====
// API Keys
app.get("/api-keys", apiKeyAuth, async (req:any, res:any) => res.json({ ok:true, data: await listApiKeys(req.auth.tenantId) }));
app.post("/api-keys", apiKeyAuth, async (req:any, res:any) => res.json(await createApiKey(req.auth.tenantId, req.auth.userId, req.body.name, null)));
app.post("/api-keys/:id/revoke", apiKeyAuth, async (req:any, res:any) => res.json(await revokeApiKey(req.auth.tenantId, Number(req.params.id))));

// Webhooks & Broadcast
app.post("/webhooks/set", apiKeyAuth, setWebhook);
app.get("/broadcast/jobs", apiKeyAuth, listBroadcastJobs);
app.post("/broadcast/create", apiKeyAuth, createBroadcast);
app.get("/broadcast/:id", apiKeyAuth, getJob);

// Error Handler
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(500).json({ ok: false, error: err.message || "Unknown error" });
});

async function main() {
  await migrate();
  await bootSessions();
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`API running on port ${port}`));
}

main().catch(console.error);