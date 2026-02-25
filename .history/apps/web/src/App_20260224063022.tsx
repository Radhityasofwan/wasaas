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
  Menu,
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

/**
 * Guard Component
 */
function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Main Shell: Responsive Layout (Bottom Nav di Mobile, Sidebar di Desktop)
 */
function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menu = useMemo(() => [
    { name: "Inbox", path: "/", icon: <MessageCircle size={20} strokeWidth={2} /> },
    { name: "Sessions", path: "/sessions", icon: <Smartphone size={20} strokeWidth={2} /> },
    { name: "Broadcast", path: "/broadcast", icon: <Megaphone size={20} strokeWidth={2} /> },
    { name: "Follow Up", path: "/follow-up", icon: <CalendarClock size={20} strokeWidth={2} /> },
    { name: "Templates", path: "/templates", icon: <Layers size={20} strokeWidth={2} /> },
    { name: "Leads", path: "/leads", icon: <Target size={20} strokeWidth={2} /> },
    { name: "Auto Reply", path: "/auto-reply", icon: <Bot size={20} strokeWidth={2} /> },
    { name: "API Keys", path: "/api-keys", icon: <Key size={20} strokeWidth={2} /> },
    { name: "Webhooks", path: "/webhooks", icon: <Zap size={20} strokeWidth={2} /> },
    { name: "Admin", path: "/admin", icon: <Settings size={20} strokeWidth={2} /> },
    { name: "API Docs", path: "/docs", icon: <BookOpen size={20} strokeWidth={2} /> },
  ], []);

  // Menu utama untuk bottom navigation di mobile (maks 4 agar rapi ala native app)
  const bottomNavMenu = menu.slice(0, 4); 

  const handleLogout = () => {
    clearApiKey();
    nav("/login");
  };

  return (
    <div className="w-full bg-slate-50 relative overflow-hidden flex justify-center 
                    h-[100dvh] /* Menggunakan 100dvh agar fit di HP */
                    md:p-4 lg:p-6"
    >
      {/* Background Minimalist: Bebas GPU, sangat ringan untuk server dan client */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-slate-50 to-indigo-50/50 pointer-events-none z-0"></div>

      <div className="relative z-10 flex w-full max-w-[1400px] h-full gap-6">

        {/* ----------------- DESKTOP SIDEBAR ----------------- */}
        <aside className="w-[260px] hidden md:flex flex-col rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                <MessageSquare size={20} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 leading-none">WA SaaS</h1>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Workspace</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1 scrollbar-hide">
            {menu.map(item => {
              const isActive = loc.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none ${
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {item.icon}
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="w-full py-3 px-4 flex items-center gap-3 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut size={18} strokeWidth={2} />
              Log Out
            </button>
          </div>
        </aside>

        {/* ----------------- MOBILE HEADER ----------------- */}
        <header className="md:hidden absolute top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <MessageSquare size={16} strokeWidth={2.5} />
              </div>
              <h1 className="text-base font-bold text-slate-800">WA SaaS</h1>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <Menu size={24} />
          </button>
        </header>

        {/* ----------------- MOBILE FULL SCREEN MENU ----------------- */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 bg-white z-50 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4">
              <span className="font-bold text-slate-800">Menu Navigation</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
               {menu.map(item => {
                const isActive = loc.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-medium transition-colors ${
                      isActive ? "bg-blue-50 text-blue-600" : "text-slate-600 bg-slate-50"
                    }`}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="w-full mt-4 py-4 px-4 flex items-center gap-4 rounded-2xl text-base font-medium text-rose-600 bg-rose-50"
              >
                <LogOut size={20} />
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* ----------------- MAIN CONTENT AREA ----------------- */}
        <main className="flex-1 bg-white md:rounded-3xl md:border border-slate-200 shadow-sm overflow-hidden flex flex-col relative w-full
                         pt-16 pb-20 md:pt-0 md:pb-0 /* Spacing untuk header & bottom nav di mobile */"
        >
            <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 scrollbar-hide">
              {children}
            </div>
        </main>

        {/* ----------------- MOBILE BOTTOM NAV ----------------- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around px-2 z-30 pb-safe">
          {bottomNavMenu.map(item => {
            const isActive = loc.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {/* Clone icon untuk memastikan ukurannya pas di mobile */}
                {React.cloneElement(item.icon as React.ReactElement, { 
                  size: isActive ? 22 : 20,
                  className: `transition-all duration-200 ${isActive ? 'scale-110' : ''}`
                })}
                <span className="text-[10px] font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

      </div>
    </div>
  );
}

/**
 * Root Router Configuration
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