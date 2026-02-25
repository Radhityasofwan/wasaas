import React, { useMemo } from "react";
import { 
  Link, 
  Navigate, 
  Route, 
  Routes, 
  useNavigate, 
  useLocation 
} from "react-router-dom";
import { 
  MessageCircle, 
  Smartphone, 
  Megaphone, 
  Target, 
  Bot, 
  Key, 
  Zap, 
  Settings, 
  BookOpen, 
  LogOut,
  MessageSquare,
  CalendarClock, // Icon untuk Auto Follow Up
  Layers         // Icon untuk Templates
} from "lucide-react";

import Login from "./pages/Login";
import Sessions from "./pages/Sessions";
import Inbox from "./pages/Inbox";
import Webhooks from "./pages/Webhooks";
import Broadcast from "./pages/Broadcast";
import Leads from "./pages/Leads";
import ApiKeys from "./pages/ApiKeys";
import AutoReply from "./pages/AutoReply";
import Admin from "./pages/Admin";
import Docs from "./pages/Docs";

// Import halaman baru untuk fitur Follow Up dan Templates
import Templates from "./pages/Templates";
import AutoFollowUp from "./pages/AutoFollowUp";

import { clearApiKey, getApiKey } from "./lib/api";

/**
 * Guard Component: Memastikan pengguna memiliki API Key sebelum mengakses dashboard.
 */
function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Main Shell: Wrapper Layout dengan Estetika iOS Liquid Glass.
 */
function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();

  const menu = useMemo(() => [
    { name: "Inbox", path: "/", icon: <MessageCircle size={18} strokeWidth={2.5} /> },
    { name: "Sessions", path: "/sessions", icon: <Smartphone size={18} strokeWidth={2.5} /> },
    { name: "Broadcast", path: "/broadcast", icon: <Megaphone size={18} strokeWidth={2.5} /> },
    // Menu Baru: Auto Follow Up dan Templates
    { name: "Follow Up", path: "/follow-up", icon: <CalendarClock size={18} strokeWidth={2.5} /> },
    { name: "Templates", path: "/templates", icon: <Layers size={18} strokeWidth={2.5} /> },
    // Sisa menu lama
    { name: "Leads", path: "/leads", icon: <Target size={18} strokeWidth={2.5} /> },
    { name: "Auto Reply", path: "/auto-reply", icon: <Bot size={18} strokeWidth={2.5} /> },
    { name: "API Keys", path: "/api-keys", icon: <Key size={18} strokeWidth={2.5} /> },
    { name: "Webhooks", path: "/webhooks", icon: <Zap size={18} strokeWidth={2.5} /> },
    { name: "Admin", path: "/admin", icon: <Settings size={18} strokeWidth={2.5} /> },
    { name: "API Docs", path: "/docs", icon: <BookOpen size={18} strokeWidth={2.5} /> },
  ], []);

  const handleLogout = () => {
    clearApiKey();
    nav("/login");
  };

  return (
    <div className="min-h-screen w-full font-sans text-slate-800 bg-[#f8fafc] relative overflow-hidden flex items-center justify-center p-0 md:p-4 lg:p-6"
         style={{
           backgroundImage: `
             radial-gradient(at 0% 0%, hsla(215,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 0%, hsla(275,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 100%, hsla(335,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 0% 100%, hsla(165,100%,94%,1) 0px, transparent 50%)
           `
         }}>

      {/* Liquid Mesh Background Elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-blue-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[40rem] h-[40rem] bg-indigo-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="relative z-10 flex w-full max-w-[1600px] h-screen md:h-[90vh] lg:h-[94vh] gap-6">

        {/* Sidebar - Frosted Glass Glassmorphism */}
        <aside className="w-[280px] hidden md:flex flex-col rounded-[2.5rem] bg-white/40 border border-white/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(31,38,135,0.04)] overflow-hidden shrink-0 border-t-white/80">
          <div className="p-8 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white rotate-3">
                <MessageSquare size={22} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tighter leading-none italic">
                  WA SaaS
                </h1>
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] ml-0.5">V.2.0 Stable</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-5 py-2 space-y-1.5 scrollbar-hide">
            {menu.map(item => {
              const isActive = loc.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 px-5 py-4 rounded-[1.5rem] text-[13px] font-black transition-all duration-500 outline-none group border ${
                    isActive
                      ? "bg-white/80 text-blue-600 shadow-sm border border-white/50 scale-[1.02]"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/40 border border-transparent"
                  }`}
                >
                  <span className={`transition-transform duration-500 ${isActive ? 'scale-110 rotate-3' : 'group-hover:scale-110'}`}>
                    {item.icon}
                  </span>
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-6">
            <button
              onClick={handleLogout}
              className="w-full py-5 px-6 flex items-center justify-center gap-3 rounded-[1.75rem] text-xs font-black uppercase tracking-widest text-rose-500 bg-rose-50/50 hover:bg-rose-100 border border-rose-100 transition-all duration-500 shadow-sm backdrop-blur-md cursor-pointer active:scale-95"
            >
              <LogOut size={16} strokeWidth={3} />
              Keluar
            </button>
          </div>
        </aside>

        {/* Main Content Pane - Frosted Glass Container */}
        <main className="flex-1 rounded-[3rem] bg-white/40 border border-white/80 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col relative transition-all duration-700 border-t-white/80">
            <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none z-0"></div>
            
            <div className="flex-1 overflow-auto p-6 md:p-10 scrollbar-hide relative z-10">
              {children}
            </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Root Router Configuration
 * BrowserRouter dihilangkan karena biasanya sudah ada di main.tsx
 */
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
              
              {/* Rute Baru untuk Fitur Auto Follow Up & Templates */}
              <Route path="/follow-up" element={<AutoFollowUp />} />
              <Route path="/templates" element={<Templates />} />

              <Route path="/leads" element={<Leads />} />
              <Route path="/auto-reply" element={<AutoReply />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/docs" element={<Docs />} />
            </Routes>
          </Shell>
        </RequireKey>
      } />
    </Routes>
  );
}