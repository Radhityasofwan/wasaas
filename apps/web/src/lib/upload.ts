import { getApiKey } from "./api";

export async function sendMedia(
  type: "image" | "document" | "video",
  payload: { sessionKey: string; to: string; caption?: string },
  file: File
) {
  const key = getApiKey();
  const fd = new FormData();
  fd.append("sessionKey", payload.sessionKey);
  fd.append("to", payload.to);
  if (payload.caption) fd.append("caption", payload.caption);
  fd.append("file", file);

  const res = await fetch(`/api/messages/send-${type}`, {
    method: "POST",
    headers: key ? { "x-api-key": key } : undefined,
    body: fd,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}
