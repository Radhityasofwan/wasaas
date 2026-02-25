import { useEffect, useState } from "react";

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

export default function Admin() {
  const [msg, setMsg] = useState("");
  const [tenant, setTenant] = useState<any>(null);
  const [limitSessions, setLimitSessions] = useState("");
  const [limitMessages, setLimitMessages] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await apiFetch<any>("/admin/tenant");
      setTenant(r.tenant);
      setLimitSessions(r.tenant?.limit_sessions ?? "");
      setLimitMessages(r.tenant?.limit_messages_per_day ?? "");
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/admin/tenant/limits", { method: "PUT", body: JSON.stringify({ limit_sessions: Number(limitSessions), limit_messages_per_day: Number(limitMessages) }) });
      setMsg("Limit berhasil disimpan! ✅"); load();
    } catch { setMsg("Gagal menyimpan limit ✖"); } finally { setSaving(false); setTimeout(() => setMsg(""), 3000); }
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Admin</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Konfigurasi Pusat & Pembatasan Tenant</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-10 shadow-sm flex flex-col space-y-8">
           <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Tenant Limits</h2>
              <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-3 py-1 rounded-full border border-blue-200 uppercase tracking-widest italic">{tenant?.slug || "default"}</span>
           </div>
           <div className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Maksimal Sesi Aktif</label>
                 <input type="number" value={limitSessions} onChange={(e) => setLimitSessions(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-white/60 border border-white font-bold outline-none focus:bg-white" placeholder="Unlimit" />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Pesan Harian</label>
                 <input type="number" value={limitMessages} onChange={(e) => setLimitMessages(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-white/60 border border-white font-bold outline-none focus:bg-white" placeholder="Unlimit" />
              </div>
           </div>
           <button onClick={save} disabled={saving} className="w-full py-5 rounded-[2rem] bg-slate-800 text-white font-black text-sm hover:bg-black transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-slate-900/10">
             {saving ? "Menyimpan..." : "Update Pembatasan"}
           </button>
        </div>

        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-10 shadow-sm flex flex-col space-y-8">
           <h2 className="text-xl font-black text-slate-800 tracking-tight">PWA Push Config</h2>
           <p className="text-sm font-medium text-slate-500 leading-relaxed">Aktifkan notifikasi browser supaya tim CS Anda menerima alert real-time meskipun dashboard sedang tidak dibuka.</p>
           <div className="flex-1" />
           <div className="space-y-4">
              <button className="w-full py-5 rounded-[2rem] bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-sm">
                 <span className="w-2 h-2 rounded-full bg-emerald-500" /> Aktifkan Browser Push
              </button>
              <button className="w-full py-5 rounded-[2rem] bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-95">
                 Kirim Tes Notifikasi
              </button>
           </div>
        </div>
      </div>

      {msg && (
        <div className="fixed bottom-10 right-10 p-6 rounded-[2rem] bg-slate-900 text-white font-black text-xs uppercase tracking-widest shadow-2xl animate-in slide-in-from-right-10">
           {msg}
        </div>
      )}
    </div>
  );
}