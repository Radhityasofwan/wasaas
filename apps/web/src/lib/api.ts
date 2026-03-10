export function getApiKey(): string {
  return localStorage.getItem("WA_KEY") || "";
}

export function setApiKey(key: string) {
  localStorage.setItem("WA_KEY", key);
}

export function clearApiKey() {
  localStorage.removeItem("WA_KEY");
}

function getConfiguredApiOrigin(): string {
  const fromEnv = String((import.meta as any)?.env?.VITE_API_BASE_URL || "").trim();
  if (!fromEnv) return "";
  return fromEnv.replace(/\/+$/, "");
}

function getLocalFallbackApiOrigin(): string {
  if (typeof window === "undefined") return "";
  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (!isLocalHost) return "";
  if (window.location.port === "3001") return "";
  return "http://localhost:3001";
}

function withOrigin(url: string, origin: string): string {
  if (!origin) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return `${origin}/${url}`;
  return `${origin}${url}`;
}

async function parseResponseBody(res: Response): Promise<any> {
  const raw = await res.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * apiFetch rules:
 * - "/ui/..."  -> direct to UI routes (proxied by Vite "/ui" -> API)
 * - others     -> auto prefix "/api" (proxied by Vite "/api" -> API root)
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);

  // default json for non-formdata
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // normalize URL for Vite proxy
  let url = path;
  const isAbs = /^https?:\/\//i.test(path);
  if (!isAbs) {
    if (path.startsWith("/ui/") || path === "/ui" || path.startsWith("/ui?")) {
      url = path; // keep
    } else if (path.startsWith("/api/") || path === "/api" || path.startsWith("/api?")) {
      url = path; // keep
    } else {
      url = `/api${path.startsWith("/") ? "" : "/"}${path}`;
    }
  }

  const configuredApiOrigin = getConfiguredApiOrigin();
  const localFallbackApiOrigin = getLocalFallbackApiOrigin();
  const preferredApiOrigin = configuredApiOrigin || localFallbackApiOrigin;
  const requestUrl = withOrigin(url, preferredApiOrigin);

  let res = await fetch(requestUrl, { ...init, headers });

  if (
    res.status === 404 &&
    !isAbs &&
    !preferredApiOrigin &&
    (url.startsWith("/api/") || url === "/api" || url.startsWith("/ui/") || url === "/ui")
  ) {
    const fallbackApiOrigin = getLocalFallbackApiOrigin();
    if (fallbackApiOrigin) {
      const fallbackUrl = withOrigin(url, fallbackApiOrigin);
      if (fallbackUrl !== requestUrl) {
        res = await fetch(fallbackUrl, { ...init, headers });
      }
    }
  }

  const data: any = await parseResponseBody(res);

  if (!res.ok) throw new Error(data?.error || data || `HTTP ${res.status}`);
  if (typeof data === "object" && data && "ok" in data && !data.ok) throw new Error(data.error || "API error");

  return data as T;
}
