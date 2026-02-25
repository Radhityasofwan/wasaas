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
 * apiFetch: gunakan path absolute dari FE:
 * - untuk UI API:  /ui/...
 * - untuk other API: /api/... (kalau kamu pakai prefix proxy)
 *
 * Vite proxy:
 *  /ui  -> http://localhost:3001/ui
 *  /api -> http://localhost:3001 (rewrite /api -> /)
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);

  // default json for non-formdata
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data: any = isJson ? await res.json() : await res.text();

  if (!res.ok) throw new Error(data?.error || data || `HTTP ${res.status}`);
  return data as T;
}
