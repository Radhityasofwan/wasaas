import React, { useEffect, useMemo, useState } from "react";

/**
 * =============================================================================
 * HELPER INTERNAL & API CONFIGURATION
 * =============================================================================
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  // FIX: Sinkronisasi Path Proxy seperti di halaman lain
  const url = path.startsWith("http") ? path : `/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Server Backend mengalami gangguan (HTTP ${res.status}).`);
  }

  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
};

// ===== TYPES =====
type SessionRow = { session_key: string; status: string };
type JobRow = {
  id: number;
  session_key: string;
  status: string;
  delay_ms: number;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  text_body?: string;
  updated_at: string;
};
type BroadcastItem = {
  id: number;
  to_number: string;
  status: string;
  reply_status: string;
  reply_text: string | null;
  reply_received_at: string | null;
  sent_at: string | null;
};

export default function Broadcast() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [text, setText] = useState("");
  const [delayMs, setDelayMs] = useState("1200"); // Jeda Ideal
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [viewJob, setViewJob] = useState<JobRow | null>(null);
  const [jobItems, setJobItems] = useState<BroadcastItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemFilter, setItemFilter] = useState("all");

  const targets = useMemo(() => targetsText.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), [targetsText]);
  const filteredJobs = useMemo(() => historyFilter === "all" ? jobs : jobs.filter(j => j.status === historyFilter), [jobs, historyFilter]);
  const filteredItems = useMemo(() => {
    if (itemFilter === "replied") return jobItems.filter(i => i.reply_status === "replied");
    if (itemFilter === "failed") return jobItems.filter(i => i.status === "failed");
    return jobItems;
  }, [jobItems, itemFilter]);

  async function loadSessions() {
    try {
      const r = await apiFetch<any>("ui/sessions");
      const list = (r.sessions || []).map((s: any) => ({ session_key: s.session_key, status: s.status }));
      setSessions(list);
      if (!sessionKey && list.length) setSessionKey(list[0].session_key);
    } catch(e) {
      console.error("Gagal load session", e);
    }
  }

  async function loadJobs() {
    try {
      const r = await apiFetch<any>("broadcast/jobs");
      setJobs(r.jobs || []);
    } catch {}
  }

  useEffect(() => {
    loadSessions(); 
    loadJobs();
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, []);

  async function create() {
    setErr(null); setInfo(null);
    if (!sessionKey) return setErr("Silakan pilih sesi WA pengirim terlebih dahulu.");
    if (!targets.length) return setErr("Daftar nomor target kosong. Harap isi minimal 1 nomor.");
    if (!text.trim()) return setErr("Konten pesan tidak boleh kosong.");

    try {
      await apiFetch<any>("broadcast/create", {
        method: "POST",
        body: JSON.stringify({ sessionKey, text: text.trim(), targets, delayMs: Number(delayMs) }),
      });
      setInfo("Kampanye pesan massal berhasil ditambahkan ke antrean!");
      setTargetsText(""); 
      setText(""); 
      loadJobs();
    } catch (e: any) { 
      setErr(e.message || "Gagal menjadwalkan broadcast."); 
    }
  }

  async function cancelJob(id: number) {
    if (!confirm("Peringatan: Pengiriman broadcast ini akan dibatalkan permanen. Lanjutkan?")) return;
    try { 
      await apiFetch(`broadcast/${id}/cancel`, { method: "POST" }); 
      loadJobs(); 
    } catch (e: any) { 
      setErr(e.message); 
    }
  }

  async function deleteJob(id: number) {
    if (!confirm("Hapus data riwayat ini dari database secara permanen?")) return;
    try { 
      await apiFetch(`broadcast/${id}`, { method: "DELETE" }); 
      setJobs(p => p.filter(j => j.id !== id)); 
    } catch (e: any) { 
      setErr(e.message); 
    }
  }

  async function openDetail(job: JobRow) {
    setViewJob(job); setJobItems([]); setItemFilter("all"); setLoadingItems(true);
    try {
      const itemsRes = await apiFetch<any>(`broadcast/${job.id}/items?limit=500`);
      setJobItems(itemsRes.data || []);
    } catch {} finally { setLoadingItems(false); }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Broadcast Engine</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Kirim Kampanye Pesan Massal</p>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {err && (
        <div className="bg-rose-50/80 border border-rose-100 text-rose-600 px-6 py-4 rounded-2xl text-[12px] font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-md">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black">!</span>
          {err}
        </div>
      )}
      {info && (
        <div className="bg-emerald-50/80 border border-emerald-100 text-emerald-600 px-6 py-4 rounded-2xl text-[12px] font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-md">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black">✓</span>
          {info}
        </div>
      )}

      {/* FORM CARD */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-8 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-3 block">Sesi Pengirim WA & Jeda Kirim</label>
              <div className="flex gap-3">
                <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} className="flex-1 px-6 py-4 rounded-2xl bg-white border border-slate-200 font-bold text-slate-700 outline-none focus:ring-[6px] focus:ring-blue-500/10 transition-all cursor-pointer">
                  {sessions.length === 0 && <option value="">-- Tidak ada sesi WA --</option>}
                  {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
                </select>
                <div className="relative">
                  <input type="number" min="0" value={delayMs} onChange={(e) => setDelayMs(e.target.value)} className="w-28 px-4 py-4 rounded-2xl bg-white border border-slate-200 font-bold text-slate-700 outline-none focus:ring-[6px] focus:ring-blue-500/10 text-center" placeholder="1200" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">ms</span>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center ml-2 mb-3">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daftar Nomor Target</label>
                 <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">{targets.length} Target</span>
              </div>
              <textarea value={targetsText} onChange={(e) => setTargetsText(e.target.value)} rows={6} className="w-full px-6 py-4 rounded-[2rem] bg-white border border-slate-200 font-mono text-slate-700 outline-none focus:ring-[6px] focus:ring-blue-500/10 transition-all resize-none text-sm leading-relaxed" placeholder="628123456789&#10;628987654321" />
              <p className="text-[10px] text-slate-400 font-medium ml-2 mt-2">Gunakan format Internasional (contoh: 628...). Pisahkan dengan ENTER atau Koma.</p>
            </div>
          </div>

          <div className="space-y-6">
             <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-3 block">Konten Pesan</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className="w-full px-6 py-4 rounded-[2rem] bg-white border border-slate-200 font-medium text-slate-700 outline-none focus:ring-[6px] focus:ring-blue-500/10 transition-all resize-none text-sm leading-relaxed" placeholder="Halo, ini adalah pesan broadcast..." />
             </div>
             <button onClick={create} disabled={!sessionKey || sessions.length === 0} className={`w-full py-5 rounded-[2rem] text-white font-black text-sm shadow-xl transition-all uppercase tracking-widest ${!sessionKey || sessions.length === 0 ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/20 hover:scale-[1.02] active:scale-95'}`}>
               Jalankan Blast Sekarang
             </button>
          </div>
        </div>
      </div>

      {/* HISTORY TABLE */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-white/40 flex flex-col sm:flex-row justify-between items-center gap-4">
           <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Riwayat & Status Broadcast</h3>
           <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} className="bg-white px-4 py-2.5 rounded-xl text-[10px] font-black border border-slate-200 text-slate-600 uppercase tracking-tighter outline-none cursor-pointer">
              <option value="all">Semua Status Job</option>
              <option value="queued">Menunggu Antrean (Queued)</option>
              <option value="running">Sedang Berjalan (Running)</option>
              <option value="done">Selesai (Done)</option>
              <option value="canceled">Dibatalkan (Canceled)</option>
           </select>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/20">
                <th className="px-8 py-5">Sesi & Status</th>
                <th className="px-8 py-5 text-center">Progress</th>
                <th className="px-8 py-5">Update Terakhir</th>
                <th className="px-8 py-5 text-right">Manajemen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {filteredJobs.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12 text-slate-400 font-bold text-sm">Belum ada riwayat broadcast.</td></tr>
              )}
              {filteredJobs.map(j => (
                <tr key={j.id} className="hover:bg-white/40 transition-colors">
                  <td className="px-8 py-5">
                    <div className="font-black text-slate-800 text-sm mb-1">{j.session_key}</div>
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                      j.status === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      j.status === 'running' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
                      j.status === 'canceled' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <div className="inline-flex items-center gap-3 text-xs font-black">
                      <div className="flex flex-col items-center"><span className="text-emerald-500">{j.sent_count}</span><span className="text-[8px] text-slate-400 uppercase tracking-widest">Terkirim</span></div>
                      <span className="text-slate-300">/</span>
                      <div className="flex flex-col items-center"><span className="text-rose-500">{j.failed_count}</span><span className="text-[8px] text-slate-400 uppercase tracking-widest">Gagal</span></div>
                      <span className="text-slate-300">/</span>
                      <div className="flex flex-col items-center"><span className="text-slate-700">{j.total_targets}</span><span className="text-[8px] text-slate-400 uppercase tracking-widest">Total</span></div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-xs text-slate-500 font-medium">{fmtDate(j.updated_at)}</td>
                  <td className="px-8 py-5 text-right align-middle">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openDetail(j)} className="px-4 py-2 rounded-xl bg-white text-blue-600 font-bold text-[10px] hover:bg-blue-50 border border-slate-200 transition-all shadow-sm">Detail</button>
                      {(j.status === "running" || j.status === "queued") && (
                        <button onClick={() => cancelJob(j.id)} className="px-4 py-2 rounded-xl bg-amber-50 text-amber-600 font-bold text-[10px] hover:bg-amber-100 border border-amber-200 transition-all shadow-sm">Batalkan</button>
                      )}
                      <button onClick={() => deleteJob(j.id)} className="px-4 py-2 rounded-xl bg-rose-50 text-rose-500 font-bold text-[10px] hover:bg-rose-100 border border-rose-200 transition-all shadow-sm">Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL (REPLIES / ERROR TRACKING) */}
      {viewJob && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-2xl animate-in fade-in duration-300">
           <div className="w-full max-w-4xl bg-white/95 backdrop-blur-3xl rounded-[3rem] p-8 sm:p-10 shadow-2xl border border-white flex flex-col h-[90vh]">
              
              <div className="flex justify-between items-center mb-6 shrink-0 border-b border-slate-100 pb-6">
                 <div>
                   <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Laporan Job #{viewJob.id}</h2>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sesi: {viewJob.session_key}</p>
                 </div>
                 <button onClick={() => setViewJob(null)} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 hover:bg-rose-100 hover:text-rose-500 transition-colors">✕</button>
              </div>

              <div className="flex flex-wrap gap-2 mb-6 shrink-0 bg-slate-50 p-2 rounded-[1.5rem] w-fit border border-slate-100">
                 {['all', 'replied', 'failed'].map(f => (
                   <button key={f} onClick={() => setItemFilter(f)} className={`px-6 py-3 rounded-[1rem] text-[10px] font-black uppercase tracking-widest transition-all ${itemFilter === f ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800 border border-transparent'}`}>
                     {f === 'all' ? 'Semua Target' : f === 'replied' ? 'Sudah Membalas' : 'Gagal Terkirim'} 
                     <span className="ml-1.5 opacity-60">({f === 'all' ? jobItems.length : jobItems.filter(i => f === 'replied' ? i.reply_status === 'replied' : i.status === 'failed').length})</span>
                   </button>
                 ))}
              </div>

              <div className="flex-1 overflow-y-auto pr-4 scrollbar-hide border border-slate-200 rounded-[2rem] bg-white relative">
                {loadingItems ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Mengambil data...</div>
                ) : (
                 <table className="w-full">
                    <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-md text-[10px] font-black text-slate-400 uppercase tracking-widest text-left border-b border-slate-200 z-10">
                       <tr>
                         <th className="py-5 px-6">Nomor Tujuan</th>
                         <th className="py-5 px-6">Status Pengiriman</th>
                         <th className="py-5 px-6">Feedback / Balasan Klien</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {filteredItems.length === 0 && (
                         <tr><td colSpan={3} className="text-center py-10 text-slate-400 font-bold text-sm">Tidak ada data untuk filter ini.</td></tr>
                       )}
                       {filteredItems.map(item => (
                         <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                           <td className="py-4 px-6 font-mono text-sm font-bold text-slate-700">{item.to_number}</td>
                           <td className="py-4 px-6">
                              <span className={`px-3 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest ${
                                item.status === 'sent' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                item.status === 'failed' ? 'bg-rose-50 text-rose-500 border-rose-100' :
                                'bg-slate-50 text-slate-500 border-slate-200'
                              }`}>
                                {item.status}
                              </span>
                           </td>
                           <td className="py-4 px-6 max-w-xs">
                              {item.reply_status === 'replied' ? (
                                <div className="text-xs bg-blue-50 p-3 rounded-2xl border border-blue-100 text-blue-700 font-medium">
                                  <span className="font-black text-[9px] uppercase tracking-widest block mb-1 opacity-60">Pesan Balasan:</span>
                                  {item.reply_text || 'Media/Unknown'}
                                </div>
                              ) : item.status === 'failed' ? (
                                <div className="text-[10px] text-rose-500 font-mono leading-tight">{item.last_error || 'Gagal tanpa error spesifik'}</div>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-bold italic">Menunggu balasan...</span>
                              )}
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