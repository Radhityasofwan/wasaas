import { useEffect, useState, useMemo } from "react";
import { 
  Smartphone, 
  RefreshCw, 
  Plus, 
  QrCode, 
  Power, 
  PowerOff, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  X, 
  CheckCircle2, 
  Activity 
} from "lucide-react";

import { useConfirm } from "../App";

/**
 * =============================================================================
 * HELPER INTERNAL & API CONFIGURATION
 * =============================================================================
 */

const getApiKey = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("WA_KEY") || "";
  }
  return "";
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  
  if (key) {
    headers.set("x-api-key", key);
  }
  
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  
  try {
    const res = await fetch(url, { ...init, headers });
    
    const contentType = res.headers.get("content-type");
    let data: any;
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = { error: await res.text() };
    }
    
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
  label?: string | null;         
  phone_number?: string | null;  
  status: string;                
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
// MAIN COMPONENT: SESSIONS (NATIVE MD3 AESTHETIC)
// =============================================================================

export default function Sessions() {
  const confirm = useConfirm();

  // --- State Management ---
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
  async function loadDataFromAPI() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<{ ok: true; sessions: SessionRow[] }>("/ui/sessions");
      setData(Array.isArray(res.sessions) ? res.sessions : []);
    } catch (e: any) { 
      setErr(e.message || "Gagal menyinkronkan data dari server"); 
    } finally { 
      setLoading(false); 
    }
  }

  useEffect(() => { 
    loadDataFromAPI(); 
  }, []);

  // --- Session Operation Handlers ---
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

  async function handleDeleteSession(sessionKey: string) {
    const isConfirmed = await confirm({
      title: "Hapus Sesi",
      message: `HAPUS PERMANEN: "${sessionKey}"?\n\nSemua data kredensial akan dihapus secara fisik dari server.`,
      confirmText: "Hapus Permanen",
      isDanger: true
    });
    
    if (!isConfirmed) return;
    
    setErr(null);
    setActionLoading(sessionKey);
    try {
      const res = await apiFetch<any>("/sessions/delete", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey }) 
      });

      if (res.ok) {
        setTimeout(async () => {
          await loadDataFromAPI();
          setActionLoading(null);
        }, 300);
      }
    } catch (e: any) { 
      setErr(`Gagal menghapus: ${e.message}`); 
      setActionLoading(null);
    }
  }

  // --- QR Pairing Logic ---
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

        if (r.status === "connected") {
          clearInterval(pollInterval);
          await loadDataFromAPI();
          setTimeout(() => setQrModal(p => ({ ...p, open: false })), 1500);
        }
      } catch (pollErr) {}
    }, 2500);
    
    return () => clearInterval(pollInterval);
  }, [qrModal.open, qrModal.sessionKey]);

  const qrImageURL = useMemo(() => {
    if (!qrModal.qr) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrModal.qr)}`;
  }, [qrModal.qr]);

  // --- UI Components ---
  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER: Judul & Refresh */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Smartphone className="text-[#0b57d0]" size={28} />
            Perangkat Terhubung
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Kelola sesi koneksi WhatsApp untuk workspace ini.
          </p>
        </div>
        
        <button 
          onClick={loadDataFromAPI} 
          disabled={loading}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-[#f0f4f9] hover:text-[#0b57d0] transition-colors active:scale-95 shadow-sm w-full md:w-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-[#0b57d0]' : ''} />
          {loading ? "Menyinkronkan..." : "Refresh Status"}
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-start gap-3 animate-in zoom-in-95 duration-300">
          <AlertTriangle size={20} className="shrink-0 text-rose-500 mt-0.5" />
          <div className="flex flex-col">
            <span className="font-bold mb-0.5">Kesalahan Sistem</span>
            <span className="opacity-90 leading-relaxed">{err}</span>
          </div>
        </div>
      )}

      {/* CARD: Registrasi Device */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Plus size={18} className="text-[#0b57d0]" />
          Registrasi Device Baru
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStartNewSession()}
            placeholder="Ketik ID Sesi (Contoh: CS-Laptop-01)"
            className="flex-1 px-5 py-3.5 rounded-full bg-[#f0f4f9] border-none outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all font-medium text-slate-800 placeholder-slate-400 text-sm md:text-base"
          />
          <button 
            onClick={handleStartNewSession}
            disabled={loading || !newKey.trim()}
            className="px-8 py-3.5 rounded-full bg-[#0b57d0] text-white font-bold text-sm hover:bg-[#001d35] active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
            Daftarkan Sesi
          </button>
        </div>
      </div>

      {/* LIST: Daftar Perangkat (Native App Feel) */}
      <div className="space-y-4">
        {data.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-3xl border border-slate-100 border-dashed">
            <div className="w-16 h-16 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-400 mb-4">
              <Smartphone size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Belum Ada Perangkat</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Anda belum menautkan perangkat WhatsApp apa pun. Daftarkan ID sesi baru di atas untuk memulai.
            </p>
          </div>
        )}

        {data.map((session) => {
          const isOffline = ["stopped", "disconnected", "logged_out", "error", "created"].includes(session.status);
          const isBusy = actionLoading === session.session_key;
          const isConnected = session.status === "connected";

          return (
            <div 
              key={session.id} 
              className={`bg-white border rounded-3xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-shadow hover:shadow-md ${isConnected ? 'border-[#c2e7ff]' : 'border-slate-100'}`}
            >
              
              {/* Info Kiri */}
              <div className="flex items-center gap-4">
                {/* Icon App Bulat */}
                <div className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full flex items-center justify-center font-bold text-lg md:text-xl transition-colors ${
                  isConnected ? "bg-[#c2e7ff] text-[#001d35]" : "bg-[#f0f4f9] text-slate-500"
                }`}>
                  {session.session_key.charAt(0).toUpperCase()}
                </div>
                
                <div className="flex flex-col min-w-0">
                  <h3 className="font-bold text-slate-800 text-base md:text-lg tracking-tight truncate">
                    {session.session_key}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {/* Badge Nomor HP */}
                    {session.phone_number ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold text-[#0b57d0] bg-[#f0f4f9] border border-[#c2e7ff] uppercase tracking-wider truncate max-w-[150px] md:max-w-none">
                        {session.phone_number} {session.label && `— ${session.label}`}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 italic">
                        Belum ditautkan
                      </span>
                    )}

                    <span className="text-slate-300 hidden sm:inline">•</span>

                    {/* Waktu Update */}
                    <span className="text-[11px] font-medium text-slate-500">
                      {new Date(session.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aksi Kanan */}
              <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 mt-2 md:mt-0 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                
                {/* Status Indicator */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider md:mr-2 ${
                  isConnected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                }`}>
                  {isConnected ? <Activity size={12} className="animate-pulse" /> : <PowerOff size={12} />}
                  {session.status}
                </div>

                {/* Tombol Aksi */}
                <div className="flex items-center gap-1.5 md:gap-2">
                  <button 
                    onClick={() => handleOpenQRModal(session.session_key)} 
                    disabled={isBusy}
                    title="Tampilkan QR"
                    className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-[#f0f4f9] hover:text-[#0b57d0] hover:border-[#c2e7ff] transition-all disabled:opacity-50"
                  >
                    <QrCode size={18} />
                  </button>

                  {isOffline ? (
                    <button 
                      onClick={() => handleReconnectSession(session.session_key)}
                      disabled={isBusy}
                      title="Aktifkan Sesi"
                      className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-all disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStopSession(session.session_key)}
                      disabled={isBusy}
                      title="Hentikan Sesi"
                      className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 transition-all disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 size={18} className="animate-spin" /> : <PowerOff size={18} />}
                    </button>
                  )}

                  <button 
                    onClick={() => handleDeleteSession(session.session_key)} 
                    disabled={isBusy}
                    title="Hapus Permanen"
                    className="w-10 h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 transition-all disabled:opacity-50 ml-1"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER INFO */}
      {data.length > 0 && (
        <div className="text-center px-4">
          <p className="text-[12px] text-slate-400 font-medium">
            Setiap sesi berjalan secara terisolasi. Menghapus sesi akan memaksa *logout* di perangkat WhatsApp tertaut.
          </p>
        </div>
      )}

      {/* MODAL: Pairing QR */}
      {qrModal.open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setQrModal(p => ({...p, open: false}))}
        >
          <div 
            className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-between items-center mb-6">
              <div className="flex flex-col items-start">
                <h2 className="text-lg font-bold text-slate-800">Tautkan Perangkat</h2>
                <span className="text-[10px] font-bold text-[#0b57d0] bg-[#f0f4f9] px-2 py-0.5 rounded uppercase tracking-wider mt-1">
                  ID: {qrModal.sessionKey}
                </span>
              </div>
              <button 
                onClick={() => setQrModal(p => ({...p, open: false}))} 
                className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="w-full aspect-square bg-[#f8fafd] rounded-3xl border border-slate-100 flex items-center justify-center p-4 mb-6 relative">
               {qrImageURL ? (
                 <img src={qrImageURL} className="w-full h-full rounded-2xl animate-in zoom-in duration-300 shadow-sm" alt="WhatsApp QR Code" />
               ) : (
                 <div className="flex flex-col items-center gap-3 text-slate-400">
                   <Loader2 size={32} className="animate-spin text-[#0b57d0]" />
                   <div className="text-xs font-bold uppercase tracking-widest">Menyiapkan Kode...</div>
                 </div>
               )}
            </div>

            <div className="w-full space-y-4">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${
                qrModal.status === "connected" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
              }`}>
                {qrModal.status === "connected" && <CheckCircle2 size={14} />}
                Status: {qrModal.status}
              </div>
              <p className="text-xs text-slate-500 font-medium leading-relaxed px-2">
                Buka WhatsApp di HP Anda &gt; Setelan &gt; <strong className="text-slate-700">Perangkat Tertaut</strong> &gt; Tautkan Perangkat, lalu pindai kode di atas.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}