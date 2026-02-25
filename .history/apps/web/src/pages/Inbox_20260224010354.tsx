import React, { useEffect, useMemo, useState, useRef } from "react";

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

function dedupeByRemoteJid(items: any[]) {
  const seen = new Set();
  return items.filter(item => {
    const duplicate = seen.has(item.remoteJid);
    seen.add(item.remoteJid);
    return !duplicate;
  });
}

// ===== TYPES =====
type SessionRow = { session_key: string; status: string };
type ConvRow = {
  chatId: number;
  remoteJid: string;
  unreadCount: number;
  lastMessage: { id: number; direction: string; type: string; text: string | null; mediaUrl: string | null; time: string };
};
type MsgRow = {
  id: number;
  direction: "in" | "out";
  type: string;
  text: string | null;
  media: any;
  location: any;
  status: string;
  error: string | null;
  time: string;
};
type LeadRow = {
  to_number: string;
  has_replied: number;
};

// ===== HELPERS =====
function formatTime(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatChatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return formatTime(dateStr);
  if (diffDays === 1) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/**
 * FEATURE: Formatter Nomor WA Cerdas
 */
function formatPhoneNumber(jid: string) {
  if (!jid) return "";
  const num = jid.split("@")[0];
  
  if (jid.includes("@lid")) return `${num} (LID)`;
  if (jid.includes("@g.us")) return `Grup: ${num}`;
  
  if (num.startsWith("62")) {
    // Memisahkan 62 dari sisanya dan menambahkan spasi agar rapi
    return `+62 ${num.slice(2)}`;
  }
  // Cegah penambahan '+' yang salah pada nomor internal/unik
  return /^\d{10,}$/.test(num) ? `+${num}` : num;
}

export default function Inbox() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [peer, setPeer] = useState<string>("");
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Fitur Dropdown Attach & Pagination
  const [attachOpen, setAttachOpen] = useState(false);
  const [msgLimit, setMsgLimit] = useState(100);
  
  // Ref untuk kontainer pesan agar scroll bisa ditargetkan dengan bersih
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  // Fitur: Pencarian Cerdas (Mengenali +62, 08, atau spasi)
  const filteredConvs = useMemo(() => {
    if (!searchQuery) return convs;
    const q = searchQuery.replace(/\D/g, ''); // Ambil hanya angka
    
    return convs.filter(c => {
      const num = c.remoteJid.split('@')[0];
      const localNum = num.startsWith('62') ? '0' + num.slice(2) : num;
      // Filter by raw string or mapped local string (08)
      return num.includes(q) || localNum.includes(q) || c.remoteJid.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [convs, searchQuery]);

  // Perbaikan Logika Scroll
  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior
      });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // Deteksi jika user sedang scroll ke atas (threshold 50px dari bawah)
    const isBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(isBottom);
  };

  // Scroll otomatis ketika pesan BARU bertambah (Hanya jika user sedang di bawah)
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom("smooth");
    }
  }, [messages.length]);

  // Force scroll down instan saat ganti orang/peer
  useEffect(() => {
    if (peer) {
      setMsgLimit(100); // Reset limit saat ganti obrolan
      setAttachOpen(false); // Tutup menu attach
      setMessages([]); // Kosongkan sementara agar tidak flicker
      setTimeout(() => {
        scrollToBottom("auto");
        setIsAtBottom(true);
      }, 100);
    }
  }, [peer]);

  async function loadLeads() {
    try {
      const res = await apiFetch<{ ok: true; data: LeadRow[] }>("/leads?limit=1000");
      setLeads(res.data || []);
    } catch (e) { /* silent */ }
  }

  async function loadSessions() {
    try {
      const res = await apiFetch<{ ok: true; sessions: any[] }>("/ui/sessions");
      const list = (res.sessions || []).map(s => ({ session_key: s.session_key, status: s.status }));
      setSessions(list);
      if (!sessionKey && list.length) setSessionKey(list[0].session_key);
    } catch (e: any) { setErr(e.message); }
  }

  async function loadConvs(sk: string) {
    try {
      const res = await apiFetch<{ ok: true; conversations: ConvRow[] }>(`/ui/conversations?sessionKey=${encodeURIComponent(sk)}`);
      setConvs(dedupeByRemoteJid(res.conversations || []));
      if (!peer && res.conversations?.length) setPeer(res.conversations[0].remoteJid);
    } catch (e: any) { setErr(e.message); }
  }

  async function loadMessages(sk: string, p: string, limit: number) {
    try {
      const pNum = p.includes("@") ? p.split("@")[0] : p;
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(
        `/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(pNum)}&limit=${limit}`
      );
      
      setMessages(prev => {
        const newMsgs = res.messages || [];
        // FEATURE: Deep Compare agar UI tidak rerender/flicker jika pesan tidak berubah
        if (prev.length === newMsgs.length && prev[0]?.id === newMsgs[0]?.id && prev[0]?.status === newMsgs[0]?.status) {
          return prev;
        }
        return newMsgs;
      });

    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => { 
    loadSessions(); 
    loadLeads();
  }, []);

  useEffect(() => {
    if (!sessionKey) return;
    loadConvs(sessionKey);
    const t = setInterval(() => loadConvs(sessionKey), 5000);
    return () => clearInterval(t);
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer, msgLimit);
    // Polling cepat untuk centang biru & pesan baru
    const t = setInterval(() => loadMessages(sessionKey, peer, msgLimit), 3000);
    return () => clearInterval(t);
  }, [sessionKey, peer, msgLimit]);

  async function sendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/messages/send`, {
        method: "POST",
        body: JSON.stringify({ sessionKey, to: peerNumber, text: text.trim() }),
      });
      setText("");
      loadMessages(sessionKey, peer, msgLimit);
      loadConvs(sessionKey);
      scrollToBottom("smooth"); // Paksa scroll saat kirim
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  // Cek apakah nomor obrolan saat ini ada di tabel leads
  const currentLead = leads.find(l => l.to_number === peerNumber);

  return (
    <div className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem]">
      {/* SIDEBAR */}
      <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl shrink-0">
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/20 shrink-0">
          <div className="flex flex-col">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Pilih Sesi Device</label>
            <select 
              value={sessionKey} 
              onChange={(e) => setSessionKey(e.target.value)}
              className="bg-transparent text-sm font-black text-slate-800 outline-none cursor-pointer appearance-none"
            >
              {sessions.map(s => <option key={s.session_key} value={s.session_key}>📱 {s.session_key}</option>)}
            </select>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/60 flex items-center justify-center text-blue-600 shadow-sm border border-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
        </div>

        <div className="p-6 shrink-0">
          <div className="relative">
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari percakapan..."
              className="w-full pl-12 pr-6 py-4 rounded-[1.5rem] bg-white/50 border border-white/80 text-sm font-medium outline-none focus:bg-white/90 transition-all duration-500 shadow-sm"
            />
            <svg className="absolute left-4 top-4 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 scrollbar-hide">
          {filteredConvs.map(c => {
            const isActive = peer === c.remoteJid;
            const cNum = c.remoteJid.split('@')[0];
            const isLead = leads.find(l => l.to_number === cNum);
            
            return (
              <div 
                key={c.remoteJid}
                onClick={() => setPeer(c.remoteJid)}
                className={`p-5 flex items-center gap-4 rounded-[2rem] cursor-pointer transition-all duration-500 ${
                  isActive ? "bg-white/80 shadow-lg shadow-blue-500/5 border border-white scale-[1.02]" : "hover:bg-white/40"
                }`}
              >
                <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center font-black text-lg shrink-0 border border-white shadow-sm ${
                  isActive ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" : "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500"
                }`}>
                  {c.remoteJid.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    {/* FORMAT NOMOR WA & LEAD TAG */}
                    <div className="flex items-center gap-2 truncate">
                      <h3 className="text-[15px] font-extrabold text-slate-800 truncate tracking-tight">{formatPhoneNumber(c.remoteJid)}</h3>
                      {isLead && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0 border ${
                          isLead.has_replied ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}>
                          {isLead.has_replied ? '🔥 Hot' : '❄️ Cold'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter shrink-0">{formatChatDate(c.lastMessage?.time)}</span>
                  </div>
                  <p className="text-[13px] text-slate-500 font-medium truncate opacity-80">
                    {c.lastMessage?.direction === 'out' && <span className="text-blue-500 font-black mr-1">✓</span>}
                    {c.lastMessage?.text || '[Media]'}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <div className="w-6 h-6 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-black shadow-lg shadow-rose-500/30 shrink-0">
                    {c.unreadCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CHAT VIEW */}
      {peer ? (
        <div className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20">
          {/* Chat Header */}
          <div className="h-24 px-8 flex items-center border-b border-white/20 bg-white/40 backdrop-blur-xl z-20 shrink-0 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-blue-500 border border-white mr-5 shrink-0">
              {peer.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 truncate">
                <h2 className="text-xl font-black text-slate-800 tracking-tight truncate">{formatPhoneNumber(peer)}</h2>
                {/* HEAD LEADS TAG */}
                {currentLead && (
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 border ${
                    currentLead.has_replied ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>
                    {currentLead.has_replied ? '🔥 Hot Lead' : '❄️ Cold Lead'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                <p className="text-[10px] text-slate-400 font-bold tracking-[0.1em] uppercase">Terhubung & Tersinkronisasi</p>
              </div>
            </div>
          </div>

          {/* Chat Messages Container */}
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scrollbar-hide scroll-smooth relative"
          >
            {/* END-TO-END ENCRYPTION BANNER & LOAD MORE */}
            <div className="flex flex-col items-center mb-8 gap-4">
              <div className="bg-amber-50/80 border border-amber-100 text-amber-700 text-[10px] font-bold px-6 py-3 rounded-xl max-w-sm text-center leading-relaxed shadow-sm backdrop-blur-sm">
                🔒 Riwayat pesan disinkronkan secara End-to-End. Pesan Anda aman dan tidak dapat dibaca oleh pihak ketiga.
              </div>
              
              {messages.length >= msgLimit && (
                <button 
                  onClick={() => {
                    setMsgLimit(m => m + 100);
                    // Maintain current scroll visually when fetching more
                    setIsAtBottom(false); 
                  }} 
                  className="px-5 py-2 bg-white/80 border border-white text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all"
                >
                  Muat Pesan Sebelumnya
                </button>
              )}
            </div>

            {messages.slice().reverse().map((m) => {
              const isOut = m.direction === "out";
              return (
                <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[75%] px-6 py-4 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.04)] relative transition-all duration-500 ${
                    isOut 
                    ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-none" 
                    : "bg-white/90 backdrop-blur-xl text-slate-700 rounded-tl-none border border-white"
                  }`}>
                    <p className="text-[15px] leading-relaxed font-medium break-words">{m.text}</p>
                    <div className="text-[9px] mt-2 flex justify-end items-center gap-1.5 opacity-70 font-black uppercase tracking-widest">
                      {formatTime(m.time)}
                      {isOut && (
                        <span className={`text-[11px] ${m.status === 'read' ? 'text-cyan-300' : 'text-white/60'}`}>
                          {m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Area & Attachments */}
          <div className="p-6 md:p-8 bg-transparent z-20 shrink-0 border-t border-white/20 relative">
            
            {/* ATTACHMENT MENU UI */}
            {attachOpen && (
              <div className="absolute bottom-28 left-8 bg-white/95 backdrop-blur-xl border border-white/80 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2 z-50 animate-in slide-in-from-bottom-4 min-w-[220px]">
                <button onClick={() => { alert('Fitur Kirim Dokumen sedang dalam tahap pengembangan!'); setAttachOpen(false); }} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-2xl text-slate-700 font-bold transition-all text-sm w-full text-left">
                  <span className="text-blue-500 text-xl drop-shadow-sm">📄</span> Dokumen
                </button>
                <button onClick={() => { alert('Fitur Kirim Media sedang dalam tahap pengembangan!'); setAttachOpen(false); }} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-2xl text-slate-700 font-bold transition-all text-sm w-full text-left">
                  <span className="text-emerald-500 text-xl drop-shadow-sm">📷</span> Foto & Video
                </button>
                <button onClick={() => { alert('Fitur Kirim Lokasi sedang dalam tahap pengembangan!'); setAttachOpen(false); }} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-2xl text-slate-700 font-bold transition-all text-sm w-full text-left">
                  <span className="text-amber-500 text-xl drop-shadow-sm">📍</span> Lokasi
                </button>
              </div>
            )}

            <div className="max-w-4xl mx-auto flex items-end gap-4 bg-white/60 backdrop-blur-3xl p-3 rounded-[2rem] border border-white shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
              <button 
                onClick={() => setAttachOpen(!attachOpen)}
                className={`w-12 h-12 flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-90 rounded-[1.2rem] shadow-sm shrink-0 border ${
                  attachOpen ? 'bg-blue-50 border-blue-100 text-blue-600 rotate-45' : 'bg-white border-white text-slate-400 hover:text-blue-600'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              </button>
              
              <textarea 
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
                placeholder="Ketik pesan balasan..."
                className="flex-1 bg-transparent border-none py-3 px-2 text-[15px] font-bold outline-none resize-none max-h-32 text-slate-700 placeholder-slate-400 leading-relaxed"
                rows={1}
              />

              <button 
                onClick={sendText}
                disabled={!text.trim() || sending}
                className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all duration-500 shrink-0 ${
                  text.trim() ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95" : "bg-slate-100 text-slate-300 cursor-not-allowed"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-white/5 relative border-l border-white/20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-400/5 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="w-32 h-32 rounded-[3.5rem] bg-white/40 border border-white mb-8 flex items-center justify-center text-blue-500 shadow-2xl shadow-blue-500/10 backdrop-blur-3xl transform rotate-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] relative z-10">Pilih Obrolan untuk Memulai</p>
        </div>
      )}
    </div>
  );
}