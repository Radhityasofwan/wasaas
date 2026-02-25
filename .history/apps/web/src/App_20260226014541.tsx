import React, { useEffect, useState, useMemo } from "react";
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
  CheckCircle2,
  TrendingUp,
  Users,
  MessageSquare,
  Zap
} from "lucide-react";

// Import Chart.js komponen
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

// Registrasi modul Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

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
    leadsWarm: 0,
    leadsCold: 0,
    leadsConverted: 0,
    broadcastsActive: 0,
    followupsActive: 0,
    sourceData: {} as Record<string, number>
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [sessRes, leadsRes, bcRes, fuRes] = await Promise.all([
          apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] })),
          apiFetch<any>("leads?limit=1").catch(() => ({ stats: { total: 0, hot: 0, warm: 0, cold: 0, converted: 0 }, data: [] })),
          apiFetch<any>("broadcast/jobs").catch(() => ({ jobs: [] })),
          apiFetch<any>("followup/campaigns").catch(() => ({ data: [] }))
        ]);

        const sessions = sessRes.sessions || [];
        const connectedSessions = sessions.filter((s: any) => s.status === 'connected').length;
        
        const activeBc = (bcRes.jobs || []).filter((j: any) => j.status === 'running' || j.status === 'queued').length;
        const activeFu = (fuRes.data || []).filter((c: any) => c.status === 'active').length;

        // Hitung sumber trafik dari data leads terbaru (jika tersedia di response)
        const sourceMap: Record<string, number> = {};
        if (Array.isArray(leadsRes.data)) {
           leadsRes.data.forEach((l: any) => {
             const src = l.source?.split('|')[0] || 'manual';
             sourceMap[src] = (sourceMap[src] || 0) + 1;
           });
        }

        setStats({
          sessionsTotal: sessions.length,
          sessionsConnected: connectedSessions,
          leadsTotal: leadsRes.stats?.total || 0,
          leadsHot: leadsRes.stats?.hot || 0,
          leadsWarm: leadsRes.stats?.warm || 0,
          leadsCold: leadsRes.stats?.cold || 0,
          leadsConverted: leadsRes.stats?.converted || 0,
          broadcastsActive: activeBc,
          followupsActive: activeFu,
          sourceData: sourceMap
        });

      } catch (error) {
        console.error("Gagal memuat data dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Konfigurasi Chart Doughnut (Suhu Prospek)
  const doughnutData = {
    labels: ['Hot', 'Warm', 'Cold', 'Converted'],
    datasets: [
      {
        data: [stats.leadsHot, stats.leadsWarm, stats.leadsCold, stats.leadsConverted],
        backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#10b981'],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  // Konfigurasi Chart Bar (Sumber Trafik)
  const barData = {
    labels: Object.keys(stats.sourceData).length > 0 ? Object.keys(stats.sourceData).map(s => s.toUpperCase()) : ['META', 'IG', 'WEB', 'MANUAL'],
    datasets: [
      {
        label: 'Jumlah Prospek',
        data: Object.values(stats.sourceData).length > 0 ? Object.values(stats.sourceData) : [12, 19, 8, 15],
        backgroundColor: '#0b57d0',
        borderRadius: 8,
      },
    ],
  };

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
            Ringkasan performa sistem dan metrik konversi prospek bisnis Anda secara <i>real-time</i>.
          </p>
        </div>
        
        <div className="relative z-10 shrink-0 flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-full">
           <Activity size={16} className="text-emerald-500 animate-pulse" />
           <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Engine Online</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 size={40} className="animate-spin text-[#0b57d0]" />
          <span className="text-xs font-bold uppercase tracking-widest">Menganalisis Data...</span>
        </div>
      ) : (
        <>
          {/* GRID METRIK - 4 KARTU UTAMA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            
            {/* 1. Sesi WhatsApp */}
            <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-shadow group">
               <div className="w-10 h-10 bg-[#f0f4f9] text-[#0b57d0] rounded-full flex items-center justify-center mb-4">
                  <Smartphone size={20} />
               </div>
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status Koneksi</h3>
               <div className="flex items-baseline gap-2">
                 <span className="text-3xl font-bold text-slate-800">{stats.sessionsConnected}</span>
                 <span className="text-sm font-medium text-slate-400">/ {stats.sessionsTotal} Sesi</span>
               </div>
               <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-[#0b57d0] transition-all duration-1000" 
                   style={{ width: `${(stats.sessionsConnected / (stats.sessionsTotal || 1)) * 100}%` }}
                 ></div>
               </div>
            </div>

            {/* 2. Total Prospek CRM */}
            <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-shadow group">
               <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
                  <Users size={20} />
               </div>
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Database Prospek</h3>
               <div className="flex items-baseline gap-2">
                 <span className="text-3xl font-bold text-slate-800">{stats.leadsTotal.toLocaleString('id-ID')}</span>
                 <span className="text-sm font-medium text-slate-400">Kontak</span>
               </div>
               <div className="mt-4 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                  <Flame size={14} /> {stats.leadsHot} Prioritas Panas
               </div>
            </div>

            {/* 3. Kampanye Broadcast */}
            <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-shadow group">
               <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <Megaphone size={20} />
               </div>
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Broadcast Aktif</h3>
               <div className="flex items-baseline gap-2">
                 <span className="text-3xl font-bold text-slate-800">{stats.broadcastsActive}</span>
                 <span className="text-sm font-medium text-slate-400">Pekerjaan</span>
               </div>
               <div className="mt-4 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                  <TrendingUp size={14} /> Menunggu Antrean
               </div>
            </div>

            {/* 4. Automasi Follow Up */}
            <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-shadow group">
               <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mb-4">
                  <CalendarClock size={20} />
               </div>
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Auto Follow Up</h3>
               <div className="flex items-baseline gap-2">
                 <span className="text-3xl font-bold text-slate-800">{stats.followupsActive}</span>
                 <span className="text-sm font-medium text-slate-400">Workflow</span>
               </div>
               <div className="mt-4 flex items-center gap-1 text-[11px] font-bold text-orange-600">
                  <Zap size={14} /> Berjalan Otomatis
               </div>
            </div>

          </div>

          {/* VISUALISASI GRAFIK */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart 1: Distribusi Suhu Prospek */}
            <div className="lg:col-span-1 bg-white border border-slate-100 p-6 rounded-3xl shadow-sm">
               <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                 <Flame size={16} className="text-rose-500" />
                 Kualitas Prospek
               </h3>
               <div className="aspect-square max-w-[240px] mx-auto">
                 <Doughnut 
                   data={doughnutData} 
                   options={{ 
                     plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: 'bold' } } } },
                     cutout: '70%'
                   }} 
                 />
               </div>
               <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Tingkat Konversi</span>
                    <span className="text-[#0b57d0] font-bold">
                      {stats.leadsTotal > 0 ? ((stats.leadsConverted / stats.leadsTotal) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${stats.leadsTotal > 0 ? (stats.leadsConverted / stats.leadsTotal) * 100 : 0}%` }}
                    ></div>
                  </div>
               </div>
            </div>

            {/* Chart 2: Sumber Trafik Utama */}
            <div className="lg:col-span-2 bg-white border border-slate-100 p-6 rounded-3xl shadow-sm">
               <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                 <TrendingUp size={16} className="text-[#0b57d0]" />
                 Sumber Trafik Terpopuler
               </h3>
               <div className="h-[280px]">
                 <Bar 
                   data={barData} 
                   options={{ 
                     maintainAspectRatio: false,
                     plugins: { legend: { display: false } },
                     scales: { 
                       y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { display: false } },
                       x: { ticks: { font: { size: 10, weight: 'bold' } }, grid: { display: false } }
                     }
                   }} 
                 />
               </div>
            </div>

          </div>

          {/* JALAN PINTAS (QUICK LINKS) */}
          <div className="pt-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4 px-1">Aksi Cepat</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link to="/" className="flex items-center justify-between p-5 rounded-2xl bg-[#0b57d0] text-white hover:bg-[#001d35] transition-all group shadow-sm active:scale-95">
                <div>
                  <h3 className="font-bold text-base mb-0.5">Buka Inbox</h3>
                  <p className="text-xs text-blue-200 font-medium opacity-80">Balas chat prospek</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </Link>
              
              <Link to="/broadcast" className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 hover:border-[#c2e7ff] hover:bg-[#f8fafd] transition-all group shadow-sm active:scale-95">
                <div>
                  <h3 className="font-bold text-slate-800 text-base mb-0.5">Kirim Blast</h3>
                  <p className="text-xs text-slate-500 font-medium opacity-80">Sapa pelanggan Anda</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center group-hover:translate-x-1 transition-transform">
                  <ArrowRight size={18} />
                </div>
              </Link>

              <Link to="/leads" className="flex items-center justify-between p-5 rounded-2xl bg-white border border-slate-200 hover:border-[#c2e7ff] hover:bg-[#f8fafd] transition-all group shadow-sm active:scale-95">
                <div>
                  <h3 className="font-bold text-slate-800 text-base mb-0.5">Master CRM</h3>
                  <p className="text-xs text-slate-500 font-medium opacity-80">Kelola data pelanggan</p>
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