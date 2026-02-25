import React, { useEffect, useMemo, useState, useRef } from "react";
import { 
  Play, Pause, Square, Trash2, Eye, 
  Image as ImageIcon, FileText, Type, Clock, CheckCircle2, Layers, RefreshCw 
} from "lucide-react";

/**
 * HELPER INTERNAL
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
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

const formatETA = (remainingTargets: number, delayMs: number) => {
  if (remainingTargets <= 0) return "Selesai";
  const totalSeconds = Math.ceil((remainingTargets * delayMs) / 1000);
  if (totalSeconds < 60) return `${totalSeconds} dtk`;
  const minutes = Math.floor(totalSeconds / 60);
  return `± ${minutes} mnt`;
};

// ===== TYPES =====
type SessionRow = { session_key: string; status: string };
type TemplateRow = { id: number; name: string; message_type: string; text_body: string; media_url: string };
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
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  
  const [sessionKey, setSessionKey] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [text, setText] = useState("");
  const [delayMs, setDelayMs] = useState("1200");
  const [msgType, setMsgType] = useState<'text' | 'image' | 'document'>('text');
  const [scheduleDate, setScheduleDate] = useState("");
  
  // State untuk Dropdown Template
  const [templateId, setTemplateId] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [viewJob, setViewJob] = useState<JobRow | null>(null);
  const [jobItems, setJobItems] = useState<BroadcastItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemFilter, setItemFilter] = useState("all");
  
  // State untuk Pratinjau
  const [previewTrigger, setPreviewTrigger] = useState(0);

  const targets = useMemo(() => targetsText.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), [targetsText]);
  const filteredJobs = useMemo(() => historyFilter === "all" ? jobs : jobs.filter(j => j.status === historyFilter), [jobs, historyFilter]);
  const filteredItems = useMemo(() => {
    if (itemFilter === "replied") return jobItems.filter(i => i.reply_status === "replied");
    if (itemFilter === "failed") return jobItems.filter(i => i.status === "failed");
    return jobItems;
  }, [jobItems, itemFilter]);

  // LIVE PARSER PREVIEW ENGINE
  const parsedPreview = useMemo(() => {
    let txt = text || "";
    if (!txt.trim()) return "";

    // 1. Live Variable Parser
    txt = txt.replace(/\{\{nama\}\}/ig, "Budi (Contoh)");
    txt = txt.replace(/\{\{nomor\}\}/ig, "6281288844813");
    
    const h = new Date().getHours();
    let salam = "Malam";
    if (h >= 3 && h < 11) salam = "Pagi";
    else if (h >= 11 && h < 15) salam = "Siang";
    else if (h >= 15 && h < 18) salam = "Sore";
    
    txt = txt.replace(/\{\{salam\}\}/ig, salam);

    // 2. Live Spintax Parser
    txt = txt.replace(/\{([^{}]+)\}/g, (match, contents) => {
      const options = contents.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
    
    return txt;
  }, [text, previewTrigger]);

  async function loadInitialData() {
    try {
      const [sRes, tRes, jRes] = await Promise.all([
        apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] })),
        apiFetch<any>("templates").catch(() => ({ data: [] })),
        apiFetch<any>("broadcast/jobs").catch(() => ({ jobs: [] }))
      ]);
      
      setSessions(sRes.sessions || []);
      setTemplates(tRes.data || []);
      setJobs(jRes.jobs || []);
      
      if (!sessionKey && sRes.sessions?.length) setSessionKey(sRes.sessions[0].session_key);
    } catch(e) { console.error("Gagal load data awal", e); }
  }

  async function loadJobsOnly() {
    try {
      const r = await apiFetch<any>("broadcast/jobs");
      setJobs(r.jobs || []);
    } catch {}
  }

  useEffect(() => {
    loadInitialData(); 
    const t = setInterval(loadJobsOnly, 3000); 
    return () => clearInterval(t);
  }, []);

  async function create() {
    setErr(null); setInfo(null);
    if (!sessionKey) return setErr("Silakan pilih sesi WA pengirim terlebih dahulu.");
    if (!targets.length) return setErr("Daftar nomor target kosong. Harap isi minimal 1 nomor.");
    if (!text.trim() && msgType === 'text') return setErr("Konten pesan tidak boleh kosong.");

    if (msgType !== 'text') {
       return setInfo("Fitur pengiriman Media sedang dalam tahap integrasi backend. Silakan gunakan Teks untuk saat ini.");
    }

    try {
      await apiFetch<any>("broadcast/create", {
        method: "POST",
        body: JSON.stringify({ 
          sessionKey, 
          text: text.trim(), 
          targets, 
          delayMs: Number(delayMs),
          msgType: msgType,
          scheduledAt: scheduleDate ? new Date(scheduleDate).toISOString() : undefined
        }),
      });
      setInfo(scheduleDate ? "Kampanye broadcast berhasil dijadwalkan!" : "Kampanye pesan massal berhasil ditambahkan ke antrean!");
      setTargetsText(""); 
      setText(""); 
      setTemplateId("");
      loadJobsOnly();
    } catch (e: any) { 
      setErr(e.message || "Gagal menjadwalkan broadcast."); 
    }
  }

  async function togglePause(id: number, currentStatus: string) {
    const action = currentStatus === 'paused' ? 'resume' : 'pause';
    try { 
      await apiFetch(`broadcast/${id}/${action}`, { method: "POST" }); 
      loadJobsOnly(); 
    } catch (e: any) { 
      setErr(`Fitur ${action} membutuhkan pembaruan rute di backend Anda.`); 
    }
  }

  async function cancelJob(id: number) {
    if (!confirm("Hentikan pengiriman broadcast ini permanen?")) return;
    try { await apiFetch(`broadcast/${id}/cancel`, { method: "POST" }); loadJobsOnly(); } 
    catch (e: any) { setErr(e.message); }
  }

  async function deleteJob(id: number) {
    if (!confirm("Hapus data riwayat ini dari database secara permanen?")) return;
    try { await apiFetch(`broadcast/${id}`, { method: "DELETE" }); setJobs(p => p.filter(j => j.id !== id)); } 
    catch (e: any) { setErr(e.message); }
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
        
        {/* TABS TIPE PESAN */}
        <div className="flex gap-2 mb-8 bg-white/50 p-2 rounded-2xl border border-white w-fit">
           <button onClick={() => setMsgType('text')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${msgType === 'text' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}><Type size={14} /> Teks</button>
           <button onClick={() => setMsgType('image')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${msgType === 'image' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}><ImageIcon size={14} /> Gambar</button>
           <button onClick={() => setMsgType('document')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${msgType === 'document' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}><FileText size={14} /> Dokumen</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* KOLOM KIRI: KONFIGURASI TARGET */}
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
              <p className="text-[10px] text-slate-400 font-medium ml-2 mt-2 leading-relaxed">
                Gunakan format Internasional (contoh: 628...). Pisahkan dengan ENTER atau Koma.<br/>
              </p>
            </div>
          </div>

          {/* KOLOM KANAN: PESAN & PENJADWALAN */}
          <div className="space-y-6 flex flex-col h-full">
             
             {/* 🚀 INTEGRASI TEMPLATE DROPDOWN */}
             <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 transition-all hover:bg-indigo-50 shadow-sm">
               <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Layers size={14}/> Gunakan Template Tersimpan</label>
               <select 
                 className="w-full px-4 py-3 rounded-xl bg-white border border-indigo-200 text-sm font-bold text-slate-700 outline-none focus:ring-[4px] focus:ring-indigo-500/20 cursor-pointer"
                 value={templateId}
                 onChange={(e) => {
                    setTemplateId(e.target.value);
                    const tpl = templates.find(t => t.id === Number(e.target.value));
                    if(tpl) {
                       setMsgType(tpl.message_type as any);
                       setText(tpl.text_body || "");
                    }
                 }}
               >
                 <option value="">-- Pilih Template Pesan (Opsional) --</option>
                 {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.message_type})</option>)}
               </select>
             </div>

             {/* Media Uploader (Jika dipilih) */}
             {msgType !== 'text' && (
                <div className="w-full border-2 border-dashed border-slate-300 rounded-[2rem] p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer bg-white">
                   <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                      {msgType === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}
                   </div>
                   <p className="text-xs font-bold text-slate-600">Klik untuk unggah {msgType === 'image' ? 'Gambar' : 'Dokumen'}</p>
                </div>
             )}

             <div className="flex-1 flex flex-col">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Konten Pesan {msgType !== 'text' && '(Caption)'}</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} className="flex-1 w-full px-6 py-4 rounded-[2rem] bg-white border border-slate-200 font-medium text-slate-700 outline-none focus:ring-[6px] focus:ring-blue-500/10 transition-all resize-none text-sm leading-relaxed min-h-[140px]" placeholder="Halo {{nama}}, ini adalah pesan broadcast..." />
             </div>
             
             {/* 🚀 LIVE PREVIEW PARSER */}
             <div className="mt-4 border border-slate-200 rounded-[1.5rem] bg-slate-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-100/50 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">👀 Pratinjau Pengiriman</span>
                  <button type="button" onClick={() => setPreviewTrigger(p => p + 1)} className="text-[9px] font-bold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md flex items-center gap-1 hover:text-blue-600 hover:border-blue-200 transition-colors shadow-sm cursor-pointer">
                    <RefreshCw size={10} /> Acak Spintax
                  </button>
                </div>
                <div className="p-5">
                  <div className="bg-white rounded-tr-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-sm p-4 text-[14px] font-medium text-slate-700 shadow-sm border border-slate-100 whitespace-pre-wrap leading-relaxed max-w-[85%]">
                    {parsedPreview || <span className="text-slate-400 italic">Ketik sesuatu untuk melihat hasil akhir pesan Anda...</span>}
                  </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Clock size={16} /></div>
                  <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full pl-12 pr-4 py-4 rounded-[1.5rem] bg-white border border-slate-200 font-bold text-xs text-slate-600 outline-none focus:ring-[6px] focus:ring-blue-500/10" />
                </div>
                <button onClick={create} disabled={!sessionKey || sessions.length === 0} className={`w-full py-4 rounded-[1.5rem] text-white font-black text-xs shadow-xl transition-all uppercase tracking-widest ${!sessionKey || sessions.length === 0 ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/20 hover:scale-[1.02] active:scale-95'}`}>
                  {scheduleDate ? 'Jadwalkan' : 'Kirim Sekarang'}
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* HISTORY TABLE WITH PROGRESS BAR */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-white/40 flex flex-col sm:flex-row justify-between items-center gap-4">
           <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Riwayat & Status Broadcast</h3>
           <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} className="bg-white px-4 py-2.5 rounded-xl text-[10px] font-black border border-slate-200 text-slate-600 uppercase tracking-tighter outline-none cursor-pointer">
              <option value="all">Semua Status Job</option>
              <option value="queued">Menunggu Antrean</option>
              <option value="running">Sedang Berjalan</option>
              <option value="paused">Dijeda (Paused)</option>
              <option value="done">Selesai (Done)</option>
              <option value="canceled">Dibatalkan</option>
           </select>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/20">
                <th className="px-8 py-5">Sesi & Status</th>
                <th className="px-8 py-5 w-2/5">Progress Pengiriman & ETA</th>
                <th className="px-8 py-5">Update Terakhir</th>
                <th className="px-8 py-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {filteredJobs.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12 text-slate-400 font-bold text-sm">Belum ada riwayat broadcast.</td></tr>
              )}
              {filteredJobs.map(j => {
                const processed = j.sent_count + j.failed_count;
                const progressPct = j.total_targets > 0 ? Math.round((processed / j.total_targets) * 100) : 0;
                const isRunning = j.status === 'running';

                return (
                <tr key={j.id} className="hover:bg-white/40 transition-colors">
                  <td className="px-8 py-5">
                    <div className="font-black text-slate-800 text-sm mb-1">{j.session_key}</div>
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                      j.status === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      j.status === 'running' ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' :
                      j.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      j.status === 'canceled' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                      'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  
                  <td className="px-8 py-5">
                    <div className="flex justify-between items-end mb-1.5">
                       <span className="text-[10px] font-black text-slate-600">{progressPct}% Selesai</span>
                       <div className="flex gap-2 text-[9px] font-bold">
                         <span className="text-emerald-500">{j.sent_count} Sukses</span>
                         <span className="text-rose-500">{j.failed_count} Gagal</span>
                         <span className="text-slate-400">/ {j.total_targets} Total</span>
                       </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full transition-all duration-1000 ${j.status === 'done' ? 'bg-emerald-500' : j.status === 'failed' ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${progressPct}%` }}></div>
                    </div>
                    {isRunning && (
                      <div className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                        <Clock size={10} className="animate-spin-slow" /> ETA: {formatETA(j.total_targets - processed, j.delay_ms)}
                      </div>
                    )}
                  </td>

                  <td className="px-8 py-5 text-xs text-slate-500 font-medium">{fmtDate(j.updated_at)}</td>
                  
                  <td className="px-8 py-5 text-right align-middle">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openDetail(j)} className="w-8 h-8 rounded-xl bg-white text-blue-600 flex items-center justify-center hover:bg-blue-50 border border-slate-200 transition-all shadow-sm" title="Lihat Detail"><Eye size={14}/></button>
                      
                      {isRunning && (
                        <button onClick={() => togglePause(j.id, j.status)} className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 border border-amber-200 transition-all shadow-sm" title="Jeda"><Pause size={14}/></button>
                      )}
                      {j.status === 'paused' && (
                        <button onClick={() => togglePause(j.id, j.status)} className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 border border-emerald-200 transition-all shadow-sm" title="Lanjutkan"><Play size={14}/></button>
                      )}
                      {(j.status === "running" || j.status === "queued" || j.status === "paused") && (
                        <button onClick={() => cancelJob(j.id)} className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 border border-rose-200 transition-all shadow-sm" title="Batalkan"><Square size={14}/></button>
                      )}
                      
                      <button onClick={() => deleteJob(j.id)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 border border-slate-200 transition-all shadow-sm" title="Hapus Permanen"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
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
                              <span className={`flex items-center gap-1.5 px-3 py-1.5 w-fit rounded-md border text-[9px] font-black uppercase tracking-widest ${
                                item.status === 'sent' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                item.status === 'failed' ? 'bg-rose-50 text-rose-500 border-rose-100' :
                                'bg-slate-50 text-slate-500 border-slate-200'
                              }`}>
                                {item.status === 'sent' && <CheckCircle2 size={10} />}
                                {item.status}
                              </span>
                           </td>
                           <td className="py-4 px-6 max-w-xs">
                              {item.reply_status === 'replied' ? (
                                <div className="text-xs bg-blue-50 p-3 rounded-2xl border border-blue-100 text-blue-700 font-medium relative">
                                  <div className="absolute -left-1.5 top-3 w-3 h-3 bg-blue-50 border border-blue-100 rotate-45 border-r-0 border-t-0"></div>
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