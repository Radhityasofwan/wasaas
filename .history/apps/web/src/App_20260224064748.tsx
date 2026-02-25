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

// =========================================================================
// PENTING UNTUK LOKAL ANDA: 
// 1. HAPUS BLOK MOCK COMPONENT DI BAWAH INI (Baris 29 - 46)
// 2. UNCOMMENT (HAPUS TANDA /* ... */) PADA BLOK IMPORT ASLI ANDA
// =========================================================================

const MockView = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center">
    <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
    <p className="text-slate-500 mt-2">Di lokal Anda, ini akan memuat file asli dari folder ./pages/</p>
  </div>
);

const Login = () => <MockView title="Login" />;
const Sessions = () => <MockView title="Sessions" />;
const Inbox = () => <MockView title="Inbox" />;
const Webhooks = () => <MockView title="Webhooks" />;
const Broadcast = () => <MockView title="Broadcast" />;
const Leads = () => <MockView title="Leads" />;
const ApiKeys = () => <MockView title="ApiKeys" />;
const AutoReply = () => <MockView title="AutoReply" />;
const Admin = () => <MockView title="Admin" />;
const Docs = () => <MockView title="Docs" />;
const Templates = () => <MockView title="Templates" />;
const AutoFollowUp = () => <MockView title="AutoFollowUp" />;

const getApiKey = () => "mock-api-key";
const clearApiKey = () => console.log("Logout diklik");

/* === UNCOMMENT BLOK IMPORT INI DI LOKAL ANDA === 
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
=================================================== */


/**
 * Guard Component: Memastikan pengguna memiliki API Key sebelum mengakses dashboard.
 */
function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Main Shell: Responsive Layout (Mobile-First dengan Bottom Nav & Desktop Sidebar)
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

  // Ambil 4 menu pertama untuk Bottom Navigation di Mobile (agar seperti app native)
  const bottomNavMenu = menu.slice(0, 4); 

  const handleLogout = () => {
    clearApiKey();
    nav("/login");
  };

  return (
    <div className="w-full h-[100dvh] bg-slate-50 font-sans text-slate-800 flex overflow-hidden">
      
      {/* ----------------- DESKTOP SIDEBAR ----------------- */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <MessageSquare size={16} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg tracking-tight">WA SaaS</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
          {menu.map(item => {
            const isActive = loc.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
            className="w-full py-2.5 px-4 flex items-center justify-center gap-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>

      {/* ----------------- MOBILE & DESKTOP WRAPPER ----------------- */}
      <div className="flex-1 flex flex-col h-full relative min-w-0">
        
        {/* Mobile Header */}
        <header className="md:hidden h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white">
              <MessageSquare size={14} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-base tracking-tight">WA SaaS</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
          >
            <Menu size={22} />
          </button>
        </header>

        {/* Mobile Full Screen Menu (Drawer) */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 bg-white z-50 flex flex-col">
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
              <span className="font-bold text-slate-800">Menu</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {menu.map(item => {
                const isActive = loc.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-base font-medium ${
                      isActive ? "bg-blue-50 text-blue-600" : "text-slate-600"
                    }`}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                );
              })}
              <div className="pt-4 mt-4 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="w-full py-3.5 px-4 flex items-center gap-4 rounded-xl text-base font-medium text-rose-600 bg-rose-50"
                >
                  <LogOut size={20} />
                  Keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-8 bg-slate-50 scrollbar-hide">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden absolute bottom-0 w-full h-16 bg-white border-t border-slate-200 flex items-center justify-around px-2 z-20 pb-safe">
          {bottomNavMenu.map(item => {
            const isActive = loc.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  isActive ? "text-blue-600" : "text-slate-500"
                }`}
              >
                {React.cloneElement(item.icon as React.ReactElement, { 
                  size: isActive ? 22 : 20,
                  strokeWidth: isActive ? 2.5 : 2
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
 * BrowserRouter TIDAK disertakan di sini karena sudah ada di main.tsx
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