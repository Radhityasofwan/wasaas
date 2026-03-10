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
  AlertTriangle,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  X
} from "lucide-react";

import Dashboard from "./pages/Dashboard";
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

import { apiFetch, clearApiKey, getApiKey } from "./lib/api";
import logo from "./assets/logo-wasaas.png";
import { enablePush } from "./lib/push";

/** =========================================================================
 * GLOBAL CONFIRM MODAL SYSTEM (MD3 AESTHETIC)
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
const LAST_MENU_PATH_KEY = "wasaas:last-menu-path";
const SIDEBAR_COLLAPSED_KEY = "wasaas:sidebar-collapsed";
const SIDEBAR_SCROLL_KEY = "wasaas:sidebar-scroll-top";
const JUST_LOGGED_IN_KEY = "wasaas:just-logged-in";
const INSTALL_CAPSULE_KEY = "wasaas:show-install-capsule";

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const KNOWN_MENU_PATHS = new Set([
  "/dashboard",
  "/inbox",
  "/sessions",
  "/broadcast",
  "/follow-up",
  "/templates",
  "/leads",
  "/auto-reply",
  "/api-keys",
  "/webhooks",
  "/docs",
  "/admin",
  "/billing",
]);

function getSavedMenuPath() {
  if (typeof window === "undefined") return "/dashboard";
  const saved = String(localStorage.getItem(LAST_MENU_PATH_KEY) || "").trim();
  return KNOWN_MENU_PATHS.has(saved) ? saved : "/dashboard";
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const standaloneIOS = Boolean((window.navigator as any).standalone);
  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  return Boolean(standaloneIOS || standaloneMedia);
}

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
        <div className="ui-overlay z-[9999] animate-in fade-in duration-200">
          <div className="ui-dialog max-w-sm p-6 animate-in zoom-in-95 duration-200">
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
  const confirm = useConfirm();
  
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const [installPromptEvent, setInstallPromptEvent] = useState<DeferredInstallPromptEvent | null>(null);
  const [showInstallCapsule, setShowInstallCapsule] = useState(false);
  const [installingPwa, setInstallingPwa] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    return Notification.permission === "granted";
  });

  const handleSidebarScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    localStorage.setItem(SIDEBAR_SCROLL_KEY, String(e.currentTarget.scrollTop || 0));
  }, []);

  const restoreSidebarScroll = useCallback(() => {
    if (typeof window === "undefined") return;
    const saved = Number(localStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
    if (!Number.isFinite(saved) || saved <= 0) return;
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-sidebar-scroll='1']").forEach((el) => {
        el.scrollTop = saved;
      });
    });
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (evt: Event) => {
      evt.preventDefault();
      setInstallPromptEvent(evt as DeferredInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setShowInstallCapsule(false);
      setInstallPromptEvent(null);
      localStorage.removeItem(INSTALL_CAPSULE_KEY);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

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

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (loadingAuth) return;

    const justLoggedIn = localStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
    if (justLoggedIn) {
      localStorage.removeItem(JUST_LOGGED_IN_KEY);
      if (!enablingPush && "Notification" in window && Notification.permission !== "denied") {
        setEnablingPush(true);
        enablePush()
          .then(() => setPushEnabled(true))
          .catch(() => { })
          .finally(() => setEnablingPush(false));
      }
    }

    const shouldShowInstall = localStorage.getItem(INSTALL_CAPSULE_KEY) === "1";
    if (shouldShowInstall && !isStandaloneDisplay() && installPromptEvent) {
      setShowInstallCapsule(true);
    }
  }, [loadingAuth, installPromptEvent, enablingPush]);

  useEffect(() => {
    if (KNOWN_MENU_PATHS.has(loc.pathname)) {
      localStorage.setItem(LAST_MENU_PATH_KEY, loc.pathname);
    }
  }, [loc.pathname]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed ? "1" : "0");
    restoreSidebarScroll();
  }, [isSidebarCollapsed, restoreSidebarScroll]);

  const menu = useMemo(() => [
    { group: 'Utama', name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },
    { group: 'Utama', name: "Inbox", path: "/inbox", icon: <MessageCircle size={20} strokeWidth={2} />, allowedRoles: ['admin', 'owner', 'member'] },

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

  const groupedMenu = useMemo(() => {
    const visibleMenu = menu.filter(item => role && item.allowedRoles.includes(role));
    return visibleMenu.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {} as Record<string, typeof visibleMenu>);
  }, [menu, role]);

  useEffect(() => {
    if (!loadingAuth) restoreSidebarScroll();
  }, [loadingAuth, restoreSidebarScroll, loc.pathname]);

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

  const dismissInstallCapsule = () => {
    setShowInstallCapsule(false);
    localStorage.removeItem(INSTALL_CAPSULE_KEY);
  };

  const handleInstallPwa = async () => {
    if (!installPromptEvent) return;
    try {
      setInstallingPwa(true);
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        setShowInstallCapsule(false);
        localStorage.removeItem(INSTALL_CAPSULE_KEY);
      }
    } catch {
      // ignore
    } finally {
      setInstallingPwa(false);
      setInstallPromptEvent(null);
    }
  };

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f8fafd] text-slate-500 font-medium">Memverifikasi Sesi...</div>;
  }

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => {
    const collapsed = mobile ? false : isSidebarCollapsed;

    return (
      <div className="flex flex-col h-full bg-[#f8fafd] safe-area-pb">
        <div className={`py-5 flex items-center shrink-0 border-b border-slate-100 ${collapsed ? "px-3 justify-center" : "px-5 justify-between gap-3"}`}>
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} min-w-0`}>
            <img
              src={logo}
              alt="Wasaas Logo"
              className={`${collapsed ? "w-12 h-12" : "w-14 h-14"} object-contain shrink-0`}
              fetchPriority="high"
            />
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">Wasaas</h1>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mt-1 block truncate">
                  {role === "admin" ? "Superadmin" : "Workspace"}
                </span>
              </div>
            )}
          </div>
          {!mobile && !collapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(true)}
              className="ui-btn-ghost !p-2 shrink-0"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          )}
          {!mobile && collapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="ui-btn-ghost !p-2 mt-2"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
        </div>

        <nav
          data-sidebar-scroll="1"
          onScroll={handleSidebarScroll}
          className={`flex-1 overflow-y-auto py-3 space-y-5 scrollbar-hide ${collapsed ? "px-2" : "px-3"}`}
        >
          {Object.entries(groupedMenu).map(([groupName, items]) => (
            <div key={groupName}>
              {!collapsed && (
                <div className="px-3 mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {groupName}
                </div>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = loc.pathname === item.path || (loc.pathname === "/" && item.path === "/");
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={collapsed ? item.name : undefined}
                      className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2.5 rounded-2xl text-[14px] font-medium transition-colors ${
                        isActive
                          ? "bg-[#c2e7ff] text-[#001d35]"
                          : "text-slate-700 hover:bg-slate-200/60 hover:text-slate-900"
                      }`}
                    >
                      <span className={isActive ? "text-[#001d35]" : "text-slate-500"}>{item.icon}</span>
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 shrink-0">
          <div className={`ui-card p-3 flex ${collapsed ? "items-center justify-center" : "flex-col gap-3"}`}>
            {!collapsed && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm uppercase">
                  {userName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
                  <p className="text-xs text-slate-500 truncate capitalize">{role}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className={`ui-btn-ghost ${collapsed ? "!p-2.5" : "w-full"}`}
              title={collapsed ? "Keluar" : undefined}
            >
              <LogOut size={16} strokeWidth={2} />
              {!collapsed && "Keluar"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden text-slate-800">
      {showInstallCapsule && (
        <div className="fixed z-[120] bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 bg-[#001d35] text-white rounded-full px-3 py-2 shadow-2xl border border-white/10 flex items-center gap-2 max-w-[95vw]">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Download size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-tight truncate">Install Wasaas App</div>
            <div className="text-[11px] text-[#c2e7ff] leading-tight truncate">
              {pushEnabled ? "Notifikasi aktif" : "Aktifkan agar akses lebih stabil"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallPwa}
            disabled={installingPwa}
            className="ui-btn !py-1.5 !px-3 !text-xs !font-bold bg-[#0b57d0] text-white hover:bg-[#0a46a9] disabled:opacity-50"
          >
            {installingPwa ? "..." : "Install"}
          </button>
          <button
            type="button"
            onClick={dismissInstallCapsule}
            className="ui-btn-ghost !p-2 !text-white !border-white/20 hover:!bg-white/10"
            aria-label="Tutup notifikasi install"
          >
            <X size={14} />
          </button>
        </div>
      )}
      
      <aside className={`hidden md:block shrink-0 h-full border-r border-slate-100 transition-[width] duration-200 ease-out ${isSidebarCollapsed ? "w-[88px]" : "w-72"}`}>
        <SidebarContent />
      </aside>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/45 z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-[18.5rem] max-w-[88vw] bg-[#f8fafd] transform transition-transform duration-300 ease-out md:hidden shadow-2xl ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent mobile />
      </aside>

      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
        
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
                src={logo} 
                alt="Logo" 
                className="w-9 h-9 object-contain"
              />
              Wasaas
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase">
            {userName.charAt(0)}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative p-4 md:p-6 lg:p-8 scrollbar-hide">
          <div className="max-w-[1400px] mx-auto h-full">
            {role !== 'admin' && (loc.pathname === '/admin' || loc.pathname === '/billing') ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                  <AlertTriangle size={24} className="text-amber-500" />
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
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/" element={<Navigate to={getSavedMenuPath()} replace />} />
                <Route path="/inbox" element={<Inbox />} />
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
