import { useEffect, useState, useMemo } from "react";

/**
 * =============================================================================
 * HELPER INTERNAL & API CONFIGURATION
 * =============================================================================
 * Didefinisikan secara lokal untuk memastikan stabilitas kompilasi di pratinjau.
 * Menghindari ketergantungan pada file eksternal yang mungkin gagal dimuat.
 */

const getApiKey = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("WA_KEY") || "";
  }
  return "";
};

/**
 * Fungsi fetch global dengan penanganan error dan header autentikasi.
 * Menggunakan pola asinkron yang konsisten dengan standar backend.
 */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  
  if (key) {
    headers.set("x-api-key", key);
  }
  
  // Memastikan Content-Type adalah JSON kecuali jika mengirim FormData
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Normalisasi URL untuk menghindari masalah path relatif
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  
  try {
    const res = await fetch(url, { ...init, headers });
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data?.error || `HTTP Error ${res.status}`);
    }
    
    return data as T;
  } catch (err: any) {
    console.error("API Fetch Error:", err);
    throw err;
  }
}

// =============================================================================
// DATA TYPES & INTERFACES
// =============================================================================

type SessionRow = {
  id: number;
  tenant_id: number;
  session_key: string;
  label?: string | null;         // Nama profil dari WhatsApp (misal: "Matiks")
  phone_number?: string | null;  // Nomor WhatsApp (misal: "628123...")
  status: string;                // connected, disconnected, stopped, dsb.
  created_at: string;
  updated_at: string;
};

interface QRModalState {
  open: boolean;
  sessionKey: string;
  qr: string | null;
  status: string;
}

// =============================================================================
// MAIN COMPONENT: SESSIONS (iOS LIQUID GLASS AESTHETIC)
// =============================================================================

export default function Sessions() {
  // --- State Management: Data & UI ---
  const [data, setData] = useState<SessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const [newKey, setNewKey] = useState("");
  const [qrModal, setQrModal] = useState<QRModalState>({ 
    open: false, 
    sessionKey: "", 
    qr: null, 
    status: "unknown" 
  });

  // --- Data Loading Logic ---
  
  /**
   * Fungsi utama untuk menarik data sesi dari server UI.
   */
  async function loadDataFromAPI() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<{ ok: true; sessions: SessionRow[] }>("/ui/sessions");
      setData(res.sessions || []);
    } catch (e: any) { 
      setErr(e.message || "Gagal menyinkronkan data dari server"); 
    } finally { 
      setLoading(false); 
    }
  }

  /**
   * Menginisialisasi data saat komponen pertama kali dimuat.
   */
  useEffect(() => { 
    loadDataFromAPI(); 
  }, []);

  // --- Session Operation Handlers ---

  /**
   * Memulai pendaftaran perangkat baru.
   */
  async function handleStartNewSession() {
    const cleanKey = newKey.trim();
    if (cleanKey.length < 3) {
      setErr("ID Perangkat terlalu pendek (minimal 3 karakter)");
      return;
    }
    
    setErr(null);
    setLoading(true);
    try {
      await apiFetch("/sessions/start", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey: cleanKey }) 
      });
      setNewKey("");
      await loadDataFromAPI();
      handleOpenQRModal(cleanKey);
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      setLoading(false);
    }
  }

  /**
   * Membangunkan kembali sesi yang sudah terdaftar namun mati.
   */
  async function handleReconnectSession(sessionKey: string) {
    setErr(null);
    setActionLoading(sessionKey);
    try {
      await apiFetch("/sessions/start", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey }) 
      });
      await loadDataFromAPI();
      handleOpenQRModal(sessionKey);
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      setActionLoading(null);
    }
  }

  /**
   * Memutuskan koneksi socket tanpa menghapus data kredensial.
   */
  async function handleStopSession(sessionKey: string) {
    setErr(null);
    setActionLoading(sessionKey);
    try {
      await apiFetch("/sessions/stop", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey }) 
      });
      await loadDataFromAPI();
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      setActionLoading(null);
    }
  }

  /**
   * Menghapus sesi secara total dari database dan storage lokal.
   */
  async function handleDeleteSession(sessionKey: string) {
    const isConfirmed = window.confirm(
      `KONFIRMASI PENGHAPUSAN:\n\nApakah Anda benar-benar ingin menghapus "${sessionKey}"?\nTindakan ini tidak dapat dibatalkan.`
    );
    if (!isConfirmed) return;
    
    setErr(null);
    setActionLoading(sessionKey);
    try {
      await apiFetch("/sessions/delete", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey }) 
      });
      await loadDataFromAPI();
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      setActionLoading(null);
    }
  }

  // --- QR Pairing Logic ---

  /**
   * Membuka tampilan QR Code untuk pairing WhatsApp.
   */
  async function handleOpenQRModal(sessionKey: string) {
    setErr(null);
    setQrModal({ open: true, sessionKey, qr: null, status: "memuat..." });
    try {
      const r = await apiFetch<any>(`/sessions/qr?sessionKey=${encodeURIComponent(sessionKey)}`);
      setQrModal({ 
        open: true, 
        sessionKey, 
        qr: r.qr || null, 
        status: r.status || "menunggu..." 
      });
    } catch (e: any) { 
      setErr(e.message); 
    }
  }

  /**
   * Polling otomatis untuk mendeteksi perubahan status pairing.
   */
  useEffect(() => {
    if (!qrModal.open || !qrModal.sessionKey) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const r = await apiFetch<any>(`/sessions/qr?sessionKey=${encodeURIComponent(qrModal.sessionKey)}`);
        
        setQrModal(prev => ({ 
          ...prev, 
          qr: r.qr || null, 
          status: r.status || prev.status 
        }));

        // Jika terhubung, segarkan data dan tutup modal secara otomatis
        if (r.status === "connected") {
          clearInterval(pollInterval);
          loadDataFromAPI();
          setTimeout(() => setQrModal(p => ({ ...p, open: false })), 1500);
        }
      } catch (pollErr) {
        // Abaikan error polling sementara (biasanya masalah jaringan singkat)
      }
    }, 2500);
    
    return () => clearInterval(pollInterval);
  }, [qrModal.open, qrModal.sessionKey]);

  /**
   * Membuat URL Gambar QR menggunakan API eksternal yang stabil.
   * Ini menggantikan library "qrcode" yang bermasalah di bundler preview.
   */
  const qrImageURL = useMemo(() => {
    if (!qrModal.qr) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrModal.qr)}`;
  }, [qrModal.qr]);

  // --- UI Components ---

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      
      {/* SECTION: Judul Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-3">
          <h1 className="text-6xl font-black text-slate-800 tracking-tighter italic drop-shadow-sm">
            Perangkat
          </h1>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></div>
            <p className="text-slate-400 font-black text-[11px] uppercase tracking-[0.4em] opacity-80">
              Manajemen Sesi Multi-Device
            </p>
          </div>
        </div>
        
        <button 
          onClick={loadDataFromAPI} 
          disabled={loading}
          className="group px-12 py-6 rounded-[2.5rem] bg-white/40 border border-white backdrop-blur-3xl text-[12px] font-black text-slate-600 hover:bg-white/90 hover:scale-105 active:scale-95 transition-all duration-500 shadow-xl shadow-blue-500/5 flex items-center gap-5"
        >
          <svg 
            className={`group-hover:rotate-180 transition-transform duration-1000 ${loading ? 'animate-spin text-blue-500' : ''}`} 
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          >
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          {loading ? "SINKRONISASI..." : "REFRESH DATA"}
        </button>
      </div>

      {/* SECTION: Pesan Galat */}
      {err && (
        <div className="p-8 rounded-[2.5rem] bg-rose-50/70 border border-rose-100 text-rose-600 text-sm font-black flex items-center gap-6 animate-in zoom-in-95 duration-500 shadow-lg shadow-rose-500/5">
          <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center text-xl shadow-lg shadow-rose-300 transform rotate-3">!</div>
          <div className="flex flex-col">
            <span className="uppercase text-[10px] tracking-widest opacity-60 mb-1">Terjadi Kesalahan</span>
            {err}
          </div>
        </div>
      )}

      {/* SECTION: Form Tambah Perangkat (Glass Card) */}
      <div className="group bg-white/40 backdrop-blur-3xl border border-white rounded-[3.5rem] p-12 shadow-[0_25px_80px_rgba(31,38,135,0.05)] hover:shadow-[0_30px_90px_rgba(31,38,135,0.08)] transition-all duration-700 relative overflow-hidden">
        {/* Subtle Liquid Gradient Overlay */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/5 rounded-full blur-[80px] -mr-32 -mt-32"></div>
        
        <label className="block text-[12px] font-black text-slate-400 mb-6 ml-6 uppercase tracking-[0.3em] opacity-80">
          Registrasi Device Baru
        </label>
        
        <div className="flex flex-col sm:flex-row gap-6 relative z-10">
          <div className="relative flex-1">
            <input 
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartNewSession()}
              placeholder="Misal: Marketing-iPhone-01"
              className="w-full px-10 py-7 rounded-[2.5rem] bg-white/70 border border-white/80 outline-none focus:bg-white focus:ring-[20px] focus:ring-blue-500/5 transition-all duration-500 font-bold text-slate-800 placeholder-slate-300 shadow-sm"
            />
            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-200 group-hover:text-blue-200 transition-colors duration-500">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </div>
          </div>
          
          <button 
            onClick={handleStartNewSession}
            disabled={loading}
            className="px-14 py-7 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-sm shadow-2xl shadow-blue-600/30 hover:scale-[1.03] active:scale-95 hover:shadow-blue-600/50 transition-all duration-500 flex items-center justify-center gap-3"
          >
            {loading ? (
               <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : "AKTIFKAN SESI"}
          </button>
        </div>
        
        <p className="mt-8 text-[11px] text-slate-400 font-bold ml-6 uppercase tracking-widest opacity-60 italic">
          Gunakan nama yang mudah dikenali untuk identifikasi API.
        </p>
      </div>

      {/* SECTION: Tabel Daftar Perangkat */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[4rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.03)] border-t-white/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/40 bg-white/10">
                <th className="px-14 py-12 text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Identitas</th>
                <th className="px-14 py-12 text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Status</th>
                <th className="px-14 py-12 text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Aktivitas</th>
                <th className="px-14 py-12 text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] text-right">Opsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {data.map((session) => {
                const isOffline = ["stopped", "disconnected", "logged_out", "error", "created"].includes(session.status);
                const isBusy = actionLoading === session.session_key;

                return (
                  <tr key={session.id} className="group hover:bg-white/50 transition-all duration-500">
                    <td className="px-14 py-10">
                      <div className="flex items-center gap-7">
                        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-2xl border border-white shadow-lg transition-transform duration-700 group-hover:scale-110 group-hover:rotate-2 ${
                          session.status === "connected" ? "bg-emerald-50 text-emerald-500 shadow-emerald-500/5" : "bg-slate-50 text-slate-400"
                        }`}>
                          {session.session_key.charAt(0).toUpperCase()}
                        </div>
                        <div className="space-y-1">
                          <div className="font-black text-slate-800 text-xl tracking-tight leading-none">{session.session_key}</div>
                          {session.phone_number ? (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[10px] font-black text-blue-500 uppercase tracking-widest border border-blue-100">
                                {session.phone_number} {session.label && `— ${session.label}`}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] font-bold text-slate-300 italic uppercase tracking-widest mt-2">
                              Belum Terpairing
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-14 py-10">
                      <div className="flex flex-col gap-3">
                        <div className={`w-max px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm ${
                          session.status === "connected" 
                            ? "bg-emerald-100/40 text-emerald-600 border-emerald-200" 
                            : session.status === "error" || session.status === "logged_out"
                            ? "bg-rose-100/40 text-rose-600 border-rose-200"
                            : "bg-slate-100/40 text-slate-400 border-slate-200"
                        }`}>
                          {session.status}
                        </div>
                        {session.status === "connected" && (
                          <div className="flex items-center gap-2 ml-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Realtime Sync</span>
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-14 py-10">
                      <div className="text-[12px] text-slate-500 font-black tracking-tight">
                        {new Date(session.updated_at).toLocaleDateString('id-ID', { 
                          day: '2-digit', 
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-[11px] text-slate-400 font-bold mt-1.5 uppercase opacity-60 tracking-wider">
                        Jam {new Date(session.updated_at).toLocaleTimeString('id-ID', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </td>
                    
                    <td className="px-14 py-10 text-right">
                      <div className="flex items-center justify-end gap-5">
                        {/* AKSI: Tampilkan QR */}
                        <button 
                          onClick={() => handleOpenQRModal(session.session_key)} 
                          disabled={isBusy}
                          className="p-5 rounded-2xl bg-white border border-white text-slate-500 shadow-sm hover:scale-110 active:scale-90 hover:text-blue-600 transition-all duration-500 group/btn"
                        >
                          <svg className="group-hover/btn:rotate-12 transition-transform" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </button>

                        {/* AKSI: Nyalakan/Matikan Sesi */}
                        {isOffline ? (
                          <button 
                            onClick={() => handleReconnectSession(session.session_key)}
                            disabled={isBusy}
                            className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 hover:scale-110 active:scale-95 shadow-lg shadow-emerald-500/5 transition-all duration-500 group/btn"
                          >
                            {isBusy ? (
                              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg className="fill-current" width="22" height="22" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            )}
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleStopSession(session.session_key)}
                            disabled={isBusy}
                            className="p-5 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 hover:scale-110 active:scale-95 shadow-lg shadow-amber-500/5 transition-all duration-500 group/btn"
                          >
                             {isBusy ? (
                              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><rect x="6" y="4" width="3" height="16"></rect><rect x="15" y="4" width="3" height="16"></rect></svg>
                            )}
                          </button>
                        )}

                        {/* AKSI: Hapus Permanen */}
                        <button 
                          onClick={() => handleDeleteSession(session.session_key)} 
                          disabled={isBusy}
                          className="p-5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 hover:scale-110 active:scale-90 shadow-lg shadow-rose-500/5 transition-all duration-500 group/btn"
                        >
                          <svg className="group-hover/btn:-rotate-12 transition-transform" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {/* STATE: Kosong */}
              {data.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-14 py-32 text-center">
                    <div className="flex flex-col items-center opacity-20 space-y-8">
                      <div className="w-32 h-32 rounded-[3.5rem] bg-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
                      </div>
                      <p className="text-lg font-black text-slate-600 uppercase tracking-[0.5em] leading-relaxed">
                        Database Sesi Kosong
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION: Info Tambahan */}
      <div className="px-14 py-10 bg-white/20 backdrop-blur-sm rounded-[3rem] border border-white/40 text-center">
        <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] opacity-50 leading-loose">
          Tip: Jika status perangkat "Error", coba lakukan Stop lalu jalankan kembali sebelum melakukan pairing ulang.
        </p>
      </div>

      {/* MODAL: QR Pairing (Glassmorphism Detail) */}
      {qrModal.open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/60 backdrop-blur-2xl animate-in fade-in duration-500"
          onClick={() => setQrModal(p => ({...p, open: false}))}
        >
          <div 
            className="w-full max-w-md bg-white/90 backdrop-blur-[60px] rounded-[4.5rem] p-16 shadow-[0_50px_120px_rgba(0,0,0,0.4)] border border-white animate-in zoom-in-95 slide-in-from-top-12 duration-700 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Liquid Decoration Orbs */}
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>

            <div className="flex justify-between items-start mb-14 relative z-10">
               <div className="space-y-2">
                 <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Pairing Sesi</h2>
                 <div className="px-4 py-1 bg-blue-500 text-[10px] font-black text-white uppercase tracking-widest rounded-full w-max shadow-lg shadow-blue-500/20">
                   ID: {qrModal.sessionKey}
                 </div>
               </div>
               <button 
                 onClick={() => setQrModal(p => ({...p, open: false}))} 
                 className="w-14 h-14 rounded-full bg-slate-100/80 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all duration-500 font-black shadow-inner"
               >
                 ✕
               </button>
            </div>
            
            <div className="aspect-square bg-white rounded-[3.5rem] border-[8px] border-slate-50 flex items-center justify-center p-10 mb-14 shadow-2xl relative z-10 transform transition-transform duration-700 hover:scale-105">
               {qrImageURL ? (
                 <img src={qrImageURL} className="w-full h-full rounded-2xl animate-in fade-in duration-1000 select-none pointer-events-none" alt="WhatsApp QR Code" />
               ) : (
                 <div className="flex flex-col items-center gap-6">
                   <div className="w-16 h-16 border-[5px] border-blue-500/20 border-t-blue-600 rounded-full animate-spin"></div>
                   <div className="text-[11px] font-black text-slate-300 tracking-[0.4em] uppercase animate-pulse">Sinkronisasi QR</div>
                 </div>
               )}
            </div>

            <div className="relative z-10 text-center space-y-8">
              <div className={`inline-block px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border transition-colors duration-500 ${
                qrModal.status === "connected" ? "bg-emerald-500 text-white border-emerald-400" : "bg-slate-100 text-slate-500 border-white"
              }`}>
                STATUS: {qrModal.status}
              </div>
              <p className="text-[12px] text-slate-400 font-bold leading-relaxed uppercase tracking-[0.2em] px-4 opacity-80">
                Gunakan menu <span className="text-slate-600">Perangkat Tertaut</span> di WhatsApp untuk memindai.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STYLE OVERRIDES */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        input::placeholder {
          transition: transform 0.3s ease;
        }
        input:focus::placeholder {
          transform: translateX(10px);
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}