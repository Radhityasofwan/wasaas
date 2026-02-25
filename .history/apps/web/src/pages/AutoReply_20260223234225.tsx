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

interface AutoReplyRule {
  id: number;
  keyword: string;
  match_type: "exact" | "contains" | "startswith";
  reply_text: string;
  is_active: boolean;
}

export default function AutoReply() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"exact" | "contains" | "startswith">("exact");
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>("auto-reply");
      setRules(res.data || []);
    } catch { /* Silent */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !replyText.trim()) return;
    setSaving(true);
    try {
      await apiFetch("auto-reply", { method: "POST", body: JSON.stringify({ keyword, match_type: matchType, reply_text: replyText }) });
      setKeyword(""); setReplyText(""); setMatchType("exact"); setIsCreating(false); fetchRules();
    } catch { alert("Gagal menyimpan"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus aturan ini?")) return;
    try { await apiFetch(`auto-reply/${id}`, { method: "DELETE" }); fetchRules(); } catch { alert("Gagal hapus"); }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Auto Reply</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Bot Balasan Otomatis Berbasis Keyword</p>
        </div>
        <button onClick={() => setIsCreating(!isCreating)} className={`px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all shadow-lg ${isCreating ? 'bg-slate-100 text-slate-500' : 'bg-blue-600 text-white shadow-blue-500/20 hover:scale-105'}`}>
          {isCreating ? "Batalkan" : "+ Tambah Aturan"}
        </button>
      </div>

      {isCreating && (
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-10 shadow-sm animate-in slide-in-from-top-4 duration-500">
          <form onSubmit={handleSave} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Kata Kunci (Keyword)</label>
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full px-8 py-5 rounded-2xl bg-white/60 border border-white font-bold text-slate-800 outline-none focus:bg-white" placeholder="Contoh: harga" required />
               </div>
               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Tipe Pencocokan</label>
                  <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)} className="w-full px-8 py-5 rounded-2xl bg-white/60 border border-white font-bold text-slate-800 outline-none focus:bg-white appearance-none">
                     <option value="exact">Sama Persis</option>
                     <option value="contains">Mengandung Kata</option>
                     <option value="startswith">Diawali Dengan</option>
                  </select>
               </div>
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Konten Balasan Bot</label>
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={5} className="w-full px-8 py-5 rounded-[2rem] bg-white/60 border border-white font-medium text-slate-700 outline-none focus:bg-white transition-all resize-none text-sm" placeholder="Ketik pesan balasan otomatis..." required />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="px-12 py-5 rounded-[2rem] bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95">
                {saving ? "Menyimpan..." : "Simpan Aturan Bot"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        {loading ? (
           <div className="p-24 text-center text-slate-300 font-black uppercase tracking-[0.3em] animate-pulse">Menyiapkan Database Bot...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/40">
                  <th className="px-10 py-8">Kondisi Pemicu</th>
                  <th className="px-10 py-8">Balasan Otomatis</th>
                  <th className="px-10 py-8 text-center">Status</th>
                  <th className="px-10 py-8 text-right">Manajemen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {rules.map(rule => (
                  <tr key={rule.id} className="group hover:bg-white/40 transition-all">
                    <td className="px-10 py-8">
                       <div className="px-3 py-1 bg-blue-50 text-[9px] font-black text-blue-500 uppercase rounded-full w-max border border-blue-100 mb-2">{rule.match_type}</div>
                       <div className="font-black text-slate-800 text-lg tracking-tight italic">"{rule.keyword}"</div>
                    </td>
                    <td className="px-10 py-8">
                       <div className="max-w-md text-sm font-medium text-slate-500 line-clamp-2 leading-relaxed">{rule.reply_text}</div>
                    </td>
                    <td className="px-10 py-8 text-center">
                       <span className="px-4 py-2 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase border border-emerald-100">Aktif</span>
                    </td>
                    <td className="px-10 py-8 text-right">
                       <button onClick={() => handleDelete(rule.id)} className="p-4 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-90">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}