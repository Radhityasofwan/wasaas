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
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await apiFetch<any>("api-keys", { method: "POST", body: JSON.stringify({ name: newName }) });
      setNewlyCreatedKey(res.apiKey); setNewName(""); setIsCreating(false); fetchKeys();
    } catch { alert("Gagal buat key"); }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Cabut akses kunci ini?")) return;
    try { await apiFetch(`api-keys/${id}`, { method: "DELETE" }); fetchKeys(); } catch { alert("Gagal"); }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Kunci API</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Akses Integrasi Programatik & Developer</p>
        </div>
        <button onClick={() => setIsCreating(!isCreating)} className="px-8 py-4 rounded-[1.5rem] bg-blue-600 text-white font-black text-xs shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">
          + Buat Kunci Baru
        </button>
      </div>

      {isCreating && (
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-10 shadow-sm animate-in slide-in-from-top-4">
           <form onSubmit={handleCreate} className="flex gap-4">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 px-8 py-5 rounded-[1.5rem] bg-white/60 border border-white font-bold outline-none focus:bg-white" placeholder="Label identitas (misal: Aplikasi Web)" autoFocus required />
              <button type="submit" className="px-10 py-5 rounded-[1.5rem] bg-blue-600 text-white font-black text-sm">Generate</button>
           </form>
        </div>
      )}

      {newlyCreatedKey && (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-[2.5rem] p-10 shadow-lg shadow-emerald-500/5 animate-in zoom-in-95">
           <h3 className="text-emerald-600 font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><span>✅</span> Simpan Kunci Anda Sekarang!</h3>
           <div className="flex gap-3 items-center">
              <code className="flex-1 bg-white p-5 rounded-2xl border border-emerald-200 font-mono text-sm text-emerald-800 break-all shadow-inner select-all">{newlyCreatedKey}</code>
              <button onClick={() => { navigator.clipboard.writeText(newlyCreatedKey); alert("Copied!"); }} className="bg-emerald-500 text-white px-8 py-5 rounded-2xl font-black text-xs uppercase shadow-lg shadow-emerald-500/20">Salin</button>
           </div>
           <p className="mt-4 text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">Peringatan: Kunci ini tidak akan ditampilkan lagi demi alasan keamanan.</p>
        </div>
      )}

      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/40">
              <th className="px-10 py-8">Label Akses</th>
              <th className="px-10 py-8">Status</th>
              <th className="px-10 py-8">Dibuat</th>
              <th className="px-10 py-8 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20">
            {keys.map(k => (
              <tr key={k.id} className="hover:bg-white/40 transition-all">
                <td className="px-10 py-7">
                  <div className="font-black text-slate-800 tracking-tight">{k.name}</div>
                  <div className="font-mono text-[10px] text-slate-300 mt-1 uppercase">live_********</div>
                </td>
                <td className="px-10 py-7">
                  <span className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border ${k.revoked_at ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{k.revoked_at ? 'Revoked' : 'Active'}</span>
                </td>
                <td className="px-10 py-7 text-xs font-bold text-slate-400">{new Date(k.created_at).toLocaleDateString()}</td>
                <td className="px-10 py-7 text-right">
                  {!k.revoked_at && <button onClick={() => handleRevoke(k.id)} className="text-rose-500 font-black text-[10px] uppercase tracking-widest hover:underline px-4 py-2">Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}