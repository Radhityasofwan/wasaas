import React, { useMemo, useState, useEffect } from "react";
import { 
  BrowserRouter,
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
  LayoutDashboard,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

/**
 * =============================================================================
 * INTERNAL HELPERS & API SHIM
 * =============================================================================
 * Didefinisikan di sini untuk menghindari error "Could not resolve" di pratinjau.
 */

const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");
const setApiKey = (key: string) => (typeof window !== "undefined" ? localStorage.setItem("WA_KEY", key) : null);
const clearApiKey = () => (typeof window !== "undefined" ? localStorage.removeItem("WA_KEY") : null);

/**
 * =============================================================================
 * PLACEHOLDER COMPONENTS FOR PREVIEW
 * =============================================================================
 * Di proyek nyata, ini akan diimpor dari folder ./pages.
 * Di sini kita definisikan struktur dasarnya agar desain sistem terlihat konsisten.
 */

const PagePlaceholder = ({ title, desc, icon: Icon }: any) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <div className="flex items-center gap-4">
      <div className="p-4 rounded-3xl bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-sm">
        <Icon size={32} strokeWidth={2.5} />
      </div>
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter italic">{title}</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] opacity-80 mt-1">{desc}</p>
      </div>
    </div>
    <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-12 shadow-[0_20px_60px_rgba(31,38,135,0.03)] flex flex-col items-center justify-center min-h-[400px] border-t-white/60">
      <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-6 border border-white">
        <Icon size={32} strokeWidth={2} />
      </div>
      <p className="text-sm font-black text-slate-400 uppercase tracking-widest opacity-40">Modul {title} Sedang Dimuat...</p>
    </div>
  </div>
);

const Inbox = () => <PagePlaceholder title="Inbox" desc="Manajemen Percakapan Real-time" icon={MessageCircle} />;
const Sessions = () => <PagePlaceholder title="Sessions" desc="Manajemen Perangkat Terhubung" icon={Smartphone} />;
const Broadcast = () => <PagePlaceholder title="Broadcast" desc="Kampanye Pesan Massal" icon={Megaphone} />;
const Leads = () => <PagePlaceholder title="Leads" desc="Klasifikasi Prospek & Respon" icon={Target} />;
const AutoReply = () => <PagePlaceholder title="Auto Reply" desc="Bot Balasan Otomatis Berbasis Kata Kunci" icon={Bot} />;
const ApiKeys = () => <PagePlaceholder title="API Keys" desc="Kunci Akses Integrasi Developer" icon={Key} />;
const Webhooks = () => <PagePlaceholder title="Webhooks" desc="Kirim Event Real-time ke Server" icon={Zap} />;
const Admin = () => <PagePlaceholder title="Admin" desc="Konfigurasi Pusat & Limitasi" icon={Settings} />;
const Docs = () => <PagePlaceholder title="API Docs" desc="Panduan Integrasi & Endpoint" icon={BookOpen} />;

/**
 * LOGIN PAGE COMPONENT
 */
const Login = () => {
  const [key, setKeyInput] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim().startsWith("live_")) {
      setApiKey(key.trim());
      nav("/");
    } else {
      setError("API Key tidak valid (harus diawali 'live_')");
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
      <div className="absolute top-[-10%] left-[-5%] w-[30rem] h-[30rem] bg-blue-400/10 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="w-full max-w-[440px] z-10">
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3.5rem] p-12 shadow-[0_30px_80px_rgba(0,0,0,0.05)] border-t-white/80 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-2xl shadow-blue-600/30 flex items-center justify-center text-white mx-auto mb-8 transform rotate-3">
            <MessageSquare size={40} strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter mb-2 italic">WA SaaS</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest opacity-60 mb-10">Admin Dashboard</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative group">
              <input 
                type="password"
                value={key}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="live_xxxxxxxxxxxxxxxx"
                className="w-full px-8 py-6 rounded-[2rem] bg-white/60 border border-white outline-none focus:bg-white focus:ring-[15px] focus:ring-blue-500/5 transition-all duration-500 font-bold text-slate-800 placeholder-slate-300"
              />
            </div>
            {error && <div className="text-rose-500 text-[10px] font-black uppercase tracking-widest animate-bounce">{error}</div>}
            <button type="submit" className="w-full py-6 rounded-[2rem] bg-slate-900 text-white font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all">
              Akses Dashboard
            </button>
          </form>
          <p className="mt-10 text-[9px] text-slate-400 font-black uppercase tracking-[0.3em] opacity-40">Dev Mode V.2.0 Stable</p>
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

      {/* Liquid Mesh Background Elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-blue-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[40rem] h-[40rem] bg-indigo-400/10 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="relative z-10 flex w-full max-w-[1600px] h-full md:h-[90vh] lg:h-[94vh] gap-6">

        {/* SIDEBAR: Frosted Glass iOS Style */}
        <aside className="w-[300px] hidden md:flex flex-col rounded-[3.5rem] bg-white/40 border border-white/60 backdrop-blur-3xl shadow-[0_20px_50px_rgba(31,38,135,0.04)] overflow-hidden shrink-0 transition-all duration-700 border-t-white/80">
          <div className="p-10 pb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-br from-blue-600 to-indigo-600 shadow-xl shadow-blue-500/30 flex items-center justify-center text-white rotate-6 transition-transform hover:rotate-0 duration-500">
                <MessageSquare size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tighter leading-none italic">
                  WA SaaS
                </h1>
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.3em] ml-0.5 opacity-80">Stability v2.0</span>
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
                </Link>
              );
            })}
          </nav>

          <div className="p-8">
            <button
              onClick={handleLogout}
              className="w-full py-5 px-6 flex items-center justify-center gap-3 rounded-[1.75rem] text-[11px] font-black uppercase tracking-[0.2em] text-rose-500 bg-rose-50/50 hover:bg-rose-100 border border-rose-100 transition-all duration-500 shadow-sm backdrop-blur-md cursor-pointer active:scale-95"
            >
              <LogOut size={16} strokeWidth={3} />
              Keluar
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 rounded-[3.5rem] bg-white/40 border border-white/80 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col relative transition-all duration-700 border-t-white/80">
            {/* Top Gloss Detail */}
            <div className="absolute top-0 inset-x-0 h-[300px] bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-0"></div>
            
            <div className="flex-1 overflow-auto p-8 md:p-12 scrollbar-hide relative z-10">
              {children}
            </div>
        </main>

      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-bottom { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

/**
 * ROOT EXPORT
 */
export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}