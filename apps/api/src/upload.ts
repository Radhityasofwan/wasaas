import path from "path";
import fs from "fs";
import multer from "multer";

// Pastikan folder storage ada
const uploadDir = path.join(process.cwd(), "storage", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

function safeName(original: string) {
  return original.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uploadLimitBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB || 100);
  const safeMb = Number.isFinite(mb) ? Math.max(1, Math.min(1024, Math.floor(mb))) : 100;
  return safeMb * 1024 * 1024;
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      cb(null, `${ts}-${safeName(file.originalname)}`);
    }
  }),
  // Default tetap 100MB agar kompatibel dengan fitur saat ini; bisa diturunkan via MAX_UPLOAD_MB.
  limits: { fileSize: uploadLimitBytes() }
});

export function filePublicUrl(filename: string) {
  return `/files/${filename}`;
}
