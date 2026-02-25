import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type SessionRow = { session_key: string; status: string };
type JobRow = {
  id: number;
  session_key: string;
  status: string;
  delay_ms: number;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
};

export default function Broadcast() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [text, setText] = useState("");
  const [delayMs, setDelayMs] = useState("800");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const targets = useMemo(() => {
    return targetsText.split(/[\n,;]/).map(s=>s.trim()).filter(Boolean);
  }, [targetsText]);

  async function loadSessions() {
    const r = await apiFetch<any>("/ui/sessions");
    const list = (r.sessions || []).map((s:any)=>({ session_key: s.session_key, status: s.status }));
    setSessions(list);
    if (!sessionKey && list.length) setSessionKey(list[0].session_key);
  }

  async function loadJobs() {
    try {
      const r = await apiFetch<any>("/broadcast/jobs");
      setJobs(r.jobs || []);
    } catch (e:any) {
      setErr(e?.message || "error");
    }
  }

  useEffect(() => {
    loadSessions().catch(()=>{});
    loadJobs().catch(()=>{});
    const t = setInterval(() => loadJobs().catch(()=>{}), 2500);
    return () => clearInterval(t);
  }, []);

  async function create() {
    setErr(null); setInfo(null);
    if (!sessionKey) return setErr("sessionKey required");
    if (!text.trim()) return setErr("text required");
    if (!targets.length) return setErr("targets required (pisahkan pakai newline)");

    const d = Math.max(0, Math.floor(Number(delayMs || 0)));
    try {
      const r = await apiFetch<any>("/broadcast/create", {
        method: "POST",
        body: JSON.stringify({ sessionKey, text: text.trim(), targets, delayMs: d }),
      });
      setInfo(`Broadcast created ✅ ${r?.id ? `id=${r.id}` : ""}`);
      setTargetsText("");
      setText("");
      await loadJobs();
    } catch (e:any) {
      setErr(e?.message || "error");
    }
  }

  async function cancel(id: number) {
    setErr(null); setInfo(null);
    try {
      const r = await apiFetch<any>(`/broadcast/${id}/cancel`, { method: "POST" });
      setInfo(`Cancel requested ✅ affected=${r.affectedRows}`);
      await loadJobs();
    } catch (e:any) {
      setErr(e?.message || "error");
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Broadcast / Blast</h2>

      {err && <div style={{ color:"#ff6b6b", marginBottom: 10 }}>{err}</div>}
      {info && <div style={{ color:"#9be6d4", marginBottom: 10 }}>{info}</div>}

      <div style={card}>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <select value={sessionKey} onChange={(e)=>setSessionKey(e.target.value)} style={select}>
            {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
          </select>
          <input value={delayMs} onChange={(e)=>setDelayMs(e.target.value)} style={inpSmall} placeholder="delay ms" />
          <button style={btnGreen} onClick={create}>Create</button>
        </div>

        <div style={{ marginTop: 10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div>
            <div style={label}>Targets (nomor, newline/comma)</div>
            <textarea value={targetsText} onChange={(e)=>setTargetsText(e.target.value)} rows={10} style={ta} placeholder="62812...\n62813...\n..." />
            <div style={{ opacity:0.75, fontSize: 12, marginTop: 6 }}>count: <b>{targets.length}</b></div>
          </div>
          <div>
            <div style={label}>Message</div>
            <textarea value={text} onChange={(e)=>setText(e.target.value)} rows={10} style={ta} placeholder="Isi pesan broadcast..." />
            <div style={{ opacity:0.75, fontSize: 12, marginTop: 6 }}>
              delay per target: <b>{Math.max(0, Math.floor(Number(delayMs || 0)))}ms</b>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight: 900 }}>Jobs</div>
          <button style={btn} onClick={loadJobs}>Refresh</button>
        </div>

        <div style={{ marginTop: 10, border:"1px solid #1f2c33", borderRadius: 12, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#0b141a" }}>
                <th style={th}>id</th>
                <th style={th}>session</th>
                <th style={th}>status</th>
                <th style={th}>sent/failed/total</th>
                <th style={th}>delay</th>
                <th style={th}>updated</th>
                <th style={th}>action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} style={{ borderTop:"1px solid #1f2c33" }}>
                  <td style={td}><code>{j.id}</code></td>
                  <td style={td}><code>{j.session_key}</code></td>
                  <td style={td}>{j.status}</td>
                  <td style={td}>{j.sent_count}/{j.failed_count}/{j.total_targets}</td>
                  <td style={td}>{j.delay_ms}ms</td>
                  <td style={td}>{new Date(j.updated_at).toLocaleString()}</td>
                  <td style={td}>
                    <button style={btn} onClick={()=>cancel(j.id)} disabled={!(j.status==="queued"||j.status==="running")}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
              {!jobs.length && <tr><td style={td} colSpan={7}>No jobs</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { border:"1px solid #1f2c33", borderRadius: 14, padding: 12, background:"#111b21", maxWidth: 1100, marginBottom: 12 };
const label: React.CSSProperties = { opacity: 0.85, fontSize: 12, marginBottom: 6 };
const ta: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef", resize:"vertical" };
const select: React.CSSProperties = { minWidth: 220, padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef" };
const inpSmall: React.CSSProperties = { width: 140, padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef" };
const btn: React.CSSProperties = { padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef" };
const btnGreen: React.CSSProperties = { ...btn, background:"#00a884", color:"#001a12", fontWeight: 900 };
const th: React.CSSProperties = { textAlign:"left", padding: 10, fontSize: 12, opacity: 0.9 };
const td: React.CSSProperties = { padding: 10, fontSize: 13 };
