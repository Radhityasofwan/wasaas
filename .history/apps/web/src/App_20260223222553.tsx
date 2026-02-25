import React, { useState, useEffect } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";

// --- MOCK LIB/API (Hapus/Ganti dengan import asli di lokal) ---
const getApiKey = () => localStorage.getItem("WA_KEY") || "mock-key";
const setApiKey = (key: string) => localStorage.setItem("WA_KEY", key);
const clearApiKey = () => localStorage.removeItem("WA_KEY");

const apiFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  console.log(`API Call: ${path}`);
  return { ok: true, data: [] } as any;
};

// --- KOMPONEN HALAMAN (MOCK) ---
const Login = () => <div className="p-8 text-center font-semibold">Halaman Login</div>;
const Inbox = () => <div className="p-4 text-xl font-bold">Pesan Masuk</div>;
const Sessions = () => <div className="p-4 text-xl font-bold">Manajemen Sesi</div>;
const Broadcast = () => <div className="p-4 text-xl font-bold">Kampanye Broadcast</div>;
const Leads = () => <div className="p-4 text-xl font-bold">Daftar Leads</div>;
const ApiKeys = () => <div className="p-4 text-xl font-bold">API Keys</div>;
const Webhooks = () => <div className="p-4 text-xl font-bold">Konfigurasi Webhook</div>;
const Admin = () => <div className="p-4 text-xl font-bold">Dashboard Admin</div>;
const Docs = () => <div className="p-4 text-xl font-bold">Dokumentasi API</div>;

// --- HALAMAN AUTO REPLY (VERSI BERSIH) ---
const AutoReply = () => {
  const [rules, setRules] = useState([
    { id: 1, keyword: "ping", match_type: "exact", reply_text: "PONG! Bot Aktif 🤖", is_active: true },
    { id: 2, keyword: "halo", match_type: "contains", reply_text: "Halo! Ada yang bisa kami bantu?", is_active: true }
  ]);

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Bot Auto Reply</h2>
          <p className="text-slate-500 text-sm">Kelola balasan otomatis WhatsApp Anda</p>
        </div>
        <button className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
          + Aturan Baru
        </button>
      </div>

      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-all flex justify-between items-center group">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                  {rule.match_type}
                </span>
                <span className="font-mono font-bold text-slate-700">"{rule.keyword}"</span>
              </div>
              <p className="text-slate-600 text-sm">{rule.reply_text}</p>
            </div>
            <button className="text-rose-500 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">Hapus</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- PROTEKSI ROUTE ---
function RequireKey({ children }: { children: any }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return children;
}

// --- LAYOUT UTAMA (VERSI CLEAN & OPTIMAL) ---
function Shell({ children }: { children: any }) {
  const nav = useNavigate();
  const loc = useLocation();

  const menu = [
    { name: "Inbox", path: "/", icon: "💬" },
    { name: "Sessions", path: "/sessions", icon: "📱" },
    { name: "Broadcast", path: "/broadcast", icon: "📢" },
    { name: "Leads", path: "/leads", icon: "🎯" },
    { name: "Auto Reply", path: "/auto-reply", icon: "🤖" },
    { name: "API Keys", path: "/api-keys", icon: "🔑" },
    { name: "Webhooks", path: "/webhooks", icon: "⚡" },
    { name: "Admin", path: "/admin", icon: "⚙️" },
    { name: "API Docs", path: "/docs", icon: "📚" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row p-0 md:p-4 lg:p-6 gap-4">
      
      {/* Sidebar - Minimalis & Praktis */}
      <aside className="w-full md:w-[260px] flex flex-col bg-white border border-slate-200 rounded-none md:rounded-[1.5rem] shadow-sm overflow-hidden shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-sm">WA</div>
            <h1 className="text-lg font-black tracking-tight text-slate-800">WA SaaS</h1>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {menu.map(item => {
            const isActive = loc.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-slate-100 text-slate-900 shadow-inner"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => { clearApiKey(); nav("/login"); }}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-rose-500 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer"
          >
            Keluar
          </button>
        </div>
      </aside>

      {/* Konten Utama - Fokus pada Konten */}
      <main className="flex-1 bg-white border border-slate-200 rounded-none md:rounded-[1.5rem] shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

// --- APP ENTRY POINT ---
// FIX: Menghapus <Router> karena pembungkus rute sudah ada di level main.tsx/parent
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <RequireKey>
          <Shell>
            <Routes>
              <Route path="/" element={<Inbox />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/auto-reply" element={<AutoReply />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        </RequireKey>
      } />
    </Routes>
  );
}