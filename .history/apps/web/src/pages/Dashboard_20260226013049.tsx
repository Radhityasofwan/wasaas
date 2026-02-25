import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  LayoutDashboard, 
  Smartphone, 
  Target, 
  Flame, 
  Megaphone, 
  CalendarClock, 
  Loader2, 
  ArrowRight,
  Activity,
  CheckCircle2
} from "lucide-react";

/** HELPER INTERNAL */
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
  catch (e) { throw new Error(`Server Backend Error`); }

  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sessionsTotal: 0,
    sessionsConnected: 0,
    leadsTotal: 0,
    leadsHot: 0,
    broadcastsActive: 0,
    followupsActive: 0
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch ke semua endpoint yang diperlukan secara paralel
        const [sessRes, leadsRes, bcRes, fuRes] = await Promise.all([
          apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] })),
          apiFetch<any>("leads?limit=1").catch(() => ({ stats: { total: 0, hot: 0 } })),
          apiFetch<any>("broadcast/jobs").catch(() => ({ jobs: [] })),
          apiFetch<any>("followup/campaigns").catch(() => ({ data: [] }))
        ]);

        const sessions = sessRes.sessions || [];
        const connectedSessions = sessions.filter((s: any) => s.status === 'connected').length;
        
        const activeBc = (bcRes.jobs || []).filter((j: any) => j.status === 'running' || j.status === 'queued').length;
        const activeFu = (fuRes.data || []).filter((c: any) => c.status === 'active').length;

        setStats({
          sessionsTotal: sessions.length,
          sessionsConnected: connectedSessions,
          leadsTotal: leadsRes.stats?.total || 0,
          leadsHot: leadsRes.stats?.hot || 0,
          broadcastsActive: activeBc,
          followupsActive: activeFu
        });

      } catch (error) {
        console.error("Gagal memuat data dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#f0f4f9] rounded-full blur-3xl pointer-events-none -mt-20 -mr-20"></div>
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <LayoutDashboard className="text-[#0b57d0]" size={28} />
            Dashboard Utama
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl leading-relaxed">
            Selamat datang di Pusat Kendali CRM. Berikut adalah ringkasan lalu lintas pesan dan metrik konversi prospek Anda secara <i>real-time</i>.
          </p>
        </div>
        
        <div className="relative z-10 shrink-0 flex items-center gap-2 bg-[#f8fafd] border border-slate-200 px-4 py-2 rounded-full">
           <Activity size={16} className="text-emerald-500 animate-pulse" />
           <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Sistem Online</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 size={40} className="animate-spin text-[#0b57d0]" />
          <span className="text-xs font-bold uppercase tracking-widest">Mengumpulkan Metrik...</span>
        </div>
      ) : (
        <>
          {/* GRID METRIK */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            
            {/* Kartu: Sesi WA */}
            <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
               <div>
                  <div className="w-12 h-12 bg-[#f0f4f9] text-[#0b57d0] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Smartphone size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Perangkat (Sesi)</h3>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-slate-800">{stats.sessionsConnected}</span>
                    <span className="text-sm font-medium text-slate-400 mb-1">/ {stats.sessionsTotal} Terhubung</span>
                  </div>
               </div>
               {stats.sessionsConnected > 0 ? (
                 <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md w-max">
                   <CheckCircle2 size={14} /> Sinkronisasi Lancar
                 </div>
               ) : (
                 <div className="mt-4 text-[11px] font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-md w-max">
                   Offline (Hubungkan WA)
                 </div>
               )}
            </div>

            {/* Kartu: CRM Leads */}
            <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
               <div>
                  <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Target size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Prospek</h3>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-slate-800">{stats.leadsTotal.toLocaleString('id-ID')}</span>
                    <span className="text-sm font-medium text-slate-400 mb-1">Kontak</span>
                  </div>
               </div>
               <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-md w-max">
                 <Flame size={14} /> {stats.leadsHot} Hot Leads Baru
               </div>
            </div>

            {/* Kartu: Broadcast */}
            <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
               <div>
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Megaphone size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Broadcast Job</h3>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-slate-800">{stats.broadcastsActive}</span>
                    <span className="text-sm font-medium text-slate-400 mb-1">Antrean</span>
                  </div>
               </div>
               <div className="mt-4 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md w-max">
                 Sedang dalam pemrosesan
               </div>
            </div>

            {/* Kartu: Follow Up */}
            <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
               <div>
                  <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <CalendarClock size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Auto Follow Up</h3>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-slate-800">{stats.followupsActive}</span>
                    <span className="text-sm font-medium text-slate-400 mb-1">Workflow</span>
                  </div>
               </div>
               <div className="mt-4 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md w-max">
                 Rangkaian berjalan aktif
               </div>
            </div>

          </div>

          {/* JALAN PINTAS (QUICK LINKS) */}
          <div className="pt-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4 px-1">Jalan Pintas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link to="/" className="flex items-center justify-between p-5 rounded-2xl bg-[#0b57d0] text-white hover:bg-[#001d35] transition-colors group shadow-sm">
                <div>
                  <h3 className="font-bold text-base mb-0.5">Inbox Obrolan</h3>
                  <p className="text-xs text-blue-200 font-medium">Balas chat prospek</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </Link>
              
              <Link to="/broadcast" className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 hover:border-[#c2e7ff] hover:bg-[#f8fafd] transition-colors group shadow-sm">
                <div>
                  <h3 className="font-bold text-slate-800 text-base mb-0.5">Kirim Broadcast</h3>
                  <p className="text-xs text-slate-500 font-medium">Sapa prospek Anda</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center group-hover:translate-x-1 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </Link>

              <Link to="/leads" className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 hover:border-[#c2e7ff] hover:bg-[#f8fafd] transition-colors group shadow-sm">
                <div>
                  <h3 className="font-bold text-slate-800 text-base mb-0.5">Database CRM</h3>
                  <p className="text-xs text-slate-500 font-medium">Kelola suhu pelanggan</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center group-hover:translate-x-1 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}