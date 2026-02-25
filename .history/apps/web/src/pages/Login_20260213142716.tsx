import { useState } from "react";
import { getApiKey, setApiKey } from "../lib/api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const [key, setKey] = useState(getApiKey());
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#0b141a", color: "#e9edef" }}>
      <div style={{ width: "min(520px, 100%)", background: "#111b21", border: "1px solid #1f2c33", borderRadius: 16, padding: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>WA SaaS — Login (Dev)</h1>
        <p style={{ opacity: 0.8, lineHeight: 1.4 }}>
          Masukkan <b>x-api-key</b> (WA_KEY) untuk akses UI lokal.
        </p>

        <label style={{ display: "block", fontSize: 12, opacity: 0.9, marginBottom: 6 }}>API Key</label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="live_..."
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" }}
        />

        {err && <div style={{ marginTop: 12, color: "#ff6b6b", fontSize: 13 }}>{err}</div>}

        <button
          onClick={() => {
            try {
              setErr(null);
              if (!key.trim().startsWith("live_")) throw new Error("API key tidak valid (harus diawali live_)");
              setApiKey(key);
              nav("/");
            } catch (e: any) {
              setErr(e?.message || "error");
            }
          }}
          style={{ marginTop: 14, width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#00a884", color: "#001a12", fontWeight: 700 }}
        >
          Masuk
        </button>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Nanti production akan pakai login JWT, bukan API key di browser.
        </div>
      </div>
    </div>
  );
}
