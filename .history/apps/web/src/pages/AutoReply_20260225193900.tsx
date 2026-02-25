import React, { useEffect, useState } from "react";
import { Bot, Plus, X, Edit3, Trash2, Smartphone, MessageSquare, Power, Clock, Info } from "lucide-react";

/** HELPER INTERNAL */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try { 
    data = text ? JSON.parse(text) : {}; 
  } catch (e) { 
    throw new Error(`Server Error (HTTP ${res.status}).`); 
  }
  
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
  delay_ms: number;
}

interface WaSession {
  session_key: string;
  label?: string | null;
  phone_number?: string | null;
  status?: string;
}

export default function AutoReply() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [activeSessions, setActiveSessions] = useState<WaSession[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [selectedSession, setSelectedSession] = useState(""); 
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"exact" | "contains" | "startswith">("exact");
  const [replyText, setReplyText] = useState("");
  const [delayMs, setDelayMs] = useState("2000");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, sessionsRes] = await Promise.all([
        apiFetch<any>("auto-reply").catch(() => ({ data: [] })),
        apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] }))
      ]);
      setRules(rulesRes.data || []);
      setActiveSessions(sessionsRes.sessions || []);
    } catch (err) {
      console.error("Gagal memuat data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreateForm = () => {
    setEditingId(null);
    setSelectedSession("");
    setKeyword("");
    setMatchType("exact");
    setReplyText("");
    setDelayMs("2000");
    setIsCreating(true);
  };

  const openEditForm = (rule: AutoReplyRule) => {
    setEditingId(rule.id);
    setSelectedSession(rule.session_key || "");
    setKeyword(rule.keyword);
    setMatchType(rule.match_type);
    setReplyText(rule.reply_text);
    setDelayMs(String(rule.delay_ms || 2000));
    setIsCreating(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKeyword = keyword.trim();
    const cleanReplyText = replyText.trim();
    const cleanSession = selectedSession.trim();

    if (!cleanKeyword || !cleanReplyText) return alert("Keyword dan balasan wajib diisi!");
    
    setSaving(true);
    try {
      const payload = { 
        session_key: cleanSession || null, 
        keyword: cleanKeyword, 
        match_type: matchType, 
        reply_text: cleanReplyText,
        delay_ms: Number(delayMs)
      };

      if (editingId) {
        await apiFetch(`auto-reply/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("auto-reply", { method: "POST", body: JSON.stringify(payload) });
      }
      
      setIsCreating(false); 
      fetchData();
    } catch (e: any) { 
      alert(e.message || "Gagal menyimpan aturan."); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleToggleActive = async (id: number, currentStatus: boolean) => {
    try {
      setRules(rules.map(r => r.id === id ? { ...r, is_active: !currentStatus } : r));
      await apiFetch(`auto-reply/${id}/status`, { 
        method: "PUT", 
        body: JSON.stringify({ is_active: !currentStatus }) 
      });
    } catch (e: any) {
      alert("Gagal merubah status");
      fetchData(); 
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus aturan bot ini secara permanen?")) return;
    try { 
      await apiFetch(`auto-reply/${id}`, { method: "DELETE" }); 
      fetchData(); 
    } catch { 
      alert("Gagal menghapus aturan."); 
    }
  };

  const getSessionDisplay = (sessionKey: string | null) => {
    if (!sessionKey) return "🌐 SEMUA NOMOR (GLOBAL)";
    const found = activeSessions.find(s => s.session_key === sessionKey);
    if (found) {
      return `📱 ${found.label || found.phone_number || found.session_key}`;
    }
    return `📱 ${sessionKey}`;
  };

  const matchTypeMap = {
    exact: "Sama Persis",
    contains: "Mengandung Kata",
    startswith: "Diawali Dengan"
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
            <Bot size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter">Bot Auto Reply</h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Balas Pesan Otomatis Multi-Keyword</p>
          </div>
        </div>
        
        {!isCreating && (
          <button 
            onClick={openCreateForm} 
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 text-white font-bold text-sm shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={18} strokeWidth={3} /> Tambah Aturan
          </button>
        )}
      </div>

      {/* FORM CREATE/EDIT */}
      {isCreating && (
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[2.5rem] p-8 shadow-2xl shadow-indigo-500/5 animate-in slide-in-from-top-4 duration-500 relative overflow-hidden">
          
          <div className="flex items-center justify-between mb-8 border-b border-white/50 pb-6">
            <h2 className="text-xl font-black text-slate-800">{editingId ? 'Edit Aturan Bot' : 'Buat Aturan Baru'}</h2>
            <button onClick={() => setIsCreating(false)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-colors shadow-sm">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-8 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">Target Nomor WA</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Smartphone size={16} /></div>
                    <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} className="w-full pl-12 pr-10 py-4 rounded-2xl bg-white/80 border border-white font-bold text-slate-700 outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 appearance-none cursor-pointer shadow-sm">
                       <option value="">-- SEMUA NOMOR TERKONEKSI --</option>
                       {activeSessions.map(session => {
                         const sessionName = session.label || session.phone_number || session.session_key;
                         return <option key={session.session_key} value={session.session_key}>{sessionName} {session.status === 'connected' ? '🟢' : '🔴'}</option>
                       })}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                  </div>
               </div>

               {/* [NEW] INPUT JEDA WAKTU MENGETIK */}
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">Jeda Mengetik Organik (Milidetik)</label>
                  <div className="relative">
                    <input 
                      type="number" min="0" step="100"
                      value={delayMs} onChange={(e) => setDelayMs(e.target.value)} 
                      className="w-full pl-5 pr-12 py-4 rounded-2xl bg-white/80 border border-white font-black text-slate-700 outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 shadow-sm" 
                      placeholder="2000" required 
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">MS</span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-medium ml-2 mt-1 italic flex items-center gap-1">
                    <Clock size={10} /> 1000 ms = 1 detik. Memicu status "Sedang mengetik..."
                  </p>
               </div>

               <div className="space-y-3 md:col-span-2">
                  <div className="flex items-start gap-4">
                     <div className="flex-1 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">Kata Kunci (Pisahkan dengan koma)</label>
                        <input 
                          value={keyword} onChange={(e) => setKeyword(e.target.value)} 
                          className="w-full px-5 py-4 rounded-2xl bg-white/80 border border-white font-black text-indigo-600 outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 shadow-sm" 
                          placeholder="Contoh: halo, hai, p, permisi, info" required 
                        />
                        <div className="text-[10px] text-slate-500 font-medium ml-2 leading-relaxed flex items-start gap-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                           <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                           <p>Ketikkan banyak variasi kata kunci sekaligus dan pisahkan dengan koma. <br/>Jika pelanggan mengetik <b>salah satu</b> dari kata tersebut, Bot akan merespons.</p>
                        </div>
                     </div>
                     
                     <div className="w-64 shrink-0 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">Tipe Pencocokan (Logika)</label>
                        <div className="relative">
                          <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)} className="w-full px-5 py-4 rounded-2xl bg-white/80 border border-white font-bold text-slate-700 outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 appearance-none cursor-pointer shadow-sm">
                             <option value="exact">🎯 Sama Persis</option>
                             <option value="contains">🔍 Mengandung Kata</option>
                             <option value="startswith">🚀 Diawali Dengan</option>
                          </select>
                          <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                        </div>
                     </div>
                  </div>
               </div>

            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block flex items-center gap-2"><MessageSquare size={14} /> Konten Balasan Bot</label>
              <textarea 
                value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={5} 
                className="w-full px-6 py-5 rounded-[2rem] bg-white/80 border border-white font-medium text-slate-700 outline-none focus:bg-white focus:ring-[4px] focus:ring-indigo-500/10 transition-all resize-none text-sm leading-relaxed shadow-sm" 
                placeholder="Ketik balasan Anda. Gunakan {{nama}} untuk menyebut nama pelanggan." required 
              />
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={saving} className="px-10 py-4 rounded-2xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95">
                {saving ? "Menyimpan..." : (editingId ? "Update Aturan" : "Simpan Aturan Bot")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TABLE LIST */}
      {!isCreating && (
        <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
          {loading ? (
             <div className="p-24 text-center text-slate-400 font-black uppercase tracking-[0.3em] animate-pulse">Memuat Aturan Bot...</div>
          ) : rules.length === 0 ? (
             <div className="p-24 text-center">
                <Bot size={48} className="mx-auto text-slate-300 mb-4 opacity-50" />
                <p className="text-slate-400 font-bold">Belum ada aturan Auto Reply yang dibuat.</p>
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/40">
                    <th className="px-8 py-6 w-2/5">Kondisi & Kata Kunci (Triggers)</th>
                    <th className="px-8 py-6">Balasan Otomatis</th>
                    <th className="px-8 py-6 text-center">Status</th>
                    <th className="px-8 py-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {rules.map(rule => (
                    <tr key={rule.id} className={`group transition-all ${rule.is_active ? 'hover:bg-white/40' : 'bg-slate-50/50 opacity-70 grayscale-[30%]'}`}>
                      <td className="px-8 py-6">
                         <div className="flex flex-wrap gap-2 mb-3">
                           <div className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md border ${rule.session_key ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                             {getSessionDisplay(rule.session_key)}
                           </div>
                           <div className="px-2.5 py-1 bg-slate-100 text-[9px] font-black text-slate-500 uppercase rounded-md border border-slate-200">
                             {matchTypeMap[rule.match_type]}
                           </div>
                           <div className="px-2.5 py-1 bg-amber-50 text-[9px] font-black text-amber-600 uppercase rounded-md border border-amber-100 flex items-center gap-1" title="Menampilkan 'Sedang mengetik...' selama durasi ini">
                             <Clock size={10} /> {(rule.delay_ms || 2000) / 1000} Dtk
                           </div>
                         </div>
                         
                         {/* Multi-Keyword Badge Rendering */}
                         <div className="flex flex-wrap gap-1.5">
                           {rule.keyword.split(',').map((kw, i) => {
                              const cleanKw = kw.trim();
                              if (!cleanKw) return null;
                              return (
                                <span key={i} className="px-2.5 py-1 bg-white border border-indigo-100 shadow-sm text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-lg">
                                  "{cleanKw}"
                                </span>
                              );
                           })}
                         </div>
                      </td>
                      
                      <td className="px-8 py-6">
                         <div className="max-w-sm p-4 rounded-2xl bg-white/60 border border-white text-xs font-medium text-slate-600 leading-relaxed shadow-sm line-clamp-3 relative">
                            <div className="absolute -left-1.5 top-5 w-3 h-3 bg-white/60 border border-white rotate-45 border-r-0 border-t-0"></div>
                            {rule.reply_text}
                         </div>
                      </td>
                      
                      <td className="px-8 py-6 text-center align-middle">
                         <button 
                           onClick={() => handleToggleActive(rule.id, Boolean(rule.is_active))}
                           className={`p-3 rounded-2xl border transition-all ${rule.is_active ? 'bg-emerald-50 text-emerald-500 border-emerald-100 shadow-sm shadow-emerald-500/10' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                           title={rule.is_active ? "Matikan Bot" : "Aktifkan Bot"}
                         >
                           <Power size={18} strokeWidth={rule.is_active ? 3 : 2} />
                         </button>
                      </td>

                      <td className="px-8 py-6 text-right align-middle">
                         <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                           <button 
                             onClick={() => openEditForm(rule)} 
                             className="w-10 h-10 rounded-xl bg-white text-indigo-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white border border-slate-100 transition-colors shadow-sm"
                           >
                             <Edit3 size={16} />
                           </button>
                           <button 
                             onClick={() => handleDelete(rule.id)} 
                             className="w-10 h-10 rounded-xl bg-white text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white border border-slate-100 transition-colors shadow-sm"
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
          )}
        </div>
      )}
    </div>
  );
}