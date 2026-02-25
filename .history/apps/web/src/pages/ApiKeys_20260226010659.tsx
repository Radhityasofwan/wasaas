import React, { useEffect, useState } from "react";
import { Key, Plus, Trash2, XCircle, CheckCircle2, ShieldAlert, Copy, Loader2, X } from "lucide-react";

import { useConfirm } from "../App";

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
  const confirm = useConfirm();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    
    setSaving(true);
    try {
      const res = await apiFetch<any>("api-keys", { method: "POST", body: JSON.stringify({ name: newName }) });
      setNewlyCreatedKey(res.apiKey); 
      setNewName(""); 
      setIsCreating(false); 
      fetchKeys();
    } catch { 
      alert("Gagal membuat kunci API."); 
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: number) => {
    const isConfirmed = await confirm({
      title: "Cabut Akses Kunci",
      message: "Anda yakin ingin mencabut akses kunci ini? Kunci yang dicabut tidak akan bisa digunakan lagi untuk autentikasi API.",
      confirmText: "Cabut Kunci",
      isDanger: true
    });

    if (!isConfirmed) return;

    try { 
      await apiFetch(`api-keys/${id}`, { method: "DELETE" }); 
      fetchKeys(); 
    } catch { 
      alert("Gagal mencabut kunci."); 
    }
  };

  const handleDelete = async (id: number) => {
    const isConfirmed = await confirm({
      title: "Hapus Kunci Permanen",
      message: "TINDAKAN BERBAHAYA: Anda yakin ingin menghapus permanen kunci API ini dari Server? Tindakan ini tidak dapat dibatalkan.",
      confirmText: "Hapus Permanen",
      isDanger: true
    });

    if (!isConfirmed) return;

    try { 
      await apiFetch(`api-keys/${id}/permanent`, { method: "DELETE" }); 
      fetchKeys(); 
    } catch { 
      alert("Gagal menghapus kunci."); 
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Key className="text-[#0b57d0]" size={28} />
            Kunci API
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Akses integrasi programatik untuk sistem pihak ketiga.
          </p>
        </div>
        
        {!isCreating && (
          <button 
            onClick={() => { setIsCreating(true); setNewlyCreatedKey(null); }} 
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0b57d0] text-white font-bold text-sm hover:bg-[#001d35] active:scale-95 transition-all shadow-sm w-full md:w-auto"
          >
            <Plus size={18} strokeWidth={2.5} /> Buat Kunci Baru
          </button>
        )}
      </div>

      {/* FORM CREATE */}
      {isCreating && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-5">
             <h2 className="text-lg font-bold text-slate-800">Generate Kunci Baru</h2>
             <button onClick={() => setIsCreating(false)} className="w-8 h-8 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-colors">
               <X size={18} />
             </button>
          </div>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              className="flex-1 px-5 py-3.5 rounded-full bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all" 
              placeholder="Label identitas (misal: Aplikasi Web e-Commerce)" 
              autoFocus 
              required 
            />
            <button type="submit" disabled={saving || !newName.trim()} className="px-8 py-3.5 rounded-full bg-[#0b57d0] hover:bg-[#001d35] disabled:bg-slate-300 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Generate...</> : "Generate Key"}
            </button>
          </form>
        </div>
      )}

      {/* NEW KEY ALERT */}
      {newlyCreatedKey && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 md:p-8 shadow-sm animate-in zoom-in-95">
           <h3 className="text-emerald-700 font-bold text-base mb-4 flex items-center gap-2">
             <CheckCircle2 size={20}/> Simpan Kunci Anda Sekarang!
           </h3>
           <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <code className="flex-1 w-full bg-white px-5 py-4 rounded-2xl border border-emerald-200 font-mono text-sm text-emerald-800 break-all select-all shadow-sm">
                {newlyCreatedKey}
              </code>
              <button 
                onClick={() => { navigator.clipboard.writeText(newlyCreatedKey); alert("Kunci API berhasil disalin ke clipboard!"); }} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-2xl font-bold text-sm shadow-sm transition-all active:scale-95 shrink-0"
              >
                <Copy size={18}/> Salin Kunci
              </button>
           </div>
           <p className="mt-4 text-[11px] text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1.5">
             <ShieldAlert size={14}/> Peringatan: Kunci ini tidak akan ditampilkan lagi demi alasan keamanan.
           </p>
        </div>
      )}

      {/* TABLE / CARD DATA */}
      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
        
        {loading ? (
          <div className="p-20 text-center text-slate-400 flex flex-col items-center">
             <Loader2 size={36} className="animate-spin text-[#0b57d0] mb-3" />
             <span className="font-bold text-xs uppercase tracking-widest">Memuat Kunci...</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center border border-dashed border-slate-200 m-6 rounded-3xl">
             <div className="w-16 h-16 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-400 mb-4">
               <Key size={32} />
             </div>
             <h3 className="text-lg font-bold text-slate-800 mb-1">Belum Ada Kunci API</h3>
             <p className="text-sm font-medium text-slate-500">Anda belum membuat kunci integrasi. Buat kunci baru untuk memulai.</p>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE VIEW */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#f8fafd] text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-4">Label Akses</th>
                    <th className="px-6 py-4">Status Sistem</th>
                    <th className="px-6 py-4">Dibuat Pada</th>
                    <th className="px-6 py-4 text-right">Aksi Manajerial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {keys.map(k => (
                    <tr key={k.id} className="hover:bg-[#f8fafd] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 text-[15px]">{k.name}</div>
                        <div className="font-mono text-xs font-medium text-slate-400 mt-1">live_************************</div>
                      </td>
                      
                      <td className="px-6 py-4 align-middle">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${k.revoked_at ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {k.revoked_at ? <><XCircle size={12}/> Revoked</> : <><CheckCircle2 size={12}/> Active</>}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 align-middle text-xs font-medium text-slate-600">
                        {new Date(k.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      
                      <td className="px-6 py-4 align-middle text-right">
                        <div className="flex justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          {!k.revoked_at && (
                            <button 
                              onClick={() => handleRevoke(k.id)} 
                              className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                              title="Cabut akses (kunci tidak dapat digunakan)"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleDelete(k.id)} 
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                            title="Hapus Permanen"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARD VIEW */}
            <div className="md:hidden divide-y divide-slate-100">
              {keys.map(k => (
                <div key={k.id} className="p-4 flex flex-col gap-3 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{k.name}</div>
                      <div className="font-mono text-[11px] font-medium text-slate-400 mt-0.5">live_********</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0 ${k.revoked_at ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      {k.revoked_at ? 'Revoked' : 'Active'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-50 pt-2 mt-1">
                     <span className="text-[11px] font-medium text-slate-500">
                       {new Date(k.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                     </span>
                     <div className="flex gap-2">
                       {!k.revoked_at && (
                         <button 
                           onClick={() => handleRevoke(k.id)} 
                           className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-orange-50 text-orange-600 text-[10px] font-bold border border-orange-100"
                         >
                           <XCircle size={12} /> Cabut
                         </button>
                       )}
                       <button 
                         onClick={() => handleDelete(k.id)} 
                         className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-rose-50 text-rose-600 text-[10px] font-bold border border-rose-100"
                       >
                         <Trash2 size={12} /> Hapus
                       </button>
                     </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}