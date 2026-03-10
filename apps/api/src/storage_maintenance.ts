import fs from "fs";
import path from "path";
import { pool } from "./db";

type PruneResult = {
  scanned: number;
  deleted: number;
};

let running = false;

function envNumber(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function resolveUploadsRoot() {
  return path.join(process.cwd(), "storage", "uploads");
}

function resolveBaileysRoot() {
  const configured = String(process.env.BAILEYS_STORE_DIR || "storage/baileys").trim();
  if (!configured) return path.join(process.cwd(), "storage", "baileys");
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function cutoffMs(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function addToken(set: Set<string>, value: string | null | undefined) {
  const v = String(value || "").trim();
  if (!v) return;
  const normalized = v.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return;
  set.add(normalized);
  set.add(path.basename(normalized));
}

function extractUploadTokens(rawInput: any): string[] {
  const raw = String(rawInput || "").trim();
  if (!raw) return [];

  const out = new Set<string>();
  const addFrom = (input: string) => {
    const val = String(input || "").trim();
    if (!val) return;

    const filesIdx = val.indexOf("/files/");
    if (filesIdx >= 0) {
      const rel = decodeURIComponent(val.slice(filesIdx + "/files/".length)).split("?")[0];
      addToken(out, rel);
    }

    const uploadsIdx = val.replace(/\\/g, "/").toLowerCase().indexOf("storage/uploads/");
    if (uploadsIdx >= 0) {
      const rel = val.replace(/\\/g, "/").slice(uploadsIdx + "storage/uploads/".length).split("?")[0];
      addToken(out, rel);
    }
  };

  addFrom(raw);

  try {
    const parsed = new URL(raw);
    addFrom(parsed.pathname);
  } catch {
    // ignore non-url input
  }

  return Array.from(out);
}

async function collectReferencedUploadTokens() {
  const refs = new Set<string>();

  const queries = [
    `SELECT media_url AS ref
     FROM wa_messages
     WHERE media_url IS NOT NULL
       AND media_url <> ''
       AND (media_url LIKE '/files/%' OR media_url LIKE '%/files/%' OR media_url LIKE '%storage/uploads/%')`,
    `SELECT media_url AS ref
     FROM message_templates
     WHERE media_url IS NOT NULL
       AND media_url <> ''
       AND (media_url LIKE '/files/%' OR media_url LIKE '%/files/%' OR media_url LIKE '%storage/uploads/%')`,
    `SELECT media_path AS ref
     FROM broadcast_jobs
     WHERE media_path IS NOT NULL
       AND media_path <> ''
       AND (media_path LIKE '/files/%' OR media_path LIKE '%/files/%' OR media_path LIKE '%storage/uploads/%')`,
  ];

  for (const sql of queries) {
    try {
      const [rows] = await pool.query<any[]>(sql);
      for (const row of rows || []) {
        for (const token of extractUploadTokens(row?.ref)) {
          addToken(refs, token);
        }
      }
    } catch {
      // Keep maintenance robust even if one table is unavailable.
    }
  }

  return refs;
}

async function pruneUploadOrphans(days: number): Promise<PruneResult> {
  const root = resolveUploadsRoot();
  if (!fs.existsSync(root)) return { scanned: 0, deleted: 0 };

  const references = await collectReferencedUploadTokens();
  const maxMtime = cutoffMs(days);
  const entries = fs.readdirSync(root, { withFileTypes: true });

  let scanned = 0;
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relName = entry.name.replace(/\\/g, "/");
    if (relName.startsWith(".")) continue;

    scanned += 1;
    if (references.has(relName) || references.has(path.basename(relName))) continue;

    const abs = path.join(root, entry.name);
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.mtimeMs > maxMtime) continue;

    try {
      fs.unlinkSync(abs);
      deleted += 1;
    } catch {
      // ignore single-file delete failure
    }
  }

  return { scanned, deleted };
}

async function collectKnownSessionKeys() {
  const keys = new Set<string>();
  try {
    const [rows] = await pool.query<any[]>(`SELECT session_key FROM wa_sessions`);
    for (const row of rows || []) {
      const key = String(row?.session_key || "").trim();
      if (key) keys.add(key);
    }
  } catch {
    // ignore
  }
  return keys;
}

async function pruneBaileysOrphans(days: number): Promise<PruneResult> {
  const root = resolveBaileysRoot();
  if (!fs.existsSync(root)) return { scanned: 0, deleted: 0 };

  const known = await collectKnownSessionKeys();
  const maxMtime = cutoffMs(days);
  const entries = fs.readdirSync(root, { withFileTypes: true });

  let scanned = 0;
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionKey = String(entry.name || "").trim();
    if (!sessionKey) continue;

    scanned += 1;
    if (known.has(sessionKey)) continue;

    const abs = path.join(root, sessionKey);
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (st.mtimeMs > maxMtime) continue;

    try {
      fs.rmSync(abs, { recursive: true, force: true });
      deleted += 1;
    } catch {
      // ignore single-dir delete failure
    }
  }

  return { scanned, deleted };
}

export function getStorageMaintenanceIntervalMs() {
  const minutes = envNumber("STORAGE_MAINT_INTERVAL_MIN", 60, 5, 1440);
  return minutes * 60 * 1000;
}

export async function processStorageMaintenance() {
  const enabled = String(process.env.STORAGE_MAINT_ENABLED || "1") !== "0";
  if (!enabled) return;
  if (running) return;

  running = true;
  try {
    const uploadDays = envNumber("STORAGE_UPLOAD_ORPHAN_DAYS", 30, 1, 3650);
    const baileysDays = envNumber("STORAGE_BAILEYS_ORPHAN_DAYS", 14, 1, 3650);

    const upload = await pruneUploadOrphans(uploadDays);
    const baileys = await pruneBaileysOrphans(baileysDays);

    if (upload.deleted > 0 || baileys.deleted > 0) {
      console.log(
        `[StorageMaintenance] uploads deleted=${upload.deleted}/${upload.scanned}, baileys deleted=${baileys.deleted}/${baileys.scanned}`
      );
    }
  } catch (err: any) {
    console.warn("[StorageMaintenance] failed:", err?.message || err);
  } finally {
    running = false;
  }
}
