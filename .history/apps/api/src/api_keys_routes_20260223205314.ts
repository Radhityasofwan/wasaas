import { Router } from "express";
import { listApiKeys, createApiKey, revokeApiKey } from "./api_keys";

// Diasumsikan route ini di-mount di belakang middleware authentication untuk user dashboard 
// (BUKAN middleware apiKeyAuth, karena user mengakses ini via dashboard web, menggunakan cookie/JWT session)
// Misalnya: router.use(userSessionAuthMiddleware)

const router = Router();

// GET /api-keys - Ambil daftar key
router.get("/", async (req, res) => {
  try {
    const tenantId = req.auth?.tenantId; 
    if (!tenantId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const keys = await listApiKeys(tenantId);
    res.json({ ok: true, data: keys });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api-keys - Buat key baru
router.post("/", async (req, res) => {
  try {
    const tenantId = req.auth?.tenantId;
    const userId = req.auth?.userId;
    if (!tenantId || !userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const { name, scopes } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "Name is required" });

    const result = await createApiKey(tenantId, userId, name, scopes || null);
    
    // Response HARUS menyertakan raw apiKey agar bisa ditangkap UI
    res.json({ ok: true, data: result, apiKey: result.apiKey });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api-keys/:id - Revoke key
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: "Invalid ID" });

    const result = await revokeApiKey(tenantId, id);
    res.json({ ok: true, data: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;