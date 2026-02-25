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
  text_body?: string; // Optional (dari list mungkin preview, dari detail full)
  created_at: string;
  updated_at: string;
};

type BroadcastItem = {
  id: number;
  to_number: string;
  status: string;
  reply_status: string;
  reply_text: string | null; // NEW
  reply_received_at: string | null;
  last_error: string | null;
  sent_at: string | null;
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

  // State untuk Modal Detail
  const [viewJob, setViewJob] = useState<JobRow | null>(null);
  const [jobItems, setJobItems] = useState<BroadcastItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const targets = useMemo(() => {
    return targetsText.split(/[\n,;]/).map(s => s.trim()).filter(Boolean);
  }, [targetsText]);

  async function loadSessions() {
    const r = await apiFetch<any>("/ui/sessions");
    const list = (r.sessions || []).map((s: any) => ({ session_key: s.session_key, status: s.status }));
    setSessions(list);
    if (!sessionKey && list.length) setSessionKey(list[0].session_key);
  }

  async function loadJobs() {
    try {
      const r = await apiFetch<any>("/broadcast/jobs");
      setJobs(r.jobs || []);
    } catch (e: any) {
      // silent error on loop
    }
  }

  useEffect(() => {
    loadSessions().catch(() => {});
    loadJobs().catch(() => {});
    const t = setInterval(() => loadJobs().catch(() => {}), 3000);
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
    } catch (e: any) {
      setErr(e?.message || "error");
    }
  }

  async function cancel(id: number) {
    if (!window.confirm("Stop this broadcast?")) return;
    setErr(null); setInfo(null);
    try {
      const r = await apiFetch<any>(`/broadcast/${id}/cancel`, { method: "POST" });
      setInfo(`Cancel requested ✅ affected=${r.affectedRows}`);
      await loadJobs();
    } catch (e: any) {
      setErr(e?.message || "error");
    }
  }

  async function deleteJob(id: number) {
    if (!window.confirm("Delete this history permanently?")) return;
    try {
      await apiFetch<any>(`/broadcast/${id}`, { method: "DELETE" });
      setInfo(`Job ${id} deleted`);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (viewJob?.id === id) setViewJob(null);
    } catch (e: any) {
      setErr(e?.message || "delete failed");
    }
  }

  // FIX: Fetch full detail job & items
  async function openDetail(job: JobRow) {
    // Set awal dengan data dari list (mungkin text_body masih kosong/preview)
    setViewJob(job);
    setJobItems([]);
    setLoadingItems(true);
    
    try {
      // 1. Fetch Items
      const itemsReq = apiFetch<any>(`/broadcast/${job.id}/items?limit=500`);
      // 2. Fetch Detail Job (untuk dapat full text body)
      const detailReq = apiFetch<any>(`/broadcast/${job.id}`);

      const [itemsRes, detailRes] = await Promise.all([itemsReq, detailReq]);

      setJobItems(itemsRes.data || []);
      if (detailRes.data) {
        setViewJob(detailRes.data); // Update viewJob dengan data lengkap
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingItems(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Broadcast / Blast</h2>

      {err && <div style={{ color: "#ff6b6b", marginBottom: 10 }}>{err}</div>}
      {info && <div style={{ color: "#9be6d4", marginBottom: 10 }}>{info}</div>}

      {/* Form Create */}
      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} style={select}>
            {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
          </select>
          <input value={delayMs} onChange={(e) => setDelayMs(e.target.value)} style={inpSmall} placeholder="delay ms" />
          <button style={btnGreen} onClick={create}>Create</button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={label}>Targets (nomor, newline/comma)</div>
            <textarea value={targetsText} onChange={(e) => setTargetsText(e.target.value)} rows={5} style={ta} placeholder="62812...\n62813...\n..." />
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>count: <b>{targets.length}</b></div>
          </div>
          <div>
            <div style={label}>Message</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} style={ta} placeholder="Isi pesan broadcast..." />
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>
              delay per target: <b>{Math.max(0, Math.floor(Number(delayMs || 0)))}ms</b>
            </div>
          </div>
        </div>
      </div>

      {/* List Jobs */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>History</div>
          <button style={btn} onClick={loadJobs}>Refresh</button>
        </div>

        <div style={{ border: "1px solid #1f2c33", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#0b141a" }}>
                <th style={th}>ID</th>
                <th style={th}>Status</th>
                <th style={th}>Stats (Sent/Fail/Total)</th>
                <th style={th}>Updated</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} style={{ borderTop: "1px solid #1f2c33" }}>
                  <td style={td}>#{j.id}</td>
                  <td style={td}>
                    <span style={{ 
                      color: j.status === 'done' ? '#00a884' : j.status === 'failed' ? '#ff6b6b' : '#fff',
                      fontWeight: 'bold'
                    }}>
                      {j.status}
                    </span>
                  </td>
                  <td style={td}>{j.sent_count} / {j.failed_count} / {j.total_targets}</td>
                  <td style={td} style={{fontSize: 11, opacity: 0.8}}>{new Date(j.updated_at).toLocaleString()}</td>
                  <td style={td}>
                    <div style={{display:'flex', gap: 6}}>
                      <button style={btnSmall} onClick={() => openDetail(j)} title="View Details">👁️</button>
                      {(j.status === "queued" || j.status === "running") && (
                        <button style={btnSmallWarning} onClick={() => cancel(j.id)} title="Stop">⏹️</button>
                      )}
                      <button style={btnSmallDanger} onClick={() => deleteJob(j.id)} title="Delete">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!jobs.length && <tr><td style={td} colSpan={5}>No jobs found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DETAIL */}
      {viewJob && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 14}}>
              <h3>Job Detail #{viewJob.id}</h3>
              <button style={btn} onClick={() => setViewJob(null)}>Close</button>
            </div>

            <div style={{marginBottom: 14, padding: 10, background: '#0b141a', borderRadius: 8, fontSize: 13}}>
               <div style={{opacity: 0.7, marginBottom: 4}}>Message Content:</div>
               <div style={{whiteSpace: 'pre-wrap', maxHeight: 150, overflowY:'auto'}}>
                 {viewJob.text_body || "Loading content..."}
               </div>
            </div>

            <div style={{overflowY: 'auto', maxHeight: '50vh'}}>
              {loadingItems ? (
                <div style={{padding: 20, textAlign:'center'}}>Loading items...</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize: 13}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #333', textAlign:'left'}}>
                      <th style={{padding: 8}}>Number</th>
                      <th style={{padding: 8}}>Status</th>
                      <th style={{padding: 8}}>Reply</th>
                      <th style={{padding: 8}}>Info</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobItems.map(item => (
                      <tr key={item.id} style={{borderBottom:'1px solid #1f2c33'}}>
                        <td style={{padding: 8}}>{item.to_number}</td>
                        <td style={{padding: 8}}>
                           <span style={{
                             color: item.status === 'sent' ? '#00a884' : item.status === 'failed' ? '#ff6b6b' : '#fbceb1'
                           }}>
                             {item.status}
                           </span>
                        </td>
                        <td style={{padding: 8}}>
                          {item.reply_status === 'replied' ? (
                            <div>
                              <div style={{color: '#53bdeb', fontWeight:'bold', fontSize: 11}}>↩️ Replied</div>
                              <div style={{color: '#fff', marginTop: 2, fontStyle:'italic'}}>{item.reply_text || "(no text)"}</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td style={{padding: 8, fontSize: 11, opacity: 0.7}}>
                          {item.last_error || (item.sent_at ? new Date(item.sent_at).toLocaleTimeString() : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ===== STYLES =====
const card: React.CSSProperties = { border: "1px solid #1f2c33", borderRadius: 14, padding: 12, background: "#111b21", maxWidth: 1100, marginBottom: 12 };
const label: React.CSSProperties = { opacity: 0.85, fontSize: 12, marginBottom: 6 };
const ta: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef", resize: "vertical" };
const select: React.CSSProperties = { minWidth: 220, padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const inpSmall: React.CSSProperties = { width: 140, padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };

// Buttons
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #1f2c33", background: "#202c33", color: "#e9edef", cursor: 'pointer' };
const btnGreen: React.CSSProperties = { ...btn, background: "#00a884", color: "#001a12", fontWeight: 900 };
const btnSmall: React.CSSProperties = { padding: "4px 8px", borderRadius: 6, border: "1px solid #1f2c33", background: "#202c33", color: "#e9edef", cursor: 'pointer', fontSize: 12 };
const btnSmallWarning: React.CSSProperties = { ...btnSmall, background: "#ffae00", color: "#000" };
const btnSmallDanger: React.CSSProperties = { ...btnSmall, background: "#5c0000", color: "#ff8f8f", borderColor: '#ff6b6b' };

// Table
const th: React.CSSProperties = { textAlign: "left", padding: 10, fontSize: 12, opacity: 0.9 };
const td: React.CSSProperties = { padding: 10, fontSize: 13 };

// Modal
const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 };
const modalContent: React.CSSProperties = { background: '#111b21', padding: 20, borderRadius: 14, width: '90%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #333' };