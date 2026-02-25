import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * HELPER INTERNAL: Manajemen API Key (Token Akses)
 * Didefinisikan secara lokal agar file ini mandiri (standalone) 
 * dan tidak rentan terhadap error import dari lib/api.ts
 */
const getApiKey = (): string => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("WA_KEY") || "";
  }
  return "";
};

const setApiKey = (key: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("WA_KEY", key);
  }
};

export default function Login() {
  const nav = useNavigate();
  const [key, setKey] = useState(getApiKey());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = () => {
    try {
      setErr(null);
      setLoading(true);
      const cleanKey = key.trim();
      
      if (!cleanKey) {
        throw new Error("API Key tidak boleh kosong.");
      }

      if (!cleanKey.startsWith("live_")) {
        throw new Error("API Key tidak valid (harus diawali dengan 'live_')");
      }
      
      // Simpan kunci di LocalStorage (Akan dibaca oleh App.tsx -> RequireKey)
      setApiKey(cleanKey);
      
      // Memberikan feedback visual singkat sebelum mengalihkan halaman
      setTimeout(() => {
        nav("/");
      }, 600);
      
    } catch (e: any) {
      setErr(e?.message || "Terjadi kesalahan saat masuk");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden bg-[#f8fafc]"
         style={{
           backgroundImage: `
             radial-gradient(at 0% 0%, hsla(215,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 0%, hsla(275,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 100% 100%, hsla(335,100%,94%,1) 0px, transparent 50%),
             radial-gradient(at 0% 100%, hsla(165,100%,94%,1) 0px, transparent 50%)
           `
         }}>
      
      {/* Background Orbs dengan efek Liquid Blur */}
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-blue-400/20 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[40rem] h-[40rem] bg-indigo-400/20 rounded-full mix-blend-multiply blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="w-full max-w-[440px] relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="bg-white/40 backdrop-blur-3xl border border-white/80 rounded-[3rem] p-8 md:p-12 shadow-[0_20px_60px_rgba(31,38,135,0.05)] relative overflow-hidden">
          
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[40px] pointer-events-none"></div>

          <div className="flex flex-col items-center mb-10 text-center relative z-10">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-2xl shadow-blue-500/30 flex items-center justify-center text-white mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-500">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter mb-2 italic">WA SaaS</h1>
            <div className="h-1.5 w-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mb-4"></div>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">
              Selamat datang kembali. Silakan masukkan kunci API Anda untuk masuk ke Dashboard.
            </p>
          </div>

          <div className="space-y-6 relative z-10">
            <div className="relative">
              <label className="block text-[10px] font-black text-slate-400 mb-2 ml-4 uppercase tracking-[0.2em]">API Key Akses</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="live_xxxxxxxxxxxxxxxx"
                disabled={loading}
                className="w-full px-6 py-5 rounded-[2rem] bg-white border border-slate-200 text-slate-700 placeholder-slate-300 focus:bg-white focus:ring-[6px] focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all duration-300 shadow-sm text-sm font-mono"
              />
            </div>

            {err && (
              <div className="bg-rose-50/80 border border-rose-100 text-rose-600 px-6 py-4 rounded-2xl text-[11px] font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-md">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black">!</span>
                {err}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className={`group w-full py-5 rounded-[2rem] text-white font-extrabold text-sm uppercase tracking-widest transition-all duration-500 relative overflow-hidden ${
                loading 
                  ? 'bg-slate-400 cursor-not-allowed scale-95' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-xl shadow-blue-600/20 hover:shadow-blue-600/40 hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Memvalidasi...
                  </div>
                ) : (
                  <>
                    Masuk Dashboard
                    <svg className="group-hover:translate-x-1 transition-transform duration-300" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </>
                )}
              </span>
              {!loading && (
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              )}
            </button>
          </div>

          <div className="mt-10 pt-8 border-t border-slate-200 text-center relative z-10">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
              Lokal / SaaS Mode
            </p>
            <p className="text-[9px] text-slate-400 mt-1 font-medium">
              Sesi login Anda disimpan dengan aman di LocalStorage browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}