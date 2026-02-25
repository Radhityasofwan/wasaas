import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function Webhooks() {
  const [url, setUrl] = useState("http://localhost:4010/webhook");
  const [msg, setMsg] = useState<string>("");

  async function save() {
    setMsg("");
    try {
      const res = await apiFetch<any>("/webhooks/set", {
        method: "POST",
        body: JSON.stringify({ url, status: "active" }),
      });
      setMsg(`OK ✅ id=${res.id} secret_head=${res.secret_head}`);
    } catch (e: any) {
      setMsg(`ERR: ${e?.message || "error"}`);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Webhooks</h2>
      <div style={{ maxWidth: 720, border: "1px solid #1f2c33", borderRadius: 14, padding: 12, background: "#111b21" }}>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>Set endpoint receiver (contract: /webhooks/set + status)</div>
        <input value={url} onChange={(e)=>setUrl(e.target.value)} style={inp} />
        <button onClick={save} style={btn}>Save</button>
        {msg && <div style={{ marginTop: 10, fontSize: 13 }}>{msg}</div>}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const btn: React.CSSProperties = { marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
