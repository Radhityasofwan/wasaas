import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { enablePush } from "../lib/push";

export default function Admin() {
  const [msg, setMsg] = useState("");
  const [tenant, setTenant] = useState<any>(null);
  const [limitSessions, setLimitSessions] = useState<string>("");
  const [limitMessages, setLimitMessages] = useState<string>("");

  async function loadTenant() {
    const r = await apiFetch<any>("/admin/tenant");
    setTenant(r.tenant);
    setLimitSessions(r.tenant?.limit_sessions ?? "");
    setLimitMessages(r.tenant?.limit_messages_per_day ?? "");
  }

  useEffect(() => { loadTenant().catch(()=>{}); }, []);

  async function saveLimits() {
    setMsg("");
    const r = await apiFetch<any>("/admin/tenant/limits", {
      method: "PUT",
      body: JSON.stringify({
        limit_sessions: limitSessions === "" ? null : Number(limitSessions),
        limit_messages_per_day: limitMessages === "" ? null : Number(limitMessages),
      }),
    });
    setMsg("Limits saved ✅");
    await loadTenant();
    return r;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Admin Dashboard</h2>

      <div style={card}>
        <div style={title}>Tenant Limits</div>
        <div style={sub}>Atur limit dari admin dashboard (enforced oleh API middleware).</div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop: 10 }}>
          <div>
            <div style={label}>Limit Sessions</div>
            <input value={limitSessions} onChange={(e)=>setLimitSessions(e.target.value)} placeholder="mis. 5 (kosong = unlimited)" style={inp}/>
          </div>
          <div>
            <div style={label}>Limit Messages / Day</div>
            <input value={limitMessages} onChange={(e)=>setLimitMessages(e.target.value)} placeholder="mis. 300 (kosong = unlimited)" style={inp}/>
          </div>
        </div>

        <div style={{ marginTop: 10, display:"flex", gap:8, flexWrap:"wrap" }}>
          <button style={btnGreen} onClick={saveLimits}>Save</button>
          <button style={btn} onClick={()=>loadTenant()}>Reload</button>
          {tenant && <span style={{ opacity:0.75, fontSize: 12 }}>tenant: <b>{tenant.slug}</b></span>}
        </div>
      </div>

      <div style={card}>
        <div style={title}>Notifications (PWA Push)</div>
        <div style={sub}>Aktifkan notifikasi supaya HP dapat alert saat ada chat masuk.</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop: 10 }}>
          <button
            style={btn}
            onClick={async()=>{ setMsg(""); try { await enablePush(); setMsg("Push enabled ✅"); } catch(e:any){ setMsg(e?.message || "error"); } }}
          >
            Enable Notifications
          </button>
          <button
            style={btn}
            onClick={async()=>{ setMsg(""); try { const r=await apiFetch<any>("/push/test",{method:"POST"}); setMsg(`Test sent ✅ to ${r.sent} subs`); } catch(e:any){ setMsg(e?.message || "error"); } }}
          >
            Send Test Push
          </button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 10, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}

const card: React.CSSProperties = { border:"1px solid #1f2c33", borderRadius: 14, padding: 12, background:"#111b21", maxWidth: 860, marginBottom: 12 };
const title: React.CSSProperties = { fontWeight: 900, marginBottom: 6 };
const sub: React.CSSProperties = { opacity: 0.8, fontSize: 13 };
const label: React.CSSProperties = { opacity: 0.85, fontSize: 12, marginBottom: 6 };
const inp: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef" };
const btn: React.CSSProperties = { padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef" };
const btnGreen: React.CSSProperties = { ...btn, background:"#00a884", color:"#001a12", fontWeight: 900 };
