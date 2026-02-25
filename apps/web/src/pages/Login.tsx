import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Lock, Mail, Key, Loader2, ArrowRight } from "lucide-react";

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
  const [loginMode, setLoginMode] = useState<'email' | 'apikey'>('email');
  
  // State Form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState(getApiKey());
  
  // State UI
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    try {
      setErr(null);
      setLoading(true);
      
      if (loginMode === 'apikey') {
        // --- LOGIKA LOGIN API KEY ---
        const cleanKey = key.trim();
        if (!cleanKey) throw new Error("API Key tidak boleh kosong.");
        if (!cleanKey.startsWith("live_")) {
          throw new Error("API Key tidak valid (harus diawali dengan 'live_')");
        }
        
        setApiKey(cleanKey);
        setTimeout(() => nav("/"), 600);
        
      } else {
        // --- LOGIKA LOGIN EMAIL & PASSWORD ---
        if (!email || !password) {
          throw new Error("Email dan Password wajib diisi.");
        }

        // Panggil endpoint backend (Catatan: Pastikan endpoint /api/login sudah ada di backend Anda)
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data?.error || "Email atau password salah.");
        }

        // Asumsi backend mengembalikan token dalam properti `apiKey` atau `token`
        const receivedKey = data.apiKey || data.token;
        if (!receivedKey) {
          throw new Error("Respons server tidak memiliki Token / API Key yang valid.");
        }

        setApiKey(receivedKey);
        setTimeout(() => nav("/"), 600);
      }
      
    } catch (e: any) {
      setErr(e?.message || "Terjadi kesalahan saat masuk");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 bg-[#f8fafd] overflow-hidden relative">
      
      {/* Background Shapes (Solid & Ringan) */}
      <div className="absolute top-[-15%] left-[-10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-[#e9eef6] rounded-full mix-blend-multiply opacity-70 pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-[#e9eef6] rounded-full mix-blend-multiply opacity-70 pointer-events-none"></div>

      <div className="w-full max-w-[420px] relative z-10 animate-in fade-in zoom-in-[0.98] duration-500">
        
        {/* Main Card */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-slate-200/50">
          
          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center mb-5 border border-slate-100">
              <img 
                src="https://matiklaundry.site/wp-content/uploads/2026/02/logo_wa-saas.png" 
                alt="Logo" 
                className="w-10 h-10 object-contain"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight mb-2">WA SaaS</h1>
            <p className="text-slate-500 text-sm font-medium">
              Selamat datang kembali. Silakan masuk.
            </p>
          </div>

          {/* Form Area */}
          <div className="space-y-5">
            
            {loginMode === 'email' ? (
              // Form Email & Password
              <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Email Akses</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="nama@perusahaan.com"
                      disabled={loading}
                      className="w-full pl-11 pr-5 py-3.5 rounded-full bg-[#f0f4f9] border-none text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#c2e7ff] outline-none transition-all text-sm font-medium"
                    />
                  </div>
                </div>
                
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Kata Sandi</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      placeholder="••••••••"
                      disabled={loading}
                      className="w-full pl-11 pr-5 py-3.5 rounded-full bg-[#f0f4f9] border-none text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#c2e7ff] outline-none transition-all text-sm font-medium"
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Form API Key
              <div className="relative animate-in fade-in slide-in-from-right-2 duration-300">
                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 ml-1 uppercase tracking-wider">Kunci API</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                    <Key size={18} />
                  </div>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    placeholder="live_xxxxxxxxxxxxxxxx"
                    disabled={loading}
                    className="w-full pl-11 pr-5 py-3.5 rounded-full bg-[#f0f4f9] border-none text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-[#c2e7ff] outline-none transition-all text-sm font-mono"
                  />
                </div>
              </div>
            )}

            {/* Pesan Error */}
            {err && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-2xl text-[11px] font-medium flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5 font-bold">!</div>
                <span className="leading-relaxed">{err}</span>
              </div>
            )}

            {/* Tombol Masuk */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className={`w-full py-3.5 mt-2 rounded-full text-white font-bold text-sm transition-all duration-300 shadow-md flex items-center justify-center gap-2 ${
                loading 
                  ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none' 
                  : 'bg-[#0b57d0] hover:bg-[#001d35] active:scale-95'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Memverifikasi...
                </>
              ) : (
                <>
                  Masuk Dashboard
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>

          {/* Toggle Login Mode */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <button 
              type="button"
              onClick={() => {
                setErr(null);
                setLoginMode(loginMode === 'email' ? 'apikey' : 'email');
              }}
              className="text-xs font-bold text-slate-500 hover:text-[#0b57d0] transition-colors inline-flex items-center gap-1.5"
            >
              {loginMode === 'email' ? (
                <><Key size={14} /> Gunakan Kunci API</>
              ) : (
                <><Mail size={14} /> Gunakan Email & Sandi</>
              )}
            </button>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">
              Akses dienkripsi secara lokal.
            </p>
          </div>
          
        </div>
      </div>
    </div>
  );
}