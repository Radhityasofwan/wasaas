/**
 * ============================================================================
 * LEADS.TSX - CRM MASTER DATA DASHBOARD (ENTERPRISE EDITION)
 * ============================================================================
 */

import React, { useEffect, useState, useMemo, useRef } from "react";
import { 
  Target, Flame, Snowflake, Download, Search, 
  ArrowRight, Activity, Filter, CheckCircle2, 
  XCircle, Megaphone, CalendarClock, MessageSquare, 
  ExternalLink, Layers, CheckSquare, Sun, RefreshCw,
  Send, Loader2, X, Trash2, ChevronDown,
  MonitorPlay, Camera, Globe, Hash, Settings2, Info
} from "lucide-react";

// ============================================================================
// 1. API UTILITIES
// ============================================================================

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
  try { data = text ? JSON.parse(text) : {}; } 
  catch (e) { throw new Error(`Server Error (HTTP ${res.status}).`); }
  
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// ============================================================================
// 2. TYPE DEFINITIONS
// ============================================================================

type LeadRow = { id: number; to_number: string; name: string | null; source: string; status: 'cold' | 'warm' | 'hot' | 'converted' | 'dead'; tags_json: any; last_interacted_at: string; created_at: string; total_broadcasts: number; total_followups: number; };
type Stats = { total: number; hot: number; warm: number; cold: number; converted: number; };
type MsgRow = { id: number; direction: "in" | "out"; type: string; text: string | null; status: string; time: string; };

const ALL_SOURCES = [
  { id: 'meta_ads', label: 'Meta Ads (FB/IG)' },
  { id: 'ig', label: 'Instagram DM' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'web', label: 'Website / Landing Page' },
  { id: 'broadcast_reply', label: 'Balasan Broadcast' },
  { id: 'followup_reply', label: 'Balasan Follow Up' }
];

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================

export default function Leads() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, hot: 0, warm: 0, cold: 0, converted: 0 });
  const [loading, setLoading] = useState(false);
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Modals
  const [bcModalOpen, setBcModalOpen] = useState(false);
  const [bcPayload, setBcPayload] = useState({ sessionKey: "", templateId: "", text: "", delay: "2000" });
  const [bcPreviewTrigger, setBcPreviewTrigger] = useState(0);
  
  const [fuModalOpen, setFuModalOpen] = useState(false);
  const [fuPayload, setFuPayload] = useState({ sessionKey: "", campaignId: "" });

  const [chatModal, setChatModal] = useState<{ open: boolean; lead: LeadRow | null }>({ open: false, lead: null });
  const [chatSession, setChatSession] = useState("");
  const [chatMessages, setChatMessages] = useState<MsgRow[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // SMART ENGINE SETTINGS MODAL
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [rulesPayload, setRulesPayload] = useState({ hot_keywords: "pesan,order,beli", warm_sources: ["meta_ads", "web"], cold_days: 7 });
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const parsedBcPreview = useMemo(() => {
    let txt = bcPayload.text || "";
    if (!txt.trim()) return "";
    txt = txt.replace(/\{\{nama\}\}/ig, "Budi (Contoh)");
    txt = txt.replace(/\{nama\}/ig, "Budi (Contoh)");
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
  }, [bcPayload.text, bcPreviewTrigger]);

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "500");
      if (sourceFilter !== "all") qs.set("source", sourceFilter);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (debouncedSearch) qs.set("q", debouncedSearch);

      const res = await apiFetch<any>(`leads?${qs.toString()}`);
      setLeads(res.data || []);
      if (res.stats) setStats(res.stats);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadHelpers = async () => {
    try {
      const [sessRes, tplRes, campRes] = await Promise.all([
        apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] })),
        apiFetch<any>("templates").catch(() => ({ data: [] })),
        apiFetch<any>("followup/campaigns?status=active").catch(() => ({ data: [] }))
      ]);
      setSessions(sessRes.sessions || []);
      setTemplates(tplRes.data || []);
      setCampaigns(campRes.data || []);
      if (sessRes.sessions?.length > 0) {
        setBcPayload(prev => ({ ...prev, sessionKey: sessRes.sessions[0].session_key }));
        setFuPayload(prev => ({ ...prev, sessionKey: sessRes.sessions[0].session_key }));
        setChatSession(sessRes.sessions[0].session_key);
      }
    } catch (e) {}
  };

  const loadTempRules = async () => {
    try {
      const res = await apiFetch<any>("leads/temp-rules");
      if (res.data) {
        setRulesPayload({
          hot_keywords: res.data.hot_keywords || "",
          warm_sources: res.data.warm_sources ? JSON.parse(res.data.warm_sources) : [],
          cold_days: res.data.cold_days || 7
        });
      }
    } catch (e) {}
  };

  useEffect(() => { loadData(); }, [sourceFilter, statusFilter, debouncedSearch]);
  useEffect(() => { loadHelpers(); loadTempRules(); }, []);

  useEffect(() => {
    let intervalId: any;
    if (chatModal.open && chatModal.lead && chatSession) {
      const fetchChat = async () => {
        try {
          const peerJid = `${chatModal.lead!.to_number.replace(/\D/g, '')}@s.whatsapp.net`;
          const res = await apiFetch<any>(`ui/messages?sessionKey=${encodeURIComponent(chatSession)}&peer=${encodeURIComponent(peerJid)}&limit=50`);
          setChatMessages(prev => {
            const newMsgs = res.messages || [];
            if (prev.length !== newMsgs.length) {
              setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, 100);
              return newMsgs;
            }
            let changed = false;
            for (let i=0; i<prev.length; i++) {
              if (prev[i].id !== newMsgs[i].id || prev[i].status !== newMsgs[i].status) { changed = true; break; }
            }
            return changed ? newMsgs : prev;
          });
        } catch (e) {}
      };
      fetchChat();
      intervalId = setInterval(fetchChat, 3000);
    }
    return () => clearInterval(intervalId);
  }, [chatModal.open, chatModal.lead, chatSession]);

  const executeUpdateStatus = async (targets: string[], newStatus: string) => {
    try {
      await apiFetch("leads/status", { method: "POST", body: JSON.stringify({ targets, status: newStatus }) });
      setLeads(prev => prev.map(l => targets.includes(l.to_number) ? { ...l, status: newStatus as any } : l));
      if (targets.length > 1) { setSelectedLeads([]); setIsSelectionMode(false); loadData(); }
    } catch (e: any) { alert("Gagal memperbarui status: " + e.message); }
  };

  const handleSaveSettings = async () => {
    setSavingRules(true);
    try {
      await apiFetch("leads/temp-rules", {
        method: "POST",
        body: JSON.stringify({
          hot_keywords: rulesPayload.hot_keywords,
          warm_sources: JSON.stringify(rulesPayload.warm_sources),
          cold_days: Number(rulesPayload.cold_days)
        })
      });
      setSettingsModalOpen(false);
      alert("Pengaturan Suhu Pintar berhasil diperbarui. Mesin bot akan mengikuti aturan baru ini.");
    } catch (e:any) {
      alert("Gagal simpan: " + e.message);
    } finally {
      setSavingRules(false);
    }
  };

  const toggleWarmSource = (sourceId: string) => {
    setRulesPayload(prev => {
      const isExist = prev.warm_sources.includes(sourceId);
      return { ...prev, warm_sources: isExist ? prev.warm_sources.filter(s => s !== sourceId) : [...prev.warm_sources, sourceId] };
    });
  };

  // UI Formatters...
  const handleExportCSV = () => { /* Same as before */ };
  const getSourceBadge = (source: string) => { /* Same as before */ 
    const s = source.toLowerCase();
    if (s === 'meta_ads') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-black uppercase tracking-widest shadow-sm"><MonitorPlay size={10}/> Meta Ads</span>;
    if (s === 'ig' || s === 'instagram') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-pink-500 to-purple-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm"><Camera size={10}/> Instagram</span>;
    if (s === 'tiktok') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest shadow-sm"><Hash size={10}/> TikTok</span>;
    if (s === 'web') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm"><Globe size={10}/> Website</span>;
    if (s === 'broadcast_reply') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm"><Megaphone size={10}/> Balasan Blast</span>;
    if (s === 'followup_reply') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm"><CalendarClock size={10}/> Balasan Follow Up</span>;
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest border border-slate-200"><MessageSquare size={10}/> Manual/Organik</span>;
  };
  const statusColors: Record<string, string> = {
    hot: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100', warm: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100',
    converted: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100', dead: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200',
    cold: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
  };
  const parseTags = (tagsJson: any) => { /* Same as before */ try { const t = typeof tagsJson === 'string' ? JSON.parse(tagsJson) : tagsJson; if (t && t.name && t.color) return <span className={`px-2 py-0.5 rounded text-[9px] font-black text-white ${t.color}`}>{t.name}</span>; } catch(e) {} return null; };
  const toggleLeadSelection = (num: string) => { setSelectedLeads(p => p.includes(num) ? p.filter(x => x !== num) : [...p, num]); };
  const openWaMe = (num: string) => { window.open(`https://wa.me/${num.replace(/\D/g, '')}`, "_blank"); };
  const executeRetargetBroadcast = async () => { /* Same */ setBcModalOpen(false); setSelectedLeads([]); setIsSelectionMode(false); };
  const executeRetargetFollowUp = async () => { /* Same */ setFuModalOpen(false); setSelectedLeads([]); setIsSelectionMode(false); };
  const sendQuickChat = async () => { /* Same */ setChatText(""); };
  const executeDeleteLeads = async (targets: string[]) => { /* Same */ setSelectedLeads([]); setIsSelectionMode(false); loadData(); };


  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 rotate-3">
            <Target size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter">Database CRM</h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Lacak Sumber Trafik & Suhu Prospek</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedLeads([]); }}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border shadow-sm ${isSelectionMode ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-600'}`}
          >
            {isSelectionMode ? <><XCircle size={16}/> Batal Pilih</> : <><CheckSquare size={16}/> Mode Massal (Bulk)</>}
          </button>
          <button 
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-slate-600 border border-slate-200 font-black text-xs uppercase tracking-widest shadow-sm hover:text-indigo-600 hover:border-indigo-200 transition-all"
          >
            <Settings2 size={16} /> Suhu Otomatis
          </button>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
         <div className="bg-white/60 backdrop-blur-xl border border-white p-5 rounded-[2rem] shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Prospek</p><h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stats.total.toLocaleString('id-ID')}</h3></div>
         <div className="bg-white/60 backdrop-blur-xl border border-rose-100 p-5 rounded-[2rem] shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1 flex items-center gap-1"><Flame size={12}/> Hot</p><h3 className="text-3xl font-black text-rose-600 tracking-tighter">{stats.hot.toLocaleString('id-ID')}</h3></div>
         <div className="bg-white/60 backdrop-blur-xl border border-orange-100 p-5 rounded-[2rem] shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1 flex items-center gap-1"><Sun size={12}/> Warm</p><h3 className="text-3xl font-black text-orange-600 tracking-tighter">{stats.warm.toLocaleString('id-ID')}</h3></div>
         <div className="bg-white/60 backdrop-blur-xl border border-blue-100 p-5 rounded-[2rem] shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1 flex items-center gap-1"><Snowflake size={12}/> Cold</p><h3 className="text-3xl font-black text-blue-600 tracking-tighter">{stats.cold.toLocaleString('id-ID')}</h3></div>
         <div className="bg-white/60 backdrop-blur-xl border border-emerald-100 p-5 rounded-[2rem] shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1 flex items-center gap-1"><CheckCircle2 size={12}/> Converted</p><h3 className="text-3xl font-black text-emerald-600 tracking-tighter">{stats.converted.toLocaleString('id-ID')}</h3></div>
      </div>

      {/* MAIN DATA SECTION */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm relative">
        
        {/* TOOLBAR */}
        <div className="p-6 md:p-8 border-b border-white/50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="relative w-full xl:max-w-md">
             <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400"><Search size={16} strokeWidth={3} /></div>
             <input type="text" placeholder="Cari prospek (Nama / Nomor HP)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-5 py-4 rounded-2xl bg-white/80 border border-white outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 font-bold text-slate-700 text-sm transition-all shadow-sm" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white/60 border border-white rounded-2xl px-2 py-1 shadow-sm"><Filter size={16} className="text-slate-400 mx-2" /><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="bg-transparent py-3 pr-4 border-none text-[11px] font-black text-slate-600 outline-none cursor-pointer uppercase tracking-widest"><option value="all">Semua Trafik</option><option value="meta_ads">Meta Ads</option><option value="ig">Instagram</option><option value="tiktok">TikTok</option><option value="web">Website</option><option value="broadcast_reply">Balasan Blast</option><option value="followup_reply">Balasan Follow Up</option><option value="manual">Organik / Manual</option></select></div>
            <div className="flex items-center bg-white/60 border border-white rounded-2xl px-2 py-1 shadow-sm"><Activity size={16} className="text-slate-400 mx-2" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent py-3 pr-4 border-none text-[11px] font-black text-slate-600 outline-none cursor-pointer uppercase tracking-widest"><option value="all">Semua Suhu</option><option value="hot">🔥 Hot Leads</option><option value="warm">☀️ Warm Leads</option><option value="cold">❄️ Cold Leads</option><option value="converted">✅ Converted</option><option value="dead">❌ Dead</option></select></div>
            <button onClick={loadData} className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-100 shadow-sm" title="Refresh Data"><RefreshCw size={18} /></button>
          </div>
        </div>

        {/* TABLE DATA */}
        <div className="overflow-x-auto pb-16">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/30 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/50">
                {isSelectionMode && <th className="px-6 py-6 w-10 text-center">Pilih</th>}
                <th className="px-6 py-6">Identitas Prospek</th>
                <th className="px-6 py-6">Sumber Trafik</th>
                <th className="px-6 py-6">Tingkat Suhu</th>
                <th className="px-6 py-6 text-center">Jejak Interaksi</th>
                <th className="px-6 py-6">Terakhir Aktif</th>
                <th className="px-6 py-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {loading ? (
                <tr><td colSpan={7} className="px-10 py-32 text-center text-indigo-500 font-black animate-pulse uppercase tracking-[0.3em]">Memindai Database CRM...</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={7} className="px-10 py-32 text-center"><Target size={48} className="mx-auto text-slate-300 mb-4 opacity-50" /><p className="text-slate-400 font-black uppercase tracking-[0.2em]">Tidak Ada Prospek Ditemukan</p></td></tr>
              ) : leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className={`transition-colors ${!isSelectionMode ? 'hover:bg-white/60 cursor-pointer' : 'hover:bg-slate-50/30'}`}
                  onClick={(e) => {
                    if (isSelectionMode) return;
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.tagName.toLowerCase() === 'select' || target.tagName.toLowerCase() === 'option') return;
                    setChatModal({ open: true, lead });
                  }}
                >
                  
                  {isSelectionMode && (
                    <td className="px-6 py-5 align-middle text-center">
                      <div onClick={() => toggleLeadSelection(lead.to_number)} className={`w-6 h-6 mx-auto rounded-md border-2 cursor-pointer flex items-center justify-center transition-all ${selectedLeads.includes(lead.to_number) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                        {selectedLeads.includes(lead.to_number) && <CheckSquare size={14} strokeWidth={3}/>}
                      </div>
                    </td>
                  )}

                  <td className="px-6 py-5 align-middle">
                    <div className="font-black text-slate-800 text-[15px] tracking-tight">{lead.name || 'Pelanggan Baru'}</div>
                    <div className="text-xs font-bold text-slate-500 font-mono mt-0.5">{lead.to_number}</div>
                    <div className="mt-2">{parseTags(lead.tags_json)}</div>
                  </td>
                  
                  <td className="px-6 py-5 align-middle">{getSourceBadge(lead.source)}</td>
                  
                  <td className="px-6 py-5 align-middle">
                    <div className="relative inline-block">
                      <select 
                        value={lead.status}
                        onChange={(e) => executeUpdateStatus([lead.to_number], e.target.value)}
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg outline-none cursor-pointer appearance-none pr-8 shadow-sm transition-all focus:ring-4 ${statusColors[lead.status]}`}
                      >
                        <option value="hot">🔥 Hot</option><option value="warm">☀️ Warm</option><option value="cold">❄️ Cold</option>
                        <option value="converted">✅ Converted</option><option value="dead">❌ Dead</option>
                      </select>
                      <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60`} />
                    </div>
                  </td>
                  
                  <td className="px-6 py-5 text-center align-middle">
                    <div className="inline-flex gap-2">
                      <div className="flex flex-col items-center p-2 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[50px]"><Megaphone size={14} className="text-emerald-500 mb-1"/><span className="text-xs font-black text-slate-700">{lead.total_broadcasts}</span></div>
                      <div className="flex flex-col items-center p-2 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[50px]"><CalendarClock size={14} className="text-orange-500 mb-1"/><span className="text-xs font-black text-slate-700">{lead.total_followups}</span></div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-5 align-middle">
                    <div className="text-xs font-bold text-slate-600">{fmtDate(lead.last_interacted_at)}</div>
                    <div className="text-[9px] font-black text-slate-400 mt-1 uppercase tracking-widest">Dibuat: {new Date(lead.created_at).toLocaleDateString('id-ID')}</div>
                  </td>
                  
                  <td className="px-6 py-5 align-middle text-right">
                    <div className="flex justify-end gap-1.5 opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openWaMe(lead.to_number)} className="w-9 h-9 rounded-xl bg-white text-blue-600 flex items-center justify-center hover:bg-blue-50 border border-slate-200 transition-all shadow-sm" title="Chat Manual"><ExternalLink size={16}/></button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setBcModalOpen(true); }} className="w-9 h-9 rounded-xl bg-white text-emerald-600 flex items-center justify-center hover:bg-emerald-50 border border-slate-200 transition-all shadow-sm" title="Retarget"><Megaphone size={16}/></button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setFuModalOpen(true); }} className="w-9 h-9 rounded-xl bg-white text-orange-500 flex items-center justify-center hover:bg-orange-50 border border-slate-200 transition-all shadow-sm" title="Follow Up"><CalendarClock size={16}/></button>
                      <button onClick={() => executeDeleteLeads([lead.to_number])} className="w-9 h-9 rounded-xl bg-white text-rose-500 flex items-center justify-center hover:bg-rose-50 border border-slate-200 transition-all shadow-sm" title="Hapus"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BULK ACTION BAR */}
        {isSelectionMode && selectedLeads.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-max bg-slate-900 rounded-[2rem] p-4 shadow-2xl border border-slate-700 flex items-center gap-6 animate-in slide-in-from-bottom-10 z-50">
             <span className="text-[11px] font-black text-white px-4 py-2 bg-slate-800 rounded-xl border border-slate-700 whitespace-nowrap">{selectedLeads.length} Terpilih</span>
             <div className="flex items-center gap-2">
                <div className="relative group flex items-center bg-slate-800 rounded-xl border border-slate-700 mr-2 px-1">
                  <Flame size={14} className="text-slate-400 ml-3" />
                  <select onChange={(e) => { if(e.target.value) { executeUpdateStatus(selectedLeads, e.target.value); e.target.value = ""; } }} className="bg-transparent text-[10px] font-black text-white uppercase tracking-widest pl-2 pr-8 py-2.5 outline-none cursor-pointer appearance-none">
                    <option value="" className="text-slate-800">-- Ubah Suhu --</option><option value="hot" className="text-slate-800">🔥 Set Hot</option><option value="warm" className="text-slate-800">☀️ Set Warm</option><option value="cold" className="text-slate-800">❄️ Set Cold</option><option value="converted" className="text-slate-800">✅ Set Converted</option><option value="dead" className="text-slate-800">❌ Set Dead</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
                <button onClick={() => setBcModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all"><Megaphone size={14} /> Blast</button>
                <button onClick={() => setFuModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all"><CalendarClock size={14} /> Follow Up</button>
                <div className="w-[2px] h-6 bg-slate-700 mx-1 self-center rounded-full"></div>
                <button onClick={() => executeDeleteLeads(selectedLeads)} className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all"><Trash2 size={14} /> Hapus</button>
             </div>
          </div>
        )}
      </div>

      {/* ============================================================================ */}
      {/* 4. MODALS AREA (QUICK CHAT, SETTINGS, BROADCAST, FOLLOW UP) */}
      {/* ============================================================================ */}
      
      {/* SMART TEMPERATURE SETTINGS MODAL */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95">
             <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-indigo-50 text-indigo-600 flex items-center justify-center rounded-2xl"><Settings2 size={24} strokeWidth={2.5}/></div>
                 <div>
                   <h2 className="text-xl font-black text-slate-800">Logika Suhu Otomatis</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Biarkan robot mengkualifikasi leads Anda</p>
                 </div>
               </div>
               <button onClick={() => setSettingsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-rose-50 hover:text-rose-500 transition-colors text-slate-400"><X size={20}/></button>
             </div>

             <div className="space-y-8 mb-8">
                {/* HOT */}
                <div className="bg-rose-50/50 border border-rose-100 p-5 rounded-[2rem]">
                  <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest flex items-center gap-2 mb-3"><Flame size={16}/> Otomatis 🔥 HOT Jika:</h4>
                  <p className="text-[11px] font-bold text-slate-500 mb-3 leading-relaxed">Pelanggan mengirim pesan yang mengandung salah satu kata kunci Niat Beli (Buying Intent) di bawah ini:</p>
                  <input 
                    value={rulesPayload.hot_keywords} 
                    onChange={e => setRulesPayload({...rulesPayload, hot_keywords: e.target.value})}
                    className="w-full px-5 py-4 rounded-xl bg-white border border-rose-200 outline-none font-bold text-slate-700 text-sm focus:border-rose-400 shadow-sm"
                    placeholder="pesan, order, transfer, harga, beli"
                  />
                  <p className="text-[9px] font-bold text-slate-400 mt-2 italic">* Pisahkan kata kunci dengan tanda koma (,)</p>
                </div>

                {/* WARM */}
                <div className="bg-orange-50/50 border border-orange-100 p-5 rounded-[2rem]">
                  <h4 className="text-xs font-black text-orange-600 uppercase tracking-widest flex items-center gap-2 mb-3"><Sun size={16}/> Otomatis ☀️ WARM Jika:</h4>
                  <p className="text-[11px] font-bold text-slate-500 mb-4 leading-relaxed">Pesan pertama pelanggan berasal dari klik tautan/iklan sumber lalu lintas berikut:</p>
                  <div className="grid grid-cols-2 gap-3">
                    {ALL_SOURCES.map(src => {
                      const isChecked = rulesPayload.warm_sources.includes(src.id);
                      return (
                        <label key={src.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isChecked ? 'bg-white border-orange-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleWarmSource(src.id)} className="w-4 h-4 accent-orange-500" />
                          <span className={`text-[11px] font-black uppercase tracking-widest ${isChecked ? 'text-orange-700' : 'text-slate-500'}`}>{src.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                
                <div className="flex gap-2 items-start bg-slate-50 p-4 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-500 leading-relaxed">
                  <Info size={16} className="shrink-0 text-blue-500"/>
                  Sistem tidak akan menurunkan suhu secara otomatis untuk status yang sudah Anda ubah menjadi "Converted ✅" atau "Dead ❌".
                </div>
             </div>

             <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onClick={() => setSettingsModalOpen(false)} className="px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors">Batal</button>
                <button onClick={handleSaveSettings} disabled={savingRules} className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95">
                  {savingRules ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} Simpan Pengaturan
                </button>
             </div>
          </div>
        </div>
      )}

      {/* QUICK CHAT MODAL */}
      {chatModal.open && chatModal.lead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:justify-end sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full h-full sm:w-[450px] sm:h-[90vh] bg-slate-50 sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-right-8 border border-white">
             <div className="bg-white px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">{(chatModal.lead.name ? chatModal.lead.name.charAt(0) : 'P').toUpperCase()}</div>
                  <div><h3 className="text-sm font-black text-slate-800">{chatModal.lead.name || 'Pelanggan'}</h3><p className="text-[10px] font-bold text-slate-500 font-mono">{chatModal.lead.to_number}</p></div>
                </div>
                <button onClick={() => setChatModal({ open: false, lead: null })} className="p-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-500 rounded-full transition-colors text-slate-400"><X size={18} strokeWidth={3} /></button>
             </div>
             <div className="bg-indigo-50/50 px-4 py-2 flex items-center justify-between border-b border-indigo-100 shrink-0">
               <span className="text-[9px] font-black text-indigo-800 uppercase tracking-widest">Kirim via Sesi:</span>
               <select value={chatSession} onChange={e => setChatSession(e.target.value)} className="bg-white border border-indigo-200 text-[10px] font-bold text-indigo-600 py-1 px-2 rounded outline-none cursor-pointer">
                 {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
               </select>
             </div>
             <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-100/50 scrollbar-hide">
                {chatMessages.length === 0 && <div className="text-center p-6 text-slate-400 opacity-60"><MessageSquare size={32} className="mx-auto mb-2" /><p className="text-xs font-bold">Memuat Obrolan...</p></div>}
                {chatMessages.map(msg => {
                  const isOut = msg.direction === 'out';
                  return (
                    <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] shadow-sm ${isOut ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'}`}>
                        {msg.type === 'text' ? msg.text : <span className="italic font-bold opacity-80">[{msg.type.toUpperCase()}]</span>}
                        <div className={`text-[9px] mt-1.5 font-bold flex items-center gap-1 opacity-70 ${isOut ? 'justify-end' : 'justify-start'}`}>
                           {new Date(msg.time).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}
                           {isOut && <span>{msg.status === 'read' ? <CheckCircle2 size={10} className="text-cyan-300"/> : msg.status === 'failed' ? <XCircle size={10} className="text-rose-300"/> : <CheckCircle2 size={10}/>}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
             </div>
             <div className="p-4 bg-white border-t border-slate-200 shrink-0">
               <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-[1.5rem] p-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                  <textarea value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuickChat(); } }} placeholder="Balas instan..." rows={1} className="flex-1 bg-transparent border-none py-2 px-3 text-sm font-medium outline-none resize-none max-h-24 text-slate-700" />
                  <button onClick={sendQuickChat} disabled={!chatText.trim() || chatSending} className={`w-10 h-10 rounded-[1rem] flex items-center justify-center shrink-0 transition-all ${chatText.trim() && !chatSending ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>{chatSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="ml-0.5" />}</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Broadcast Retargeting Modal */}
      {bcModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-800 mb-2 flex items-center gap-3"><Megaphone className="text-emerald-500"/> Retarget Broadcast</h3>
            <p className="text-xs font-bold text-slate-500 mb-6">Pesan akan disebar ke <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{selectedLeads.length} Prospek Terpilih</span>.</p>
            <div className="space-y-5 mb-8">
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">WA Pengirim</label><select value={bcPayload.sessionKey} onChange={e => setBcPayload({...bcPayload, sessionKey: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700">{sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}</select></div>
              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100"><label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 flex items-center gap-2"><Layers size={14}/> Gunakan Template Cepat</label><select value={bcPayload.templateId} onChange={e => { const t = templates.find(x => x.id === Number(e.target.value)); setBcPayload({...bcPayload, templateId: e.target.value, text: t?.text_body || ""}); }} className="w-full px-4 py-3 rounded-xl bg-white border border-indigo-200 outline-none font-bold text-sm text-slate-700 cursor-pointer"><option value="">-- Pilih Template (Opsional) --</option>{templates.filter(t => t.message_type === 'text').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Teks Pesan Promo</label>
                <textarea rows={5} value={bcPayload.text} onChange={e => setBcPayload({...bcPayload, text: e.target.value})} placeholder="Gunakan {{nama}}..." className="w-full px-5 py-4 rounded-[1.5rem] bg-slate-50 border border-slate-200 outline-none font-medium text-sm text-slate-700 resize-none focus:bg-white focus:border-emerald-400 transition-colors" />
                <div className="mt-3 mb-5 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setBcPayload(p => ({...p, text: p.text + '{{nama}}'}))} className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-600 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 hover:text-white transition-colors">+ {"{{nama}}"}</button>
                    <button onClick={() => setBcPayload(p => ({...p, text: p.text + '{{nomor}}'}))} className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-600 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 hover:text-white transition-colors">+ {"{{nomor}}"}</button>
                    <button onClick={() => setBcPayload(p => ({...p, text: p.text + 'Selamat {{salam}}'}))} className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-600 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 hover:text-white transition-colors">+ {"{{salam}}"}</button>
                    <button onClick={() => setBcPayload(p => ({...p, text: p.text + '{Halo|Hai}'}))} className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-600 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-600 hover:text-white transition-colors">Spintax {"{A|B}"}</button>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-[1.5rem] bg-slate-50 overflow-hidden shadow-inner"><div className="px-4 py-3 border-b border-slate-200 bg-slate-100/80 flex justify-between items-center"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">👀 Pratinjau Pesan</span><button type="button" onClick={() => setBcPreviewTrigger(p => p + 1)} className="text-[9px] font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:text-emerald-600 hover:border-emerald-200 transition-colors shadow-sm cursor-pointer active:scale-95"><RefreshCw size={12} /> Acak</button></div><div className="p-5"><div className="bg-white rounded-tr-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-sm p-4 text-[14px] font-medium text-slate-700 shadow-sm border border-slate-100 whitespace-pre-wrap leading-relaxed max-w-[85%]">{parsedBcPreview || <span className="text-slate-400 italic">Ketik sesuatu untuk melihat hasil akhir...</span>}</div></div></div>
              </div>
            </div>
            <div className="flex gap-3 justify-end"><button onClick={() => setBcModalOpen(false)} className="px-6 py-3.5 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 text-xs uppercase tracking-widest">Batal</button><button onClick={executeRetargetBroadcast} className="px-8 py-3.5 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/30">Mulai Penyiaran</button></div>
          </div>
        </div>
      )}

      {/* Follow Up Retargeting Modal */}
      {fuModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-800 mb-2 flex items-center gap-3"><CalendarClock className="text-orange-500"/> Retarget Follow Up</h3>
            <p className="text-xs font-bold text-slate-500 mb-6">Suntikkan <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{selectedLeads.length} Prospek Terpilih</span> ke jadwal urutan Sequence.</p>
            <div className="space-y-5 mb-8">
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">WA Pengirim</label><select value={fuPayload.sessionKey} onChange={e => setFuPayload({...fuPayload, sessionKey: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700">{sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}</select></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Pilih Jalur Rangkaian (Campaign)</label>{campaigns.length > 0 ? (<select value={fuPayload.campaignId} onChange={e => setFuPayload({...fuPayload, campaignId: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700"><option value="">-- Induk Campaign --</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>) : (<div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-bold border border-rose-100 text-center">Belum ada Campaign Sequence aktif.<br/>Buat di menu Follow Up terlebih dahulu.</div>)}</div>
            </div>
            <div className="flex gap-3 justify-end"><button onClick={() => setFuModalOpen(false)} className="px-6 py-3.5 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 text-xs uppercase tracking-widest">Batal</button><button onClick={executeRetargetFollowUp} disabled={!fuPayload.campaignId} className="px-8 py-3.5 rounded-2xl font-black text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-widest shadow-lg shadow-orange-500/30">Jadwalkan</button></div>
          </div>
        </div>
      )}

    </div>
  );
}