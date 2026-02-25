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
  ChevronRight,
  User
} from "lucide-react";

/**
 * =============================================================================
 * MOCK INTERNAL HELPERS (Untuk Keperluan Pratinjau)
 * =============================================================================
 * Bagian ini menggantikan "./lib/api" agar kode tidak error saat dikompilasi.
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");
const setApiKey = (key: string) => (typeof window !== "undefined" ? localStorage.setItem("WA_KEY", key) : null);
const clearApiKey = () => (typeof window !== "undefined" ? localStorage.removeItem("WA_KEY") : null);

/**
 * =============================================================================
 * PLACEHOLDER COMPONENTS (Untuk Keperluan Pratinjau)
 * =============================================================================
 * Di proyek asli Anda, komponen ini diimpor dari folder ./pages/...
 */
const PageLayout = ({ title, icon: Icon, children }: any) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-sm">
          <Icon size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter italic">{title}</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] opacity-80">Dashboard / {title}</p>
        </div>
      </div>
    </div>
    <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-10 min-h-[400px] shadow-[0_20px_50px_rgba(0,0,0,0.02)] border-t-white/60">
      {children || <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 mt-20">
        <Icon size={48} strokeWidth={1} className="opacity-20" />
        <p className="font-black text-xs uppercase tracking-widest opacity-40">Konten Modul {title} Sedang Disiapkan</p>
      </div>}
    </div>
  </div>
);

const Inbox = () => <PageLayout title="Inbox" icon={MessageCircle} />;
const Sessions = () => <PageLayout title="Sessions" icon={Smartphone} />;
const Broadcast = () => <PageLayout title="Broadcast" icon={Megaphone} />;
const Leads = () => <PageLayout title="Leads" icon={Target} />;
const AutoReply = () => <PageLayout title="Auto Reply" icon={Bot} />;
const ApiKeys = () => <PageLayout title="API Keys" icon={Key} />;
const Webhooks = () => <PageLayout title="Webhooks" icon={Zap} />;
const Admin = () => <PageLayout title="Admin" icon={Settings} />;
const Docs = () => <PageLayout title="API Docs" icon={BookOpen} />;

/**
 * LOGIN COMPONENT
 */
const Login = () => {
  const [key, setKeyInput] = useState("");
  const nav = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim().startsWith("live_")) {
      setApiKey(key.trim());
      nav("/");
    } else {
      alert("Kunci API tidak valid!");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#f8fafc] relative overflow-hidden"
         style={{
           backgroundImage: `
             radial-gradient(at 0% 0%, hsla(215,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 0%, hsla(275,100%,94%,1) 0px, transparent 50%)
           `
         }}>
      <div className="w-full max-w-[420px] z-10">
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3.5rem] p-12 shadow-[0_40px_100px_rgba(31,38,135,0.06)] border-t-white/80">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl shadow-blue-500/30 flex items-center justify-center text-white mx-auto mb-8 rotate-3">
            <MessageSquare size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tighter text-center mb-10 italic">WA SaaS Login</h1>
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="password" 
              value={key} 
              onChange={e => setKeyInput(e.target.value)}
              placeholder="Masukkan live_api_key..."
              className="w-full px-8 py-5 rounded-[2rem] bg-white/60 border border-white outline-none focus:bg-white focus:ring-8 focus:ring-blue-500/5 transition-all font-bold text-slate-700 shadow-inner"
            />
            <button className="w-full py-5 rounded-[2rem] bg-slate-900 text-white font-black text-sm uppercase tracking-widest shadow-2xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all">
              Masuk Dashboard
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/**
 * =============================================================================
 * CORE APPLICATION SHELL
 * =============================================================================
 */

function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();

  const menu = useMemo(() => [
    { name: "Inbox", path: "/", icon: <MessageCircle size={18} strokeWidth={2.5} /> },
    { name: "Sessions", path: "/sessions", icon: <Smartphone size={18} strokeWidth={2.5} /> },
    { name: "Broadcast", path: "/broadcast", icon: <Megaphone size={18} strokeWidth={2.5} /> },
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

      {/* Liquid Mesh Decorations */}
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-blue-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[40rem] h-[40rem] bg-indigo-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="relative z-10 flex w-full max-w-[1600px] h-full md:h-[90vh] lg:h-[94vh] gap-6">

        {/* SIDEBAR: Frosted Glass */}
        <aside className="w-[300px] hidden md:flex flex-col rounded-[3.5rem] bg-white/40 border border-white/60 backdrop-blur-3xl shadow-[0_20px_50px_rgba(31,38,135,0.04)] overflow-hidden shrink-0 border-t-white/80 transition-all duration-700">
          <div className="p-10 pb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-br from-blue-600 to-indigo-600 shadow-xl shadow-blue-500/30 flex items-center justify-center text-white rotate-6 transition-transform hover:rotate-0 duration-500">
                <MessageSquare size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tighter leading-none italic">
                  WA SaaS
                </h1>
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.3em] ml-0.5 opacity-80">Stability V2.0</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-6 py-2 space-y-2 scrollbar-hide">
            {menu.map(item => {
              const isActive = loc.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 px-6 py-4 rounded-[1.75rem] text-[13px] font-black transition-all duration-500 outline-none group border ${
                    isActive
                      ? "bg-white/90 text-blue-600 shadow-lg shadow-blue-500/5 border-white scale-[1.03]"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/50 border-transparent"
                  }`}
                >
                  <span className={`transition-all duration-500 ${isActive ? 'scale-110 rotate-3' : 'group-hover:scale-110'}`}>
                    {item.icon}
                  </span>
                  {item.name}
                  {isActive && <ChevronRight size={14} className="ml-auto opacity-40" />}
                </Link>
              );
            })}
          </nav>

          <div className="p-8">
            <div className="bg-white/30 rounded-3xl p-4 mb-4 flex items-center gap-3 border border-white/40">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm border border-white">
                <User size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter truncate">API OWNER</p>
                <p className="text-[11px] font-black text-slate-700 truncate tracking-tight italic">Tenant #001</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-5 px-6 flex items-center justify-center gap-3 rounded-[1.75rem] text-[11px] font-black uppercase tracking-[0.2em] text-rose-500 bg-rose-50/50 hover:bg-rose-100 border border-rose-100 transition-all duration-500 shadow-sm backdrop-blur-md cursor-pointer active:scale-95"
            >
              <LogOut size={16} strokeWidth={3} />
              Keluar
            </button>
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 rounded-[3.5rem] bg-white/40 border border-white/80 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col relative transition-all duration-700 border-t-white/80">
            <div className="absolute top-0 inset-x-0 h-[300px] bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-0"></div>
            <div className="flex-1 overflow-auto p-8 md:p-12 scrollbar-hide relative z-10">
              {children}
            </div>
        </main>

      </div>
    </div>
  );
}

/**
 * ROOT APP
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