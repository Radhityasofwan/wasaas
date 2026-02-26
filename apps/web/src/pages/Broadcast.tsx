import React, { useEffect, useMemo, useState } from "react";
import { Play, Pause, Square, Trash2, Eye, 
  Image as ImageIcon, FileText, Type, Clock, CheckCircle2, Layers, RefreshCw, CheckSquare, XCircle, AlertTriangle, Send, Megaphone, Loader2 } from "lucide-react";

import { useConfirm } from "../App";

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
  
  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
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
  
  last_error?: string | null;
id: number;
  to_number: string;
  status: string;
  reply_status: string;
  reply_text: string | null;
  reply_received_at: string | null;
  sent_at: string | null;
};

export default function Broadcast() {
  const confirm = useConfirm();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  
  const [sessionKey, setSessionKey] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [text, setText] = useState("");
  const [delayMs, setDelayMs] = useState("1200");
  const [msgType, setMsgType] = useState<'text' | 'image' | 'document'>('text');
  const [scheduleDate, setScheduleDate] = useState("");
  
  const [templateId, setTemplateId] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [viewJob, setViewJob] = useState<JobRow | null>(null);
  const [jobItems, setJobItems] = useState<BroadcastItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemFilter, setItemFilter] = useState("all");
  
  const [previewTrigger, setPreviewTrigger] = useState(0);

  // Bulk Delete Broadcast States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<number[]>([]);

  const targets = useMemo(() => targetsText.split(/[\n,;]/).map(s => s.trim()).filter(Boolean), [targetsText]);
  const filteredJobs = useMemo(() => historyFilter === "all" ? jobs : jobs.filter(j => j.status === historyFilter), [jobs, historyFilter]);
  const filteredItems = useMemo(() => {
    if (itemFilter === "replied") return jobItems.filter(i => i.reply_status === "replied");
    if (itemFilter === "failed") return jobItems.filter(i => i.status === "failed");
    return jobItems;
  }, [jobItems, itemFilter]);

  const parsedPreview = useMemo(() => {
    let txt = text || "";
    if (!txt.trim()) return "";

    const fallbackName = "Budi (Contoh)";
    txt = txt.replace(/\{\{nama\}\}/ig, fallbackName);
    txt = txt.replace(/\{nama\}/ig, fallbackName);
    
    txt = txt.replace(/\{\{nomor\}\}/ig, "6281288844813");
    txt = txt.replace(/\{nomor\}/ig, "6281288844813");
    
    const h = new Date().getHours();
    let salam = "Malam";
    if (h >= 3 && h < 11) salam = "Pagi";
    else if (h >= 11 && h < 15) salam = "Siang";
    else if (h >= 15 && h < 18) salam = "Sore";
    
    txt = txt.replace(/\{\{salam\}\}/ig, salam);
    txt = txt.replace(/\{salam\}/ig, salam);

    const spintaxRegex = /\{([^{}]*\|[^{}]*)\}/g;
    let match;
    let processed = txt;
    
    while ((match = spintaxRegex.exec(processed)) !== null) {
      const options = match[1].split('|');
      const choice = options[Math.floor(Math.random() * options.length)];
      processed = processed.replace(match[0], choice);
      spintaxRegex.lastIndex = 0; 
    }
    
    return processed;
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
    const t = setInterval(loadJobsOnly, 5000); // Interval diperlambat sedikit untuk performa
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

    const isConfirmed = await confirm({
      title: "Kirim Broadcast",
      message: `Anda akan mengirim pesan massal ke ${targets.length} nomor tujuan. Lanjutkan?`,
      confirmText: scheduleDate ? "Ya, Jadwalkan" : "Ya, Kirim Sekarang"
    });

    if (!isConfirmed) return;

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
    const isConfirmed = await confirm({
      title: "Hentikan Job",
      message: "Hentikan pengiriman broadcast ini secara permanen?",
      confirmText: "Hentikan",
      isDanger: true
    });
    
    if (!isConfirmed) return;

    try { await apiFetch(`broadcast/${id}/cancel`, { method: "POST" }); loadJobsOnly(); } 
    catch (e: any) { setErr(e.message); }
  }

  async function deleteJob(id: number) {
    const isConfirmed = await confirm({
      title: "Hapus Riwayat",
      message: "Hapus data riwayat ini dari database secara permanen?",
      confirmText: "Hapus",
      isDanger: true
    });

    if (!isConfirmed) return;

    try { await apiFetch(`broadcast/${id}`, { method: "DELETE" }); setJobs(p => p.filter(j => j.id !== id)); } 
    catch (e: any) { setErr(e.message); }
  }

  const toggleJobSelection = (id: number) => {
    setSelectedJobs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  async function executeBulkDeleteJobs() {
    const isConfirmed = await confirm({
      title: "Hapus Massal",
      message: `Hapus permanen ${selectedJobs.length} riwayat broadcast beserta antrean targetnya?`,
      confirmText: "Hapus Massal",
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      await Promise.all(selectedJobs.map(id => apiFetch(`broadcast/${id}`, { method: "DELETE" })));
      setSelectedJobs([]);
      setIsSelectionMode(false);
      loadJobsOnly();
      setInfo(`${selectedJobs.length} Riwayat berhasil dihapus.`);
    } catch (e: any) {
      setErr("Gagal menghapus beberapa riwayat: " + e.message);
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
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20 relative">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Megaphone className="text-[#0b57d0]" size={28} />
            Broadcast Engine
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Kirim kampanye pesan massal ke banyak nomor sekaligus.
          </p>
        </div>
      </div>

      {/* NOTIFIKASI */}
      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-start gap-3 animate-in zoom-in-95 duration-300">
          <AlertTriangle size={20} className="shrink-0 text-rose-500 mt-0.5" />
          <span>{err}</span>
        </div>
      )}
      {info && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm flex items-start gap-3 animate-in zoom-in-95 duration-300">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-500 mt-0.5" />
          <span>{info}</span>
        </div>
      )}

      {/* FORM CARD */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm">
        
        {/* TABS TIPE PESAN */}
        <div className="flex gap-2 mb-6 bg-[#f0f4f9] p-1.5 rounded-2xl w-fit">
           <button onClick={() => setMsgType('text')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${msgType === 'text' ? 'bg-white text-[#0b57d0] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Type size={16} /> Teks</button>
           <button onClick={() => setMsgType('image')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${msgType === 'image' ? 'bg-white text-[#0b57d0] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><ImageIcon size={16} /> Gambar</button>
           <button onClick={() => setMsgType('document')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${msgType === 'document' ? 'bg-white text-[#0b57d0] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><FileText size={16} /> Dokumen</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* KOLOM KIRI: KONFIGURASI TARGET */}
          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-2 block">Sesi Pengirim & Jeda Kirim (Ms)</label>
              <div className="flex gap-3">
                <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} className="flex-1 px-4 py-3 rounded-2xl bg-[#f0f4f9] border-none font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all cursor-pointer">
                  {sessions.length === 0 && <option value="">-- Tidak ada sesi WA --</option>}
                  {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
                </select>
                <div className="relative">
                  <input type="number" min="0" value={delayMs} onChange={(e) => setDelayMs(e.target.value)} className="w-24 px-4 py-3 rounded-2xl bg-[#f0f4f9] border-none font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff] text-center" placeholder="1200" />
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="text-xs font-bold text-slate-700">Daftar Nomor Target</label>
                 <span className="text-[10px] font-bold text-[#0b57d0] bg-[#e9eef6] px-2 py-0.5 rounded uppercase tracking-wider">{targets.length} Target</span>
              </div>
              <textarea value={targetsText} onChange={(e) => setTargetsText(e.target.value)} rows={7} className="w-full px-5 py-4 rounded-2xl bg-[#f0f4f9] border-none font-mono text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all resize-none text-sm leading-relaxed" placeholder="628123456789&#10;628987654321" />
              <p className="text-xs text-slate-500 font-medium mt-2">
                Gunakan format Internasional (contoh: 628...). Pisahkan dengan ENTER atau Koma.
              </p>
            </div>
          </div>

          {/* KOLOM KANAN: PESAN & PENJADWALAN */}
          <div className="space-y-5 flex flex-col h-full">
             
             <div className="bg-[#e9eef6] rounded-2xl p-4 transition-all">
               <label className="text-xs font-bold text-[#0b57d0] mb-2 flex items-center gap-1.5"><Layers size={16}/> Gunakan Template Tersimpan (Opsional)</label>
               <select 
                 className="w-full px-4 py-3 rounded-xl bg-white border-none text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff] cursor-pointer"
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
                 <option value="">-- Pilih Template --</option>
                 {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.message_type})</option>)}
               </select>
             </div>

             {msgType !== 'text' && (
                <div className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:bg-[#f0f4f9] transition-colors cursor-pointer bg-white">
                   <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                      {msgType === 'image' ? <ImageIcon size={24} /> : <FileText size={24} />}
                   </div>
                   <p className="text-sm font-bold text-slate-600">Klik untuk unggah {msgType === 'image' ? 'Gambar' : 'Dokumen'}</p>
                </div>
             )}

             <div className="flex-1 flex flex-col">
                <label className="text-xs font-bold text-slate-700 mb-2 block">Konten Pesan {msgType !== 'text' && '(Caption)'}</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} className="flex-1 w-full px-5 py-4 rounded-2xl bg-[#f0f4f9] border-none font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all resize-none text-sm leading-relaxed min-h-[120px]" placeholder="Halo {{nama}}, ini adalah pesan broadcast..." />
                
                {/* TOMBOL INSERT CEPAT */}
                <div className="mt-2.5 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setText(text + '{{nama}}')} className="px-3 py-1.5 bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#0b57d0] rounded-lg text-xs font-bold transition-colors">
                      + {"{{nama}}"}
                    </button>
                    <button onClick={() => setText(text + '{{nomor}}')} className="px-3 py-1.5 bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#0b57d0] rounded-lg text-xs font-bold transition-colors">
                      + {"{{nomor}}"}
                    </button>
                    <button onClick={() => setText(text + 'Selamat {{salam}}')} className="px-3 py-1.5 bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#0b57d0] rounded-lg text-xs font-bold transition-colors">
                      + {"{{salam}}"}
                    </button>
                    <button onClick={() => setText(text + '{Halo|Hai|Permisi}')} className="px-3 py-1.5 bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#0b57d0] rounded-lg text-xs font-bold transition-colors">
                      Spintax {"{A|B}"}
                    </button>
                  </div>
                </div>
             </div>
             
             {/* 🚀 LIVE PREVIEW PARSER */}
             <div className="mt-2 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-[#f8fafd] flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">👀 Pratinjau Pengiriman</span>
                  <button type="button" onClick={() => setPreviewTrigger(p => p + 1)} className="text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:text-[#0b57d0] hover:border-[#c2e7ff] transition-colors cursor-pointer">
                    <RefreshCw size={12} /> Acak Spintax
                  </button>
                </div>
                <div className="p-4 bg-[#f0f4f9]">
                  <div className="bg-white rounded-tr-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-sm p-3.5 text-sm font-medium text-slate-700 shadow-sm whitespace-pre-wrap leading-relaxed max-w-[90%] md:max-w-[85%]">
                    {parsedPreview || <span className="text-slate-400 italic">Ketik sesuatu untuk melihat hasil akhir pesan Anda...</span>}
                  </div>
                </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Clock size={18} /></div>
                  <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-full bg-[#f0f4f9] border-none font-bold text-sm text-slate-600 outline-none focus:ring-2 focus:ring-[#c2e7ff]" />
                </div>
                <button onClick={create} disabled={!sessionKey || sessions.length === 0} className={`w-full py-3 rounded-full text-white font-bold text-sm transition-all flex items-center justify-center gap-2 ${!sessionKey || sessions.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#0b57d0] hover:bg-[#001d35] active:scale-95 shadow-sm'}`}>
                  <Send size={16} />
                  {scheduleDate ? 'Jadwalkan' : 'Kirim Sekarang'}
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* HISTORY TABLE WITH PROGRESS BAR - MOBILE RESPONSIVE */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-[#f8fafd] flex flex-col sm:flex-row justify-between items-center gap-4">
           <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
             <h3 className="text-base font-bold text-slate-800 tracking-tight">Riwayat</h3>
             <button 
               onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedJobs([]); }}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${isSelectionMode ? 'bg-[#001d35] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-[#f0f4f9]'}`}
             >
               {isSelectionMode ? <XCircle size={14}/> : <CheckSquare size={14}/>} 
               {isSelectionMode ? 'Batal Pilih' : 'Mode Pilih'}
             </button>
           </div>
           
           <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} className="w-full sm:w-auto bg-white px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-[#c2e7ff]">
              <option value="all">Semua Status</option>
              <option value="queued">Menunggu Antrean</option>
              <option value="running">Sedang Berjalan</option>
              <option value="paused">Dijeda</option>
              <option value="done">Selesai</option>
              <option value="canceled">Dibatalkan</option>
           </select>
        </div>
        
        {/* Tampilan Desktop (Tabel) & Mobile (Card) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left bg-white text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                {isSelectionMode && <th className="px-5 py-4 w-10 text-center">Pilih</th>}
                <th className="px-6 py-4">Sesi & Status</th>
                <th className="px-6 py-4 w-2/5">Progress Pengiriman</th>
                <th className="px-6 py-4">Update Terakhir</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredJobs.length === 0 && (
                <tr><td colSpan={isSelectionMode ? 5 : 4} className="text-center py-12 text-slate-400 font-medium">Belum ada riwayat broadcast.</td></tr>
              )}
              {filteredJobs.map(j => {
                const processed = j.sent_count + j.failed_count;
                const progressPct = j.total_targets > 0 ? Math.round((processed / j.total_targets) * 100) : 0;
                const isRunning = j.status === 'running';

                return (
                <tr key={j.id} className="hover:bg-[#f8fafd] transition-colors">
                  {isSelectionMode && (
                    <td className="px-5 py-4 align-middle text-center">
                      <div 
                        onClick={() => toggleJobSelection(j.id)}
                        className={`w-5 h-5 mx-auto rounded border-2 cursor-pointer flex items-center justify-center transition-all ${selectedJobs.includes(j.id) ? 'bg-[#0b57d0] border-[#0b57d0] text-white' : 'bg-white border-slate-300'}`}
                      >
                        {selectedJobs.includes(j.id) && <CheckSquare size={14} strokeWidth={3}/>}
                      </div>
                    </td>
                  )}
                  
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800 text-sm mb-1.5">{j.session_key}</div>
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      j.status === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      j.status === 'running' ? 'bg-[#e9eef6] text-[#0b57d0] border-[#c2e7ff] animate-pulse' :
                      j.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      j.status === 'canceled' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                      'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-xs font-bold text-slate-700">{progressPct}% Selesai</span>
                       <div className="flex gap-2 text-[10px] font-medium">
                         <span className="text-emerald-600">{j.sent_count} Sukses</span>
                         <span className="text-rose-600">{j.failed_count} Gagal</span>
                         <span className="text-slate-500">/ {j.total_targets} Total</span>
                       </div>
                    </div>
                    <div className="w-full bg-[#f0f4f9] rounded-full h-2 mb-1.5 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all duration-1000 ${j.status === 'done' ? 'bg-emerald-500' : j.status === 'failed' ? 'bg-rose-500' : 'bg-[#0b57d0]'}`} style={{ width: `${progressPct}%` }}></div>
                    </div>
                    {isRunning && (
                      <div className="text-[10px] font-medium text-slate-500 flex items-center gap-1.5 mt-2">
                        <Clock size={12} className="animate-spin-slow text-[#0b57d0]" /> ETA: {formatETA(j.total_targets - processed, j.delay_ms)}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">{fmtDate(j.updated_at)}</td>
                  
                  <td className="px-6 py-4 text-right align-middle">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openDetail(j)} className="w-8 h-8 rounded-full bg-white text-[#0b57d0] flex items-center justify-center hover:bg-[#e9eef6] border border-slate-200 transition-colors" title="Lihat Detail"><Eye size={16}/></button>
                      
                      {isRunning && (
                        <button onClick={() => togglePause(j.id, j.status)} className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 border border-amber-200 transition-colors" title="Jeda"><Pause size={16}/></button>
                      )}
                      {j.status === 'paused' && (
                        <button onClick={() => togglePause(j.id, j.status)} className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 border border-emerald-200 transition-colors" title="Lanjutkan"><Play size={16}/></button>
                      )}
                      {(j.status === "running" || j.status === "queued" || j.status === "paused") && (
                        <button onClick={() => cancelJob(j.id)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 border border-rose-200 transition-colors" title="Batalkan"><Square size={16}/></button>
                      )}
                      
                      <button onClick={() => deleteJob(j.id)} className="w-8 h-8 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 border border-slate-200 transition-colors" title="Hapus Permanen"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* List View untuk Mobile */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredJobs.length === 0 && (
            <div className="text-center py-8 text-slate-400 font-medium">Belum ada riwayat broadcast.</div>
          )}
          {filteredJobs.map(j => {
             const processed = j.sent_count + j.failed_count;
             const progressPct = j.total_targets > 0 ? Math.round((processed / j.total_targets) * 100) : 0;
             const isRunning = j.status === 'running';

             return (
              <div key={j.id} className="p-4 bg-white flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {isSelectionMode && (
                      <div 
                        onClick={() => toggleJobSelection(j.id)}
                        className={`w-5 h-5 rounded border-2 cursor-pointer flex items-center justify-center transition-all ${selectedJobs.includes(j.id) ? 'bg-[#0b57d0] border-[#0b57d0] text-white' : 'bg-white border-slate-300'}`}
                      >
                        {selectedJobs.includes(j.id) && <CheckSquare size={14} strokeWidth={3}/>}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{j.session_key}</div>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        j.status === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        j.status === 'running' ? 'bg-[#e9eef6] text-[#0b57d0] border-[#c2e7ff] animate-pulse' :
                        j.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        j.status === 'canceled' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                        'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {j.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium text-right">
                    {fmtDate(j.updated_at).replace(', ', '\n')}
                  </div>
                </div>

                <div>
                   <div className="flex justify-between items-end mb-1.5">
                       <span className="text-xs font-bold text-slate-700">{progressPct}% Selesai</span>
                       <div className="flex gap-2 text-[10px] font-medium">
                         <span className="text-emerald-600">{j.sent_count} Sukses</span>
                         <span className="text-rose-600">{j.failed_count} Gagal</span>
                       </div>
                    </div>
                    <div className="w-full bg-[#f0f4f9] rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full transition-all duration-1000 ${j.status === 'done' ? 'bg-emerald-500' : j.status === 'failed' ? 'bg-rose-500' : 'bg-[#0b57d0]'}`} style={{ width: `${progressPct}%` }}></div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-1">
                    <button onClick={() => openDetail(j)} className="w-8 h-8 rounded-full bg-white text-[#0b57d0] flex items-center justify-center border border-slate-200 shadow-sm" title="Lihat Detail"><Eye size={14}/></button>
                    {isRunning && (
                      <button onClick={() => togglePause(j.id, j.status)} className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shadow-sm"><Pause size={14}/></button>
                    )}
                    {j.status === 'paused' && (
                      <button onClick={() => togglePause(j.id, j.status)} className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-sm"><Play size={14}/></button>
                    )}
                    {(j.status === "running" || j.status === "queued" || j.status === "paused") && (
                      <button onClick={() => cancelJob(j.id)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-200 shadow-sm"><Square size={14}/></button>
                    )}
                    <button onClick={() => deleteJob(j.id)} className="w-8 h-8 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center border border-slate-200 shadow-sm"><Trash2 size={14}/></button>
                </div>
              </div>
             )
          })}
        </div>

        {/* BULK ACTION BAR - MENGAMBANG DI BAWAH JIKA ADA YANG DIPILIH */}
        {isSelectionMode && selectedJobs.length > 0 && (
          <div className="fixed sm:absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#001d35] rounded-full p-2.5 shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-10 z-50 whitespace-nowrap">
             <span className="text-[11px] font-bold text-[#c2e7ff] px-3">
               {selectedJobs.length} Terpilih
             </span>
             <button onClick={executeBulkDeleteJobs} className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 rounded-full text-white font-bold text-[11px] uppercase tracking-wider transition-colors">
               <Trash2 size={14} /> Hapus Massal
             </button>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {viewJob && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full max-w-4xl bg-white rounded-3xl p-5 md:p-8 shadow-2xl flex flex-col h-[90vh] animate-in zoom-in-95 duration-200">
              
              <div className="flex justify-between items-start mb-5 shrink-0 border-b border-slate-100 pb-5">
                 <div>
                   <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Laporan Job #{viewJob.id}</h2>
                   <p className="text-xs font-medium text-slate-500 mt-1">Sesi: <span className="font-bold text-slate-700">{viewJob.session_key}</span></p>
                 </div>
                 <button onClick={() => setViewJob(null)} className="w-10 h-10 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                   <XCircle size={20} />
                 </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-5 shrink-0 bg-[#f8fafd] p-1.5 rounded-2xl w-fit">
                 {['all', 'replied', 'failed'].map(f => (
                   <button key={f} onClick={() => setItemFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${itemFilter === f ? 'bg-white text-[#0b57d0] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                     {f === 'all' ? 'Semua Target' : f === 'replied' ? 'Sudah Membalas' : 'Gagal Terkirim'} 
                     <span className="ml-1 opacity-60">({f === 'all' ? jobItems.length : jobItems.filter(i => f === 'replied' ? i.reply_status === 'replied' : i.status === 'failed').length})</span>
                   </button>
                 ))}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide border border-slate-100 rounded-2xl bg-white relative">
                {loadingItems ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                    <Loader2 size={32} className="animate-spin text-[#0b57d0]" />
                    <span className="text-xs font-bold uppercase tracking-widest">Memuat Data...</span>
                  </div>
                ) : (
                 <table className="w-full">
                    <thead className="sticky top-0 bg-[#f8fafd] text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left border-b border-slate-100 z-10">
                       <tr>
                         <th className="py-4 px-5">Nomor Tujuan</th>
                         <th className="py-4 px-5">Status</th>
                         <th className="py-4 px-5">Balasan Klien</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {filteredItems.length === 0 && (
                         <tr><td colSpan={3} className="text-center py-10 text-slate-400 font-medium text-sm">Tidak ada data untuk filter ini.</td></tr>
                       )}
                       {filteredItems.map(item => (
                         <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="py-3 px-5 font-mono text-sm font-bold text-slate-700">{item.to_number}</td>
                           <td className="py-3 px-5">
                              <span className={`flex items-center gap-1.5 px-2.5 py-1 w-fit rounded text-[10px] font-bold uppercase tracking-wider border ${
                                item.status === 'sent' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                item.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                'bg-[#f0f4f9] text-slate-500 border-slate-200'
                              }`}>
                                {item.status === 'sent' && <CheckCircle2 size={12} />}
                                {item.status}
                              </span>
                           </td>
                           <td className="py-3 px-5">
                              {item.reply_status === 'replied' ? (
                                <div className="text-sm bg-[#f0f4f9] p-3 rounded-xl border border-[#c2e7ff] text-slate-800 font-medium">
                                  <span className="font-bold text-[10px] uppercase tracking-wider block mb-1 text-[#0b57d0]">Pesan Balasan:</span>
                                  {item.reply_text || 'Media/Unknown'}
                                </div>
                              ) : item.status === 'failed' ? (
                                <div className="text-xs text-rose-500 font-medium">{item.last_error || 'Gagal tanpa error spesifik'}</div>
                              ) : (
                                <span className="text-xs text-slate-400 font-medium italic">Menunggu balasan...</span>
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