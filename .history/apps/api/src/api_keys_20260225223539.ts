import { Router } from "express";
import { listApiKeys, createApiKey, revokeApiKey, deleteApiKey } from "./api_keys";

const router = Router();

// GET /api-keys - Ambil daftar key milik tenant
router.get("/", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId; 
    if (!tenantId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const keys = await listApiKeys(tenantId);
    res.json({ ok: true, data: keys });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api-keys - Buat key baru (Untuk integrasi external)
router.post("/", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    const userId = req.auth?.userId;
    if (!tenantId || !userId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const { name, scopes } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "Name is required" });

    const result = await createApiKey(tenantId, userId, name, scopes || null);
    
    res.json({ ok: true, data: result, apiKey: result.apiKey });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// DELETE /api-keys/:id - Revoke (Cabut) key (Soft Delete)
router.delete("/:id", async (req: any, res: any) => {
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

// DELETE /api-keys/:id/permanent - Hapus Permanen Key (Hard Delete)
router.delete("/:id/permanent", async (req: any, res: any) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: "Invalid ID" });

    const result = await deleteApiKey(tenantId, id);
    res.json({ ok: true, data: result, message: "Kunci API berhasil dihapus secara permanen." });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;