function getApiKey() {
  // sesuai cara kamu simpan WA_KEY di UI (localStorage / env)
  return localStorage.getItem("WA_KEY") || "";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // normalize path:
  // - kalau sudah full URL -> pakai apa adanya
  // - kalau relative -> pakai prefix /api supaya kena Vite proxy
  const url = path.startsWith("http")
    ? path
    : path.startsWith("/api")
      ? path
      : `/api${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  // inject API key untuk dev (sementara). Nanti kalau UI login pakai JWT, ini diganti.
  const k = getApiKey();
  if (k && !headers.has("x-api-key")) headers.set("x-api-key", k);

  const res = await fetch(url, { ...init, headers });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      (typeof data === "object" && data && (data.error || data.message)) ||
      (typeof data === "string" && data) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  // kalau API kita selalu {ok:boolean}, boleh enforce di sini
  if (typeof data === "object" && data && "ok" in data && !(data as any).ok) {
    throw new Error((data as any).error || "API error");
  }

  return data as T;
}
