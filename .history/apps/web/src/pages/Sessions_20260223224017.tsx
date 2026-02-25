import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * HELPER INTERNAL
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

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

export default function Sessions() {
  const [data, setData] = useState<SessionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [qrModal, setQrModal] = useState<{
    open: boolean;
    sessionKey: string;
    qr: string | null;
    status: string;
  }>({ open: false, sessionKey: "", qr: null, status: "unknown" });

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: true; sessions: SessionRow[] }>("/ui/sessions");
      setData(res.sessions || []);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function start() {
    const sessionKey = newKey.trim();
    if (sessionKey.length < 3) return setErr("Minimal 3 karakter");
    try {
      await apiFetch("/sessions/start", { method: "POST", body: JSON.stringify({ sessionKey }) });
      setNewKey("");
      load();
      openQr(sessionKey);
    } catch (e: any) { setErr(e.message); }
  }

  async function stop(sessionKey: string) {
    try {
      await apiFetch("/sessions/stop", { method: "POST", body: JSON.stringify({ sessionKey }) });
      load();
    } catch (e: any) { setErr(e.message); }
  }

  async function deleteSession(sessionKey: string) {
    if (!window.confirm(`Hapus device "${sessionKey}" secara permanen?`)) return;
    try {
      await apiFetch("/sessions/delete", { method: "POST", body: JSON.stringify({ sessionKey }) });
      load();
    } catch (e: any) { setErr(e.message); }
  }

  async function openQr(sessionKey: string) {
    setQrModal({ open: true, sessionKey, qr: null, status: "loading" });
    try {
      const r = await apiFetch<any>(`/sessions/qr?sessionKey=${encodeURIComponent(sessionKey)}`);
      setQrModal({ open: true, sessionKey, qr: r.qr || null, status: r.status || "unknown" });
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => {
    if (!qrModal.open || !qrModal.sessionKey) return;
    const t = setInterval(async () => {
      try {
        const r = await apiFetch<any>(`/sessions/qr?sessionKey=${encodeURIComponent(qrModal.sessionKey)}`);
        setQrModal(prev => ({ ...prev, qr: r.qr || null, status: r.status || prev.status }));
        if (r.status === "connected") load();
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [qrModal.open]);

  useEffect(() => {
    if (qrModal.qr) {
      QRCode.toDataURL(qrModal.qr, { margin: 2, scale: 8 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
    } else { setQrDataUrl(null); }
  }, [qrModal.qr]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Perangkat</h1>
          <p className="text-slate-500 font-bold mt-1 uppercase text-[10px] tracking-widest opacity-60">Pusat Manajemen Koneksi Multi-Device</p>
        </div>
        <button onClick={load} className="group px-8 py-4 rounded-[1.5rem] bg-white/40 border border-white backdrop-blur-md text-xs font-black text-slate-600 hover:bg-white/80 transition-all duration-500 flex items-center gap-3">
          <svg className={`group-hover:rotate-180 transition-transform duration-700 ${loading ? 'animate-spin' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          Muat Ulang
        </button>
      </div>

      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
        <label className="block text-[10px] font-black text-slate-400 mb-4 ml-2 uppercase tracking-[0.2em]">Tambah Sesi Baru</label>
        <div className="flex flex-col sm:flex-row gap-4">
          <input 
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="ID Perangkat (misal: laptop-admin)"
            className="flex-1 px-8 py-5 rounded-[1.5rem] bg-white/60 border border-white outline-none focus:bg-white focus:ring-8 focus:ring-blue-500/5 transition-all duration-500 font-bold text-slate-700"
          />
          <button 
            onClick={start}
            className="px-10 py-5 rounded-[1.5rem] bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all duration-500"
          >
            Mulai Koneksi
          </button>
        </div>
      </div>

      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/40 text-left">
                <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identitas</th>
                <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status Sesi</th>
                <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Aktivitas Terakhir</th>
                <th className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Manajemen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {data.map(s => (
                <tr key={s.id} className="hover:bg-white/30 transition-colors duration-500">
                  <td className="px-10 py-7">
                    <div className="font-black text-slate-800 tracking-tight">{s.session_key}</div>
                    {s.phone_number && <div className="text-[10px] font-black text-blue-500 mt-2 uppercase tracking-widest">{s.phone_number} {s.label && `(${s.label})`}</div>}
                  </td>
                  <td className="px-10 py-7">
                    <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      s.status === "connected" ? "bg-emerald-100 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-10 py-7 text-xs text-slate-500 font-bold">
                    {new Date(s.updated_at).toLocaleTimeString()}
                  </td>
                  <td className="px-10 py-7 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openQr(s.session_key)} title="Scan QR" className="p-4 rounded-2xl bg-white border border-white text-slate-600 shadow-sm hover:scale-110 active:scale-90 transition-all">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                      </button>
                      <button onClick={() => stop(s.session_key)} title="Hentikan" className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 hover:scale-110 active:scale-90 transition-all">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                      </button>
                      <button onClick={() => deleteSession(s.session_key)} title="Hapus Permanen" className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 hover:scale-110 active:scale-90 transition-all">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {qrModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/40 backdrop-blur-xl">
          <div className="w-full max-w-sm bg-white/90 backdrop-blur-3xl rounded-[3rem] p-10 shadow-2xl border border-white animate-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center mb-10">
               <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Pairing Sesi</h2>
               <button onClick={() => setQrModal(p => ({...p, open: false}))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors font-black">✕</button>
            </div>
            
            <div className="aspect-square bg-white rounded-[2rem] border-4 border-slate-50 flex items-center justify-center p-6 mb-10 shadow-inner">
               {qrDataUrl ? <img src={qrDataUrl} className="w-full h-full" /> : <div className="text-[10px] font-black text-slate-300 animate-pulse tracking-widest uppercase">Sinkronisasi QR...</div>}
            </div>

            <div className="text-center px-6">
              <p className="text-[11px] text-slate-400 font-bold leading-relaxed uppercase tracking-wider">
                Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}