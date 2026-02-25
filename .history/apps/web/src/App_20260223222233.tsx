import React, { useState, useEffect } from "react";
// Menggunakan HashRouter atau MemoryRouter untuk kompatibilitas pratinjau jika diperlukan, 
// namun di sini kita asumsikan struktur standar react-router-dom tersedia.
import { HashRouter as Router, Link, Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";

// --- MOCK LIB/API ---
const getApiKey = () => localStorage.getItem("WA_KEY") || "mock-key";
const setApiKey = (key: string) => localStorage.setItem("WA_KEY", key);
const clearApiKey = () => localStorage.removeItem("WA_KEY");

const apiFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  console.log(`Fetching: ${path}`);
  return { ok: true, data: [] } as any;
};

// --- MOCK PAGES (Agar tidak error saat kompilasi pratinjau) ---
const Login = () => <div className="p-8">Halaman Login</div>;
const Sessions = () => <div className="p-8 font-bold text-2xl">Sessions Management</div>;
const Inbox = () => <div className="p-8 font-bold text-2xl">Inbox Messages</div>;
const Webhooks = () => <div className="p-8 font-bold text-2xl">Webhook Settings</div>;
const Broadcast = () => <div className="p-8 font-bold text-2xl">Broadcast Campaign</div>;
const Leads = () => <div className="p-8 font-bold text-2xl">Leads & Prospects</div>;
const ApiKeys = () => <div className="p-8 font-bold text-2xl">API Keys Management</div>;
const Admin = () => <div className="p-8 font-bold text-2xl">Admin Dashboard</div>;
const Docs = () => <div className="p-8 font-bold text-2xl">API Documentation</div>;

// --- AUTO REPLY PAGE IMPLEMENTATION ---
const AutoReply = () => {
  const [rules, setRules] = useState([
    { id: 1, keyword: "ping", match_type: "exact", reply_text: "PONG! Bot Aktif 🤖", is_active: true },
    { id: 2, keyword: "halo", match_type: "contains", reply_text: "Halo! Ada yang bisa kami bantu?", is_active: true }
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Bot Auto Reply</h2>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl shadow-lg shadow-blue-500/30 transition-all font-bold cursor-pointer">
          + Aturan Baru
        </button>
      </div>

      <div className="grid gap-4">
        {rules.map(rule => (
          <div key={rule.id} className="p-6 rounded-[2rem] bg-white/60 border border-white/80 backdrop-blur-xl shadow-sm flex justify-between items-start group hover:scale-[1.01] transition-transform">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest">
                  {rule.match_type}
                </span>
                <code className="text-lg font-bold text-slate-800">"{rule.keyword}"</code>
              </div>
              <p className="text-slate-600 leading-relaxed">{rule.reply_text}</p>
            </div>
            <button className="text-rose-500 font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity p-2">Hapus</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- AUTH GUARD ---
function RequireKey({ children }: { children: any }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return children;
}

// --- MAIN SHELL (Liquid Glass iOS 26 Design) ---
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
    <div className="min-h-screen w-full font-sans text-slate-900 bg-[#f0f4f8] relative overflow-hidden flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8"
         style={{
           backgroundImage: `
             radial-gradient(at 0% 0%, hsla(210,100%,93%,1) 0px, transparent 50%),
             radial-gradient(at 100% 0%, hsla(280,100%,93%,1) 0px, transparent 50%),
             radial-gradient(at 100% 100%, hsla(340,100%,93%,1) 0px, transparent 50%),
             radial-gradient(at 0% 100%, hsla(160,100%,93%,1) 0px, transparent 50%)
           `
         }}>
      
      {/* Background Animated Elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-blue-300/20 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[45rem] h-[45rem] bg-purple-300/20 rounded-full blur-[130px] animate-pulse pointer-events-none"></div>

      {/* Main Glass Container */}
      <div className="relative z-10 w-full max-w-[1400px] h-full lg:h-[90vh] flex flex-col lg:flex-row gap-6">
        
        {/* Sidebar Panel */}
        <aside className="w-full lg:w-[300px] flex flex-col rounded-[2.5rem] bg-white/40 border border-white/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden shrink-0">
          <div className="p-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/30 flex items-center justify-center text-white text-xl">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 tracking-tighter">
                WA SaaS
              </h1>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-2 scrollbar-hide">
            {menu.map(item => {
              const isActive = loc.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 px-5 py-3.5 rounded-[1.5rem] text-sm font-bold transition-all duration-500 ${
                    isActive
                      ? "bg-white shadow-lg shadow-blue-900/5 text-blue-600 scale-[1.02]"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-6">
            <button
              onClick={() => { clearApiKey(); nav("/login"); }}
              className="w-full py-4 rounded-[1.5rem] flex items-center justify-center gap-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-black text-sm transition-all duration-300 border border-rose-500/10 cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Keluar
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 rounded-[3rem] bg-white/60 border border-white/80 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col relative">
          {/* Top Decorative Reflection */}
          <div className="absolute top-0 inset-x-0 h-[100px] bg-gradient-to-b from-white/40 to-transparent pointer-events-none z-0"></div>
          
          <div className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-12 relative z-10 scrollbar-hide">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// --- MAIN APP ---
export default function App() {
  return (
    <Router>
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
                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </RequireKey>
        } />
      </Routes>
    </Router>
  );
}