import { z } from "zod";
import { filePublicUrl } from "./upload";
import { sendText } from "./wa"; // sendText ada di wa.ts
import { sendLocation, sendMediaImage, sendMediaDocument, sendMediaVideo } from "./wa_media"; // Logic media di wa_media.ts

// Handler TEXT
export async function handleSendText(req: any, res: any) {
  const schema = z.object({
    sessionKey: z.string(),
    to: z.string(),
    text: z.string().min(1)
  });
  
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok:false, error: parsed.error });

  const result = await sendText(parsed.data.sessionKey, parsed.data.to, parsed.data.text);
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
}

// Handler LOCATION
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
  if (!parsed.success) return res.status(400).json({ ok:false, error: parsed.error });

  const result = await sendLocation({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    ...parsed.data
  });
  
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
}

// Handler MEDIA (Image, Video, Document)
export async function handleSendMedia(req: any, res: any) {
  if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

  // req.body fields come as strings from FormData
  const { sessionKey, to, caption, kind } = req.body;

  if (!sessionKey || !to || !kind) {
    return res.status(400).json({ ok: false, error: "Missing sessionKey, to, or kind" });
  }

  const commonParams = {
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    sessionKey,
    to,
    caption: caption || "",
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
    // Default to document
    result = await sendMediaDocument(commonParams);
  }

  if (!result.ok) return res.status(500).json(result);
  res.json(result);
}