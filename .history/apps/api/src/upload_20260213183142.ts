import path from "path";
import fs from "fs";
import multer from "multer";

// Pastikan folder storage ada
const uploadDir = path.join(process.cwd(), "storage", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

function safeName(original: string) {
  return original.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      cb(null, `${ts}-${safeName(file.originalname)}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 } // Limit 100MB
});

export function filePublicUrl(filename: string) {
  return `/files/${filename}`;
}