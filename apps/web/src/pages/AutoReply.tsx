import React, { useEffect, useState } from "react";
import { Bot, Plus, X, Edit3, Trash2, Smartphone, MessageSquare, Power, PowerOff, Clock, Info, CheckCircle2, Loader2 } from "lucide-react";

import { useConfirm } from "../App";

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
  reply_text: string | null;
  template_id?: number | null;
  template_name?: string | null;
  template_type?: string | null;
  is_active: boolean;
  delay_ms: number;
  typing_enabled?: boolean;
  typing_ms?: number | null;
}

interface TemplateRow {
  id: number;
  name: string;
  message_type: string;
}

interface WaSession {
  session_key: string;
  label?: string | null;
  phone_number?: string | null;
  status?: string;
}

export default function AutoReply() {
  const confirm = useConfirm();

  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [activeSessions, setActiveSessions] = useState<WaSession[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [selectedSession, setSelectedSession] = useState(""); 
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"exact" | "contains" | "startswith">("exact");
  const [replyText, setReplyText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [delayMs, setDelayMs] = useState("3000");
  const [typingEnabled, setTypingEnabled] = useState(true);
  const [typingMs, setTypingMs] = useState("2000");
  const [typingSyncWithDelay, setTypingSyncWithDelay] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, sessionsRes, templatesRes] = await Promise.all([
        apiFetch<any>("auto-reply").catch(() => ({ data: [] })),
        apiFetch<any>("ui/sessions").catch(() => ({ sessions: [] })),
        apiFetch<any>("templates").catch(() => ({ data: [] }))
      ]);
      setRules(rulesRes.data || []);
      setActiveSessions(sessionsRes.sessions || []);
      setTemplates(templatesRes.data || []);
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
    setTemplateId("");
    setDelayMs("3000");
    setTypingEnabled(true);
    setTypingMs("2000");
    setTypingSyncWithDelay(true);
    setIsCreating(true);
  };

  const openEditForm = (rule: AutoReplyRule) => {
    setEditingId(rule.id);
    setSelectedSession(rule.session_key || "");
    setKeyword(rule.keyword);
    setMatchType(rule.match_type);
    setReplyText(rule.reply_text || "");
    setTemplateId(rule.template_id ? String(rule.template_id) : "");
    const hasTypingConfig = rule.typing_ms !== undefined && rule.typing_ms !== null;
    setTypingSyncWithDelay(!hasTypingConfig);
    setTypingEnabled(rule.typing_enabled === undefined ? true : Boolean(rule.typing_enabled));
    setTypingMs(String(hasTypingConfig ? Number(rule.typing_ms || 0) : Number(rule.delay_ms || 2000)));
    setDelayMs(String(hasTypingConfig ? Number(rule.delay_ms || 0) : Number(rule.delay_ms || 2000)));
    setIsCreating(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKeyword = keyword.trim();
    const cleanReplyText = replyText.trim();
    const cleanSession = selectedSession.trim();
    const cleanTemplateId = templateId.trim();
    const delayValue = Number(delayMs || 0);
    const typingValue = Number(typingMs || 0);
    const sendDelayMs = Math.max(0, delayValue);
    const typingDurationMs = Math.max(0, typingValue);

    if (!cleanKeyword) return alert("Keyword wajib diisi!");
    if (!cleanReplyText && !cleanTemplateId) return alert("Isi balasan teks atau pilih template media.");
    if (!Number.isFinite(sendDelayMs)) return alert("Jeda kirim tidak valid.");
    if (typingEnabled && !typingSyncWithDelay && !Number.isFinite(typingDurationMs)) return alert("Durasi typing indicator tidak valid.");
    
    setSaving(true);
    try {
      const payloadDelayMs = typingSyncWithDelay ? sendDelayMs : sendDelayMs;
      const payloadTypingMs = typingEnabled
        ? (typingSyncWithDelay ? null : typingDurationMs)
        : (typingSyncWithDelay ? null : 0);

      const payload = { 
        session_key: cleanSession || null, 
        keyword: cleanKeyword, 
        match_type: matchType, 
        reply_text: cleanReplyText || null,
        template_id: cleanTemplateId ? Number(cleanTemplateId) : null,
        delay_ms: payloadDelayMs,
        typing_enabled: typingEnabled,
        typing_ms: payloadTypingMs
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
    const isConfirmed = await confirm({
      title: "Hapus Aturan Bot",
      message: "Anda yakin ingin menghapus aturan auto reply ini secara permanen?",
      confirmText: "Hapus",
      isDanger: true
    });

    if (!isConfirmed) return;

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

  const getTypingDurationMs = (rule: AutoReplyRule) => {
    const hasTypingConfig = rule.typing_ms !== undefined && rule.typing_ms !== null;
    if (rule.typing_enabled === false) return 0;
    return hasTypingConfig ? Number(rule.typing_ms || 0) : Number(rule.delay_ms || 2000);
  };

  const getExtraDelayMs = (rule: AutoReplyRule) => {
    const hasTypingConfig = rule.typing_ms !== undefined && rule.typing_ms !== null;
    return hasTypingConfig ? Number(rule.delay_ms || 0) : 0;
  };

  const isTypingSynced = (rule: AutoReplyRule) => rule.typing_ms === undefined || rule.typing_ms === null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Bot className="text-[#0b57d0]" size={28} />
            Bot Auto Reply
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Balas pesan prospek secara otomatis menggunakan Multi-Keyword.
          </p>
        </div>
        
        {!isCreating && (
          <button 
            onClick={openCreateForm} 
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0b57d0] text-white font-bold text-sm hover:bg-[#001d35] active:scale-95 transition-all shadow-sm w-full md:w-auto"
          >
            <Plus size={18} strokeWidth={2.5} /> Tambah Aturan Baru
          </button>
        )}
      </div>

      {/* FORM CREATE/EDIT */}
      {isCreating && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm animate-in slide-in-from-top-4 duration-300">
          
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">{editingId ? 'Edit Aturan Bot' : 'Buat Aturan Baru'}</h2>
              <p className="text-xs text-slate-500 mt-1">Sistem akan merespons sesuai kondisi kata kunci di bawah ini.</p>
            </div>
            <button onClick={() => setIsCreating(false)} className="w-10 h-10 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-colors">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
               
               <div className="space-y-2.5">
                  <label className="text-xs font-bold text-slate-700 block">Target Nomor WA</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Smartphone size={16} /></div>
                    <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)} className="w-full pl-11 pr-10 py-3.5 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] appearance-none cursor-pointer transition-all">
                       <option value="">-- SEMUA NOMOR TERKONEKSI (GLOBAL) --</option>
                       {activeSessions.map(session => {
                         const sessionName = session.label || session.phone_number || session.session_key;
                         return <option key={session.session_key} value={session.session_key}>{sessionName} {session.status === 'connected' ? '🟢' : '🔴'}</option>
                       })}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                  </div>
               </div>

               <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 block">Typing Indicator</label>
                  <label className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#f0f4f9] cursor-pointer">
                    <span className="text-sm font-semibold text-slate-700">Kirim status "Sedang mengetik..."</span>
                    <input
                      type="checkbox"
                      checked={typingEnabled}
                      onChange={(e) => setTypingEnabled(e.target.checked)}
                      className="w-4 h-4 text-[#0b57d0]"
                    />
                  </label>

                  <label className={`flex items-center justify-between px-4 py-3 rounded-xl ${typingEnabled ? "bg-[#f0f4f9]" : "bg-slate-100"} cursor-pointer`}>
                    <span className="text-sm font-semibold text-slate-700">Sinkronkan typing dengan jeda kirim (natural)</span>
                    <input
                      type="checkbox"
                      checked={typingSyncWithDelay}
                      onChange={(e) => setTypingSyncWithDelay(e.target.checked)}
                      className="w-4 h-4 text-[#0b57d0]"
                      disabled={!typingEnabled}
                    />
                  </label>

                  <div className="relative">
                    <input
                      type="number" min="0" step="100"
                      value={delayMs} onChange={(e) => setDelayMs(e.target.value)}
                      className="w-full pl-4 pr-12 py-3.5 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                      placeholder={typingSyncWithDelay ? "3000" : "0"}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">MS</span>
                  </div>

                  {!typingSyncWithDelay && (
                    <div className="relative">
                      <input 
                        type="number" min="0" step="100"
                        value={typingMs} onChange={(e) => setTypingMs(e.target.value)} 
                        className="w-full pl-4 pr-12 py-3.5 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all disabled:opacity-60" 
                        placeholder="2000"
                        disabled={!typingEnabled}
                        required={typingEnabled}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">MS</span>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 font-medium ml-1 flex items-center gap-1.5">
                    <Clock size={12} className="text-[#0b57d0]"/>
                    {typingSyncWithDelay
                      ? "Mode natural: typing mengikuti jeda kirim total."
                      : "Mode advanced: typing_ms terpisah dari jeda kirim tambahan."}
                  </p>
               </div>

               <div className="space-y-2.5 lg:col-span-2">
                  <div className="flex flex-col md:flex-row items-start gap-4 md:gap-5">
                     <div className="flex-1 w-full space-y-2.5">
                        <label className="text-xs font-bold text-slate-700 block">Kata Kunci (Pisahkan dengan koma)</label>
                        <input 
                          value={keyword} onChange={(e) => setKeyword(e.target.value)} 
                          className="w-full px-4 py-3.5 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all" 
                          placeholder="Contoh: halo, hai, p, permisi, info" required 
                        />
                        <div className="text-[11px] text-slate-600 font-medium leading-relaxed flex items-start gap-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                           <Info size={16} className="text-[#0b57d0] mt-0.5 shrink-0" />
                           <p>Ketikkan banyak variasi kata kunci sekaligus dan pisahkan dengan koma. Jika pelanggan mengetik <b>salah satu</b> dari kata tersebut, Bot akan merespons.</p>
                        </div>
                     </div>
                     
                     <div className="w-full md:w-64 shrink-0 space-y-2.5">
                        <label className="text-xs font-bold text-slate-700 block">Tipe Pencocokan (Logika)</label>
                        <div className="relative">
                          <select value={matchType} onChange={(e) => setMatchType(e.target.value as any)} className="w-full px-4 py-3.5 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] appearance-none cursor-pointer transition-all">
                             <option value="exact">🎯 Sama Persis</option>
                             <option value="contains">🔍 Mengandung Kata</option>
                             <option value="startswith">🚀 Diawali Dengan</option>
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
                        </div>
                     </div>
                  </div>
               </div>

            </div>

            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare size={14} className="text-[#0b57d0]" /> Template Media (Opsional)
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all cursor-pointer"
              >
                <option value="">-- Tanpa Template (balasan teks biasa) --</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={String(tpl.id)}>
                    {tpl.name} ({tpl.message_type})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 font-medium">
                Jika dipilih, bot akan mengirim media/template ini. Isi balasan teks tetap bisa dipakai sebagai caption.
              </p>
            </div>

            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><MessageSquare size={14} className="text-[#0b57d0]" /> Konten Balasan Bot</label>
              <textarea 
                value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={5} 
                className="w-full px-5 py-4 rounded-2xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all resize-none text-sm leading-relaxed" 
                placeholder="Ketik balasan teks (opsional jika template media dipilih)." 
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsCreating(false)} className="px-6 py-3 rounded-full font-bold text-slate-600 bg-white hover:bg-[#f0f4f9] text-sm transition-colors mr-3">
                Batal
              </button>
              <button type="submit" disabled={saving} className="px-8 py-3 rounded-full bg-[#0b57d0] text-white font-bold text-sm shadow-sm transition-all hover:bg-[#001d35] active:scale-95 flex items-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : (editingId ? "Update Aturan" : "Simpan Aturan Bot")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TABLE LIST / CARD LIST */}
      {!isCreating && (
        <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
             <div className="p-20 text-center text-slate-400 flex flex-col items-center">
               <Loader2 size={36} className="animate-spin text-[#0b57d0] mb-3" />
               <span className="font-bold text-xs uppercase tracking-widest">Memuat Aturan Bot...</span>
             </div>
          ) : rules.length === 0 ? (
             <div className="p-20 text-center flex flex-col items-center border border-dashed border-slate-200 m-6 rounded-3xl">
                <div className="w-16 h-16 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-400 mb-4">
                  <Bot size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Belum Ada Aturan Bot</h3>
                <p className="text-sm font-medium text-slate-500">Anda belum membuat balasan otomatis apa pun. Tambahkan aturan baru untuk memulai.</p>
             </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#f8fafd] text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="px-6 py-4 w-2/5">Kondisi & Kata Kunci (Triggers)</th>
                      <th className="px-6 py-4">Balasan Otomatis</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rules.map(rule => (
                      <tr key={rule.id} className={`group transition-all ${rule.is_active ? 'hover:bg-[#f8fafd]' : 'bg-slate-50/50 opacity-80'}`}>
                        <td className="px-6 py-4">
                           <div className="flex flex-wrap gap-2 mb-3">
                             <div className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${rule.session_key ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                               {getSessionDisplay(rule.session_key)}
                             </div>
                             <div className="px-2.5 py-1 bg-slate-100 text-[9px] font-bold text-slate-600 uppercase tracking-wider rounded border border-slate-200">
                               {matchTypeMap[rule.match_type]}
                             </div>
                             {rule.typing_enabled !== false && (
                              <div className="px-2.5 py-1 bg-[#f0f4f9] text-[9px] font-bold text-[#0b57d0] uppercase tracking-wider rounded border border-[#c2e7ff] flex items-center gap-1">
                                <Clock size={10} /> Typing {getTypingDurationMs(rule) / 1000} Dtk
                              </div>
                             )}
                             {rule.typing_enabled !== false && isTypingSynced(rule) && (
                              <div className="px-2.5 py-1 bg-emerald-50 text-[9px] font-bold text-emerald-700 uppercase tracking-wider rounded border border-emerald-100">
                                Natural Sync
                              </div>
                             )}
                             {getExtraDelayMs(rule) > 0 && rule.typing_enabled !== false && (
                              <div className="px-2.5 py-1 bg-slate-100 text-[9px] font-bold text-slate-600 uppercase tracking-wider rounded border border-slate-200">
                                Delay +{getExtraDelayMs(rule) / 1000} Dtk
                              </div>
                             )}
                             {rule.typing_enabled === false && (
                              <div className="px-2.5 py-1 bg-rose-50 text-[9px] font-bold text-rose-600 uppercase tracking-wider rounded border border-rose-100">
                                Typing OFF
                              </div>
                             )}
                             {rule.template_name && (
                              <div className="px-2.5 py-1 bg-emerald-50 text-[9px] font-bold text-emerald-700 uppercase tracking-wider rounded border border-emerald-100">
                                Template: {rule.template_name} ({rule.template_type || "media"})
                              </div>
                             )}
                           </div>
                           
                           {/* Multi-Keyword Badge Rendering */}
                           <div className="flex flex-wrap gap-1.5">
                             {rule.keyword.split(',').map((kw, i) => {
                                const cleanKw = kw.trim();
                                if (!cleanKw) return null;
                                return (
                                  <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm">
                                    "{cleanKw}"
                                  </span>
                                );
                             })}
                           </div>
                        </td>
                        
                        <td className="px-6 py-4">
                           <div className="max-w-sm p-3.5 rounded-2xl bg-[#f0f4f9] text-sm font-medium text-slate-700 leading-relaxed line-clamp-3 relative">
                              <div className="absolute -left-1 top-4 w-2 h-2 bg-[#f0f4f9] rotate-45 border-l border-t border-transparent"></div>
                              {rule.reply_text || (rule.template_name ? `[Template] ${rule.template_name}` : "-")}
                           </div>
                        </td>
                        
                        <td className="px-6 py-4 text-center align-middle">
                           <button 
                             onClick={() => handleToggleActive(rule.id, Boolean(rule.is_active))}
                             className={`p-2.5 rounded-xl border transition-all ${rule.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}
                             title={rule.is_active ? "Matikan Bot" : "Aktifkan Bot"}
                           >
                             {rule.is_active ? <Power size={18} strokeWidth={2.5} /> : <PowerOff size={18} strokeWidth={2} />}
                           </button>
                        </td>

                        <td className="px-6 py-4 text-right align-middle">
                           <div className="flex justify-end gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => openEditForm(rule)} 
                               className="w-9 h-9 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center hover:bg-[#c2e7ff] transition-colors"
                             >
                               <Edit3 size={14} />
                             </button>
                             <button 
                               onClick={() => handleDelete(rule.id)} 
                               className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors"
                             >
                               <Trash2 size={14} />
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
                {rules.map(rule => (
                  <div key={rule.id} className={`p-4 flex flex-col gap-3 ${rule.is_active ? 'bg-white' : 'bg-slate-50 opacity-80'}`}>
                    
                    <div className="flex justify-between items-start">
                      <div className="flex flex-wrap gap-1.5">
                        <div className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${rule.session_key ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
                          {getSessionDisplay(rule.session_key)}
                        </div>
                        <div className="px-2 py-0.5 bg-slate-100 text-[9px] font-bold text-slate-600 uppercase tracking-wider rounded border border-slate-200">
                          {matchTypeMap[rule.match_type]}
                        </div>
                        {rule.template_name && (
                          <div className="px-2 py-0.5 bg-emerald-50 text-[9px] font-bold text-emerald-700 uppercase tracking-wider rounded border border-emerald-100">
                            {rule.template_name}
                          </div>
                        )}
                      </div>
                      
                      <button 
                         onClick={() => handleToggleActive(rule.id, Boolean(rule.is_active))}
                         className={`p-1.5 rounded-lg border transition-all ${rule.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'}`}
                       >
                         {rule.is_active ? <Power size={14} strokeWidth={2.5} /> : <PowerOff size={14} />}
                       </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {rule.keyword.split(',').map((kw, i) => {
                         const cleanKw = kw.trim();
                         if (!cleanKw) return null;
                         return (
                           <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-md shadow-sm">
                             "{cleanKw}"
                           </span>
                         );
                      })}
                    </div>

                    <div className="p-3 rounded-xl bg-[#f0f4f9] text-sm font-medium text-slate-700 leading-relaxed border border-transparent">
                      {rule.reply_text || (rule.template_name ? `[Template] ${rule.template_name}` : "-")}
                    </div>

                    <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-50">
                       <div className="px-2 py-1 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider rounded border border-slate-200 flex items-center gap-1.5">
                         <Clock size={12} className="text-[#0b57d0]" />
                         {rule.typing_enabled === false ? "Typing OFF" : `Typing ${getTypingDurationMs(rule) / 1000} Dtk`}
                       </div>
                       <div className="flex gap-2">
                         <button onClick={() => openEditForm(rule)} className="p-2 rounded-full bg-[#f0f4f9] text-[#0b57d0]"><Edit3 size={14}/></button>
                         <button onClick={() => handleDelete(rule.id)} className="p-2 rounded-full bg-rose-50 text-rose-500"><Trash2 size={14}/></button>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
