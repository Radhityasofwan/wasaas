import { useEffect, useMemo, useState } from "react";

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
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json();
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
  const [delayMs, setDelayMs] = useState("800");
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
    const r = await apiFetch<any>("/ui/sessions");
    const list = (r.sessions || []).map((s: any) => ({ session_key: s.session_key, status: s.status }));
    setSessions(list);
    if (!sessionKey && list.length) setSessionKey(list[0].session_key);
  }

  async function loadJobs() {
    try {
      const r = await apiFetch<any>("/broadcast/jobs");
      setJobs(r.jobs || []);
    } catch {}
  }

  useEffect(() => {
    loadSessions(); loadJobs();
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, []);

  async function create() {
    setErr(null); setInfo(null);
    if (!sessionKey) return setErr("Pilih sesi pengirim");
    if (!targets.length) return setErr("Masukkan minimal satu nomor target");
    try {
      await apiFetch<any>("/broadcast/create", {
        method: "POST",
        body: JSON.stringify({ sessionKey, text: text.trim(), targets, delayMs: Number(delayMs) }),
      });
      setInfo("Kampanye broadcast berhasil dijadwalkan!");
      setTargetsText(""); setText(""); loadJobs();
    } catch (e: any) { setErr(e.message); }
  }

  async function cancelJob(id: number) {
    if (!confirm("Hentikan pengiriman ini?")) return;
    try { await apiFetch(`/broadcast/${id}/cancel`, { method: "POST" }); loadJobs(); } catch (e: any) { setErr(e.message); }
  }

  async function deleteJob(id: number) {
    if (!confirm("Hapus riwayat ini?")) return;
    try { await apiFetch(`/broadcast/${id}`, { method: "DELETE" }); setJobs(p => p.filter(j => j.id !== id)); } catch (e: any) { setErr(e.message); }
  }

  async function openDetail(job: JobRow) {
    setViewJob(job); setJobItems([]); setItemFilter("all"); setLoadingItems(true);
    try {
      const itemsRes = await apiFetch<any>(`/broadcast/${job.id}/items?limit=500`);
      setJobItems(itemsRes.data || []);
    } catch {} finally { setLoadingItems(false); }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Broadcast</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Kampanye Pesan Massal & Blast</p>
        </div>
      </div>

      {(err || info) && (
        <div className={`p-6 rounded-[2rem] border backdrop-blur-md font-bold text-xs flex items-center gap-4 ${err ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${err ? 'bg-rose-500' : 'bg-emerald-500'}`}>!</div>
          {err || info}
        </div>
      )}

      {/* FORM CARD */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-8 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-3 block">Sesi Pengirim & Jeda</label>
              <div className="flex gap-3">
                <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} className="flex-1 px-6 py-4 rounded-2xl bg-white/60 border border-white font-bold text-slate-700 outline-none focus:bg-white transition-all">
                  {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
                </select>
                <input value={delayMs} onChange={(e) => setDelayMs(e.target.value)} className="w-28 px-6 py-4 rounded-2xl bg-white/60 border border-white font-bold text-slate-700 outline-none focus:bg-white text-center" placeholder="ms" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-3 block">Daftar Nomor Target ({targets.length})</label>
              <textarea value={targetsText} onChange={(e) => setTargetsText(e.target.value)} rows={6} className="w-full px-6 py-4 rounded-[2rem] bg-white/60 border border-white font-medium text-slate-700 outline-none focus:bg-white transition-all resize-none text-sm" placeholder="628123456789&#10;628987654321" />
            </div>
          </div>
          <div className="space-y-6">
             <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-3 block">Konten Pesan</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className="w-full px-6 py-4 rounded-[2rem] bg-white/60 border border-white font-medium text-slate-700 outline-none focus:bg-white transition-all resize-none text-sm" placeholder="Halo, ini adalah pesan broadcast..." />
             </div>
             <button onClick={create} className="w-full py-5 rounded-[2rem] bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all">
               Jalankan Blast Sekarang
             </button>
          </div>
        </div>
      </div>

      {/* HISTORY TABLE */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-white/40 flex justify-between items-center">
           <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Riwayat Broadcast</h3>
           <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} className="bg-white/60 px-4 py-2 rounded-xl text-[10px] font-black border border-white uppercase tracking-tighter outline-none">
              <option value="all">Semua Status</option>
              <option value="running">Berjalan</option>
              <option value="done">Selesai</option>
           </select>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <th className="px-8 py-5">ID & Status</th>
              <th className="px-8 py-5 text-center">Statistik</th>
              <th className="px-8 py-5">Update</th>
              <th className="px-8 py-5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20">
            {filteredJobs.map(j => (
              <tr key={j.id} className="hover:bg-white/20 transition-all">
                <td className="px-8 py-5">
                  <div className="font-bold text-slate-800">#{j.id}</div>
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${j.status === 'done' ? 'text-emerald-500' : 'text-blue-500'}`}>{j.status}</span>
                </td>
                <td className="px-8 py-5 text-center">
                  <div className="inline-flex gap-2 text-xs font-bold text-slate-600">
                    <span className="text-emerald-500">{j.sent_count}✔</span>
                    <span className="text-rose-500">{j.failed_count}✖</span>
                    <span className="opacity-40">{j.total_targets}</span>
                  </div>
                </td>
                <td className="px-8 py-5 text-xs text-slate-500 font-medium">{fmtDate(j.updated_at)}</td>
                <td className="px-8 py-5 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openDetail(j)} className="p-2.5 rounded-xl bg-white/60 hover:bg-white border border-white transition-all">👁️</button>
                    {(j.status === "running" || j.status === "queued") && <button onClick={() => cancelJob(j.id)} className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 transition-all">⏹️</button>}
                    <button onClick={() => deleteJob(j.id)} className="p-2.5 rounded-xl bg-rose-50 text-rose-500 border border-rose-100 transition-all">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DETAIL MODAL */}
      {viewJob && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-500">
           <div className="w-full max-w-4xl bg-white/90 backdrop-blur-3xl rounded-[3rem] p-10 shadow-2xl border border-white flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-8 shrink-0">
                 <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Detail Job #{viewJob.id}</h2>
                 <button onClick={() => setViewJob(null)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black">✕</button>
              </div>
              <div className="flex gap-3 mb-6 shrink-0">
                 {['all', 'replied', 'failed'].map(f => (
                   <button key={f} onClick={() => setItemFilter(f)} className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${itemFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/60 text-slate-500 border-white hover:bg-white'}`}>
                     {f} ({f === 'all' ? jobItems.length : jobItems.filter(i => f === 'replied' ? i.reply_status === 'replied' : i.status === 'failed').length})
                   </button>
                 ))}
              </div>
              <div className="flex-1 overflow-y-auto pr-4 scrollbar-hide">
                 <table className="w-full">
                    <thead className="sticky top-0 bg-white/10 backdrop-blur-md text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                       <tr><th className="py-4 px-4">Nomor</th><th className="py-4 px-4">Status</th><th className="py-4 px-4">Interaksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {filteredItems.map(item => (
                         <tr key={item.id}>
                           <td className="py-4 px-4 font-mono text-sm text-slate-700">{item.to_number}</td>
                           <td className="py-4 px-4"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${item.status === 'sent' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{item.status}</span></td>
                           <td className="py-4 px-4">
                              {item.reply_status === 'replied' ? <div className="text-xs bg-blue-50/50 p-3 rounded-2xl border border-blue-100 text-blue-700 italic">"{item.reply_text || 'Media/Unknown'}"</div> : <span className="text-[10px] text-slate-300">Belum ada balasan</span>}
                           </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}