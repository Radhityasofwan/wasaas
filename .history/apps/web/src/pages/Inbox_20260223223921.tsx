import { useEffect, useMemo, useState, useRef } from "react";

/**
 * HELPER INTERNAL (Pengganti lib/api & lib/upload untuk stabilitas pratinjau)
 * Anda bisa menghapus bagian ini jika menyalin kode ke proyek lokal Anda.
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

export default function Inbox() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [peer, setPeer] = useState<string>("");
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  const filteredConvs = useMemo(() => {
    if (!searchQuery) return convs;
    return convs.filter(c => c.remoteJid.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [convs, searchQuery]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  async function loadMessages(sk: string, p: string) {
    try {
      const pNum = p.includes("@") ? p.split("@")[0] : p;
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(
        `/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(pNum)}&limit=50`
      );
      setMessages(res.messages || []);
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    if (!sessionKey) return;
    loadConvs(sessionKey);
    const t = setInterval(() => loadConvs(sessionKey), 5000);
    return () => clearInterval(t);
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer);
    const t = setInterval(() => loadMessages(sessionKey, peer), 3000);
    return () => clearInterval(t);
  }, [sessionKey, peer]);

  async function sendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/messages/send`, {
        method: "POST",
        body: JSON.stringify({ sessionKey, to: peerNumber, text: text.trim() }),
      });
      setText("");
      loadMessages(sessionKey, peer);
      loadConvs(sessionKey);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full bg-transparent overflow-hidden rounded-[2.5rem]">
      {/* SIDEBAR */}
      <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl">
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/20">
          <div className="flex flex-col">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Pilih Sesi</label>
            <select 
              value={sessionKey} 
              onChange={(e) => setSessionKey(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer appearance-none"
            >
              {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
            </select>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/60 flex items-center justify-center text-blue-600 shadow-sm border border-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
        </div>

        <div className="p-6">
          <div className="relative">
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari percakapan..."
              className="w-full pl-12 pr-6 py-4 rounded-3xl bg-white/50 border border-white/80 text-sm font-medium outline-none focus:bg-white/90 transition-all duration-500 shadow-sm"
            />
            <svg className="absolute left-4 top-4 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 scrollbar-hide">
          {filteredConvs.map(c => {
            const isActive = peer === c.remoteJid;
            return (
              <div 
                key={c.remoteJid}
                onClick={() => setPeer(c.remoteJid)}
                className={`p-5 flex items-center gap-5 rounded-[2rem] cursor-pointer transition-all duration-500 ${
                  isActive ? "bg-white/80 shadow-lg shadow-blue-500/5 border border-white" : "hover:bg-white/40"
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-blue-500 font-black text-xl shadow-sm border border-white">
                  {c.remoteJid.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-[15px] font-extrabold text-slate-800 truncate tracking-tight">{c.remoteJid.split('@')[0]}</h3>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{formatChatDate(c.lastMessage?.time)}</span>
                  </div>
                  <p className="text-[13px] text-slate-500 font-medium truncate opacity-70">
                    {c.lastMessage?.direction === 'out' && '✓ '}
                    {c.lastMessage?.text || '[Media]'}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-black shadow-lg shadow-blue-500/30">
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
        <div className="flex-1 flex flex-col relative bg-white/10">
          <div className="h-24 px-8 flex items-center border-b border-white/20 bg-white/40 backdrop-blur-xl z-20">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-blue-500 border border-white mr-5">
              {peer.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-slate-800 tracking-tight">{peer.split('@')[0]}</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <p className="text-[10px] text-slate-400 font-black tracking-[0.1em] uppercase">Aktif Sekarang</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-10 space-y-6 scrollbar-hide">
            {messages.slice().reverse().map((m) => {
              const isOut = m.direction === "out";
              return (
                <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] px-6 py-4 rounded-[2rem] shadow-[0_4px_12px_rgba(0,0,0,0.03)] relative transition-all duration-500 ${
                    isOut 
                    ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-none" 
                    : "bg-white/80 backdrop-blur-xl text-slate-700 rounded-tl-none border border-white/60"
                  }`}>
                    <p className="text-[15px] leading-relaxed font-medium">{m.text}</p>
                    <div className="text-[9px] mt-2 flex justify-end gap-2 opacity-60 font-black uppercase tracking-widest">
                      {formatTime(m.time)}
                      {isOut && (m.status === 'read' ? '✓✓' : '✓')}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-8 bg-transparent z-20">
            <div className="max-w-4xl mx-auto flex items-end gap-4 bg-white/40 backdrop-blur-3xl p-3 rounded-[2.5rem] border border-white shadow-lg">
              <button 
                onClick={() => setAttachOpen(!attachOpen)}
                className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all duration-500 hover:scale-110 active:scale-90"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              </button>
              
              <textarea 
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
                placeholder="Tulis pesan..."
                className="flex-1 bg-transparent border-none py-4 px-2 text-[15px] font-semibold outline-none resize-none max-h-32 text-slate-700 placeholder-slate-400"
                rows={1}
              />

              <button 
                onClick={sendText}
                disabled={!text.trim() || sending}
                className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-all duration-500 ${
                  text.trim() ? "bg-blue-600 text-white shadow-xl shadow-blue-600/30 hover:scale-105" : "bg-slate-100 text-slate-300 cursor-not-allowed"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-32 h-32 rounded-[3rem] bg-white/40 border border-white mb-10 flex items-center justify-center text-blue-500 shadow-xl shadow-blue-500/5 backdrop-blur-2xl">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Pilih Obrolan untuk Memulai</p>
        </div>
      )}
    </div>
  );
}