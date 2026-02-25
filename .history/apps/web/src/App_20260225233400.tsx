import React, { useEffect, useMemo, useState } from "react";
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
  CreditCard,
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
import Billing from "./pages/Billing";
import Docs from "./pages/Docs";
import Templates from "./pages/Templates";
import AutoFollowUp from "./pages/AutoFollowUp";

import { clearApiKey, getApiKey } from "./lib/api";

/** HELPER FETCH LOKAL UNTUK APP.TSX */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type")) headers.set("Content-Type", "application/json");
  
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

/** Guard Component */
function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Main Shell: Struktur Clean/Native UI untuk Mobile & Desktop
 */
function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State untuk HP

  useEffect(() => {
    apiFetch<any>("me")
      .then(res => {
        setRole(res.auth?.role || 'owner');
        setUserName(res.auth?.name || 'User');
      })
      .catch(() => {
        clearApiKey();
        nav("/login");
      })
      .finally(() => setLoadingAuth(false));
  }, [nav]);

  // Tutup menu otomatis setiap kali pindah halaman di HP
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [loc.pathname]);

  const menu = useMemo(() => [
    { name: "Inbox", path: "/", icon: <MessageCircle size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Sessions", path: "/sessions", icon: <Smartphone size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Broadcast", path: "/broadcast", icon: <Megaphone size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Follow Up", path: "/follow-up", icon: <CalendarClock size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Templates", path: "/templates", icon: <Layers size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Leads", path: "/leads", icon: <Target size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Auto Reply", path: "/auto-reply", icon: <Bot size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "API Keys", path: "/api-keys", icon: <Key size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Webhooks", path: "/webhooks", icon: <Zap size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "API Docs", path: "/docs", icon: <BookOpen size={18} strokeWidth={2.5} />, allowedRoles: ['admin', 'owner', 'member'] },
    { name: "Admin Panel", path: "/admin", icon: <Settings size={18} strokeWidth={2.5} />, allowedRoles: ['admin'] },
    { name: "Billing & Plans", path: "/billing", icon: <CreditCard size={18} strokeWidth={2.5} />, allowedRoles: ['admin'] },
  ], []);

  const visibleMenu = menu.filter(item => role && item.allowedRoles.includes(role));

  const handleLogout = () => {
    clearApiKey();
    nav("/login");
  };

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 font-medium">Memverifikasi Sesi...</div>;
  }

  // Komponen Sidebar (Digunakan di Desktop & Drawer HP)
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 safe-area-pb">
      {/* Brand Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-slate-100 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
          <MessageSquare size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">WA SaaS</h1>
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
            {role === 'admin' ? 'Superadmin' : 'V.2.0 Stable'}
          </span>
        </div>
      </div>

      {/* User Profile Info */}
      <div className="px-5 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Akun Anda</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{userName}</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
        {visibleMenu.map((item) => {
          const isActive = loc.pathname === item.path;
          const isFirstAdminMenu = item.name === "Admin Panel";
          
          return (
            <React.Fragment key={item.path}>
              {isFirstAdminMenu && (
                <div className="mt-6 mb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Sistem Admin
                </div>
              )}
              <Link
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                  {item.icon}
                </span>
                {item.name}
              </Link>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-slate-100 shrink-0">
        <button
          onClick={handleLogout}
          className="w-full py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
        >
          <LogOut size={16} strokeWidth={2.5} />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-800 font-sans">
      
      {/* 1. SIDEBAR DESKTOP */}
      <aside className="hidden md:block w-64 shrink-0 h-full">
        <SidebarContent />
      </aside>

      {/* 2. OVERLAY MOBILE MENU (Gelap) */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 3. SIDEBAR DRAWER MOBILE */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 ease-in-out md:hidden shadow-2xl ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* 4. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        
        {/* Mobile Top Header (Muncul HANYA di HP) */}
        <header className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 safe-area-pt">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 -ml-1.5 text-slate-600 hover:bg-slate-100 rounded-md active:bg-slate-200 transition-colors"
            >
              <Menu size={22} />
            </button>
            <div className="font-bold text-slate-800 text-base flex items-center gap-2">
              <MessageSquare size={16} className="text-blue-600" />
              WA SaaS
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase shadow-sm">
            {userName.charAt(0)}
          </div>
        </header>

        {/* Dynamic Page Rendering */}
        <main className="flex-1 overflow-auto relative bg-slate-50 p-4 md:p-6 lg:p-8 scrollbar-hide">
          <div className="max-w-[1400px] mx-auto h-full">
            {/* Guard untuk Halaman Admin */}
            {role !== 'admin' && (loc.pathname === '/admin' || loc.pathname === '/billing') ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-slate-200/50 rounded-full flex items-center justify-center mb-4 border border-slate-200">
                  <span className="text-2xl">🔒</span>
                </div>
                <h2 className="text-xl font-bold text-slate-800">Akses Ditolak</h2>
                <p className="text-slate-500 mt-2 text-sm">Anda tidak memiliki izin untuk melihat halaman ini.</p>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Root Router Configuration */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <RequireKey>
          <Shell>
            <Routes>
              {/* Menu Klien */}
              <Route path="/" element={<Inbox />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/follow-up" element={<AutoFollowUp />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/auto-reply" element={<AutoReply />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/docs" element={<Docs />} />

              {/* Menu Admin */}
              <Route path="/admin" element={<Admin />} />
              <Route path="/billing" element={<Billing />} />
            </Routes>
          </Shell>
        </RequireKey>
      } />
    </Routes>
  );
}