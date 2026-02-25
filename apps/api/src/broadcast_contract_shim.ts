export function normalizeBroadcastBody(body: any) {
  const sessionKey = String(body?.sessionKey || body?.session_key || "").trim();
  const text = String(body?.text || body?.message || body?.message_text || "").trim();

  const delayMsRaw = body?.delayMs ?? body?.delay_ms ?? body?.delay ?? 0;
  const delayMs = Math.max(0, Math.floor(Number(delayMsRaw || 0)));

  let targets: string[] = [];
  const t = body?.targets ?? body?.to ?? body?.recipients ?? body?.numbers;
  if (Array.isArray(t)) targets = t.map((x:any)=>String(x).trim()).filter(Boolean);
  if (typeof t === "string") {
    targets = t.split(/[\n,;]/).map(s=>s.trim()).filter(Boolean);
  }

  return { sessionKey, text, targets, delayMs };
}
