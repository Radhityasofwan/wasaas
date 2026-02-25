import { z } from "zod";
import { upload, filePublicUrl } from "./upload"; // Multer config
import { sendText } from "./wa_text";
import { sendLocation, sendMediaImage, sendMediaDocument, sendMediaVideo } from "./wa_media";

// POST /messages/send (Text)
export async function handleSendText(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string(),
    to: z.string(),
    text: z.string().min(1)
  });
  
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const result = await sendText({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    sessionKey: parsed.data.sessionKey,
    to: parsed.data.to,
    text: parsed.data.text
  });

  if (!result.ok) return res.status(500).json(result);
  res.json(result);
}

// POST /messages/send-location
export async function handleSendLocation(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string(),
    to: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const result = await sendLocation({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    ...parsed.data
  });

  if (!result.ok) return res.status(500).json(result);
  res.json(result);
}

// POST /messages/send-media
// Middleware 'upload.single("file")' harus dipasang di router level (index.ts) sebelum handler ini
export async function handleSendMedia(req: any, res: any) {
  if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

  const sessionKey = req.body.sessionKey;
  const to = req.body.to;
  const caption = req.body.caption || "";
  const kind = req.body.kind; // 'image', 'video', 'document'

  if (!sessionKey || !to || !kind) {
    return res.status(400).json({ ok: false, error: "Missing sessionKey, to, or kind" });
  }

  const commonParams = {
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    sessionKey,
    to,
    caption,
    filePath: req.file.path,
    mime: req.file.mimetype,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    publicUrl: filePublicUrl(req.file.filename)
  };

  let result;
  if (kind === "image") {
    result = await sendMediaImage(commonParams);
  } else if (kind === "video") {
    result = await sendMediaVideo(commonParams);
  } else {
    result = await sendMediaDocument(commonParams);
  }

  if (!result.ok) return res.status(500).json(result);
  res.json(result);
}