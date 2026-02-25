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
  Send, Loader2, X
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
  catch (e) { throw new Error(`Server Error (HTTP ${res.status}). Respons bukan JSON.`); }
  
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

type LeadRow = {
  id: number;
  to_number: string;
  name: string | null;
  source: string;
  status: 'cold' | 'warm' | 'hot' | 'converted' | 'dead';
  tags_json: any;
  last_interacted_at: string;
  created_at: string;
  total_broadcasts: number;
  total_followups: number;
};

type Stats = {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  converted: number;
};

type MsgRow = {
  id: number; 
  direction: "in" | "out"; 
  type: string; 
  text: string | null; 
  status: string; 
  time: string; 
};

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================

export default function Leads() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, hot: 0, warm: 0, cold: 0, converted: 0 });
  const [loading, setLoading] = useState(false);
  
  // States: Form Bantuan (Dependencies)
  const [sessions, setSessions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // States: Filters & Search
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // States: Bulk Actions & Modals
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Broadcast Modal State
  const [bcModalOpen, setBcModalOpen] = useState(false);
  const [bcPayload, setBcPayload] = useState({ sessionKey: "", templateId: "", text: "", delay: "2000" });

  // Follow Up Modal State
  const [fuModalOpen, setFuModalOpen] = useState(false);
  const [fuPayload, setFuPayload] = useState({ sessionKey: "", campaignId: "" });

  // Quick Chat Modal State
  const [chatModal, setChatModal] = useState<{ open: boolean; lead: LeadRow | null }>({ open: false, lead: null });
  const [chatSession, setChatSession] = useState("");
  const [chatMessages, setChatMessages] = useState<MsgRow[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Debounce Effect for Search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Main Data
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Load Helper Data (Sessions, Templates, Campaigns)
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

  useEffect(() => { 
    loadData(); 
  }, [sourceFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    loadHelpers();
  }, []);

  // Quick Chat Polling Engine
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
              setTimeout(() => {
                if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
              }, 100);
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

  // ============================================================================
  // LOGIC: EXECUTORS & FORMATTERS
  // ============================================================================

  const handleExportCSV = () => {
    if (leads.length === 0) return alert("Tidak ada data untuk diekspor");
    
    const headers = ["Nama Kontak", "Nomor WhatsApp", "Sumber Trafik", "Status Lead", "Total Broadcast", "Total Follow Up", "Terakhir Interaksi"];
    const csvContent = [
      headers.join(","),
      ...leads.map(l => [
        `"${(l.name || "").replace(/"/g, '""')}"`,
        l.to_number,
        l.source,
        l.status,
        l.total_broadcasts,
        l.total_followups,
        l.last_interacted_at || "-"
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm_leads_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getSourceBadge = (source: string) => {
    const s = source.toLowerCase();
    if (s === 'meta_ads') return <span className="px-2 py-1 rounded bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">Meta Ads</span>;
    if (s === 'ig' || s === 'instagram') return <span className="px-2 py-1 rounded bg-gradient-to-r from-pink-500 to-purple-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">Instagram</span>;
    if (s === 'tiktok') return <span className="px-2 py-1 rounded bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest shadow-sm border border-slate-700">TikTok</span>;
    if (s === 'web') return <span className="px-2 py-1 rounded bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">Website</span>;
    if (s === 'broadcast_reply') return <span className="px-2 py-1 rounded bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">Balasan Blast</span>;
    if (s === 'followup_reply') return <span className="px-2 py-1 rounded bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">Balasan Follow Up</span>;
    return <span className="px-2 py-1 rounded bg-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest border border-slate-300">Manual / Organik</span>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'hot': return <span className="flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100 font-black text-[9px] uppercase tracking-widest"><Flame size={10}/> Hot</span>;
      case 'warm': return <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100 font-black text-[9px] uppercase tracking-widest"><Sun size={10}/> Warm</span>;
      case 'converted': return <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 font-black text-[9px] uppercase tracking-widest"><CheckCircle2 size={10}/> Converted</span>;
      case 'dead': return <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 font-black text-[9px] uppercase tracking-widest"><XCircle size={10}/> Dead</span>;
      default: return <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 font-black text-[9px] uppercase tracking-widest"><Snowflake size={10}/> Cold</span>;
    }
  };

  const parseTags = (tagsJson: any) => {
    if (!tagsJson) return null;
    try {
      const t = typeof tagsJson === 'string' ? JSON.parse(tagsJson) : tagsJson;
      if (t && t.name && t.color) {
        return <span className={`px-2 py-0.5 rounded text-[9px] font-black text-white ${t.color}`}>{t.name}</span>;
      }
    } catch(e) {}
    return null;
  };

  const toggleLeadSelection = (num: string) => {
    setSelectedLeads(p => p.includes(num) ? p.filter(x => x !== num) : [...p, num]);
  };

  const openWaMe = (num: string) => {
    const cleanNum = num.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanNum}`, "_blank");
  };

  // RETARGETING EXECUTORS
  const executeRetargetBroadcast = async () => {
    if (!bcPayload.text.trim() || !bcPayload.sessionKey) return alert("Pilih sesi dan isi pesan!");
    try {
      await apiFetch("broadcast/create", {
        method: "POST",
        body: JSON.stringify({
          sessionKey: bcPayload.sessionKey,
          text: bcPayload.text,
          delayMs: Number(bcPayload.delay),
          name: `Retargeting Leads (${selectedLeads.length} Target)`,
          targets: selectedLeads
        })
      });
      setBcModalOpen(false);
      setSelectedLeads([]);
      setIsSelectionMode(false);
      alert(`Berhasil! Pesan retargeting sedang disebar ke ${selectedLeads.length} prospek.`);
    } catch (e: any) { alert("Gagal: " + e.message); }
  };

  const executeRetargetFollowUp = async () => {
    if (!fuPayload.campaignId || !fuPayload.sessionKey) return alert("Pilih Sesi & Campaign!");
    try {
      await apiFetch("followup/add-targets", {
        method: "POST",
        body: JSON.stringify({
          sessionKey: fuPayload.sessionKey,
          campaignId: fuPayload.campaignId,
          targets: selectedLeads
        })
      });
      setFuModalOpen(false);
      setSelectedLeads([]);
      setIsSelectionMode(false);
      alert(`Berhasil! ${selectedLeads.length} prospek masuk ke jalur Follow Up.`);
    } catch (e: any) { alert("Gagal: " + e.message); }
  };

  const sendQuickChat = async () => {
    if (!chatText.trim() || chatSending || !chatModal.lead || !chatSession) return;
    setChatSending(true);
    try {
       const peerJid = `${chatModal.lead.to_number.replace(/\D/g, '')}@s.whatsapp.net`;
       await apiFetch("messages/send", { 
         method: "POST", 
         body: JSON.stringify({ sessionKey: chatSession, to: peerJid, text: chatText.trim() })
       });
       setChatText("");
    } catch(e: any) { 
       alert("Gagal kirim: " + e.message); 
    } finally { 
       setChatSending(false); 
    }
  };

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
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedLeads([]);
            }}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border shadow-sm ${isSelectionMode ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-600'}`}
          >
            {isSelectionMode ? <><XCircle size={16}/> Batal Pilih</> : <><CheckSquare size={16}/> Retargeting (Bulk)</>}
          </button>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* DASHBOARD STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
         <div className="bg-white/60 backdrop-blur-xl border border-white p-5 rounded-[2rem] shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Prospek</p>
            <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stats.total.toLocaleString('id-ID')}</h3>
         </div>
         <div className="bg-white/60 backdrop-blur-xl border border-rose-100 p-5 rounded-[2rem] shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1 flex items-center gap-1"><Flame size={12}/> Hot</p>
            <h3 className="text-3xl font-black text-rose-600 tracking-tighter">{stats.hot.toLocaleString('id-ID')}</h3>
         </div>
         <div className="bg-white/60 backdrop-blur-xl border border-orange-100 p-5 rounded-[2rem] shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1 flex items-center gap-1"><Sun size={12}/> Warm</p>
            <h3 className="text-3xl font-black text-orange-600 tracking-tighter">{stats.warm.toLocaleString('id-ID')}</h3>
         </div>
         <div className="bg-white/60 backdrop-blur-xl border border-blue-100 p-5 rounded-[2rem] shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1 flex items-center gap-1"><Snowflake size={12}/> Cold</p>
            <h3 className="text-3xl font-black text-blue-600 tracking-tighter">{stats.cold.toLocaleString('id-ID')}</h3>
         </div>
         <div className="bg-white/60 backdrop-blur-xl border border-emerald-100 p-5 rounded-[2rem] shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1 flex items-center gap-1"><CheckCircle2 size={12}/> Converted</p>
            <h3 className="text-3xl font-black text-emerald-600 tracking-tighter">{stats.converted.toLocaleString('id-ID')}</h3>
         </div>
      </div>

      {/* MAIN DATA SECTION */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm relative">
        
        {/* TOOLBAR: SEARCH & FILTER */}
        <div className="p-6 md:p-8 border-b border-white/50 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="relative w-full xl:max-w-md">
             <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400">
               <Search size={16} strokeWidth={3} />
             </div>
             <input 
               type="text" 
               placeholder="Cari prospek (Nama / Nomor HP)..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full pl-12 pr-5 py-4 rounded-2xl bg-white/80 border border-white outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 font-bold text-slate-700 text-sm transition-all shadow-sm"
             />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white/60 border border-white rounded-2xl px-2 py-1 shadow-sm">
              <Filter size={16} className="text-slate-400 mx-2" />
              <select 
                value={sourceFilter} 
                onChange={(e) => setSourceFilter(e.target.value)} 
                className="bg-transparent py-3 pr-4 border-none text-[11px] font-black text-slate-600 outline-none cursor-pointer uppercase tracking-widest"
              >
                <option value="all">Semua Trafik</option>
                <option value="meta_ads">Meta Ads</option>
                <option value="ig">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="web">Website</option>
                <option value="broadcast_reply">Balasan Blast</option>
                <option value="followup_reply">Balasan Follow Up</option>
                <option value="manual">Organik / Manual</option>
              </select>
            </div>

            <div className="flex items-center bg-white/60 border border-white rounded-2xl px-2 py-1 shadow-sm">
              <Activity size={16} className="text-slate-400 mx-2" />
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)} 
                className="bg-transparent py-3 pr-4 border-none text-[11px] font-black text-slate-600 outline-none cursor-pointer uppercase tracking-widest"
              >
                <option value="all">Semua Suhu</option>
                <option value="hot">🔥 Hot Leads</option>
                <option value="warm">☀️ Warm Leads</option>
                <option value="cold">❄️ Cold Leads</option>
                <option value="converted">✅ Converted</option>
                <option value="dead">❌ Dead</option>
              </select>
            </div>
            
            <button onClick={loadData} className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-100 shadow-sm" title="Refresh Data">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* TABLE DATA */}
        <div className="overflow-x-auto pb-16">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/30 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/50">
                {isSelectionMode && <th className="px-6 py-6 w-10 text-center">Pilih</th>}
                <th className="px-6 py-6">Identitas Prospek</th>
                <th className="px-6 py-6">Status & Sumber</th>
                <th className="px-6 py-6 text-center">Jejak Interaksi</th>
                <th className="px-6 py-6">Terakhir Aktif</th>
                <th className="px-6 py-6 text-right">Aksi Singkat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {loading ? (
                <tr><td colSpan={6} className="px-10 py-32 text-center text-indigo-500 font-black animate-pulse uppercase tracking-[0.3em]">Memindai Database CRM...</td></tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-10 py-32 text-center">
                    <Target size={48} className="mx-auto text-slate-300 mb-4 opacity-50" />
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em]">Tidak Ada Prospek Ditemukan</p>
                    <p className="text-slate-400 text-xs font-medium mt-2">Sesuaikan filter atau hubungkan akun dengan Ads / Website.</p>
                  </td>
                </tr>
              ) : leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className={`transition-colors ${!isSelectionMode ? 'hover:bg-white/60 cursor-pointer' : 'hover:bg-slate-50/30'}`}
                  onClick={(e) => {
                    if (isSelectionMode) return;
                    // Cegah popup jika yang diklik adalah tombol/icon di kanan
                    const target = e.target as HTMLElement;
                    if (target.closest('button')) return;
                    
                    setChatModal({ open: true, lead });
                  }}
                >
                  {isSelectionMode && (
                    <td className="px-6 py-5 align-middle text-center">
                      <div 
                        onClick={() => toggleLeadSelection(lead.to_number)}
                        className={`w-6 h-6 mx-auto rounded-md border-2 cursor-pointer flex items-center justify-center transition-all ${selectedLeads.includes(lead.to_number) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}
                      >
                        {selectedLeads.includes(lead.to_number) && <CheckSquare size={14} strokeWidth={3}/>}
                      </div>
                    </td>
                  )}

                  <td className="px-6 py-5 align-middle">
                    <div className="font-black text-slate-800 text-[15px] tracking-tight">{lead.name || 'Pelanggan Baru'}</div>
                    <div className="text-xs font-bold text-slate-500 font-mono mt-0.5">{lead.to_number}</div>
                    <div className="mt-2">{parseTags(lead.tags_json)}</div>
                  </td>
                  
                  <td className="px-6 py-5 align-middle">
                    <div className="flex flex-col items-start gap-2">
                       {getStatusBadge(lead.status)}
                       {getSourceBadge(lead.source)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-5 text-center align-middle">
                    <div className="inline-flex gap-2">
                      <div className="flex flex-col items-center p-2 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[50px]">
                        <Megaphone size={14} className="text-emerald-500 mb-1"/>
                        <span className="text-xs font-black text-slate-700">{lead.total_broadcasts}</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[50px]">
                        <CalendarClock size={14} className="text-orange-500 mb-1"/>
                        <span className="text-xs font-black text-slate-700">{lead.total_followups}</span>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-5 align-middle">
                    <div className="text-xs font-bold text-slate-600">
                      {fmtDate(lead.last_interacted_at)}
                    </div>
                    <div className="text-[9px] font-black text-slate-400 mt-1 uppercase tracking-widest">
                      Dibuat: {new Date(lead.created_at).toLocaleDateString('id-ID')}
                    </div>
                  </td>
                  
                  <td className="px-6 py-5 align-middle text-right">
                    <div className="flex justify-end gap-1.5 opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openWaMe(lead.to_number)} className="w-9 h-9 rounded-xl bg-white text-blue-600 flex items-center justify-center hover:bg-blue-50 border border-slate-200 transition-all shadow-sm" title="Chat Manual di WA Web">
                        <ExternalLink size={16}/>
                      </button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setBcModalOpen(true); }} className="w-9 h-9 rounded-xl bg-white text-emerald-600 flex items-center justify-center hover:bg-emerald-50 border border-slate-200 transition-all shadow-sm" title="Kirim Broadcast Retargeting">
                        <Megaphone size={16}/>
                      </button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setFuModalOpen(true); }} className="w-9 h-9 rounded-xl bg-white text-orange-500 flex items-center justify-center hover:bg-orange-50 border border-slate-200 transition-all shadow-sm" title="Jadwalkan Follow Up Khusus">
                        <CalendarClock size={16}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BULK ACTION BAR - MENGAMBANG DI BAWAH JIKA ADA YANG DIPILIH */}
        {isSelectionMode && selectedLeads.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 rounded-[2rem] p-4 shadow-2xl border border-slate-700 flex items-center gap-6 animate-in slide-in-from-bottom-10 z-50">
             <span className="text-[11px] font-black text-white px-4 py-2 bg-slate-800 rounded-xl border border-slate-700">
               {selectedLeads.length} Prospek Terpilih
             </span>
             <div className="flex gap-2">
                <button onClick={() => setBcModalOpen(true)} className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all">
                  <Megaphone size={14} /> Blast Promo
                </button>
                <button onClick={() => setFuModalOpen(true)} className="flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all">
                  <CalendarClock size={14} /> Auto Follow Up
                </button>
             </div>
          </div>
        )}
      </div>

      {/* ============================================================================ */}
      {/* QUICK CHAT MODAL (POPUP BALAS INSTAN) */}
      {/* ============================================================================ */}
      {chatModal.open && chatModal.lead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:justify-end sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full h-full sm:w-[450px] sm:h-[90vh] bg-slate-50 sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-right-8 border border-white">
             
             {/* Header */}
             <div className="bg-white px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black">
                     {(chatModal.lead.name ? chatModal.lead.name.charAt(0) : 'P').toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">{chatModal.lead.name || 'Pelanggan'}</h3>
                    <p className="text-[10px] font-bold text-slate-500 font-mono">{chatModal.lead.to_number}</p>
                  </div>
                </div>
                <button onClick={() => setChatModal({ open: false, lead: null })} className="p-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-500 rounded-full transition-colors text-slate-400">
                  <X size={18} strokeWidth={3} />
                </button>
             </div>

             {/* Session Selector */}
             <div className="bg-indigo-50/50 px-4 py-2 flex items-center justify-between border-b border-indigo-100 shrink-0">
               <span className="text-[9px] font-black text-indigo-800 uppercase tracking-widest">Kirim via Sesi:</span>
               <select 
                 value={chatSession} 
                 onChange={e => setChatSession(e.target.value)}
                 className="bg-white border border-indigo-200 text-[10px] font-bold text-indigo-600 py-1 px-2 rounded outline-none cursor-pointer"
               >
                 {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
               </select>
             </div>

             {/* Chat History */}
             <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-100/50 scrollbar-hide">
                {chatMessages.length === 0 && (
                  <div className="text-center p-6 text-slate-400 opacity-60">
                    <MessageSquare size={32} className="mx-auto mb-2" />
                    <p className="text-xs font-bold">Memuat Obrolan...</p>
                  </div>
                )}
                {chatMessages.map(msg => {
                  const isOut = msg.direction === 'out';
                  return (
                    <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] shadow-sm ${isOut ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'}`}>
                        {msg.type === 'text' ? msg.text : <span className="italic font-bold opacity-80">[{msg.type.toUpperCase()}]</span>}
                        <div className={`text-[9px] mt-1.5 font-bold flex items-center gap-1 opacity-70 ${isOut ? 'justify-end' : 'justify-start'}`}>
                           {new Date(msg.time).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}
                           {isOut && (
                             <span>
                                {msg.status === 'read' ? <CheckCircle2 size={10} className="text-cyan-300"/> : 
                                 msg.status === 'failed' ? <XCircle size={10} className="text-rose-300"/> : 
                                 <CheckCircle2 size={10}/>}
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                  )
                })}
             </div>

             {/* Chat Input */}
             <div className="p-4 bg-white border-t border-slate-200 shrink-0">
               <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-[1.5rem] p-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                  <textarea 
                    value={chatText} 
                    onChange={e => setChatText(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuickChat(); } }}
                    placeholder="Balas instan..." 
                    rows={1}
                    className="flex-1 bg-transparent border-none py-2 px-3 text-sm font-medium outline-none resize-none max-h-24 text-slate-700"
                  />
                  <button 
                    onClick={sendQuickChat} 
                    disabled={!chatText.trim() || chatSending}
                    className={`w-10 h-10 rounded-[1rem] flex items-center justify-center shrink-0 transition-all ${chatText.trim() && !chatSending ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                  >
                    {chatSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="ml-0.5" />}
                  </button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODALS: RETARGETING ENGINE (BROADCAST & FOLLOW UP) */}
      {/* ============================================================================ */}

      {/* Broadcast Retargeting Modal */}
      {bcModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-[3rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-800 mb-2 flex items-center gap-3"><Megaphone className="text-emerald-500"/> Retarget Broadcast</h3>
            <p className="text-xs font-bold text-slate-500 mb-6">Pesan akan disebar ke <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{selectedLeads.length} Prospek Terpilih</span>.</p>
            
            <div className="space-y-5 mb-8">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">WA Pengirim</label>
                <select value={bcPayload.sessionKey} onChange={e => setBcPayload({...bcPayload, sessionKey: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700">
                  {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
                </select>
              </div>

              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 flex items-center gap-2"><Layers size={14}/> Gunakan Template Cepat</label>
                <select 
                  value={bcPayload.templateId} 
                  onChange={e => {
                    const t = templates.find(x => x.id === Number(e.target.value));
                    setBcPayload({...bcPayload, templateId: e.target.value, text: t?.text_body || ""});
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-indigo-200 outline-none font-bold text-sm text-slate-700 cursor-pointer"
                >
                  <option value="">-- Pilih Template (Opsional) --</option>
                  {templates.filter(t => t.message_type === 'text').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Teks Pesan Promo</label>
                <textarea rows={5} value={bcPayload.text} onChange={e => setBcPayload({...bcPayload, text: e.target.value})} placeholder="Gunakan {{nama}} untuk menyebut nama pelanggan secara otomatis..." className="w-full px-5 py-4 rounded-[1.5rem] bg-slate-50 border border-slate-200 outline-none font-medium text-sm text-slate-700 resize-none focus:bg-white focus:border-emerald-400 transition-colors" />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setBcModalOpen(false)} className="px-6 py-3.5 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 text-xs uppercase tracking-widest">Batal</button>
              <button onClick={executeRetargetBroadcast} className="px-8 py-3.5 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/30">Mulai Penyiaran</button>
            </div>
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
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">WA Pengirim</label>
                <select value={fuPayload.sessionKey} onChange={e => setFuPayload({...fuPayload, sessionKey: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700">
                  {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Pilih Jalur Rangkaian (Campaign)</label>
                {campaigns.length > 0 ? (
                  <select value={fuPayload.campaignId} onChange={e => setFuPayload({...fuPayload, campaignId: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700">
                    <option value="">-- Induk Campaign --</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-bold border border-rose-100 text-center">Belum ada Campaign Sequence aktif.<br/>Buat di menu Follow Up terlebih dahulu.</div>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setFuModalOpen(false)} className="px-6 py-3.5 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 text-xs uppercase tracking-widest">Batal</button>
              <button onClick={executeRetargetFollowUp} disabled={!fuPayload.campaignId} className="px-8 py-3.5 rounded-2xl font-black text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-widest shadow-lg shadow-orange-500/30">Jadwalkan</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}