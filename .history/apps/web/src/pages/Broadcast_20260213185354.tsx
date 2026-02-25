import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { fmtDate } from "../lib/fmt"; // Helper WIB Jakarta

type SessionRow = { session_key: string; status: string };
type JobRow = {
  id: number;
  session_key: string;
  name?: string;
  status: string;
  delay_ms: number;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  text_body?: string;
  created_at: string;
  updated_at: string;
};

type BroadcastItem = {
  id: number;
  to_number: string;
  status: string;
  reply_status: string;
  reply_text: string | null;
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

  // State untuk Filter History
  const [historyFilter, setHistoryFilter] = useState("all");

  // State untuk Modal Detail & Filter Item
  const [viewJob, setViewJob] = useState<JobRow | null>(null);
  const [jobItems, setJobItems] = useState<BroadcastItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemFilter, setItemFilter] = useState("all"); // all, replied, failed

  const targets = useMemo(() => {
    return targetsText.split(/[\n,;]/).map(s => s.trim()).filter(Boolean);
  }, [targetsText]);

  // Logic filter untuk tabel History
  const filteredJobs = useMemo(() => {
    if (historyFilter === "all") return jobs;
    return jobs.filter(j => j.status === historyFilter);
  }, [jobs, historyFilter]);

  // Logic filter untuk tabel Item di dalam Modal
  const filteredItems = useMemo(() => {
    if (itemFilter === "replied") return jobItems.filter(i => i.reply_status === "replied");
    if (itemFilter === "failed") return jobItems.filter(i => i.status === "failed");
    if (itemFilter === "sent") return jobItems.filter(i => i.status === "sent");
    return jobItems;
  }, [jobItems, itemFilter]);

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
      // silent
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
    if (!sessionKey) return setErr("Sesi diperlukan");
    if (!text.trim()) return setErr("Pesan diperlukan");
    if (!targets.length) return setErr("Target diperlukan");

    const d = Math.max(0, Math.floor(Number(delayMs || 0)));
    try {
      const r = await apiFetch<any>("/broadcast/create", {
        method: "POST",
        body: JSON.stringify({ sessionKey, text: text.trim(), targets, delayMs: d }),
      });
      setInfo(`Broadcast berhasil dibuat ✅ ${r?.id ? `ID: ${r.id}` : ""}`);
      setTargetsText("");
      setText("");
      await loadJobs();
    } catch (e: any) {
      setErr(e?.message || "Gagal membuat broadcast");
    }
  }

  async function cancel(id: number) {
    if (!window.confirm("Hentikan broadcast ini?")) return;
    setErr(null); setInfo(null);
    try {
      const r = await apiFetch<any>(`/broadcast/${id}/cancel`, { method: "POST" });
      setInfo(`Pembatalan diproses ✅`);
      await loadJobs();
    } catch (e: any) {
      setErr(e?.message || "Gagal membatalkan");
    }
  }

  async function deleteJob(id: number) {
    if (!window.confirm("Hapus riwayat ini secara permanen?")) return;
    try {
      await apiFetch<any>(`/broadcast/${id}`, { method: "DELETE" });
      setInfo(`Riwayat #${id} berhasil dihapus`);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (viewJob?.id === id) setViewJob(null);
    } catch (e: any) {
      setErr(e?.message || "Gagal menghapus");
    }
  }

  async function openDetail(job: JobRow) {
    setViewJob(job);
    setJobItems([]);
    setItemFilter("all"); // Reset filter modal setiap buka baru
    setLoadingItems(true);
    
    try {
      const itemsReq = apiFetch<any>(`/broadcast/${job.id}/items?limit=500`);
      const detailReq = apiFetch<any>(`/broadcast/${job.id}`);
      const [itemsRes, detailRes] = await Promise.all([itemsReq, detailReq]);

      setJobItems(itemsRes.data || []);
      if (detailRes.data) {
        setViewJob(detailRes.data);
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

      {/* Panel Form Create */}
      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} style={select}>
            {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
          </select>
          <input value={delayMs} onChange={(e) => setDelayMs(e.target.value)} style={inpSmall} placeholder="delay ms" />
          <button style={btnGreen} onClick={create}>Create Broadcast</button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={label}>Targets (Nomor HP, Pisahkan Baris Baru)</div>
            <textarea value={targetsText} onChange={(e) => setTargetsText(e.target.value)} rows={5} style={ta} placeholder="62812...\n62813..." />
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>Jumlah: <b>{targets.length}</b></div>
          </div>
          <div>
            <div style={label}>Message Content</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} style={ta} placeholder="Isi pesan..." />
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>
              Estimasi Jeda: <b>{Math.max(0, Math.floor(Number(delayMs || 0)))}ms / target</b>
            </div>
          </div>
        </div>
      </div>

      {/* Panel History / Jobs */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 900 }}>History</div>
            {/* FILTER UI UNTUK JOBS */}
            <select 
              value={historyFilter} 
              onChange={(e) => setHistoryFilter(e.target.value)}
              style={{ ...select, minWidth: 120, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="all">Semua Status</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="canceled">Canceled</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <button style={btn} onClick={loadJobs}>Refresh</button>
        </div>

        <div style={{ border: "1px solid #1f2c33", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#0b141a" }}>
                <th style={th}>ID</th>
                <th style={th}>Status</th>
                <th style={th}>Stats (S/F/T)</th>
                <th style={th}>Updated (WIB)</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(j => (
                <tr key={j.id} style={{ borderTop: "1px solid #1f2c33" }}>
                  <td style={td}>#{j.id}</td>
                  <td style={td}>
                    <span style={{ 
                      color: j.status === 'done' ? '#00a884' : j.status === 'failed' ? '#ff6b6b' : j.status === 'running' ? '#53bdeb' : '#fff',
                      fontWeight: 'bold', fontSize: 11
                    }}>
                      {j.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={td}>{j.sent_count} / {j.failed_count} / {j.total_targets}</td>
                  <td style={td} style={{fontSize: 11, opacity: 0.8}}>{fmtDate(j.updated_at)}</td>
                  <td style={td}>
                    <div style={{display:'flex', gap: 6}}>
                      <button style={btnSmall} onClick={() => openDetail(j)} title="Detail Penerima">👁️</button>
                      {(j.status === "queued" || j.status === "running") && (
                        <button style={btnSmallWarning} onClick={() => cancel(j.id)} title="Stop">⏹️</button>
                      )}
                      <button style={btnSmallDanger} onClick={() => deleteJob(j.id)} title="Hapus Riwayat">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredJobs.length && <tr><td style={td} colSpan={5} style={{textAlign:'center', opacity: 0.5}}>Tidak ada data yang cocok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DETAIL DENGAN FILTER ITEM */}
      {viewJob && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding: '16px 20px', borderBottom: '1px solid #333'}}>
              <h3 style={{margin:0}}>Job Detail #{viewJob.id}</h3>
              <button style={btn} onClick={() => setViewJob(null)}>Close</button>
            </div>

            <div style={{padding: 20, overflowY: 'auto', flex: 1}}>
              {/* Box Info Pesan */}
              <div style={{marginBottom: 20, padding: 12, background: '#0b141a', borderRadius: 8, border: '1px solid #1f2c33'}}>
                 <div style={{opacity: 0.5, marginBottom: 6, fontSize: 10, fontWeight:'bold', textTransform:'uppercase'}}>Message Content</div>
                 <div style={{whiteSpace: 'pre-wrap', maxHeight: 100, overflowY:'auto', color:'#d1d7db', fontSize: 13}}>
                   {viewJob.text_body || "Memuat konten..."}
                 </div>
              </div>

              {/* FILTER UI UNTUK ITEM/NOMOR */}
              <div style={{display:'flex', gap: 8, marginBottom: 12}}>
                <button 
                  onClick={() => setItemFilter("all")} 
                  style={itemFilter === "all" ? tabActive : tabInactive}
                >Semua ({jobItems.length})</button>
                <button 
                  onClick={() => setItemFilter("replied")} 
                  style={itemFilter === "replied" ? tabActiveReplied : tabInactive}
                >Dibalas ({jobItems.filter(i=>i.reply_status==='replied').length})</button>
                <button 
                  onClick={() => setItemFilter("failed")} 
                  style={itemFilter === "failed" ? tabActiveFailed : tabInactive}
                >Gagal ({jobItems.filter(i=>i.status==='failed').length})</button>
              </div>

              {loadingItems ? (
                <div style={{padding: 30, textAlign:'center', opacity:0.7}}>Memuat rincian penerima...</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize: 13}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #333', textAlign:'left', opacity: 0.6}}>
                      <th style={{padding: 10, width: '30%'}}>Nomor</th>
                      <th style={{padding: 10, width: '15%'}}>Status</th>
                      <th style={{padding: 10, width: '55%'}}>Interaksi / Balasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <tr key={item.id} style={{borderBottom:'1px solid #1f2c33'}}>
                        <td style={{padding: 10, fontFamily:'monospace'}}>{item.to_number}</td>
                        <td style={{padding: 10}}>
                           <span style={{
                             padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold',
                             background: item.status === 'sent' ? 'rgba(0,168,132,0.1)' : item.status === 'failed' ? 'rgba(255,107,107,0.1)' : 'rgba(255,255,255,0.05)',
                             color: item.status === 'sent' ? '#00a884' : item.status === 'failed' ? '#ff6b6b' : '#fbceb1'
                           }}>
                             {item.status.toUpperCase()}
                           </span>
                        </td>
                        <td style={{padding: 10}}>
                          {item.reply_status === 'replied' ? (
                            <div style={{background: '#1f2c33', padding: '8px 12px', borderRadius: 8, borderLeft: '4px solid #53bdeb'}}>
                              <div style={{color: '#53bdeb', fontWeight:'bold', fontSize: 10, marginBottom: 4, display:'flex', justifyContent:'space-between'}}>
                                <span>↩️ DIBALAS</span>
                                <span style={{opacity:0.6}}>{item.reply_received_at ? fmtDate(item.reply_received_at) : ''}</span>
                              </div>
                              <div style={{color: '#e9edef', fontSize: 12, lineHeight: 1.4}}>{item.reply_text || "(Media/Lainnya)"}</div>
                            </div>
                          ) : (
                            <div style={{fontSize: 11, opacity: 0.5}}>
                              {item.last_error ? <span style={{color:'#ff6b6b'}}>{item.last_error}</span> : (item.sent_at ? `Terkirim: ${fmtDate(item.sent_at)}` : '-')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr><td colSpan={3} style={{padding: 30, textAlign:'center', opacity:0.5}}>Tidak ada data untuk filter ini</td></tr>
                    )}
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
const ta: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef", resize: "vertical", fontFamily: 'inherit' };
const select: React.CSSProperties = { minWidth: 220, padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const inpSmall: React.CSSProperties = { width: 140, padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };

// Buttons
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #1f2c33", background: "#202c33", color: "#e9edef", cursor: 'pointer', fontSize: 13 };
const btnGreen: React.CSSProperties = { ...btn, background: "#00a884", color: "#001a12", fontWeight: 900, border: 'none' };
const btnSmall: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid #1f2c33", background: "#202c33", color: "#e9edef", cursor: 'pointer', fontSize: 12 };
const btnSmallWarning: React.CSSProperties = { ...btnSmall, background: "#ffae00", color: "#000", border: 'none' };
const btnSmallDanger: React.CSSProperties = { ...btnSmall, background: "#3b1212", color: "#ff8f8f", borderColor: '#5c0000' };

// Table
const th: React.CSSProperties = { textAlign: "left", padding: "12px 10px", fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px' };
const td: React.CSSProperties = { padding: "12px 10px", fontSize: 13, borderTop: "1px solid #1f2c33" };

// Modal
const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 };
const modalContent: React.CSSProperties = { background: '#111b21', borderRadius: 16, width: '95%', maxWidth: 850, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' };

// Tab Filter Styles
const tabBase: React.CSSProperties = { padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #1f2c33', transition: 'all 0.2s' };
const tabInactive: React.CSSProperties = { ...tabBase, background: 'transparent', color: '#8696a0' };
const tabActive: React.CSSProperties = { ...tabBase, background: '#202c33', color: '#fff', borderColor: '#53bdeb' };
const tabActiveReplied: React.CSSProperties = { ...tabBase, background: 'rgba(83, 189, 235, 0.2)', color: '#53bdeb', borderColor: '#53bdeb' };
const tabActiveFailed: React.CSSProperties = { ...tabBase, background: 'rgba(255, 107, 107, 0.2)', color: '#ff6b6b', borderColor: '#ff6b6b' };