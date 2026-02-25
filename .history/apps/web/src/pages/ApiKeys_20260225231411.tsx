import React, { useEffect, useState } from "react";
import { Key, Plus, Trash2, XCircle, CheckCircle2, ShieldAlert, Copy } from "lucide-react";

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
  
  // Normalisasi URL untuk konsistensi proxy Vite
  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error("Backend Error (Not JSON):", text);
    throw new Error(`Server Backend mengalami gangguan (Status HTTP ${res.status}).`);
  }

  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

type ApiKey = {
  id: number;
  name: string;
  revoked_at: string | null;
  created_at: string;
};

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>("api-keys");
      setKeys(res.data || []);
    } catch (e: any) { 
      console.error("Gagal load API Keys:", e);
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await apiFetch<any>("api-keys", { method: "POST", body: JSON.stringify({ name: newName }) });
      setNewlyCreatedKey(res.apiKey); 
      setNewName(""); 
      setIsCreating(false); 
      fetchKeys();
    } catch { alert("Gagal membuat kunci API."); }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Cabut akses kunci ini? Kunci yang dicabut tidak bisa digunakan lagi.")) return;
    try { 
      await apiFetch(`api-keys/${id}`, { method: "DELETE" }); 
      fetchKeys(); 
    } catch { alert("Gagal mencabut kunci."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("TINDAKAN BERBAHAYA: Anda yakin ingin menghapus permanen kunci API ini dari Server? Tindakan ini tidak dapat dibatalkan.")) return;
    try { 
      await apiFetch(`api-keys/${id}/permanent`, { method: "DELETE" }); 
      fetchKeys(); 
    } catch { alert("Gagal menghapus kunci."); }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20 rotate-3">
            <Key size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter">Kunci API</h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Akses Integrasi Programatik & Developer</p>
          </div>
        </div>
        
        <button onClick={() => setIsCreating(!isCreating)} className="flex items-center gap-2 px-8 py-4 rounded-[1.5rem] bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">
          {isCreating ? <XCircle size={16}/> : <Plus size={16} strokeWidth={3} />} 
          {isCreating ? "Batal" : "Buat Kunci Baru"}
        </button>
      </div>

      {/* FORM CREATE */}
      {isCreating && (
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-8 shadow-xl shadow-blue-500/5 animate-in slide-in-from-top-4">
           <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4">
              <input 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)} 
                className="flex-1 px-8 py-5 rounded-[1.5rem] bg-white/80 border border-white font-bold text-slate-700 outline-none focus:bg-white focus:ring-[4px] focus:ring-blue-500/10 shadow-sm transition-all" 
                placeholder="Label identitas (misal: Aplikasi Web e-Commerce)" 
                autoFocus 
                required 
              />
              <button type="submit" className="px-10 py-5 rounded-[1.5rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest transition-colors shadow-md">
                Generate Key
              </button>
           </form>
        </div>
      )}

      {/* NEW KEY ALERT */}
      {newlyCreatedKey && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-[2.5rem] p-8 shadow-xl shadow-emerald-500/10 animate-in zoom-in-95">
           <h3 className="text-emerald-700 font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
             <CheckCircle2 size={18}/> Simpan Kunci Anda Sekarang!
           </h3>
           <div className="flex flex-col sm:flex-row gap-3 items-center">
              <code className="flex-1 w-full bg-white px-6 py-5 rounded-2xl border border-emerald-200 font-mono text-sm text-emerald-800 break-all shadow-inner select-all">
                {newlyCreatedKey}
              </code>
              <button 
                onClick={() => { navigator.clipboard.writeText(newlyCreatedKey); alert("Kunci API berhasil disalin ke clipboard!"); }} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <Copy size={16}/> Salin Kunci
              </button>
           </div>
           <p className="mt-4 text-[10px] text-emerald-600 font-bold uppercase tracking-widest flex items-center gap-1.5 bg-emerald-100/50 w-max px-3 py-1.5 rounded-lg">
             <ShieldAlert size={12}/> Peringatan: Kunci ini tidak akan ditampilkan lagi demi alasan keamanan.
           </p>
        </div>
      )}

      {/* TABLE DATA */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/30 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/50">
                <th className="px-8 py-6">Label Akses</th>
                <th className="px-8 py-6">Status Sistem</th>
                <th className="px-8 py-6">Dibuat Pada</th>
                <th className="px-8 py-6 text-right">Aksi Manajerial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {loading ? (
                <tr><td colSpan={4} className="px-10 py-24 text-center text-blue-500 font-black animate-pulse uppercase tracking-[0.3em]">Memuat Data Kunci...</td></tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-10 py-24 text-center">
                    <Key size={48} className="mx-auto text-slate-300 mb-4 opacity-50" />
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em]">Belum Ada Kunci API</p>
                  </td>
                </tr>
              ) : keys.map(k => (
                <tr key={k.id} className="hover:bg-white/60 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="font-black text-slate-800 tracking-tight text-[15px]">{k.name}</div>
                    <div className="font-mono text-[10px] font-bold text-slate-400 mt-1 uppercase">live_************************</div>
                  </td>
                  
                  <td className="px-8 py-6 align-middle">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm border ${k.revoked_at ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                      {k.revoked_at ? <><XCircle size={10}/> Revoked</> : <><CheckCircle2 size={10}/> Active</>}
                    </span>
                  </td>
                  
                  <td className="px-8 py-6 align-middle text-xs font-bold text-slate-500">
                    {new Date(k.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  
                  <td className="px-8 py-6 align-middle text-right">
                    <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      {/* Tombol Cabut (Hanya jika belum direvoke) */}
                      {!k.revoked_at && (
                        <button 
                          onClick={() => handleRevoke(k.id)} 
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100 font-black text-[10px] uppercase tracking-widest transition-all"
                          title="Cabut akses (kunci tidak dapat digunakan, tapi data riwayat tetap ada)"
                        >
                          <XCircle size={14} /> Cabut
                        </button>
                      )}
                      
                      {/* Tombol Hapus Permanen (Bisa dilakukan kapan saja) */}
                      <button 
                        onClick={() => handleDelete(k.id)} 
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 font-black text-[10px] uppercase tracking-widest transition-all"
                        title="Hapus Kunci API secara permanen dari server"
                      >
                        <Trash2 size={14} /> Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}