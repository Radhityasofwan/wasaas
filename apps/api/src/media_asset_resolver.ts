import fs from "fs";
import path from "path";
import { filePublicUrl } from "./upload";

export type ResolvedMediaAsset = {
  filePath: string;
  fileName: string;
  fileSize: number;
  mime: string;
  publicUrl: string;
};

const UPLOAD_ROOT = path.join(process.cwd(), "storage", "uploads");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

function safeFileName(input: string) {
  return path.basename(String(input || "").trim() || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function guessMimeFromName(fileName: string) {
  const ext = path.extname(String(fileName || "").toLowerCase());
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg" || ext === ".oga") return "audio/ogg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".ppt") return "application/vnd.ms-powerpoint";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".zip") return "application/zip";
  return "application/octet-stream";
}

function extFromMime(mime: string) {
  const m = String(mime || "").toLowerCase();
  if (!m) return "";
  if (m === "image/jpeg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "video/mp4") return ".mp4";
  if (m === "video/quicktime") return ".mov";
  if (m === "audio/mpeg") return ".mp3";
  if (m === "audio/ogg") return ".ogg";
  if (m === "audio/mp4") return ".m4a";
  if (m === "audio/wav") return ".wav";
  if (m === "application/pdf") return ".pdf";
  return "";
}

function buildFromExistingPath(filePath: string): ResolvedMediaAsset | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const st = fs.statSync(filePath);
    if (!st.isFile()) return null;

    const name = path.basename(filePath);
    const normalizedRoot = path.normalize(UPLOAD_ROOT + path.sep);
    const normalizedFile = path.normalize(filePath);

    let publicUrl = filePath;
    if (normalizedFile.startsWith(normalizedRoot)) {
      const rel = path.relative(UPLOAD_ROOT, normalizedFile).replace(/\\/g, "/");
      publicUrl = filePublicUrl(rel);
    }

    return {
      filePath: normalizedFile,
      fileName: name,
      fileSize: st.size,
      mime: guessMimeFromName(name),
      publicUrl,
    };
  } catch {
    return null;
  }
}

function resolveLocalFilesUrl(inputPath: string): ResolvedMediaAsset | null {
  const marker = "/files/";
  const idx = inputPath.indexOf(marker);
  if (idx === -1) return null;

  const relRaw = decodeURIComponent(inputPath.substring(idx + marker.length));
  const rel = relRaw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;

  const fullPath = path.join(UPLOAD_ROOT, rel);
  return buildFromExistingPath(fullPath);
}

async function downloadRemoteMedia(remoteUrl: string): Promise<ResolvedMediaAsset> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res: Response;

  try {
    res = await fetch(remoteUrl, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Gagal download media URL (${res.status})`);
  }

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const headerMime = String(res.headers.get("content-type") || "").split(";")[0].trim();

  const parsed = new URL(remoteUrl);
  let baseName = safeFileName(path.basename(decodeURIComponent(parsed.pathname || "")) || "file");
  if (!path.extname(baseName)) {
    const ext = extFromMime(headerMime);
    if (ext) baseName = `${baseName}${ext}`;
  }

  const finalName = `${Date.now()}-${baseName}`;
  const targetPath = path.join(UPLOAD_ROOT, finalName);
  fs.writeFileSync(targetPath, buf);

  return {
    filePath: targetPath,
    fileName: finalName,
    fileSize: buf.length,
    mime: headerMime || guessMimeFromName(finalName),
    publicUrl: filePublicUrl(finalName),
  };
}

export async function resolveMediaAssetFromUrl(inputUrl: string): Promise<ResolvedMediaAsset> {
  const raw = String(inputUrl || "").trim();
  if (!raw) throw new Error("URL media kosong.");

  const localByFilesUrl = resolveLocalFilesUrl(raw);
  if (localByFilesUrl) return localByFilesUrl;

  const localDirect = buildFromExistingPath(raw);
  if (localDirect) return localDirect;

  try {
    const parsed = new URL(raw);
    const localFromPathname = resolveLocalFilesUrl(parsed.pathname);
    if (localFromPathname) return localFromPathname;
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return downloadRemoteMedia(parsed.toString());
    }
  } catch {
    // not an URL; continue to final error
  }

  throw new Error("Media tidak ditemukan atau URL tidak valid.");
}
