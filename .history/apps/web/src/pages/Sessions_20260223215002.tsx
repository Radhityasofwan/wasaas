import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import { apiFetch } from "../lib/api";

type SessionRow = {
  id: number;
  tenant_id: number;
  session_key: string;
  label?: string | null;         // Tambahan: Nama WA (dari DB label)
  phone_number?: string | null;  // Tambahan: Nomor WA
  status: string;
  created_at: string;
  updated_at: string;
};

export default function Sessions() {
  const [data, setData] = useState<SessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [newKey, setNewKey] = useState("");

  const [qrModal, setQrModal] = useState<{
    open: boolean;
    sessionKey: string;
    qr: string | null;
    status: string;
  }>({ open: false, sessionKey: "", qr: null, status: "unknown" });

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<{ ok: true; sessions: SessionRow[] }>("/ui/sessions");
      setData(res.sessions || []);
    } catch (e: any) {
      setErr(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function start() {
    setErr(null);
    const sessionKey = newKey.trim();
    if (sessionKey.length < 3) {
      setErr("sessionKey minimal 3 karakter");
      return;
    }
    try {
      await apiFetch("/sessions/start", { method: "POST", body: JSON.stringify({ sessionKey }) });
      setNewKey("");
      await load();
      await openQr(sessionKey);
    } catch (e: any) {
      setErr(e?.message || "error");
    }
  }

  // Fungsi tambahan untuk tombol "Start" pada row tabel yang sedang stop/mati
  async function startExisting(sessionKey: string) {
    setErr(null);
    try {
      await apiFetch("/sessions/start", { method: "POST", body: JSON.stringify({ sessionKey }) });
      await load();
      await openQr(sessionKey);
    } catch (e: any) {
      setErr(e?.message || "error");
    }
  }

  async function stop(sessionKey: string) {
    setErr(null);
    try {
      await apiFetch("/sessions/stop", { method: "POST", body: JSON.stringify({ sessionKey }) });
      await load();
    } catch (e: any) {
      setErr(e?.message || "error");
    }
  }

  async function deleteSession(sessionKey: string) {
    if (!window.confirm(`Yakin ingin menghapus device "${sessionKey}" secara permanen? Sesi akan diputuskan dan dihapus.`)) {
      return;
    }
    setErr(null);
    try {
      await apiFetch("/sessions/delete", { method: "POST", body: JSON.stringify({ sessionKey }) });
      await load(); // Reload data tabel
    } catch (e: any) {
      setErr(e?.message || "error deleting session");
    }
  }

  async function openQr(sessionKey: string) {
    setErr(null);
    setQrModal({ open: true, sessionKey, qr: null, status: "loading" });
    try {
      const r = await apiFetch<any>(`/sessions/qr?sessionKey=${encodeURIComponent(sessionKey)}`);
      setQrModal({ open: true, sessionKey, qr: r.qr || null, status: r.status || "unknown" });
    } catch (e: any) {
      setQrModal({ open: true, sessionKey, qr: null, status: "error" });
      setErr(e?.message || "error");
    }
  }

  // Poll QR/status tiap 2s saat modal open
  useEffect(() => {
    if (!qrModal.open || !qrModal.sessionKey) return;
    const t = setInterval(async () => {
      try {
        const r = await apiFetch<any>(`/sessions/qr?sessionKey=${encodeURIComponent(qrModal.sessionKey)}`);
        setQrModal((prev) => ({ ...prev, qr: r.qr || null, status: r.status || prev.status }));
        
        // Auto-refresh background tabel kalau status connected agar Nama profil muncul
        if (r.status === "connected") {
           load(); 
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [qrModal.open, qrModal.sessionKey]);

  // Convert raw QR string => dataURL (biar <img> bisa render)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const raw = qrModal.qr;
        if (!raw) {
          if (alive) setQrDataUrl(null);
          return;
        }

        // kalau backend sudah kirim dataURL (optional), langsung pakai
        if (typeof raw === "string" && raw.startsWith("data:image/")) {
          if (alive) setQrDataUrl(raw);
          return;
        }

        const url = await (QRCode as any).toDataURL(String(raw), { margin: 1, scale: 8 });
        if (alive) setQrDataUrl(url);
      } catch {
        if (alive) setQrDataUrl(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [qrModal.qr]);

  function closeModal() {
    setQrModal({ open: false, sessionKey: "", qr: null, status: "unknown" });
    setQrDataUrl(null);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Sessions (Multi-device)</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={load} style={btn}>Refresh</button>
        {loading && <span style={{ opacity: 0.7 }}>loading...</span>}
        {err && <span style={{ color: "#ff6b6b" }}>{err}</span>}
      </div>

      <div style={{ marginTop: 12, border: "1px solid #1f2c33", borderRadius: 14, padding: 12, background: "#111b21" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Device</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="device2"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #1f2c33",
              background: "#0b141a",
              color: "#e9edef",
            }}
          />
          <button onClick={start} style={{ ...btn, background: "#00a884", color: "#001a12", fontWeight: 800 }}>
            Start
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Setelah start, buka QR untuk pairing (Linked devices).
        </div>
      </div>

      <div style={{ marginTop: 12, border: "1px solid #1f2c33", borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#111b21" }}>
              <th style={th}>Device / WA Profil</th>
              <th style={th}>Status</th>
              <th style={th}>Updated</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => {
              const isOffline = ["stopped", "disconnected", "logged_out", "error"].includes(s.status);
              return (
                <tr key={s.id} style={{ borderTop: "1px solid #1f2c33" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{s.session_key}</div>
                    {(s.phone_number || s.label) && (
                      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                        {s.phone_number} {s.label ? `(${s.label})` : ""}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{
                      color: s.status === "connected" ? "#00a884" : s.status === "error" ? "#ff6b6b" : "#e9edef"
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={td}>{new Date(s.updated_at).toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => openQr(s.session_key)} style={btn}>QR / Status</button>
                      
                      {isOffline ? (
                        <button onClick={() => startExisting(s.session_key)} style={{ ...btn, borderColor: "#00a884", color: "#00a884" }}>Start</button>
                      ) : (
                        <button onClick={() => stop(s.session_key)} style={{ ...btn, borderColor: "#7a5c1a", color: "#f0c341" }}>Stop</button>
                      )}
                      
                      <button onClick={() => deleteSession(s.session_key)} style={{ ...btn, borderColor: "#7a1a1a", color: "#ff6b6b" }}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!data.length && (
              <tr><td style={td} colSpan={4}>No sessions</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {qrModal.open && (
        <div style={overlay} onClick={closeModal}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>QR — {qrModal.sessionKey}</div>
              <button style={btn} onClick={closeModal}>Close</button>
            </div>

            <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
              status: <b style={{ color: qrModal.status === "connected" ? "#00a884" : "inherit" }}>{qrModal.status}</b>
            </div>

            <div style={{ marginTop: 12 }}>
              {qrDataUrl ? (
                <img
                  alt="qr"
                  src={qrDataUrl}
                  style={{ width: 320, height: 320, background: "#fff", borderRadius: 16, padding: 10 }}
                />
              ) : (
                <div style={{ opacity: 0.8, padding: "20px 0" }}>QR belum tersedia / sesi offline.</div>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              WhatsApp HP → Linked devices → Link a device → scan QR.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btn: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #1f2c33",
  background: "#0b141a",
  color: "#e9edef",
  cursor: "pointer",
};

const th: CSSProperties = { textAlign: "left", padding: 12, fontSize: 13, opacity: 0.9 };
const td: CSSProperties = { padding: 12, fontSize: 14 };

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
};

const modal: CSSProperties = {
  width: "min(520px, 92vw)",
  background: "#111b21",
  border: "1px solid #1f2c33",
  borderRadius: 16,
  padding: 14,
};