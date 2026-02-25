import React, { useEffect, useState } from "react";
import { 
  Target, Flame, Snowflake, Download, 
  Search, MessageSquare, ArrowRight, Activity 
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
  
  // FIX: Sinkronisasi Path Proxy
  const url = path.startsWith("http") ? path : `/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try { 
    data = text ? JSON.parse(text) : {}; 
  } catch (e) { 
    throw new Error(`Server Error (HTTP ${res.status}). Respons bukan JSON.`); 
  }
  
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

type LeadRow = {
  to_number: string;
  total_broadcasts: number;
  last_sent_at: string;
  last_reply_at: string | null;
  has_replied: number;
  reply_preview: string | null;
};

type Stats = {
  total: number;
  hot: number;
  cold: number;
};

export default function Leads() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, hot: 0, cold: 0 });
  const [loading, setLoading] = useState(false);
  
  // Filter & Search
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce logic for search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500); // 500ms delay
    return () => clearTimeout(handler);
  }, [searchQuery]);

  async function loadData() {
    setLoading(true);
    try {
      const endpoint = `leads?limit=100&filter=${filter}${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''}`;
      const res = await apiFetch<any>(endpoint);
      setLeads(res.data || []);
      if (res.stats) setStats(res.stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    loadData(); 
  }, [filter, debouncedSearch]);

  const handleExportCSV = () => {
    if (leads.length === 0) return alert("Tidak ada data untuk diekspor");
    
    const headers = ["Nomor WhatsApp", "Klasifikasi", "Total Broadcast", "Terakhir Dikirim", "Terakhir Membalas", "Preview Balasan"];
    const csvContent = [
      headers.join(","),
      ...leads.map(l => [
        l.to_number,
        l.has_replied ? "Hot Lead" : "Cold Lead",
        l.total_broadcasts,
        l.last_sent_at || "-",
        l.last_reply_at || "-",
        `"${(l.reply_preview || "").replace(/"/g, '""')}"` // Handle koma dalam teks balasan
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
            <Target size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter">Database Prospek</h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Klasifikasi Leads & Respon Interaksi</p>
          </div>
        </div>
        
        <button 
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-[1.5rem] bg-slate-900 text-white font-bold text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* DASHBOARD STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2rem] shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
               <Target size={28} strokeWidth={2} />
            </div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Prospek</p>
               <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stats.total.toLocaleString('id-ID')} <span className="text-sm font-medium text-slate-500 tracking-normal">Nomor</span></h3>
            </div>
         </div>

         <div className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2rem] shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
               <Flame size={28} strokeWidth={2} />
            </div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-1">Hot Leads (Membalas)</p>
               <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stats.hot.toLocaleString('id-ID')} <span className="text-sm font-medium text-slate-500 tracking-normal">Nomor</span></h3>
            </div>
         </div>

         <div className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2rem] shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
               <Snowflake size={28} strokeWidth={2} />
            </div>
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Cold Leads (Pasif)</p>
               <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stats.cold.toLocaleString('id-ID')} <span className="text-sm font-medium text-slate-500 tracking-normal">Nomor</span></h3>
            </div>
         </div>
      </div>

      {/* MAIN DATA SECTION */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        
        {/* TOOLBAR: SEARCH & FILTER */}
        <div className="p-6 md:p-8 border-b border-white/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative w-full md:max-w-sm">
             <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400">
               <Search size={16} strokeWidth={3} />
             </div>
             <input 
               type="text" 
               placeholder="Cari nomor HP (contoh: 62812...)" 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full pl-12 pr-5 py-4 rounded-2xl bg-white/60 border border-white outline-none focus:bg-white focus:ring-[4px] focus:ring-blue-500/10 font-bold text-slate-700 text-sm transition-all"
             />
          </div>

          <div className="flex items-center gap-3">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)} 
              className="bg-white px-6 py-4 rounded-2xl border border-slate-100 text-[11px] font-black text-slate-600 outline-none focus:ring-[4px] focus:ring-blue-500/10 transition-all cursor-pointer uppercase tracking-widest shadow-sm"
            >
              <option value="all">📊 Semua Prospek</option>
              <option value="replied">🔥 Hanya Hot Leads</option>
              <option value="pending">❄️ Hanya Cold Leads</option>
            </select>
            <button 
              onClick={loadData} 
              className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors border border-blue-100"
              title="Refresh Data"
            >
              <Activity size={20} />
            </button>
          </div>
        </div>

        {/* TABLE DATA */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/20 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/40">
                <th className="px-8 py-6">Nomor WhatsApp</th>
                <th className="px-8 py-6 text-center">Klasifikasi</th>
                <th className="px-8 py-6 text-center">Total Blast</th>
                <th className="px-8 py-6">Interaksi Terakhir</th>
                <th className="px-8 py-6">Riwayat Balasan Klien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {loading ? (
                <tr><td colSpan={5} className="px-10 py-32 text-center text-blue-500 font-black animate-pulse uppercase tracking-[0.3em]">Mengumpulkan Data Prospek...</td></tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center">
                    <Target size={48} className="mx-auto text-slate-300 mb-4 opacity-50" />
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em]">Tidak Ada Data Ditemukan</p>
                    <p className="text-slate-400 text-xs font-medium mt-2">Jalankan kampanye broadcast untuk mulai mengumpulkan prospek.</p>
                  </td>
                </tr>
              ) : leads.map((lead) => (
                <tr key={lead.to_number} className="hover:bg-white/40 transition-colors">
                  <td className="px-8 py-6 align-middle">
                    <div className="font-black text-slate-800 text-[15px] tracking-tight">{lead.to_number}</div>
                  </td>
                  
                  <td className="px-8 py-6 text-center align-middle">
                    {lead.has_replied ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-100 shadow-sm">
                        <Flame size={12} /> Hot Lead
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-200">
                        <Snowflake size={12} /> Cold Lead
                      </span>
                    )}
                  </td>
                  
                  <td className="px-8 py-6 text-center align-middle">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-blue-600 text-xs border border-slate-100 mx-auto">
                      {lead.total_broadcasts}
                    </div>
                  </td>
                  
                  <td className="px-8 py-6 align-middle">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <ArrowRight size={10} /> Kirim: {fmtDate(lead.last_sent_at)}
                      </div>
                      {lead.last_reply_at && (
                        <div className="flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-widest">
                          <MessageSquare size={10} /> Balas: {fmtDate(lead.last_reply_at)}
                        </div>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-8 py-6 align-middle">
                    {lead.reply_preview ? (
                      <div className="max-w-[280px] p-4 rounded-2xl bg-white/60 border border-white text-xs font-medium text-slate-600 leading-relaxed shadow-sm relative">
                        <div className="absolute -left-1.5 top-5 w-3 h-3 bg-white/60 border border-white rotate-45 border-r-0 border-t-0"></div>
                        <span className="line-clamp-2 italic">"{lead.reply_preview}"</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic ml-4">Belum merespon</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}