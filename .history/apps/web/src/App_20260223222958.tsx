import React, { useState, useEffect } from "react";
import { 
  Link, 
  Navigate, 
  Route, 
  Routes, 
  useNavigate, 
  useLocation 
} from "react-router-dom";

/**
 * --- MOCK UTILITIES ---
 * Menangani fungsi API agar aplikasi tetap berjalan di lingkungan preview.
 */
const getApiKey = () => localStorage.getItem("WA_KEY") || "mock-key";
const setApiKey = (key) => localStorage.setItem("WA_KEY", key);
const clearApiKey = () => localStorage.removeItem("WA_KEY");

/**
 * --- MOCK COMPONENTS ---
 * Komponen ini berfungsi sebagai pengganti (placeholder) untuk file di folder /pages
 * agar aplikasi tidak blank dan tidak terjadi error "Could not resolve" saat di-preview.
 */
const Login = () => {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="p-8 bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md text-center">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl mx-auto mb-4 flex items-center justify-center text-white font-bold">WA</div>
        <h2 className="text-2xl font-bold mb-6 text-slate-800">Login WA SaaS</h2>
        <button 
          onClick={() => { setApiKey("demo"); nav("/"); }}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 cursor-pointer"
        >
          Masuk Demo
        </button>
      </div>
    </div>
  );
};

const Inbox = () => (
  <div className="animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-4">💬 Pesan Masuk</h2>
    <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm text-slate-400 text-center">
      Belum ada percakapan terbaru.
    </div>
  </div>
);

const Sessions = () => (
  <div className="animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-4">📱 Manajemen Sesi</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">✓</div>
          <div>
            <div className="font-bold text-slate-800">Sesi Utama</div>
            <div className="text-[10px] text-green-500 font-black uppercase tracking-widest">Connected</div>
          </div>
        </div>
        <button className="text-rose-500 text-sm font-bold px-3 py-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">Putuskan</button>
      </div>
    </div>
  </div>
);

const Broadcast = () => (
  <div className="animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-4 text-slate-800">📢 Kampanye Broadcast</h2>
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
        <button className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-sm font-bold shadow-xl hover:bg-slate-800 transition-all cursor-pointer">
            Buat Campaign Baru
        </button>
    </div>
  </div>
);

const Leads = () => (
  <div className="animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-6 text-slate-800">🎯 Leads & Prospek</h2>
    <div className="overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
          <tr>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest">Nama Pelanggan</th>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest">Nomor WhatsApp</th>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="hover:bg-slate-50 transition-colors">
            <td className="p-5 text-sm font-medium">Budi Santoso</td>
            <td className="p-5 text-sm font-mono text-slate-500">628123456789</td>
            <td className="p-5 text-center">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase">Prospect</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const AutoReply = () => {
  const [rules] = useState([
    { id: 1, keyword: "harga", type: "contains", reply: "Harga paket mulai dari Rp50rb/bln." },
    { id: 2, keyword: "halo", type: "exact", reply: "Halo! Ada yang bisa kami bantu?" }
  ]);
  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">🤖 Auto Reply</h2>
        <button className="bg-indigo-600 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all cursor-pointer">
            Tambah Aturan
        </button>
      </div>
      <div className="space-y-4">
        {rules.map(r => (
          <div key={r.id} className="p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex justify-between items-start group hover:border-indigo-200 transition-all">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[9px] font-black uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-500 tracking-tighter">{r.type}</span>
                <span className="font-bold text-slate-800 text-lg">"{r.keyword}"</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">{r.reply}</p>
            </div>
            <button className="text-rose-500 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-rose-50 rounded-xl cursor-pointer">Hapus</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const ApiKeys = () => (
  <div className="animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-4 text-slate-800">🔑 API Keys</h2>
    <div className="p-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Key</span>
          <div className="font-mono text-sm bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-slate-700">live_8a7b...9c2d</div>
      </div>
      <button className="text-rose-500 text-sm font-black uppercase tracking-widest px-6 py-2 hover:bg-rose-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100">Revoke Key</button>
    </div>
  </div>
);

const Webhooks = () => (
  <div className="animate-in fade-in duration-500">
    <h2 className="text-2xl font-bold mb-6 text-slate-800">⚡ Webhooks</h2>
    <div className="p-8 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm max-w-2xl">
      <label className="block text-[10px] font-black uppercase tracking-widest mb-3 text-slate-400">Endpoint URL Receiver</label>
      <input 
        type="url" 
        placeholder="https://your-server.com/webhook" 
        className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50/50 focus:border-indigo-400 mb-6 transition-all"
      />
      <button className="bg-slate-900 text-white w-full md:w-auto px-8 py-3.5 rounded-2xl text-sm font-bold shadow-xl hover:bg-black transition-all cursor-pointer">
          Simpan Konfigurasi
      </button>
    </div>
  </div>
);

const Admin = () => <div className="text-2xl font-bold text-slate-800">⚙️ Dashboard Admin</div>;
const Docs = () => <div className="text-2xl font-bold text-slate-800">📚 Dokumentasi API</div>;

/**
 * --- LAYOUT SYSTEM ---
 */
function RequireKey({ children }: { children: React.ReactNode }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();

  const menuItems = [
    { name: "Inbox", path: "/", icon: "💬" },
    { name: "Sessions", path: "/sessions", icon: "📱" },
    { name: "Broadcast", path: "/broadcast", icon: "📢" },
    { name: "Leads", path: "/leads", icon: "🎯" },
    { name: "Auto Reply", path: "/auto-reply", icon: "🤖" },
    { name: "API Keys", path: "/api-keys", icon: "🔑" },
    { name: "Webhooks", path: "/webhooks", icon: "⚡" },
    { name: "Admin", path: "/admin", icon: "⚙️" },
    { name: "API Docs", path: "/docs", icon: "📚" },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar Berwarna Putih Bersih */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm shrink-0">
        <div className="p-8 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-[11px] shadow-lg shadow-indigo-100">
              WA
            </div>
            <span className="font-black text-xl tracking-tighter text-slate-800">WA SaaS</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = loc.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-4 px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className={`text-xl transition-opacity ${isActive ? "opacity-100" : "opacity-50"}`}>{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-slate-50">
          <button
            onClick={() => { clearApiKey(); nav("/login"); }}
            className="w-full flex items-center justify-center gap-3 py-3.5 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-2xl transition-all cursor-pointer border border-transparent hover:border-rose-100 shadow-sm hover:shadow-rose-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Keluar
          </button>
        </div>
      </aside>

      {/* Area Konten Utama */}
      <main className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * --- MAIN APP ENTRY ---
 * FIX: Menghapus pembungkus <Router> (BrowserRouter/HashRouter) 
 * karena komponen ini sudah berada di dalam Router pada level parent (main.tsx).
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </RequireKey>
        }
      />
    </Routes>
  );
}