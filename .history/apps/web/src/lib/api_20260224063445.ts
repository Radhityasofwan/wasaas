export function getApiKey(): string {
  return localStorage.getItem("WA_KEY") || "";
}

export function setApiKey(key: string) {
  localStorage.setItem("WA_KEY", key);
}

export function clearApiKey() {
  localStorage.removeItem("WA_KEY");
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

  const res = await fetch(url, { ...init, headers });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data: any = isJson ? await res.json() : await res.text();

  if (!res.ok) throw new Error(data?.error || data || `HTTP ${res.status}`);
  if (typeof data === "object" && data && "ok" in data && !data.ok) throw new Error(data.error || "API error");

  return data as T;
}
