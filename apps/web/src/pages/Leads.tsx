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
  MonitorPlay, Camera, Globe, Hash, Settings2, Info, HelpCircle, FileSpreadsheet, ArrowLeft
} from "lucide-react";

import { useConfirm } from "../App";

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
  { id: 'web', label: 'Website / LP' },
  { id: 'broadcast_reply', label: 'Balasan Blast' },
  { id: 'followup_reply', label: 'Balasan Follow Up' },
  { id: 'random', label: 'Random (Tanpa Trafik)' }
];

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================

export default function Leads() {
  const confirm = useConfirm();

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
  const isLidRef = useRef<boolean>(false); 

  // SMART ENGINE SETTINGS MODAL
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [rulesPayload, setRulesPayload] = useState({ 
    hot_keywords: "pesan, order, beli", 
    hot_sources: ["broadcast_reply", "followup_reply"],
    warm_keywords: "tanya, info, halo",
    warm_sources: ["meta_ads", "web", "ig", "tiktok"], 
    cold_days: 7 
  });
  const [savingRules, setSavingRules] = useState(false);

  // EXPORT MODAL STATE
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPayload, setExportPayload] = useState({ source: "all", status: "all" });
  const [exporting, setExporting] = useState(false);

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

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "500");
      if (sourceFilter !== "all") qs.set("source", sourceFilter);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (debouncedSearch) qs.set("q", debouncedSearch);

      const res = await apiFetch<any>(`leads?${qs.toString()}`);
      setLeads(res.data || []);
      if (res.stats) setStats(res.stats);
    } catch (e) { console.error(e); } finally { if (showLoading) setLoading(false); }
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
          hot_sources: res.data.hot_sources ? JSON.parse(res.data.hot_sources) : [],
          warm_keywords: res.data.warm_keywords || "",
          warm_sources: res.data.warm_sources ? JSON.parse(res.data.warm_sources) : [],
          cold_days: res.data.cold_days || 7
        });
      }
    } catch (e) {}
  };

  useEffect(() => { 
    loadData(true); 
    const interval = setInterval(() => { loadData(false); }, 10000);
    return () => clearInterval(interval);
  }, [sourceFilter, statusFilter, debouncedSearch]);
  
  useEffect(() => { loadHelpers(); loadTempRules(); }, []);

  useEffect(() => {
    let intervalId: any;
    if (chatModal.open && chatModal.lead && chatSession) {
      const fetchChat = async () => {
        try {
          const cleanNum = chatModal.lead!.to_number.replace(/\D/g, '');
          const peerJidStd = `${cleanNum}@s.whatsapp.net`;
          const peerJidLid = `${cleanNum}@lid`;

          const [resStd, resLid] = await Promise.all([
            apiFetch<any>(`ui/messages?sessionKey=${encodeURIComponent(chatSession)}&peer=${encodeURIComponent(peerJidStd)}&limit=50`).catch(() => ({ messages: [] })),
            apiFetch<any>(`ui/messages?sessionKey=${encodeURIComponent(chatSession)}&peer=${encodeURIComponent(peerJidLid)}&limit=50`).catch(() => ({ messages: [] }))
          ]);

          if (resLid.messages && resLid.messages.length > 0) {
            isLidRef.current = true;
          } else {
            isLidRef.current = false;
          }

          const combined = [...(resStd.messages || []), ...(resLid.messages || [])]
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

          setChatMessages(prev => {
            if (prev.length !== combined.length) {
              setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, 100);
              return combined;
            }
            let changed = false;
            for (let i=0; i<prev.length; i++) {
              if (prev[i].id !== combined[i].id || prev[i].status !== combined[i].status) { changed = true; break; }
            }
            return changed ? combined : prev;
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
          hot_sources: JSON.stringify(rulesPayload.hot_sources),
          warm_keywords: rulesPayload.warm_keywords,
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

  const toggleSourceSelection = (type: 'hot' | 'warm', sourceId: string) => {
    setRulesPayload(prev => {
      const key = type === 'hot' ? 'hot_sources' : 'warm_sources';
      const isExist = prev[key].includes(sourceId);
      return { 
        ...prev, 
        [key]: isExist ? prev[key].filter(s => s !== sourceId) : [...prev[key], sourceId] 
      };
    });
  };

  // ============================================================================
  // EXPORT ENGINE (XLSX - SHEETJS VIA DYNAMIC IMPORT)
  // ============================================================================
  const executeExportXLSX = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "10000"); 
      if (exportPayload.source !== "all") qs.set("source", exportPayload.source);
      if (exportPayload.status !== "all") qs.set("status", exportPayload.status);

      const res = await apiFetch<any>(`leads?${qs.toString()}`);
      const dataToExport = res.data || [];

      if (dataToExport.length === 0) {
        alert("Tidak ada data Prospek yang sesuai dengan filter export ini.");
        setExporting(false);
        return;
      }

      const formattedData = dataToExport.map((l: any) => {
        let sourceLabel = l.source;
        if (l.source.startsWith('meta_ads')) sourceLabel = l.source.replace('|', ' - ');

        return {
          "Nama Kontak": l.name || "Pelanggan Baru",
          "Nomor WhatsApp": l.to_number,
          "Sumber Trafik": sourceLabel.toUpperCase(),
          "Suhu / Status": l.status.toUpperCase(),
          "Total Di-Broadcast": l.total_broadcasts,
          "Total Masuk Follow Up": l.total_followups,
          "Terakhir Interaksi": l.last_interacted_at ? new Date(l.last_interacted_at).toLocaleString('id-ID') : "-",
          "Tanggal Masuk (Dibuat)": new Date(l.created_at).toLocaleString('id-ID')
        };
      });

      // Menggunakan dynamic import untuk modul XLSX via CDN
      const XLSX = await import('xlsx');
      
      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Prospek CRM");

      const wscols = [
        { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, 
        { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }
      ];
      worksheet['!cols'] = wscols;

      const fileName = `Export_Leads_${exportPayload.source}_${exportPayload.status}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setExportModalOpen(false);
    } catch (e: any) {
      alert("Gagal mengekspor data: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  const getSourceBadge = (source: string) => {
    const baseSource = source.split('|')[0].toLowerCase();
    const campaignName = source.includes('|') ? source.split('|')[1] : null;

    let icon, styles, label;

    if (baseSource === 'meta_ads') {
      icon = <MonitorPlay size={12} className="shrink-0"/>;
      styles = "bg-blue-50 text-blue-600 border-blue-100";
      label = "Meta Ads";
    } else if (baseSource === 'ig' || baseSource === 'instagram') {
      icon = <Camera size={12} className="shrink-0"/>;
      styles = "bg-pink-50 text-pink-600 border-pink-100";
      label = "Instagram";
    } else if (baseSource === 'tiktok') {
      icon = <Hash size={12} className="shrink-0"/>;
      styles = "bg-slate-100 text-slate-800 border-slate-200";
      label = "TikTok";
    } else if (baseSource === 'web') {
      icon = <Globe size={12} className="shrink-0"/>;
      styles = "bg-emerald-50 text-emerald-600 border-emerald-100";
      label = "Website";
    } else if (baseSource === 'broadcast_reply') {
      icon = <Megaphone size={12} className="shrink-0"/>;
      styles = "bg-amber-50 text-amber-600 border-amber-100";
      label = "Balasan Blast";
    } else if (baseSource === 'followup_reply') {
      icon = <CalendarClock size={12} className="shrink-0"/>;
      styles = "bg-orange-50 text-orange-600 border-orange-100";
      label = "Balasan Follow Up";
    } else if (baseSource === 'random') {
      icon = <HelpCircle size={12} className="shrink-0"/>;
      styles = "bg-slate-50 text-slate-600 border-slate-200"; 
      label = "Direct / Random";
    } else {
      icon = <MessageSquare size={12} className="shrink-0"/>;
      styles = "bg-slate-50 text-slate-600 border-slate-200";
      label = "Manual/Organik";
    }

    return (
      <div className="flex flex-col items-start gap-1">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${styles}`}>
          {icon} {label}
        </span>
        {campaignName && (
          <span className="text-[10px] font-medium text-slate-400 max-w-[150px] truncate" title={campaignName}>
            ↳ {campaignName}
          </span>
        )}
      </div>
    );
  };

  const statusColors: Record<string, string> = {
    hot: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100',
    warm: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100',
    converted: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100',
    dead: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200',
    cold: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
  };
  const parseTags = (tagsJson: any) => { try { const t = typeof tagsJson === 'string' ? JSON.parse(tagsJson) : tagsJson; if (t && t.name && t.color) return <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${t.color}`}>{t.name}</span>; } catch(e) {} return null; };
  const toggleLeadSelection = (num: string) => { setSelectedLeads(p => p.includes(num) ? p.filter(x => x !== num) : [...p, num]); };
  const openWaMe = (num: string) => { window.open(`https://wa.me/${num.replace(/\D/g, '')}`, "_blank"); };
  const executeRetargetBroadcast = async () => { setBcModalOpen(false); setSelectedLeads([]); setIsSelectionMode(false); };
  const executeRetargetFollowUp = async () => { setFuModalOpen(false); setSelectedLeads([]); setIsSelectionMode(false); };
  
  const sendQuickChat = async () => { 
    if (!chatText.trim() || chatSending || !chatModal.lead || !chatSession) return;
    setChatSending(true);
    try {
       const cleanNum = chatModal.lead.to_number.replace(/\D/g, '');
       const isLid = cleanNum.length >= 14 && !cleanNum.startsWith('62') && !cleanNum.startsWith('1');
       const peerJid = isLid ? `${cleanNum}@lid` : `${cleanNum}@s.whatsapp.net`;
       
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

  const executeDeleteLeads = async (targets: string[]) => { 
    const isConfirmed = await confirm({
      title: "Hapus Prospek",
      message: `Anda yakin ingin menghapus permanen ${targets.length} Prospek ini dari Master CRM? Data analitik mereka juga akan hilang.`,
      confirmText: "Hapus Permanen",
      isDanger: true
    });

    if (!isConfirmed) return;

    try { 
      await apiFetch("leads/delete", { method: "POST", body: JSON.stringify({ targets }) }); 
      setSelectedLeads([]); 
      setIsSelectionMode(false); 
      loadData(); 
    } catch (e: any) { 
      alert("Gagal menghapus: " + e.message); 
    } 
  };


  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Target className="text-[#0b57d0]" size={28} />
            Database CRM
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Lacak prospek, filter sumber trafik, dan pantau tingkat suhu (Temperature).
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedLeads([]); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all border shadow-sm ${isSelectionMode ? 'bg-[#c2e7ff] text-[#001d35] border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {isSelectionMode ? <><XCircle size={16}/> Batal</> : <><CheckSquare size={16}/> Mode Massal</>}
          </button>
          <button 
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-slate-600 border border-slate-200 font-bold text-xs uppercase tracking-wider shadow-sm hover:text-[#0b57d0] hover:border-[#c2e7ff] hover:bg-[#f0f4f9] transition-all"
          >
            <Settings2 size={16} /> Auto-Suhu
          </button>
          <button 
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <FileSpreadsheet size={16} /> Export
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
         <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Prospek</p><h3 className="text-2xl font-bold text-slate-800">{stats.total.toLocaleString('id-ID')}</h3></div>
         <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 mb-1 flex items-center gap-1.5"><Flame size={14}/> Hot</p><h3 className="text-2xl font-bold text-rose-700">{stats.hot.toLocaleString('id-ID')}</h3></div>
         <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-orange-600 mb-1 flex items-center gap-1.5"><Sun size={14}/> Warm</p><h3 className="text-2xl font-bold text-orange-700">{stats.warm.toLocaleString('id-ID')}</h3></div>
         <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1 flex items-center gap-1.5"><Snowflake size={14}/> Cold</p><h3 className="text-2xl font-bold text-blue-700">{stats.cold.toLocaleString('id-ID')}</h3></div>
         <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1.5"><CheckCircle2 size={14}/> Converted</p><h3 className="text-2xl font-bold text-emerald-700">{stats.converted.toLocaleString('id-ID')}</h3></div>
      </div>

      {/* MAIN DATA SECTION */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden relative">
        
        {/* TOOLBAR */}
        <div className="p-4 md:p-6 border-b border-slate-100 bg-[#f8fafd] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative w-full lg:max-w-md">
             <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400"><Search size={18} /></div>
             <input type="text" placeholder="Cari prospek (Nama / Nomor HP)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-full bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-[#c2e7ff] focus:border-[#0b57d0] font-medium text-slate-700 text-sm transition-all shadow-sm" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-full px-1 py-1 shadow-sm">
              <Filter size={16} className="text-slate-400 ml-3 mr-1" />
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="bg-transparent py-2 pl-1 pr-4 border-none text-[11px] font-bold text-slate-600 outline-none cursor-pointer uppercase tracking-wider">
                <option value="all">Semua Trafik</option>
                <option value="meta_ads">Meta Ads</option>
                <option value="ig">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="web">Website</option>
                <option value="broadcast_reply">Balasan Blast</option>
                <option value="followup_reply">Balasan Follow Up</option>
                <option value="random">Random / Direct</option>
                <option value="manual">Organik / Manual</option>
              </select>
            </div>
            <div className="flex items-center bg-white border border-slate-200 rounded-full px-1 py-1 shadow-sm">
              <Activity size={16} className="text-slate-400 ml-3 mr-1" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent py-2 pl-1 pr-4 border-none text-[11px] font-bold text-slate-600 outline-none cursor-pointer uppercase tracking-wider">
                <option value="all">Semua Suhu</option><option value="hot">🔥 Hot</option><option value="warm">☀️ Warm</option><option value="cold">❄️ Cold</option><option value="converted">✅ Converted</option><option value="dead">❌ Dead</option>
              </select>
            </div>
            <button onClick={() => loadData(true)} className="w-10 h-10 rounded-full bg-white text-slate-500 flex items-center justify-center hover:bg-[#f0f4f9] hover:text-[#0b57d0] transition-colors border border-slate-200 shadow-sm" title="Refresh Data"><RefreshCw size={16} /></button>
          </div>
        </div>

        {/* VIEW: Desktop Table */}
        <div className="hidden lg:block overflow-x-auto pb-16">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                {isSelectionMode && <th className="px-5 py-4 w-10 text-center">Pilih</th>}
                <th className="px-6 py-4">Identitas Prospek</th>
                <th className="px-6 py-4">Sumber Trafik</th>
                <th className="px-6 py-4">Suhu</th>
                <th className="px-6 py-4 text-center">Interaksi</th>
                <th className="px-6 py-4">Terakhir Aktif</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-20 text-center text-slate-400 flex flex-col items-center justify-center"><Loader2 size={32} className="animate-spin text-[#0b57d0] mb-3"/><span className="font-bold text-xs uppercase tracking-widest">Memuat CRM...</span></td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-20 text-center"><Target size={40} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500 font-medium">Tidak Ada Prospek Ditemukan</p></td></tr>
              ) : leads.map((lead) => {
                const cleanNum = lead.to_number.replace(/\D/g, '');
                const isLid = cleanNum.length >= 14 && !cleanNum.startsWith('62') && !cleanNum.startsWith('1');

                return (
                <tr 
                  key={lead.id} 
                  className={`transition-colors ${!isSelectionMode ? 'hover:bg-[#f8fafd] cursor-pointer' : 'hover:bg-slate-50/50'}`}
                  onClick={(e) => {
                    if (isSelectionMode) return;
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.tagName.toLowerCase() === 'select' || target.tagName.toLowerCase() === 'option') return;
                    setChatModal({ open: true, lead });
                  }}
                >
                  {isSelectionMode && (
                    <td className="px-5 py-4 align-middle text-center">
                      <div onClick={() => toggleLeadSelection(lead.to_number)} className={`w-5 h-5 mx-auto rounded border-2 cursor-pointer flex items-center justify-center transition-all ${selectedLeads.includes(lead.to_number) ? 'bg-[#0b57d0] border-[#0b57d0] text-white' : 'bg-white border-slate-300'}`}>
                        {selectedLeads.includes(lead.to_number) && <CheckSquare size={14} strokeWidth={3}/>}
                      </div>
                    </td>
                  )}

                  <td className="px-6 py-4 align-middle">
                    <div className="font-bold text-slate-800 text-sm tracking-tight">{lead.name || 'Pelanggan Baru'}</div>
                    <div className="text-xs font-medium text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                       {isLid ? (
                         <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold" title="ID Disembunyikan oleh Meta (LID)">Hidden ID</span>
                       ) : (
                         <span className="text-[#0b57d0]">+{lead.to_number}</span>
                       )}
                       {isLid && <span className="text-[10px] opacity-50">({lead.to_number})</span>}
                    </div>
                    <div className="mt-1.5">{parseTags(lead.tags_json)}</div>
                  </td>
                  
                  <td className="px-6 py-4 align-middle">{getSourceBadge(lead.source)}</td>
                  
                  <td className="px-6 py-4 align-middle">
                    <div className="relative inline-block">
                      <select 
                        value={lead.status}
                        onChange={(e) => executeUpdateStatus([lead.to_number], e.target.value)}
                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg outline-none cursor-pointer appearance-none pr-7 border transition-all ${statusColors[lead.status]}`}
                      >
                        <option value="hot">🔥 Hot</option><option value="warm">☀️ Warm</option><option value="cold">❄️ Cold</option>
                        <option value="converted">✅ Converted</option><option value="dead">❌ Dead</option>
                      </select>
                      <ChevronDown size={12} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50`} />
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 text-center align-middle">
                    <div className="inline-flex gap-2">
                      <div className="flex flex-col items-center p-2 bg-[#f8fafd] rounded-xl border border-slate-100 min-w-[45px]"><Megaphone size={14} className="text-emerald-500 mb-1"/><span className="text-xs font-bold text-slate-700">{lead.total_broadcasts}</span></div>
                      <div className="flex flex-col items-center p-2 bg-[#f8fafd] rounded-xl border border-slate-100 min-w-[45px]"><CalendarClock size={14} className="text-orange-500 mb-1"/><span className="text-xs font-bold text-slate-700">{lead.total_followups}</span></div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 align-middle">
                    <div className="text-xs font-medium text-slate-700">{fmtDate(lead.last_interacted_at)}</div>
                    <div className="text-[10px] font-medium text-slate-400 mt-1">Dibuat: {new Date(lead.created_at).toLocaleDateString('id-ID')}</div>
                  </td>
                  
                  <td className="px-6 py-4 align-middle text-right">
                    <div className="flex justify-end gap-1.5 opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openWaMe(lead.to_number)} className="w-8 h-8 rounded-full bg-white text-[#0b57d0] flex items-center justify-center hover:bg-[#e9eef6] border border-slate-200 transition-colors" title="Chat Manual"><ExternalLink size={14}/></button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setBcModalOpen(true); }} className="w-8 h-8 rounded-full bg-white text-emerald-600 flex items-center justify-center hover:bg-emerald-50 border border-slate-200 transition-colors" title="Retarget Blast"><Megaphone size={14}/></button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setFuModalOpen(true); }} className="w-8 h-8 rounded-full bg-white text-orange-500 flex items-center justify-center hover:bg-orange-50 border border-slate-200 transition-colors" title="Follow Up"><CalendarClock size={14}/></button>
                      <button onClick={() => executeDeleteLeads([lead.to_number])} className="w-8 h-8 rounded-full bg-white text-rose-500 flex items-center justify-center hover:bg-rose-50 border border-slate-200 transition-colors" title="Hapus"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* VIEW: Mobile Card List */}
        <div className="lg:hidden divide-y divide-slate-100 pb-20">
          {loading ? (
             <div className="py-16 text-center text-slate-400 flex flex-col items-center"><Loader2 size={32} className="animate-spin text-[#0b57d0] mb-2"/><span className="font-bold text-xs">Memuat Data...</span></div>
          ) : leads.length === 0 ? (
             <div className="py-16 text-center text-slate-500 font-medium">Tidak ada prospek ditemukan.</div>
          ) : leads.map(lead => {
             const cleanNum = lead.to_number.replace(/\D/g, '');
             const isLid = cleanNum.length >= 14 && !cleanNum.startsWith('62') && !cleanNum.startsWith('1');

             return (
               <div key={lead.id} className="p-4 bg-white flex flex-col gap-3">
                 <div className="flex justify-between items-start">
                   <div className="flex items-start gap-3">
                     {isSelectionMode && (
                        <div onClick={() => toggleLeadSelection(lead.to_number)} className={`mt-1 w-5 h-5 rounded border-2 cursor-pointer flex items-center justify-center transition-all shrink-0 ${selectedLeads.includes(lead.to_number) ? 'bg-[#0b57d0] border-[#0b57d0] text-white' : 'bg-white border-slate-300'}`}>
                          {selectedLeads.includes(lead.to_number) && <CheckSquare size={14} strokeWidth={3}/>}
                        </div>
                     )}
                     <div onClick={() => !isSelectionMode && setChatModal({ open: true, lead })} className={!isSelectionMode ? 'cursor-pointer' : ''}>
                        <h3 className="font-bold text-slate-800 text-sm">{lead.name || 'Pelanggan Baru'}</h3>
                        <div className="text-xs font-mono text-slate-500 mt-0.5">
                          {isLid ? <span className="bg-slate-100 px-1 rounded text-[10px]">Hidden ID</span> : `+${lead.to_number}`}
                        </div>
                     </div>
                   </div>
                   <div className="relative shrink-0">
                      <select 
                        value={lead.status}
                        onChange={(e) => executeUpdateStatus([lead.to_number], e.target.value)}
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded outline-none appearance-none border ${statusColors[lead.status]}`}
                      >
                        <option value="hot">🔥 Hot</option><option value="warm">☀️ Warm</option><option value="cold">❄️ Cold</option>
                        <option value="converted">✅ Converted</option><option value="dead">❌ Dead</option>
                      </select>
                   </div>
                 </div>

                 <div className="flex items-center justify-between mt-1">
                    {getSourceBadge(lead.source)}
                    <span className="text-[10px] text-slate-400 font-medium">{fmtDate(lead.last_interacted_at).split(' ')[0]}</span>
                 </div>

                 <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-1">
                    <div className="flex gap-2">
                       <span className="flex items-center gap-1 text-[10px] bg-[#f8fafd] border border-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold"><Megaphone size={10} className="text-emerald-500"/> {lead.total_broadcasts}</span>
                       <span className="flex items-center gap-1 text-[10px] bg-[#f8fafd] border border-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold"><CalendarClock size={10} className="text-orange-500"/> {lead.total_followups}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openWaMe(lead.to_number)} className="p-1.5 rounded-md bg-white text-[#0b57d0] border border-slate-200"><ExternalLink size={14}/></button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setBcModalOpen(true); }} className="p-1.5 rounded-md bg-white text-emerald-600 border border-slate-200"><Megaphone size={14}/></button>
                      <button onClick={() => { setSelectedLeads([lead.to_number]); setFuModalOpen(true); }} className="p-1.5 rounded-md bg-white text-orange-500 border border-slate-200"><CalendarClock size={14}/></button>
                      <button onClick={() => executeDeleteLeads([lead.to_number])} className="p-1.5 rounded-md bg-white text-rose-500 border border-slate-200"><Trash2 size={14}/></button>
                    </div>
                 </div>
               </div>
             )
          })}
        </div>

        {/* BULK ACTION BAR - Floating Mobile & Desktop */}
        {isSelectionMode && selectedLeads.length > 0 && (
          <div className="fixed sm:absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] sm:w-max bg-[#001d35] rounded-3xl p-3 shadow-xl flex items-center justify-between sm:justify-start gap-2 sm:gap-4 animate-in slide-in-from-bottom-10 z-50">
             <span className="text-[11px] font-bold text-[#c2e7ff] px-2 hidden sm:inline-block whitespace-nowrap">{selectedLeads.length} Terpilih</span>
             <span className="text-[11px] font-bold text-[#c2e7ff] px-2 sm:hidden">{selectedLeads.length}</span>
             
             <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="relative flex items-center bg-white/10 rounded-full border border-white/20">
                  <Flame size={14} className="text-slate-300 ml-2.5 hidden sm:block" />
                  <select onChange={(e) => { if(e.target.value) { executeUpdateStatus(selectedLeads, e.target.value); e.target.value = ""; } }} className="bg-transparent text-[10px] sm:text-xs font-bold text-white uppercase tracking-wider pl-2 sm:pl-1 pr-6 sm:pr-8 py-2 outline-none appearance-none">
                    <option value="" className="text-slate-800">Ubah Suhu</option><option value="hot" className="text-slate-800">🔥 Set Hot</option><option value="warm" className="text-slate-800">☀️ Set Warm</option><option value="cold" className="text-slate-800">❄️ Set Cold</option><option value="converted" className="text-slate-800">✅ Set Converted</option><option value="dead" className="text-slate-800">❌ Set Dead</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300" />
                </div>
                <button onClick={() => setBcModalOpen(true)} className="p-2 sm:px-4 sm:py-2 bg-emerald-600 hover:bg-emerald-700 rounded-full text-white font-bold text-[10px] sm:text-xs transition-colors flex items-center gap-1.5" title="Kirim Broadcast"><Megaphone size={14} /><span className="hidden sm:inline-block">Blast</span></button>
                <button onClick={() => setFuModalOpen(true)} className="p-2 sm:px-4 sm:py-2 bg-orange-600 hover:bg-orange-700 rounded-full text-white font-bold text-[10px] sm:text-xs transition-colors flex items-center gap-1.5" title="Jadwalkan Follow Up"><CalendarClock size={14} /><span className="hidden sm:inline-block">Follow Up</span></button>
                <button onClick={() => executeDeleteLeads(selectedLeads)} className="p-2 sm:px-4 sm:py-2 bg-rose-600 hover:bg-rose-700 rounded-full text-white font-bold text-[10px] sm:text-xs transition-colors flex items-center gap-1.5" title="Hapus"><Trash2 size={14} /><span className="hidden sm:inline-block">Hapus</span></button>
             </div>
          </div>
        )}
      </div>

      {/* ============================================================================ */}
      {/* 4. MODALS AREA (EXPORT, QUICK CHAT, SETTINGS, BROADCAST, FOLLOW UP) */}
      {/* ============================================================================ */}

      {/* EXPORT XLSX MODAL */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet size={20} className="text-emerald-600"/> Export Data</h3>
               <button onClick={() => setExportModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-full transition-colors"><X size={18}/></button>
            </div>

            <div className="space-y-4 mb-6">
               <div>
                 <label className="text-xs font-bold text-slate-700 block mb-1.5">Filter Sumber Trafik</label>
                 <select 
                   value={exportPayload.source} 
                   onChange={e => setExportPayload({...exportPayload, source: e.target.value})}
                   className="w-full px-3 py-2.5 rounded-xl bg-[#f0f4f9] border-none text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff]"
                 >
                   <option value="all">Semua Trafik</option>
                   <option value="meta_ads">Hanya Meta Ads</option>
                   <option value="web">Hanya Website</option>
                   <option value="ig">Hanya Instagram</option>
                   <option value="tiktok">Hanya TikTok</option>
                   <option value="broadcast_reply">Hanya Balasan Blast</option>
                   <option value="followup_reply">Hanya Balasan Follow Up</option>
                   <option value="random">Hanya Random / Direct</option>
                 </select>
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-700 block mb-1.5">Filter Suhu</label>
                 <select 
                   value={exportPayload.status} 
                   onChange={e => setExportPayload({...exportPayload, status: e.target.value})}
                   className="w-full px-3 py-2.5 rounded-xl bg-[#f0f4f9] border-none text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#c2e7ff]"
                 >
                   <option value="all">Semua Suhu</option>
                   <option value="hot">Hanya 🔥 HOT</option>
                   <option value="warm">Hanya ☀️ WARM</option>
                   <option value="cold">Hanya ❄️ COLD</option>
                   <option value="converted">Hanya ✅ CONVERTED</option>
                   <option value="dead">Hanya ❌ DEAD</option>
                 </select>
               </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setExportModalOpen(false)} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] text-sm">Batal</button>
              <button onClick={executeExportXLSX} disabled={exporting} className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-sm transition-colors">
                 {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download .xlsx
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* SMART TEMPERATURE SETTINGS MODAL */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl bg-white rounded-3xl p-5 md:p-8 shadow-xl flex flex-col max-h-[95vh] animate-in zoom-in-95">
             <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4 shrink-0">
               <div>
                 <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Settings2 size={20} className="text-[#0b57d0]"/> Logika Suhu Otomatis</h2>
                 <p className="text-xs text-slate-500 mt-0.5">Klasifikasi Lead berdasarkan sumber & kata kunci</p>
               </div>
               <button onClick={() => setSettingsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={18}/></button>
             </div>

             <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6 pb-4">
                
                {/* SETTING HOT */}
                <div className="bg-[#fcf8f8] border border-rose-100 p-5 rounded-2xl">
                  <h4 className="text-sm font-bold text-rose-600 flex items-center gap-1.5 mb-1"><Flame size={16}/> Indikator 🔥 HOT</h4>
                  <p className="text-xs text-slate-500 mb-4">Mendefinisikan lead sangat tertarik.</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 block">Dari Sumber Trafik</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ALL_SOURCES.map(src => {
                          const isChecked = rulesPayload.hot_sources.includes(src.id);
                          return (
                            <label key={`hot_${src.id}`} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${isChecked ? 'bg-white border-rose-300' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                              <input type="checkbox" checked={isChecked} onChange={() => toggleSourceSelection('hot', src.id)} className="w-4 h-4 accent-rose-500" />
                              <span className={`text-xs font-medium ${isChecked ? 'text-rose-700' : 'text-slate-600'}`}>{src.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Dari Kata Kunci Pesan</label>
                      <input 
                        value={rulesPayload.hot_keywords} 
                        onChange={e => setRulesPayload({...rulesPayload, hot_keywords: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-rose-200 outline-none font-medium text-slate-700 text-sm focus:border-rose-400"
                        placeholder="pesan, order, transfer, harga"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">* Pisahkan dengan koma</p>
                    </div>
                  </div>
                </div>

                {/* SETTING WARM */}
                <div className="bg-[#fef8f3] border border-orange-100 p-5 rounded-2xl">
                  <h4 className="text-sm font-bold text-orange-600 flex items-center gap-1.5 mb-1"><Sun size={16}/> Indikator ☀️ WARM</h4>
                  <p className="text-xs text-slate-500 mb-4">Mendefinisikan lead masih menimbang.</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 block">Dari Sumber Trafik</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ALL_SOURCES.map(src => {
                          const isChecked = rulesPayload.warm_sources.includes(src.id);
                          return (
                            <label key={`warm_${src.id}`} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${isChecked ? 'bg-white border-orange-300' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                              <input type="checkbox" checked={isChecked} onChange={() => toggleSourceSelection('warm', src.id)} className="w-4 h-4 accent-orange-500" />
                              <span className={`text-xs font-medium ${isChecked ? 'text-orange-700' : 'text-slate-600'}`}>{src.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">Dari Kata Kunci Pesan</label>
                      <input 
                        value={rulesPayload.warm_keywords} 
                        onChange={e => setRulesPayload({...rulesPayload, warm_keywords: e.target.value})}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-orange-200 outline-none font-medium text-slate-700 text-sm focus:border-orange-400"
                        placeholder="tanya, info, halo, p"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">* Pisahkan dengan koma</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#f0f4f9] p-3 rounded-xl border border-[#c2e7ff] text-xs font-medium text-slate-600 leading-relaxed flex gap-2">
                  <Info size={16} className="shrink-0 text-[#0b57d0] mt-0.5"/>
                  Sistem mengecek kondisi HOT terlebih dahulu. Jika tidak cocok, baru mengecek WARM. Suhu tidak akan diturunkan otomatis jika sudah dikunci ke Converted atau Dead.
                </div>
             </div>

             <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 shrink-0">
                <button onClick={() => setSettingsModalOpen(false)} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] text-sm transition-colors">Batal</button>
                <button onClick={handleSaveSettings} disabled={savingRules} className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] transition-colors text-sm">
                  {savingRules ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} Simpan
                </button>
             </div>
          </div>
        </div>
      )}

      {/* QUICK CHAT MODAL */}
      {chatModal.open && chatModal.lead && (
        <div className="fixed inset-0 z-[100] flex sm:items-center sm:justify-end sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full h-full sm:h-auto sm:w-[400px] sm:max-h-[90vh] bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-right-8">
             
             {/* Chat Header */}
             <div className="bg-white px-4 py-3 border-b border-slate-100 shrink-0 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <button onClick={() => setChatModal({ open: false, lead: null })} className="p-1 sm:hidden text-slate-500 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button>
                  <div className="w-10 h-10 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center font-bold text-lg">{(chatModal.lead.name ? chatModal.lead.name.charAt(0) : 'P').toUpperCase()}</div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{chatModal.lead.name || 'Pelanggan'}</h3>
                    <p className="text-xs font-medium text-slate-500 font-mono">+{chatModal.lead.to_number}</p>
                  </div>
                </div>
                <button onClick={() => setChatModal({ open: false, lead: null })} className="hidden sm:block p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"><X size={18} /></button>
             </div>
             
             {/* Session Selector */}
             <div className="bg-[#f8fafd] px-4 py-2 flex items-center justify-between border-b border-slate-100 shrink-0">
               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kirim via Sesi:</span>
               <select value={chatSession} onChange={e => setChatSession(e.target.value)} className="bg-white border border-slate-200 text-[10px] font-bold text-slate-700 py-1 px-2 rounded-md outline-none cursor-pointer">
                 {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
               </select>
             </div>
             
             {/* Chat Messages */}
             <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-hide scroll-smooth">
                {chatMessages.length === 0 && <div className="text-center py-10 text-slate-400"><MessageSquare size={32} className="mx-auto mb-2 opacity-50" /><p className="text-xs font-medium">Memuat Obrolan...</p></div>}
                {chatMessages.map(msg => {
                  const isOut = msg.direction === 'out';
                  return (
                    <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[14px] shadow-sm ${isOut ? 'bg-[#0b57d0] text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
                        {msg.type === 'text' ? msg.text : <span className="italic font-bold opacity-80">[{msg.type.toUpperCase()}]</span>}
                        <div className={`text-[10px] mt-1 font-medium flex items-center gap-1 opacity-70 ${isOut ? 'justify-end' : 'justify-start'}`}>
                           {new Date(msg.time).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}
                           {isOut && <span>{msg.status === 'read' ? <CheckCircle2 size={12} className="text-[#c2e7ff]"/> : msg.status === 'failed' ? <XCircle size={12} className="text-rose-300"/> : <CheckCircle2 size={12}/>}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
             </div>
             
             {/* Chat Input */}
             <div className="p-3 bg-white border-t border-slate-100 shrink-0">
               <div className="flex items-end gap-2 bg-[#f0f4f9] rounded-[1.5rem] p-1.5 focus-within:ring-2 focus-within:ring-[#c2e7ff] transition-all">
                  <textarea value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuickChat(); } }} placeholder="Ketik pesan..." rows={1} className="flex-1 bg-transparent border-none py-2 px-3 text-sm font-medium outline-none resize-none max-h-24 text-slate-800" />
                  <button onClick={sendQuickChat} disabled={!chatText.trim() || chatSending} className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${chatText.trim() && !chatSending ? 'bg-[#0b57d0] text-white hover:bg-[#001d35]' : 'bg-transparent text-slate-400 cursor-not-allowed'}`}>{chatSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Broadcast Retargeting Modal */}
      {bcModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2"><Megaphone size={20} className="text-emerald-600"/> Retarget Broadcast</h3>
            <p className="text-xs text-slate-500 mb-5">Pesan akan dikirim ke <span className="font-bold text-emerald-600">{selectedLeads.length} Prospek Terpilih</span>.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">WA Pengirim</label>
                <select value={bcPayload.sessionKey} onChange={e => setBcPayload({...bcPayload, sessionKey: e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-[#f0f4f9] border-none outline-none text-sm font-medium text-slate-700">{sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}</select>
              </div>
              <div className="bg-[#f8fafd] p-3 rounded-xl border border-slate-100">
                <label className="text-xs font-bold text-[#0b57d0] block mb-1.5 flex items-center gap-1.5"><Layers size={14}/> Gunakan Template</label>
                <select value={bcPayload.templateId} onChange={e => { const t = templates.find(x => x.id === Number(e.target.value)); setBcPayload({...bcPayload, templateId: e.target.value, text: t?.text_body || ""}); }} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 outline-none text-sm font-medium text-slate-700 cursor-pointer"><option value="">-- Pilih Template (Opsional) --</option>{templates.filter(t => t.message_type === 'text').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Isi Pesan</label>
                <textarea rows={4} value={bcPayload.text} onChange={e => setBcPayload({...bcPayload, text: e.target.value})} placeholder="Ketik pesan..." className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none text-sm font-medium text-slate-700 resize-none focus:ring-2 focus:ring-[#c2e7ff]" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBcModalOpen(false)} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] text-sm">Batal</button>
              <button onClick={executeRetargetBroadcast} className="px-5 py-2.5 rounded-full font-bold text-white bg-emerald-600 hover:bg-emerald-700 text-sm flex items-center gap-1.5"><Send size={14}/> Kirim</button>
            </div>
          </div>
        </div>
      )}

      {/* Follow Up Retargeting Modal */}
      {fuModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2"><CalendarClock size={20} className="text-orange-600"/> Retarget Follow Up</h3>
            <p className="text-xs text-slate-500 mb-5">Suntikkan <span className="font-bold text-orange-600">{selectedLeads.length} Prospek</span> ke antrean Sequence.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">WA Pengirim</label>
                <select value={fuPayload.sessionKey} onChange={e => setFuPayload({...fuPayload, sessionKey: e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-[#f0f4f9] border-none outline-none text-sm font-medium text-slate-700">{sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}</select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Pilih Workflow (Campaign)</label>
                {campaigns.length > 0 ? (
                  <select value={fuPayload.campaignId} onChange={e => setFuPayload({...fuPayload, campaignId: e.target.value})} className="w-full px-3 py-2.5 rounded-xl bg-[#f0f4f9] border-none outline-none text-sm font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff]"><option value="">-- Induk Campaign --</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                ) : (
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100 text-center">Belum ada Workflow aktif.</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setFuModalOpen(false)} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] text-sm">Batal</button>
              <button onClick={executeRetargetFollowUp} disabled={!fuPayload.campaignId} className="px-5 py-2.5 rounded-full font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-sm">Jadwalkan</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}