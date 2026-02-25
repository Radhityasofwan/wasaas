import React, { useMemo, useState } from "react";
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
  CalendarClock,
  Layers,
  Menu, // Icon untuk menu mobile
  X
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

import Templates from "./pages/Templates";
import AutoFollowUp from "./pages/AutoFollowUp";

import { clearApiKey, getApiKey } from "./lib/api";

function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Daftar menu lengkap
  const menu = useMemo(() => [
    { name: "Inbox", path: "/", icon: <MessageCircle size={20} strokeWidth={2.5} /> },
    { name: "Sessions", path: "/sessions", icon: <Smartphone size={20} strokeWidth={2.5} /> },
    { name: "Broadcast", path: "/broadcast", icon: <Megaphone size={20} strokeWidth={2.5} /> },
    { name: "Follow Up", path: "/follow-up", icon: <CalendarClock size={20} strokeWidth={2.5} /> },
    { name: "Templates", path: "/templates", icon: <Layers size={20} strokeWidth={2.5} /> },
    { name: "Leads", path: "/leads", icon: <Target size={20} strokeWidth={2.5} /> },
    { name: "Auto Reply", path: "/auto-reply", icon: <Bot size={20} strokeWidth={2.5} /> },
    { name: "API Keys", path: "/api-keys", icon: <Key size={20} strokeWidth={2.5} /> },
    { name: "Webhooks", path: "/webhooks", icon: <Zap size={20} strokeWidth={2.5} /> },
    { name: "Admin", path: "/admin", icon: <Settings size={20} strokeWidth={2.5} /> },
    { name: "API Docs", path: "/docs", icon: <BookOpen size={20} strokeWidth={2.5} /> },
  ], []);

  // Menu utama untuk ditampilkan di Bottom Nav (Mobile)
  const bottomNavItems = menu.slice(0, 4);

  const handleLogout = () => {
    clearApiKey();
    nav("/login");
  };

  return (
    <div className="min-h-[100dvh] w-full font-sans text-slate-800 bg-[#f8fafc] relative overflow-hidden flex items-center justify-center p-0 md:p-4 lg:p-6"
         style={{
           backgroundImage: `
             radial-gradient(at 0% 0%, hsla(215,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 0%, hsla(275,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 100%, hsla(335,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 0% 100%, hsla(165,100%,94%,1) 0px, transparent 50%)
           `
         }}>

      {/* Liquid Mesh Background Elements (Desktop only for performance) */}
      <div className="hidden md:block absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-blue-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="hidden md:block absolute bottom-[-10%] right-[-5%] w-[40rem] h-[40rem] bg-indigo-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

      {/* Main App Container: 100dvh di HP, rounded di Desktop */}
      <div className="relative z-10 flex w-full h-[100dvh] md:h-screen md:max-h-[90vh] lg:max-h-[94vh] max-w-[1600px] md:gap-6">

        {/* SIDEBAR DESKTOP - Hidden di Mobile */}
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
                  className={`flex items-center gap-4 px-5 py-3.5 rounded-[1.5rem] text-[14px] font-bold transition-all duration-300 outline-none group border ${
                    isActive
                      ? "bg-white/90 text-blue-600 shadow-sm border-white/50 scale-[1.02]"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/40 border-transparent"
                  }`}
                >
                  <span className={`transition-transform duration-300 ${isActive ? 'scale-110 rotate-3' : 'group-hover:scale-110'}`}>
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
              className="w-full py-4 px-6 flex items-center justify-center gap-3 rounded-2xl text-xs font-black uppercase tracking-widest text-rose-500 bg-rose-50 hover:bg-rose-100 transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <LogOut size={16} strokeWidth={3} />
              Keluar
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT PANE */}
        <main className="flex-1 md:rounded-[3rem] bg-white md:bg-white/40 md:border md:border-white/80 md:backdrop-blur-3xl md:shadow-[0_20px_60px_rgba(0,0,0,0.03)] flex flex-col relative transition-all duration-300 overflow-hidden pb-[70px] md:pb-0">
            <div className="hidden md:block absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-0"></div>
            
            <div className="flex-1 overflow-hidden relative z-10 w-full">
              {children}
            </div>
        </main>

        {/* BOTTOM NAVIGATION MOBILE (Native App Feel) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe pt-2 px-6 flex items-center justify-between z-50 h-[70px]">
           {bottomNavItems.map(item => {
             const isActive = loc.pathname === item.path;
             return (
               <Link 
                 key={item.path} 
                 to={item.path}
                 className={`flex flex-col items-center justify-center gap-1 min-w-[60px] transition-all duration-200 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
               >
                 <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-blue-50' : 'bg-transparent'}`}>
                    {item.icon}
                 </div>
                 <span className={`text-[10px] font-bold ${isActive ? 'font-black' : 'font-semibold'}`}>{item.name}</span>
               </Link>
             )
           })}
           
           {/* Mobile Menu Trigger */}
           <button 
             onClick={() => setMobileMenuOpen(true)}
             className="flex flex-col items-center justify-center gap-1 min-w-[60px] text-slate-400 hover:text-slate-800"
           >
              <div className="p-1.5 rounded-xl bg-transparent">
                 <Menu size={20} strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-semibold">Lainnya</span>
           </button>
        </nav>

        {/* MOBILE DRAWER / OFF-CANVAS MENU */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[100] flex justify-end">
            {/* Overlay */}
            <div 
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200" 
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Drawer Content */}
            <div className="relative w-[280px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 flex items-center justify-between border-b border-slate-100">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                     <MessageSquare size={16} strokeWidth={2.5} />
                   </div>
                   <h2 className="text-lg font-black text-slate-800 tracking-tight">Menu</h2>
                 </div>
                 <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500">
                   <X size={18} />
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1">
                {menu.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-[14px] font-bold transition-colors ${
                      loc.pathname === item.path ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {item.icon} {item.name}
                  </Link>
                ))}
              </div>

              <div className="p-6 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs bg-rose-50 text-rose-500 flex items-center justify-center gap-2"
                >
                  <LogOut size={16} /> Keluar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

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