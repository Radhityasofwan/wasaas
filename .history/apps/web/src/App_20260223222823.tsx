import React, { useState, useEffect } from "react";
import { 
  MemoryRouter as Router, 
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
 * agar tidak terjadi error "Could not resolve".
 */
const Login = () => {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="p-8 bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md text-center">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl mx-auto mb-4 flex items-center justify-center text-white font-bold">WA</div>
        <h2 className="text-2xl font-bold mb-6">Login WA SaaS</h2>
        <button 
          onClick={() => { setApiKey("demo"); nav("/"); }}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
        >
          Masuk Demo
        </button>
      </div>
    </div>
  );
};

const Inbox = () => (
  <div>
    <h2 className="text-2xl font-bold mb-4">💬 Pesan Masuk</h2>
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-slate-500">
      Belum ada pesan masuk untuk ditampilkan.
    </div>
  </div>
);

const Sessions = () => (
  <div>
    <h2 className="text-2xl font-bold mb-4">📱 Manajemen Sesi</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <div className="font-bold">Sesi Utama</div>
          <div className="text-xs text-green-500 font-bold uppercase">Connected</div>
        </div>
        <button className="text-rose-500 text-sm font-bold">Putuskan</button>
      </div>
    </div>
  </div>
);

const Broadcast = () => (
  <div>
    <h2 className="text-2xl font-bold mb-4">📢 Kampanye Broadcast</h2>
    <button className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg">Buat Campaign Baru</button>
  </div>
);

const Leads = () => (
  <div>
    <h2 className="text-2xl font-bold mb-4">🎯 Leads & Prospek</h2>
    <div className="overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Nama</th>
            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Nomor WA</th>
            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="p-4 text-sm">Budi Santoso</td>
            <td className="p-4 text-sm font-mono">628123456789</td>
            <td className="p-4"><span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-bold">New</span></td>
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">🤖 Auto Reply</h2>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">Tambah Aturan</button>
      </div>
      <div className="space-y-3">
        {rules.map(r => (
          <div key={r.id} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex justify-between items-start group">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{r.type}</span>
                <span className="font-bold text-slate-800">"{r.keyword}"</span>
              </div>
              <p className="text-sm text-slate-600">{r.reply}</p>
            </div>
            <button className="text-rose-500 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">Hapus</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const ApiKeys = () => (
  <div>
    <h2 className="text-2xl font-bold mb-4">🔑 API Keys</h2>
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
      <div className="font-mono text-sm bg-slate-50 p-2 rounded border border-slate-200">live_8a7b...9c2d</div>
      <button className="text-rose-500 text-sm font-bold">Revoke</button>
    </div>
  </div>
);

const Webhooks = () => (
  <div>
    <h2 className="text-2xl font-bold mb-4">⚡ Webhooks</h2>
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-2xl">
      <label className="block text-sm font-bold mb-2 text-slate-700">Endpoint URL</label>
      <input 
        type="url" 
        placeholder="https://your-server.com/webhook" 
        className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
      />
      <button className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold">Simpan Konfigurasi</button>
    </div>
  </div>
);

const Admin = () => <div className="text-2xl font-bold">⚙️ Dashboard Admin</div>;
const Docs = () => <div className="text-2xl font-bold">📚 Dokumentasi API</div>;

/**
 * --- LAYOUT SYSTEM ---
 */
function RequireKey({ children }) {
  const key = getApiKey();
  if (!key) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }) {
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
        <div className="p-6 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-[10px]">
              WA
            </div>
            <span className="font-black text-lg tracking-tighter text-slate-800">WA SaaS</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = loc.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-lg opacity-80">{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => { clearApiKey(); nav("/login"); }}
            className="w-full flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-100"
          >
            Keluar
          </button>
        </div>
      </aside>

      {/* Area Konten Utama */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * --- MAIN APP ENTRY ---
 * Menggunakan satu Router tunggal dan inlining semua rute untuk stabilitas.
 */
export default function App() {
  return (
    <Router>
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
    </Router>
  );
}