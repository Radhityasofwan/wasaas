import React, { useEffect, useMemo, useState, createContext, useContext, useCallback, useRef } from "react";
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
  CalendarClock, 
  Layers,
  CreditCard,
  Menu,
  AlertTriangle
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

/** =========================================================================
 * GLOBAL CONFIRM MODAL SYSTEM (MD3 AESTHETIC)
 * Sistem konfirmasi pop-up global yang menggantikan window.confirm bawaan.
 * ========================================================================= */

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
};

type ConfirmContextType = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm harus digunakan di dalam ConfirmProvider");
  return context;
};

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: "" });
  const resolveRef = useRef<(value: boolean) => void>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    const defaultOptions = typeof opts === "string" ? { message: opts } : opts;
    setOptions(defaultOptions);
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      // @ts-ignore
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    setIsOpen(false);
    resolveRef.current?.(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    resolveRef.current?.(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
            <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${options.isDanger ? 'text-rose-600' : 'text-slate-800'}`}>
              {options.isDanger && <AlertTriangle size={22} />}
              {options.title || "Konfirmasi"}
            </h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              {options.message}
            </p>
            <div className="flex gap-2 justify-end mt-2">
              <button 
                onClick={handleCancel} 
                className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] transition-colors text-sm"
              >
                {options.cancelText || "Batal"}
              </button>
              <button 
                onClick={handleConfirm} 
                className={`px-5 py-2.5 rounded-full font-bold text-white transition-colors text-sm ${
                  options.isDanger 
                    ? 'bg-rose-600 hover:bg-rose-700' 
                    : 'bg-[#0b57d0] hover:bg-[#001d35]'
                }`}
              >
                {options.confirmText || "Ya, Lanjutkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

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
 * Main Shell: Struktur Clean/Native UI ala Google Material 2026
 */
function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm(); // Contoh penggunaan hook confirm di Shell jika dibutuhkan
  
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  // Memoize definisi menu agar performa tetap ngebut
  const menu = useMemo(() => [
    { group: 'Utama', name: "Inbox", path: "/", icon: <MessageCircle size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Utama', name: "Sessions", path: "/sessions", icon: <Smartphone size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    
    { group: 'Pemasaran & CRM', name: "Broadcast", path: "/broadcast", icon: <Megaphone size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Pemasaran & CRM', name: "Follow Up", path: "/follow-up", icon: <CalendarClock size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Pemasaran & CRM', name: "Templates", path: "/templates", icon: <Layers size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Pemasaran & CRM', name: "Leads", path: "/leads", icon: <Target size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    
    { group: 'Otomatisasi & Integrasi', name: "Auto Reply", path: "/auto-reply", icon: <Bot size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Otomatisasi & Integrasi', name: "API Keys", path: "/api-keys", icon: <Key size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Otomatisasi & Integrasi', name: "Webhooks", path: "/webhooks", icon: <Zap size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Otomatisasi & Integrasi', name: "API Docs", path: "/docs", icon: <BookOpen size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    
    { group: 'Administrator', name: "Admin Panel", path: "/admin", icon: <Settings size={20} strokeWidth={2} />, allowedRoles: ['admin'] },
    { group: 'Administrator', name: "Billing & Plans", path: "/billing", icon: <CreditCard size={20} strokeWidth={2} />, allowedRoles: ['admin'] },
  ], []);

  // Filter & Group menu di-memoize untuk menghindari re-render yang berat
  const groupedMenu = useMemo(() => {
    const visibleMenu = menu.filter(item => role && item.allowedRoles.includes(role));
    return visibleMenu.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {} as Record<string, typeof visibleMenu>);
  }, [menu, role]);

  const handleLogout = async () => {
    const isConfirmed = await confirm({
      title: "Keluar Akun",
      message: "Apakah Anda yakin ingin keluar dari sesi saat ini?",
      confirmText: "Keluar",
      isDanger: true
    });
    
    if (isConfirmed) {
      clearApiKey();
      nav("/login");
    }
  };

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f8fafd] text-slate-500 font-medium">Memverifikasi Sesi...</div>;
  }

  // Komponen Sidebar (Digunakan di Desktop & Drawer HP)
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#f8fafd] safe-area-pb">
      {/* Brand Logo - Menggunakan custom logo URL yang diperbesar */}
      <div className="px-6 py-5 flex items-center gap-2 shrink-0">
        <img 
          src="https://matiklaundry.site/wp-content/uploads/2026/02/logo_wa-saas.png" 
          alt="WA SaaS Logo" 
          className="w-20 h-20 object-contain"
          // Minta browser untuk memprioritaskan muat gambar ini agar tidak ada layout shift
          fetchPriority="high" 
        />
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">WA SaaS</h1>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mt-1 block">
            {role === 'admin' ? 'Superadmin' : 'Workspace'}
          </span>
        </div>
      </div>

      {/* Navigation Links - Google MD3 Style */}
      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6 scrollbar-hide">
        {Object.entries(groupedMenu).map(([groupName, items]) => (
          <div key={groupName}>
            <div className="px-4 mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {groupName}
            </div>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = loc.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-full text-[14px] font-medium transition-colors ${
                      isActive
                        // Warna ala Google Material 3 Active State
                        ? "bg-[#c2e7ff] text-[#001d35]" 
                        : "text-slate-700 hover:bg-slate-200/50 hover:text-slate-900"
                    }`}
                  >
                    <span className={isActive ? "text-[#001d35]" : "text-slate-500"}>
                      {item.icon}
                    </span>
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Profile & Logout - Modern Elevated Card */}
      <div className="p-4 shrink-0">
        <div className="bg-white rounded-2xl p-4 flex flex-col gap-3 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm uppercase">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-slate-600 bg-[#f8fafd] hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            <LogOut size={16} strokeWidth={2} />
            Keluar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden text-slate-800 font-sans">
      
      {/* 1. SIDEBAR DESKTOP */}
      <aside className="hidden md:block w-72 shrink-0 h-full border-r border-slate-100">
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
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#f8fafd] transform transition-transform duration-300 ease-in-out md:hidden shadow-2xl ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* 4. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
        
        {/* Mobile Top Header (Muncul HANYA di HP) */}
        <header className="md:hidden h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 shrink-0 safe-area-pt">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full active:bg-slate-200 transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="font-bold text-slate-800 text-lg flex items-center gap-2.5">
              <img 
                src="https://matiklaundry.site/wp-content/uploads/2026/02/logo_wa-saas.png" 
                alt="Logo" 
                className="w-8 h-8 object-contain"
              />
              WA SaaS
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase">
            {userName.charAt(0)}
          </div>
        </header>

        {/* Dynamic Page Rendering */}
        <main className="flex-1 overflow-auto relative p-4 md:p-6 lg:p-8 scrollbar-hide">
          <div className="max-w-[1400px] mx-auto h-full">
            {/* Guard untuk Halaman Admin */}
            {role !== 'admin' && (loc.pathname === '/admin' || loc.pathname === '/billing') ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
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
    <ConfirmProvider>
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
    </ConfirmProvider>
  );
}