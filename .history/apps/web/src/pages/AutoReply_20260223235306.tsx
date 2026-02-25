import React, { useEffect, useState } from "react";

/** HELPER INTERNAL */
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
  session_key: string | null;
  keyword: string;
  match_type: "exact" | "contains" | "startswith";
  reply_text: string;
  is_active: boolean;
}

interface WaSession {
  session_key: string;
  label?: string | null;
  phone_number?: string | null;
  status?: string; // Tambahan status (connected/disconnected)
}

export default function AutoReply() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [activeSessions, setActiveSessions] = useState<WaSession[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [selectedSession, setSelectedSession] = useState(""); // "" = Semua Nomor
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"exact" | "contains" | "startswith">("exact");
  const [replyText, setReplyText] = useState("");

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Rules secara mandiri
    try {
      const rulesRes = await apiFetch<any>("auto-reply");
      setRules(rulesRes?.data || rulesRes || []);
    } catch (err) {
      console.error("Gagal memuat rules:", err);
    }

    // 2. Fetch Sessions secara mandiri (Lebih Resilient)
    try {
      let sessionsRes: any;
      try {
        sessionsRes = await apiFetch<any>("sessions");
      } catch (err1) {
        console.warn("Mencoba fallback rute ui/sessions...");
        sessionsRes = await apiFetch<any>("ui/sessions");
      }
      
      // Mengakomodasi berbagai format kembalian JSON dari backend
      const sData = sessionsRes?.data || sessionsRes?.sessions || sessionsRes || [];
      setActiveSessions(Array.isArray(sData) ? sData : []);
    } catch (err2) {
      console.error("Gagal memuat sessions:", err2);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !replyText.trim()) return;
    setSaving(true);
    try {
      await apiFetch("auto-reply", { 
        method: "POST", 
        body: JSON.stringify({ 
          session_key: selectedSession || null, 
          keyword, 
          match_type: matchType, 
          reply_text: replyText 
        }) 
      });
      setKeyword(""); setReplyText(""); setMatchType("exact"); setSelectedSession(""); setIsCreating(false); 
      fetchData();
    } catch { alert("Gagal menyimpan aturan."); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus aturan bot ini?")) return;
    try { await apiFetch(`auto-reply/${id}`, { method: "DELETE" }); fetchData(); } catch { alert("Gagal hapus"); }
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               
               {/* PILIHAN SESI (TARGET NOMOR) */}
               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Target Nomor WA</label>
                  <div className="relative">
                    <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} className="w-full px-8 py-5 rounded-2xl bg-white/60 border border-white font-bold text-slate-800 outline-none focus:bg-white appearance-none cursor-pointer">
                       <option value="">Semua Nomor Terkoneksi</option>
                       {activeSessions.map(session => {
                         const sessionName = session.label || session.phone_number || session.session_key;
                         return (
                           <option key={session.session_key} value={session.session_key}>
                             📱 {sessionName} {session.status === 'connected' ? '(Aktif)' : ''}
                           </option>
                         )
                       })}
                    </select>
                    {/* Icon Panah untuk Dropdown */}
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      ▼
                    </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Kata Kunci (Keyword)</label>
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full px-8 py-5 rounded-2xl bg-white/60 border border-white font-bold text-slate-800 outline-none focus:bg-white" placeholder="Contoh: harga" required />
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Tipe Pencocokan</label>
                  <div className="relative">
                    <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)} className="w-full px-8 py-5 rounded-2xl bg-white/60 border border-white font-bold text-slate-800 outline-none focus:bg-white appearance-none cursor-pointer">
                       <option value="exact">Sama Persis</option>
                       <option value="contains">Mengandung Kata</option>
                       <option value="startswith">Diawali Dengan</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      ▼
                    </div>
                  </div>
               </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Konten Balasan Bot</label>
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} className="w-full px-8 py-5 rounded-[2rem] bg-white/60 border border-white font-medium text-slate-700 outline-none focus:bg-white transition-all resize-none text-sm" placeholder="Ketik pesan balasan otomatis..." required />
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
           <div className="p-24 text-center text-slate-300 font-black uppercase tracking-[0.3em] animate-pulse">Memuat Konfigurasi Bot...</div>
        ) : rules.length === 0 ? (
           <div className="p-24 text-center text-slate-400 font-bold">Belum ada aturan Auto Reply yang dibuat.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/40">
                  <th className="px-10 py-8">Target & Kondisi</th>
                  <th className="px-10 py-8">Balasan Otomatis</th>
                  <th className="px-10 py-8 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {rules.map(rule => (
                  <tr key={rule.id} className="group hover:bg-white/40 transition-all">
                    <td className="px-10 py-8">
                       <div className="flex gap-2 mb-2">
                         <div className="px-3 py-1 bg-indigo-50 text-[9px] font-black text-indigo-500 uppercase rounded-full w-max border border-indigo-100">
                           {rule.session_key ? `📱 ${rule.session_key}` : "🌐 SEMUA NOMOR"}
                         </div>
                         <div className="px-3 py-1 bg-blue-50 text-[9px] font-black text-blue-500 uppercase rounded-full w-max border border-blue-100">
                           {rule.match_type}
                         </div>
                       </div>
                       <div className="font-black text-slate-800 text-lg tracking-tight italic">"{rule.keyword}"</div>
                    </td>
                    <td className="px-10 py-8">
                       <div className="max-w-md text-sm font-medium text-slate-600 line-clamp-3 leading-relaxed">{rule.reply_text}</div>
                    </td>
                    <td className="px-10 py-8 text-right align-middle">
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