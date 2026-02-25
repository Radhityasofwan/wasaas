import { Link, Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Sessions from "./pages/Sessions";
import Inbox from "./pages/Inbox";
import Webhooks from "./pages/Webhooks";
import Broadcast from "./pages/Broadcast";
import Leads from "./pages/Leads";
import ApiKeys from "./pages/ApiKeys";
import AutoReply from "./pages/AutoReply"; // IMPORT HALAMAN BARU
import Admin from "./pages/Admin";
import Docs from "./pages/Docs";
import { clearApiKey, getApiKey } from "./lib/api";

function RequireKey({ children }: { children: any }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }: { children: any }) {
  const nav = useNavigate();
  const loc = useLocation();

  const menu = [
    { name: "Inbox", path: "/", icon: "💬" },
    { name: "Sessions", path: "/sessions", icon: "📱" },
    { name: "Broadcast", path: "/broadcast", icon: "📢" },
    { name: "Leads", path: "/leads", icon: "🎯" },
    { name: "Auto Reply", path: "/auto-reply", icon: "🤖" }, // MENU BARU
    { name: "API Keys", path: "/api-keys", icon: "🔑" },
    { name: "Webhooks", path: "/webhooks", icon: "⚡" },
    { name: "Admin", path: "/admin", icon: "⚙️" },
    { name: "API Docs", path: "/docs", icon: "📚" },
  ];

  // Liquid Glass iOS Aesthetic Wrapper
  return (
    <div className="min-h-screen w-full font-sans text-slate-800 bg-[#f4f7fb] relative overflow-hidden"
         style={{
           // Soft liquid mesh background (iOS modern bright aesthetic)
           backgroundImage: `
             radial-gradient(at 0% 0%, hsla(215,100%,92%,1) 0px, transparent 50%),
             radial-gradient(at 100% 0%, hsla(275,100%,92%,1) 0px, transparent 50%),
             radial-gradient(at 100% 100%, hsla(335,100%,92%,1) 0px, transparent 50%),
             radial-gradient(at 0% 100%, hsla(165,100%,92%,1) 0px, transparent 50%)
           `
         }}>

      {/* Abstract Blur Orbs for Liquid effect behind the glass */}
      <div className="absolute top-[-15%] left-[-5%] w-[30rem] h-[30rem] bg-blue-400/30 rounded-full mix-blend-multiply blur-[100px] pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-10%] w-[35rem] h-[35rem] bg-purple-400/20 rounded-full mix-blend-multiply blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[30rem] h-[30rem] bg-teal-300/20 rounded-full mix-blend-multiply blur-[100px] pointer-events-none"></div>

      <div className="relative z-10 flex h-screen p-4 md:p-6 gap-6">

        {/* Sidebar - Frosted Glass Panel */}
        <aside className="w-[280px] flex flex-col rounded-[2rem] bg-white/40 border border-white/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.06)] overflow-hidden">
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white">
                {/* WA Icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 tracking-tight">
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 outline-none ${
                    isActive
                      ? "bg-white/80 text-blue-700 shadow-sm border border-white/50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent"
                  }`}
                >
                  <span className="text-lg opacity-90">{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-5">
            <button
              onClick={() => { clearApiKey(); nav("/login"); }}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 rounded-2xl text-sm font-bold text-rose-500 bg-white/40 hover:bg-rose-50 border border-white/50 hover:border-rose-200 transition-all duration-300 shadow-sm backdrop-blur-md outline-none cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Keluar
            </button>
          </div>
        </aside>

        {/* Main Content Pane - Frosted Glass Container */}
        <main className="flex-1 rounded-[2.5rem] bg-white/50 border border-white/60 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] overflow-hidden flex flex-col relative">
            {/* Top Light Reflection Edge (Liquid details) */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-80 z-20 pointer-events-none"></div>
            
            <div className="flex-1 overflow-auto p-4 md:p-8 scrollbar-hide relative z-10">
              {children}
            </div>
        </main>

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
              <Route path="/leads" element={<Leads />} />
              <Route path="/auto-reply" element={<AutoReply />} /> {/* ROUTE BARU */}
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