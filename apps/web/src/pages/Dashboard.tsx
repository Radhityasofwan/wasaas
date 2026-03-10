import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  LayoutDashboard, 
  Smartphone, 
  Target, 
  Flame, 
  Megaphone, 
  Loader2, 
  ArrowRight,
  Activity,
  CheckCircle2,
  TrendingUp,
  Zap,
  Bot,
  Layers,
  Webhook,
  Key,
  MessageSquare
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
  Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

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
  Legend,
  Filler
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
  
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
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
    broadcastSent: 0,
    broadcastFailed: 0,
    followupsActive: 0,
    templatesTotal: 0,
    autoReplyActive: 0,
    webhookUrl: "",
    sourceData: {} as Record<string, number>
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch data dari semua modul secara paralel untuk performa maksimal
        const [sessRes, leadsRes, bcRes, fuRes, arRes, tplRes, whRes] = await Promise.all([
          apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] })),
          apiFetch<any>("leads?limit=100").catch(() => ({ stats: { total: 0, hot: 0, warm: 0, cold: 0, converted: 0 }, data: [] })),
          apiFetch<any>("broadcast/jobs").catch(() => ({ jobs: [] })),
          apiFetch<any>("followup/campaigns").catch(() => ({ data: [] })),
          apiFetch<any>("auto-reply").catch(() => ({ data: [] })),
          apiFetch<any>("templates").catch(() => ({ data: [] })),
          apiFetch<any>("webhooks").catch(() => ({ data: null }))
        ]);

        const sessions = sessRes.sessions || [];
        const jobs = bcRes.jobs || [];
        
        // Pemetaan Sumber Trafik secara Real-time
        const sourceMap: Record<string, number> = {};
        if (Array.isArray(leadsRes.data)) {
           leadsRes.data.forEach((l: any) => {
             const src = l.source?.split('|')[0] || 'Unknown';
             sourceMap[src] = (sourceMap[src] || 0) + 1;
           });
        }

        setStats({
          sessionsTotal: sessions.length,
          sessionsConnected: sessions.filter((s: any) => s.status === 'connected').length,
          leadsTotal: leadsRes.stats?.total || 0,
          leadsHot: leadsRes.stats?.hot || 0,
          leadsWarm: leadsRes.stats?.warm || 0,
          leadsCold: leadsRes.stats?.cold || 0,
          leadsConverted: leadsRes.stats?.converted || 0,
          broadcastsActive: jobs.filter((j: any) => j.status === 'running' || j.status === 'queued').length,
          broadcastSent: jobs.reduce((acc: number, j: any) => acc + (j.sent_count || 0), 0),
          broadcastFailed: jobs.reduce((acc: number, j: any) => acc + (j.failed_count || 0), 0),
          followupsActive: (fuRes.data || []).filter((c: any) => c.status === 'active').length,
          templatesTotal: (tplRes.data || []).length,
          autoReplyActive: (arRes.data || []).filter((r: any) => r.is_active).length,
          webhookUrl: whRes.data?.url || "",
          sourceData: sourceMap
        });

      } catch (error) {
        console.error("Dashboard Sync Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // --- CONFIGURATION CHARTS (Real-time Config) ---
  
  // Jika leadTotal 0, beri warna abu-abu agar chart tidak kosong total (UX friendly)
  const hasLeads = stats.leadsTotal > 0;
  
  const doughnutData = {
    labels: hasLeads ? ['Hot', 'Warm', 'Cold', 'Converted'] : ['Belum Ada Data'],
    datasets: [{
      data: hasLeads ? [stats.leadsHot, stats.leadsWarm, stats.leadsCold, stats.leadsConverted] : [1],
      backgroundColor: hasLeads ? ['#ea4335', '#fbbc04', '#4285f4', '#34a853'] : ['#e2e8f0'],
      borderWidth: 0,
      hoverOffset: hasLeads ? 10 : 0,
    }],
  };

  const hasSources = Object.keys(stats.sourceData).length > 0;
  const barData = {
    labels: hasSources ? Object.keys(stats.sourceData).map(s => s.toUpperCase()) : ['BELUM ADA TRAFIK'],
    datasets: [{
      label: 'Volume Prospek',
      data: hasSources ? Object.values(stats.sourceData) : [0],
      backgroundColor: hasSources ? '#0b57d0' : '#e2e8f0',
      borderRadius: 12,
      barThickness: 32,
    }],
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400 gap-4">
        <Loader2 size={40} className="animate-spin text-[#0b57d0]" />
        <p className="font-bold tracking-widest uppercase text-[10px]">Mengkonsolidasi Data Real-time...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* 1. TOP HEADER SUMMARY */}
      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#f0f4f9] rounded-full blur-3xl pointer-events-none -mt-20 -mr-20 opacity-50"></div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h1 className="text-2xl md:text-4xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              <LayoutDashboard className="text-[#0b57d0]" size={32} />
              Ringkasan Operasional
            </h1>
            <p className="text-sm md:text-base text-slate-500 mt-3 leading-relaxed">
              Pantau seluruh aktivitas <span className="font-bold text-[#0b57d0]">{stats.sessionsConnected} perangkat</span> yang terhubung secara <i>real-time</i>. Sistem mendeteksi <span className="font-bold text-rose-600">{stats.leadsHot} prospek prioritas</span> baru hari ini.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-[#f8fafd] border border-slate-200 px-5 py-2.5 rounded-full w-fit">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
             <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Engine V.2.0 Stable</span>
          </div>
        </div>
      </div>

      {/* 2. CORE METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        
        {/* Device Sync */}
        <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group">
          <div className="w-11 h-11 bg-[#f0f4f9] text-[#0b57d0] rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
            <Smartphone size={22} />
          </div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">WhatsApp Sesi</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{stats.sessionsConnected}</span>
            <span className="text-sm font-medium text-slate-400">/ {stats.sessionsTotal} Aktif</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-[#0b57d0]">
            <CheckCircle2 size={14} /> Terenkripsi End-to-End
          </div>
        </div>

        {/* Lead Power */}
        <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group">
          <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
            <Flame size={22} />
          </div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Hot Leads</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{stats.leadsHot}</span>
            <span className="text-sm font-medium text-slate-400">Prioritas</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <TrendingUp size={14} /> Total Konversi: {stats.leadsConverted}
          </div>
        </div>

        {/* Broadcast Power */}
        <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
            <Megaphone size={22} />
          </div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pesan Terkirim</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{stats.broadcastSent.toLocaleString('id-ID')}</span>
            <span className="text-sm font-medium text-slate-400">Berhasil</span>
          </div>
          <div className="mt-4 text-[10px] font-bold text-slate-500">
            Tingkat Gagal: <span className={stats.broadcastFailed > 0 ? "text-rose-500 font-bold" : ""}>{stats.broadcastSent > 0 ? ((stats.broadcastFailed / stats.broadcastSent) * 100).toFixed(1) : 0}%</span> ({stats.broadcastFailed} pesan)
          </div>
        </div>

        {/* Automation Power */}
        <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all group">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
            <Zap size={22} />
          </div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Layanan Aktif</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">{stats.followupsActive + stats.autoReplyActive}</span>
            <span className="text-sm font-medium text-slate-400">Workflow</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-indigo-600">
            <Bot size={14} /> {stats.autoReplyActive} Aturan Balas Otomatis
          </div>
        </div>

      </div>

      {/* 3. VISUAL ANALYTICS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Doughnut: Lead Distribution */}
        <div className="lg:col-span-1 bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm flex flex-col">
           <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-8 flex items-center gap-2">
             <Target size={18} className="text-[#0b57d0]" />
             Kualitas Prospek
           </h3>
           <div className="flex-1 flex flex-col items-center justify-center min-h-[250px]">
             <div className="w-full max-w-[220px] aspect-square relative">
               <Doughnut 
                 data={doughnutData} 
                 options={{ 
                   cutout: '75%', 
                   plugins: { legend: { display: false }, tooltip: { enabled: hasLeads } } 
                 }} 
               />
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <span className="text-3xl font-black text-slate-800">{stats.leadsTotal}</span>
                 <span className="text-[9px] font-bold text-slate-400 uppercase">Total Data</span>
               </div>
             </div>
             
             {/* Legend Custom */}
             {hasLeads && (
               <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-10 w-full">
                  {['Hot', 'Warm', 'Cold', 'Converted'].map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: doughnutData.datasets[0].backgroundColor[i] }}></div>
                      <span className="text-[11px] font-bold text-slate-600 uppercase">{label}</span>
                    </div>
                  ))}
               </div>
             )}
           </div>
        </div>

        {/* Bar: Source Traffic */}
        <div className="lg:col-span-2 bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm flex flex-col">
           <div className="flex items-center justify-between mb-8">
             <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
               <TrendingUp size={18} className="text-[#0b57d0]" />
               Sumber Trafik Utama
             </h3>
             <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">Update: Real-time</span>
           </div>
           <div className="flex-1 min-h-[300px]">
             <Bar 
               data={barData} 
               options={{ 
                 maintainAspectRatio: false,
                 plugins: { legend: { display: false }, tooltip: { enabled: hasSources } },
                 scales: { 
                   x: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' } } },
                   y: { border: { display: false }, ticks: { font: { size: 10 }, stepSize: 1 } }
                 }
               }} 
             />
           </div>
        </div>

      </div>

      {/* 4. INTEGRATION & QUICK ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Service Status Card */}
        <div className="bg-[#f8fafd] border border-slate-200 p-6 md:p-8 rounded-[2rem] flex flex-col justify-between">
           <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                <Zap size={20} className="text-[#0b57d0]" />
                Konektivitas Layanan
              </h3>
              <div className="space-y-4">
                 <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><Webhook size={14}/></div>
                       <span className="text-xs font-bold text-slate-600">Integrasi Webhook</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${stats.webhookUrl ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                       {stats.webhookUrl ? 'Aktif Terhubung' : 'Belum Terpasang'}
                    </span>
                 </div>
                 <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Key size={14}/></div>
                       <span className="text-xs font-bold text-slate-600">Sistem API Key</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">Ready</span>
                 </div>
              </div>
           </div>
           <Link to="/webhooks" className="mt-6 text-xs font-bold text-[#0b57d0] hover:underline flex items-center gap-1.5">
             Kelola Integrasi Eksternal <ArrowRight size={14} />
           </Link>
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-2 gap-4">
           <Link to="/broadcast" className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm hover:border-[#c2e7ff] hover:bg-[#f0f4f9] transition-all group flex flex-col justify-between">
              <Megaphone size={24} className="text-[#0b57d0] group-hover:scale-110 transition-transform" />
              <div className="mt-4">
                 <span className="text-sm font-bold text-slate-800 block">Broadcast</span>
                 <span className="text-[10px] text-slate-400 font-medium">Kirim pesan massal</span>
              </div>
           </Link>
           <Link to="/templates" className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm hover:border-[#c2e7ff] hover:bg-[#f0f4f9] transition-all group flex flex-col justify-between">
              <Layers size={24} className="text-[#0b57d0] group-hover:scale-110 transition-transform" />
              <div className="mt-4">
                 <span className="text-sm font-bold text-slate-800 block">Templates</span>
                 <span className="text-[10px] text-slate-400 font-medium">{stats.templatesTotal} Pesan Tersimpan</span>
              </div>
           </Link>
           <Link to="/sessions" className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm hover:border-[#c2e7ff] hover:bg-[#f0f4f9] transition-all group flex flex-col justify-between">
              <Smartphone size={24} className="text-[#0b57d0] group-hover:scale-110 transition-transform" />
              <div className="mt-4">
                 <span className="text-sm font-bold text-slate-800 block">Sesi Device</span>
                 <span className="text-[10px] text-slate-400 font-medium">Tautkan HP baru</span>
              </div>
           </Link>
           <Link to="/leads" className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm hover:border-[#c2e7ff] hover:bg-[#f0f4f9] transition-all group flex flex-col justify-between">
              <Target size={24} className="text-[#0b57d0] group-hover:scale-110 transition-transform" />
              <div className="mt-4">
                 <span className="text-sm font-bold text-slate-800 block">Database Leads</span>
                 <span className="text-[10px] text-slate-400 font-medium">Lacak trafik masuk</span>
              </div>
           </Link>
        </div>

      </div>

    </div>
  );
}