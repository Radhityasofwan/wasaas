/**
 * ============================================================================
 * INBOX.TSX - WHATSAPP WEB SAAS UI (ENTERPRISE EDITION)
 * ============================================================================
 */

import React, { 
  useEffect, useMemo, useState, useRef, useCallback, ErrorInfo, Component
} from "react";
import { 
  Activity, Clock, Tag, CheckCheck, X, Check, Search, 
  Paperclip, Send, Plus, Image as ImageIcon, FileText, 
  MapPin, Trash2, Megaphone, CalendarClock, Layers, 
  MessageSquare, MessageCircle, Users, User, Loader2, AlertTriangle
} from "lucide-react";

// ============================================================================
// 1. ERROR BOUNDARY
// ============================================================================

interface ErrorBoundaryProps { children: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Inbox Component Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 text-slate-600 p-8 text-center rounded-[2.5rem]">
          <AlertTriangle size={64} className="text-rose-500 mb-6 drop-shadow-md" strokeWidth={1.5} />
          <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-3">Terjadi Kesalahan Render</h2>
          <p className="text-sm font-medium mb-6 max-w-md leading-relaxed">
            Komponen Inbox mengalami gangguan. Silakan muat ulang halaman.
            <span className="text-xs font-mono text-rose-500 mt-4 block bg-rose-50 p-3 rounded-lg border border-rose-100 text-left overflow-auto">
              {this.state.error?.message || "Unknown Error"}
            </span>
          </p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 bg-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all">
            Muat Ulang Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// 2. API UTILITIES
// ============================================================================

const getApiKey = (): string => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

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
  try { data = text ? JSON.parse(text) : {}; } 
  catch (e) { throw new Error(`Server Error (HTTP ${res.status}).`); }
  
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

// ============================================================================
// 3. TYPES & FORMATTERS
// ============================================================================

export interface SessionRow { session_key: string; status: string; }
export interface ConvRow {
  chatId: number; remoteJid: string; name?: string | null; unreadCount: number;
  lastMessage: { id: number; direction: string; type: string; text: string | null; mediaUrl: string | null; time: string; status: string; pushName?: string | null; };
}
export interface MsgRow {
  id: number; direction: "in" | "out"; type: string; text: string | null; media: any; location: any; status: string; error: string | null; time: string; participant?: string | null; pushName?: string | null;   
}
export interface LeadRow { to_number: string; has_replied: number; }
export interface CustomLabel { name: string; color: string; }

export const LABEL_COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-slate-800'];

export const getSenderColor = (jid: string): string => {
  const colors = ['text-rose-500', 'text-blue-500', 'text-emerald-600', 'text-amber-600', 'text-purple-500', 'text-cyan-600', 'text-pink-500', 'text-indigo-500'];
  if (!jid) return colors[0];
  let hash = 0;
  for (let i = 0; i < jid.length; i++) hash = jid.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export function normalizeDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  let safeStr = dateStr;
  if (safeStr.includes(" ") && !safeStr.includes("T")) {
    safeStr = safeStr.replace(" ", "T");
    if (!safeStr.endsWith("Z")) safeStr += "Z"; 
  }
  const d = new Date(safeStr);
  d.setHours(d.getHours() + 7); 
  return d;
}

export function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  return normalizeDate(dateStr).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function formatChatDate(dateStr: string, nowTime: Date): string {
  if (!dateStr) return "";
  const d = normalizeDate(dateStr);
  const isToday = nowTime.toLocaleDateString("id-ID") === d.toLocaleDateString("id-ID");
  const yesterday = new Date(nowTime);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toLocaleDateString("id-ID") === d.toLocaleDateString("id-ID");

  if (isToday) return formatTime(dateStr);
  if (isYesterday) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatContactName(jid: string, name?: string | null): string {
  const isGroup = jid.includes("@g.us");
  if (name && name.trim() !== "" && name !== jid) return name; 
  if (isGroup) return "Grup Obrolan";
  if (!jid) return "Unknown";
  const num = jid.split("@")[0];
  if (jid.includes("@lid")) return `~${num} (LID)`;
  if (num.startsWith("62")) return `+62 ${num.slice(2)}`;
  return num; 
}

// ============================================================================
// 4. SUB-COMPONENTS
// ============================================================================

const EmptyChatState: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 relative border-l border-slate-200 animate-in fade-in duration-500 overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
    <div className="w-32 h-32 rounded-[3.5rem] bg-white border border-slate-100 mb-8 flex items-center justify-center text-indigo-500 shadow-2xl shadow-indigo-500/10 transform rotate-3 relative z-10">
      <MessageCircle size={56} strokeWidth={1.5} />
    </div>
    <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-3 relative z-10">WA SaaS Enterprise</h2>
    <p className="text-sm font-medium text-slate-500 relative z-10 max-w-sm text-center leading-relaxed">
      Sistem telah terhubung. Pilih atau cari percakapan di bilah kiri untuk mulai berinteraksi dengan pelanggan Anda.
    </p>
  </div>
);

const MessageBubble: React.FC<{ msg: MsgRow; liveTime: Date; isGroup: boolean }> = ({ msg, liveTime, isGroup }) => {
  const isOut = msg.direction === "out";

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[85%] md:max-w-[75%] lg:max-w-[65%] px-5 py-3.5 rounded-[1.5rem] shadow-sm relative transition-all group border ${isOut ? "bg-indigo-600 text-white rounded-br-sm border-indigo-700" : "bg-white text-slate-800 rounded-bl-sm border-slate-200"}`}>
        
        {isGroup && !isOut && (
          <div className={`text-[12px] font-black mb-1.5 uppercase tracking-wide cursor-pointer hover:underline ${getSenderColor(msg.participant || '')}`}>
             {msg.pushName || formatContactName(msg.participant || "Anggota")}
          </div>
        )}

        {msg.type === 'image' && (
          <div className={`mb-2 text-[10px] font-bold uppercase tracking-widest inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${isOut ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <ImageIcon size={14} /> Gambar
          </div>
        )}
        
        {msg.type === 'document' && (
          <div className={`mb-2 text-[10px] font-bold uppercase tracking-widest inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${isOut ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <FileText size={14} /> Dokumen
          </div>
        )}
        
        {msg.type === 'location' && (
          <div className={`mb-2 text-[10px] font-bold uppercase tracking-widest inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${isOut ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <MapPin size={14} /> Lokasi Peta
          </div>
        )}

        <p className="text-[14px] leading-relaxed font-medium break-words whitespace-pre-wrap">
          {msg.text || (msg.type !== 'text' ? '[File Media]' : '')}
        </p>
        
        <div className="text-[9px] mt-2 flex justify-end items-center gap-1.5 opacity-80 font-black uppercase tracking-widest">
          {formatTime(msg.time)}
          {isOut && (
            <span className={`text-[13px] ${msg.status === 'read' ? 'text-cyan-300' : 'text-white/70'}`}>
              {msg.status === 'read' ? <CheckCheck size={14} strokeWidth={3} /> : 
               msg.status === 'delivered' ? <CheckCheck size={14} strokeWidth={2.5} /> : 
               msg.status === 'failed' ? <X size={14} className="text-rose-300" strokeWidth={3} /> : 
               <Check size={14} strokeWidth={2.5} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. MAIN COMPONENT (INBOX)
// ============================================================================

function InboxComponent() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [liveTime, setLiveTime] = useState<Date>(new Date());
  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const [customLabels, setCustomLabels] = useState<Record<string, CustomLabel>>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("wa_inbox_labels") || "{}"); } 
      catch { return {}; }
    }
    return {};
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("wa_inbox_labels", JSON.stringify(customLabels));
  }, [customLabels]);
  
  const uniqueLabels = useMemo(() => {
    const map = new Map<string, CustomLabel>();
    Object.values(customLabels).forEach(l => { if (!map.has(l.name)) map.set(l.name, l); });
    return Array.from(map.values());
  }, [customLabels]);

  const [peer, setPeer] = useState<string>("");
  const activePeerRef = useRef<string>("");
  useEffect(() => { activePeerRef.current = peer; }, [peer]);

  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'personal' | 'group' | 'unread' | 'read' | string>('all');
  
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [attachOpen, setAttachOpen] = useState<boolean>(false);
  const [msgLimit, setMsgLimit] = useState<number>(100);
  
  // Modals
  const [mediaModal, setMediaModal] = useState<{ open: boolean; type: 'image' | 'document' | 'location'; }>({ open: false, type: 'image' });
  const [mediaPayload, setMediaPayload] = useState({ url: "", caption: "", lat: "", lng: "" });
  const [bcModal, setBcModal] = useState<{ open: boolean; targets: string[]; }>({ open: false, targets: [] });
  const [bcPayload, setBcPayload] = useState({ text: "", delay: "2000" });
  const [labelModal, setLabelModal] = useState<{ open: boolean; targets: string[]; }>({ open: false, targets: [] });
  const [labelPayload, setLabelPayload] = useState({ name: "Penting", color: "bg-blue-500" });
  const [fuModal, setFuModal] = useState<{ open: boolean; targets: string[]; }>({ open: false, targets: [] });
  const [fuPayload, setFuPayload] = useState({ campaignId: "" });
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  const filteredConvs = useMemo(() => {
    let result = [...convs];
    
    result.sort((a, b) => normalizeDate(b.lastMessage?.time || "").getTime() - normalizeDate(a.lastMessage?.time || "").getTime());

    if (activeFilter === 'unread') result = result.filter(c => c.unreadCount > 0);
    else if (activeFilter === 'personal') result = result.filter(c => !c.remoteJid.includes('@g.us'));
    else if (activeFilter === 'group') result = result.filter(c => c.remoteJid.includes('@g.us'));
    else if (activeFilter === 'read') result = result.filter(c => c.unreadCount === 0);
    else if (activeFilter.startsWith('label_')) {
      const lblName = activeFilter.replace('label_', '');
      result = result.filter(c => customLabels[c.remoteJid.split('@')[0]]?.name === lblName);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const cleanQ = q.replace(/\D/g, ''); 
      result = result.filter(c => {
        const numOnly = c.remoteJid.split('@')[0];
        const matchString = c.remoteJid.toLowerCase().includes(q);
        const matchName = c.name?.toLowerCase().includes(q) || false;
        const matchNumber = cleanQ && numOnly.includes(cleanQ);
        const lbl = customLabels[numOnly]?.name.toLowerCase() || "";
        return matchString || matchName || matchNumber || lbl.includes(q);
      });
    }

    return result;
  }, [convs, searchQuery, customLabels, activeFilter]);

  const scrollToBottom = useCallback((behavior: "smooth" | "auto" = "smooth") => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior });
    }
  }, []);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
  };

  useEffect(() => { 
    if (isAtBottom && messages.length > 0) setTimeout(() => scrollToBottom("smooth"), 100);
  }, [messages, isAtBottom, scrollToBottom]);

  const handleSelectChat = (jid: string) => {
    if (isSelectionMode) {
      setSelectedPeers(p => p.includes(jid) ? p.filter(x => x !== jid) : [...p, jid]);
    } else {
      setPeer(jid);
      setConvs(prev => prev.map(c => c.remoteJid === jid ? { ...c, unreadCount: 0 } : c));
      setMsgLimit(100);
      setAttachOpen(false);
      setMessages([]); 
      setTimeout(() => { scrollToBottom("auto"); setIsAtBottom(true); }, 100);
      apiFetch("/ui/conversations/read", { method: "POST", body: JSON.stringify({ sessionKey, peer: jid }) }).catch(()=>{});
    }
  };

  const loadLeads = async () => { try { const res = await apiFetch<any>("leads?limit=1000"); setLeads(res.data || []); } catch (e) {} };
  const loadCampaigns = async () => { 
    try { 
      const res = await apiFetch<any>("followup/campaigns?status=active"); 
      setCampaigns(res.data || []); 
      if (res.data?.length > 0) setFuPayload(p => ({ ...p, campaignId: String(res.data[0].id) })); 
    } catch (e) {} 
  };

  const loadSessions = async () => {
    try { 
      const res = await apiFetch<any>("ui/sessions"); 
      const list = (res.sessions || []).map((s:any) => ({ session_key: s.session_key, status: s.status })); 
      setSessions(list); 
      if (!sessionKey && list.length > 0) setSessionKey(list[0].session_key);
    } catch (e: any) { setErr(e.message); } finally { setIsAppLoading(false); }
  };

  const loadConvs = useCallback(async (sk: string) => {
    try { 
      const res = await apiFetch<any>(`ui/conversations?sessionKey=${encodeURIComponent(sk)}`); 
      const deduped = dedupeByRemoteJid(res.conversations || []); 
      setConvs(deduped.map(c => c.remoteJid === activePeerRef.current ? { ...c, unreadCount: 0 } : c));
    } catch (e: any) { setErr(e.message); }
  }, []);

  const loadMessages = useCallback(async (sk: string, p: string, limit: number) => {
    try {
      const res = await apiFetch<any>(`ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(p)}&limit=${limit}`);
      setMessages(prev => {
        const newMsgs = res.messages || [];
        if (prev.length !== newMsgs.length || prev.length === 0) return newMsgs;
        let hasChanges = false;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== newMsgs[i].id || prev[i].status !== newMsgs[i].status) { hasChanges = true; break; }
        }
        return hasChanges ? newMsgs : prev;
      });
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => { loadSessions(); loadLeads(); loadCampaigns(); }, []);

  useEffect(() => {
    if (!sessionKey) return;
    loadConvs(sessionKey); 
    const intervalId = setInterval(() => loadConvs(sessionKey), 5000);
    return () => clearInterval(intervalId);
  }, [sessionKey, loadConvs]);

  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer, msgLimit); 
    const intervalId = setInterval(() => loadMessages(sessionKey, peer, msgLimit), 3000);
    return () => clearInterval(intervalId);
  }, [sessionKey, peer, msgLimit, loadMessages]);

  async function sendTextPayload() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`messages/send`, { method: "POST", body: JSON.stringify({ sessionKey, to: peer, text: text.trim() }) });
      setText("");
      await loadMessages(sessionKey, peer, msgLimit);
      await loadConvs(sessionKey);
      scrollToBottom("smooth");
    } catch (e: any) { alert("Gagal mengirim: " + e.message); } 
    finally { setSending(false); }
  }

  async function executeDeleteChats() {
    if (!confirm(`Hapus permanen ${selectedPeers.length} obrolan terpilih?`)) return;
    try { 
      await apiFetch("ui/conversations/delete", { method: "POST", body: JSON.stringify({ sessionKey, peers: selectedPeers }) }); 
      if (selectedPeers.includes(peer)) setPeer(""); 
      setSelectedPeers([]); setIsSelectionMode(false); loadConvs(sessionKey); 
    } catch (e: any) { alert("Gagal menghapus: " + e.message); }
  }

  async function executeScheduleBroadcast() {
    if (!bcPayload.text.trim()) return alert("Pesan tidak boleh kosong.");
    try { 
      const cleanTargets = bcModal.targets.map(t => t.split('@')[0]); 
      await apiFetch("broadcast/create", { method: "POST", body: JSON.stringify({ sessionKey, text: bcPayload.text, delayMs: Number(bcPayload.delay), name: `Broadcast Manual Inbox (${cleanTargets.length} Nomor)`, targets: cleanTargets }) }); 
      setBcModal({ open: false, targets: [] }); setBcPayload({ text: "", delay: "2000" }); setSelectedPeers([]); setIsSelectionMode(false); 
      alert(`Berhasil menjadwalkan broadcast ke ${cleanTargets.length} nomor.`); 
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  async function executeAddToFollowUp() {
    if (!fuPayload.campaignId) return alert("Pilih campaign terlebih dahulu.");
    try { 
      const cleanTargets = fuModal.targets.map(t => t.split('@')[0]); 
      await apiFetch("followup/add-targets", { method: "POST", body: JSON.stringify({ sessionKey, campaignId: fuPayload.campaignId, targets: cleanTargets }) }); 
      setFuModal({ open: false, targets: [] }); setSelectedPeers([]); setIsSelectionMode(false); 
      alert(`Berhasil memasukkan ${cleanTargets.length} nomor ke dalam antrean Follow Up.`); 
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  async function executeSetLabel() {
    if (!labelPayload.name.trim()) return;
    try { 
      setCustomLabels(prev => { 
        const next = { ...prev }; 
        labelModal.targets.forEach(t => { next[t.split('@')[0]] = { name: labelPayload.name, color: labelPayload.color }; }); 
        return next; 
      }); 
      apiFetch("leads/label", { method: "POST", body: JSON.stringify({ targets: labelModal.targets.map(t => t.split('@')[0]), label: labelPayload.name, color: labelPayload.color }) }).catch(()=>{}); 
      setLabelModal({ open: false, targets: [] }); setSelectedPeers([]); setIsSelectionMode(false); 
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  const removeLabel = (targetNum: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (!confirm("Hapus label dari kontak ini?")) return;
    setCustomLabels(prev => { const next = { ...prev }; delete next[targetNum]; return next; });
  };

  async function executeSendMedia() {
    if (sending) return;
    setSending(true);
    try {
      const isLoc = mediaModal.type === 'location';
      const payload = isLoc 
        ? { sessionKey, to: peer, latitude: Number(mediaPayload.lat), longitude: Number(mediaPayload.lng) } 
        : { sessionKey, to: peer, type: mediaModal.type, url: mediaPayload.url, caption: mediaPayload.caption };
      
      const endpoint = isLoc ? 'messages/send-location' : 'messages/send-media';
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      
      setMediaModal({ open: false, type: 'image' }); 
      setMediaPayload({ url: "", caption: "", lat: "", lng: "" }); 
      loadMessages(sessionKey, peer, msgLimit); 
    } catch (e: any) { 
      alert("Gagal mengirim media. Pastikan URL valid. " + e.message); 
    } finally { setSending(false); }
  }

  const currentConv = convs.find(c => c.remoteJid === peer);
  const currentLead = leads.find(l => l.to_number === peerNumber);
  const currentLabel = customLabels[peerNumber];

  if (isAppLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-transparent text-slate-400 gap-4">
        <Loader2 size={40} className="animate-spin text-indigo-500" />
        <p className="font-bold tracking-widest uppercase text-xs animate-pulse">Menghubungkan ke Server...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2rem] border border-white/50 shadow-sm relative">
      
      {/* ----------------- SIDEBAR KIRI ----------------- */}
      <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-white/30 bg-white/40 backdrop-blur-2xl shrink-0 z-10">
        
        {/* Header Sesi */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-white/40 shrink-0">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-0.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sesi Aktif</label>
              <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} className="bg-transparent text-lg font-black text-slate-800 outline-none cursor-pointer appearance-none w-full">
              {sessions.map(s => <option key={s.session_key} value={s.session_key}>📱 {s.session_key}</option>)}
              {sessions.length === 0 && <option value="">Tidak ada sesi aktif</option>}
            </select>
          </div>
          
          <button onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedPeers([]); }} className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border transition-all ${isSelectionMode ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/60 text-slate-500 hover:text-indigo-600 hover:bg-white'}`} title="Pilih Banyak Obrolan (Bulk Mode)">
            {isSelectionMode ? <X size={18} strokeWidth={3} /> : <CheckCheck size={18} strokeWidth={2.5} />}
          </button>
        </div>

        {/* Pencarian & Filter */}
        <div className="p-5 shrink-0 border-b border-white/40 bg-white/20">
          <div className="relative mb-3">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari nama atau nomor..." className="w-full pl-10 pr-8 py-3 rounded-xl bg-white border border-white/80 text-sm font-semibold outline-none focus:ring-4 focus:ring-indigo-500/10 shadow-sm" />
            <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"><X size={16} /></button>}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
             <button onClick={() => setActiveFilter('all')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white/60 text-slate-500 border-white hover:bg-white'}`}>Semua</button>
             <button onClick={() => setActiveFilter('unread')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === 'unread' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white/60 text-emerald-600 border-white hover:bg-emerald-50'}`}>Belum Dibaca</button>
             <button onClick={() => setActiveFilter('personal')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === 'personal' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/60 text-indigo-600 border-white hover:bg-indigo-50'}`}>Japri</button>
             {uniqueLabels.map(l => (
               <button key={l.name} onClick={() => setActiveFilter(`label_${l.name}`)} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === `label_${l.name}` ? l.color + ' text-white border-transparent' : 'bg-white/60 text-slate-600 border-white hover:bg-white'}`}>
                 {l.name}
               </button>
             ))}
          </div>
        </div>

        {/* Daftar Obrolan */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-hide pb-20">
          {filteredConvs.length === 0 && (
            <div className="text-center p-8 text-slate-400 opacity-80">
               <MessageSquare size={40} className="mx-auto mb-3" />
               <p className="text-xs font-bold">Tidak ada obrolan ditemukan.</p>
            </div>
          )}

          {filteredConvs.map(c => {
            const cNum = c.remoteJid.split('@')[0];
            const isActive = peer === c.remoteJid && !isSelectionMode;
            const isSelected = selectedPeers.includes(c.remoteJid);
            const isLead = leads.find(l => l.to_number === cNum);
            const lLabel = customLabels[cNum];
            const isGroup = c.remoteJid.includes('@g.us');
            const contactDisplayName = formatContactName(c.remoteJid, c.name);
            const isUnread = c.unreadCount > 0;
            const isOutMsg = c.lastMessage?.direction === 'out';
            const groupSenderPrefix = isGroup && !isOutMsg && c.lastMessage?.pushName ? `${c.lastMessage.pushName}: ` : '';
            
            return (
              <div key={c.remoteJid} onClick={() => handleSelectChat(c.remoteJid)} className={`p-3.5 flex items-stretch gap-3 rounded-[1.2rem] cursor-pointer transition-all border ${isActive ? "bg-white shadow-md border-indigo-100 ring-2 ring-indigo-50" : isSelected ? "bg-indigo-50 border-indigo-200" : "hover:bg-white/60 border-transparent"}`}>
                
                {isSelectionMode ? (
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border-2 transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200'}`}>
                    {isSelected && <CheckCheck size={20} strokeWidth={3} />}
                  </div>
                ) : (
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shrink-0 border shadow-sm relative ${isGroup ? "bg-gradient-to-br from-amber-50 to-orange-50 text-amber-500 border-amber-100" : "bg-white text-indigo-600 border-slate-100"}`}>
                    {isGroup ? <Users size={20} /> : contactDisplayName.charAt(0).toUpperCase()}
                    {isUnread && !isActive && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>}
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className={`text-[14px] truncate tracking-tight mb-0.5 ${isUnread ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{contactDisplayName}</h3>
                  <p className={`text-[12px] truncate flex items-center gap-1.5 ${isUnread ? 'text-slate-800 font-bold' : 'text-slate-500'}`}>
                    {isOutMsg && <span className={c.lastMessage.status === 'read' ? 'text-cyan-500' : 'text-slate-400'}>{c.lastMessage.status === 'read' ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
                    <span className="truncate">{groupSenderPrefix}{c.lastMessage?.text || '[Media]'}</span>
                  </p>
                  
                  {/* Labels Row */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {lLabel && <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${lLabel.color}`}>{lLabel.name}</span>}
                    {isLead && <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${isLead.has_replied ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{isLead.has_replied ? 'Hot Lead' : 'Cold'}</span>}
                  </div>
                </div>

                <div className="flex flex-col items-end pt-1 gap-1.5 shrink-0">
                  <span className={`text-[10px] font-semibold ${isUnread ? 'text-emerald-500' : 'text-slate-400'}`}>{formatChatDate(c.lastMessage?.time, liveTime)}</span>
                  {isUnread && !isSelectionMode && <div className="min-w-[20px] h-[20px] rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-black px-1.5 shadow-sm">{c.unreadCount > 99 ? '99+' : c.unreadCount}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* BULK ACTION BAR */}
        {isSelectionMode && selectedPeers.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900 rounded-2xl p-3 shadow-2xl border border-slate-700 flex items-center justify-between animate-in slide-in-from-bottom-6 z-50">
             <span className="text-[10px] font-black text-white bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">{selectedPeers.length} Dipilih</span>
             <div className="flex gap-1.5">
                <button onClick={() => setLabelModal({ open: true, targets: selectedPeers })} className="p-2.5 bg-slate-800 hover:bg-indigo-600 rounded-xl text-white transition-colors" title="Beri Label"><Tag size={16} /></button>
                <button onClick={() => setBcModal({ open: true, targets: selectedPeers })} className="p-2.5 bg-slate-800 hover:bg-emerald-600 rounded-xl text-white transition-colors" title="Kirim Broadcast"><Megaphone size={16} /></button>
                <button onClick={() => setFuModal({ open: true, targets: selectedPeers })} className="p-2.5 bg-slate-800 hover:bg-orange-500 rounded-xl text-white transition-colors" title="Follow Up Otomatis"><CalendarClock size={16} /></button>
                <div className="w-[1px] h-6 bg-slate-700 mx-1 self-center"></div>
                <button onClick={executeDeleteChats} className="p-2.5 bg-slate-800 hover:bg-rose-600 rounded-xl text-rose-400 hover:text-white transition-colors" title="Hapus"><Trash2 size={16} /></button>
             </div>
          </div>
        )}
      </div>

      {/* ----------------- AREA KANAN (RUANG OBROLAN) ----------------- */}
      {peer ? (
        <div className="flex-1 flex flex-col relative bg-white/30 backdrop-blur-xl min-w-0 border-l border-white/20">
          
          {/* Header Obrolan */}
          <div className="h-20 px-8 flex items-center border-b border-white/40 bg-white/60 z-20 shrink-0 justify-between">
            <div className="flex items-center flex-1 min-w-0 gap-4">
              <div className={`w-12 h-12 rounded-xl shadow-sm flex items-center justify-center font-black text-xl border shrink-0 ${peer.includes('@g.us') ? "bg-amber-50 text-amber-500 border-amber-100" : "bg-white text-indigo-600 border-slate-100"}`}>
                {peer.includes('@g.us') ? <Users size={24} /> : (currentConv?.name ? currentConv.name.charAt(0) : peer.charAt(0)).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black text-slate-800 tracking-tight truncate">{formatContactName(peer, currentConv?.name)}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {currentLabel && <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-white ${currentLabel.color} flex items-center gap-1`}>{currentLabel.name} <button onClick={(e) => removeLabel(peerNumber, e)}><X size={10}/></button></span>}
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Terkoneksi Penuh</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setLabelModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-xl bg-white text-slate-500 hover:text-indigo-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:bg-indigo-50" title="Beri Label"><Tag size={18} /></button>
              <button onClick={() => setBcModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-xl bg-white text-slate-500 hover:text-emerald-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:bg-emerald-50" title="Broadcast"><Megaphone size={18} /></button>
              <button onClick={() => setFuModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-xl bg-white text-slate-500 hover:text-orange-500 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:bg-orange-50" title="Follow Up"><CalendarClock size={18} /></button>
            </div>
          </div>

          {/* Area Pesan */}
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 scrollbar-hide scroll-smooth relative bg-slate-50/30">
            <div className="flex justify-center mb-8 pt-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-4 py-2 rounded-lg text-center max-w-xs shadow-sm">🔒 Enkripsi End-to-End diatur oleh WhatsApp Baileys Engine.</div>
            </div>
            
            {messages.length >= msgLimit && (
              <div className="flex justify-center mb-6">
                <button onClick={() => { setMsgLimit(m => m + 100); setIsAtBottom(false); }} className="px-5 py-2 bg-white border border-slate-200 text-indigo-600 font-bold text-[10px] uppercase tracking-widest rounded-full shadow-sm hover:bg-indigo-50 transition-all">Muat Pesan Sebelumnya</button>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} liveTime={liveTime} isGroup={peer.includes('@g.us')} />
            ))}
            
            {sending && (
              <div className="flex justify-end animate-in fade-in">
                <div className="px-5 py-3 rounded-2xl bg-indigo-100 rounded-br-sm flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              </div>
            )}
          </div>

          {/* Form Input Pesan */}
          <div className="p-5 bg-white/80 backdrop-blur-2xl z-20 shrink-0 border-t border-slate-200 relative">
            {attachOpen && (
              <div className="absolute bottom-24 left-6 bg-white border border-slate-200 p-3 rounded-2xl shadow-xl flex flex-col gap-1 z-50 animate-in slide-in-from-bottom-2 w-48">
                <button onClick={() => { setMediaModal({ open: true, type: 'document' }); setAttachOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 rounded-xl text-slate-700 font-bold text-xs text-left"><FileText size={16} className="text-blue-500" /> Dokumen</button>
                <button onClick={() => { setMediaModal({ open: true, type: 'image' }); setAttachOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 rounded-xl text-slate-700 font-bold text-xs text-left"><ImageIcon size={16} className="text-emerald-500" /> Gambar / Foto</button>
                <button onClick={() => { setMediaModal({ open: true, type: 'location' }); setAttachOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 rounded-xl text-slate-700 font-bold text-xs text-left"><MapPin size={16} className="text-amber-500" /> Titik Lokasi</button>
              </div>
            )}

            <div className="flex items-end gap-3 bg-white p-2.5 rounded-[1.5rem] border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-300 transition-all">
              <button onClick={() => setAttachOpen(!attachOpen)} className={`w-11 h-11 flex items-center justify-center rounded-xl shrink-0 transition-colors ${attachOpen ? 'bg-indigo-100 text-indigo-600 rotate-45' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
                <Plus size={22} strokeWidth={2.5} />
              </button>
              <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextPayload(); } }} className="flex-1 bg-transparent border-none py-3 px-2 text-[15px] font-medium outline-none resize-none max-h-32 text-slate-700 placeholder-slate-400" placeholder="Ketik pesan..." rows={1} />
              <button onClick={sendTextPayload} disabled={!text.trim() || sending} className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all shrink-0 ${text.trim() && !sending ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700" : "bg-slate-100 text-slate-300"}`}>
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : <EmptyChatState />}

      {/* ============================================================================ */}
      {/* 7. MODALS (CLEAN & CONCISE) */}
      {/* ============================================================================ */}

      {/* Modal Label */}
      {labelModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2"><Tag size={18} className="text-indigo-500"/> Beri Label Kustom</h3>
            <p className="text-xs text-slate-500 mb-5">Pilih atau buat label baru untuk {labelModal.targets.length} kontak.</p>
            
            {uniqueLabels.length > 0 && (
              <div className="mb-5">
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Riwayat Label</label>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueLabels.map(l => (
                    <button key={l.name} onClick={() => setLabelPayload({name: l.name, color: l.color})} className={`px-2.5 py-1 rounded-md text-[10px] font-bold text-white transition-all ${l.color} ${labelPayload.name === l.name ? 'ring-2 ring-offset-1 ring-blue-400 scale-105' : 'opacity-80 hover:opacity-100'}`}>{l.name}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
               <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Nama Label Baru</label>
               <input value={labelPayload.name} onChange={(e)=>setLabelPayload({...labelPayload, name: e.target.value})} placeholder="Contoh: Prospek Prioritas" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none text-sm font-bold text-slate-700 mb-3 focus:bg-white focus:border-indigo-400" />
               <div className="flex flex-wrap gap-2 justify-between">
                 {LABEL_COLORS.map(color => (
                   <button key={color} onClick={() => setLabelPayload({...labelPayload, color})} className={`w-6 h-6 rounded-full transition-all ${color} ${labelPayload.color === color ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110' : 'opacity-60 hover:opacity-100'}`} />
                 ))}
               </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setLabelModal({ open: false, targets: [] })} className="px-4 py-2 rounded-xl font-bold text-slate-500 bg-slate-100 text-xs hover:bg-slate-200">Batal</button>
              <button onClick={executeSetLabel} className="px-4 py-2 rounded-xl font-bold text-white bg-indigo-600 text-xs hover:bg-indigo-700">Simpan Label</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Broadcast */}
      {bcModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2"><Megaphone size={18} className="text-emerald-500"/> Kirim Broadcast Instan</h3>
            <p className="text-xs text-slate-500 mb-5">Pesan akan dikirim ke {bcModal.targets.length} nomor tujuan secara berurutan.</p>
            
            <div className="mb-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Teks Pesan</label>
                <textarea rows={5} value={bcPayload.text} onChange={(e)=>setBcPayload({...bcPayload, text: e.target.value})} placeholder="Halo {{nama}}..." className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none text-sm font-medium text-slate-700 resize-none focus:bg-white focus:border-emerald-400" />
              </div>
              <div>
                 <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Jeda Pengiriman (Anti-Spam)</label>
                 <div className="flex items-center gap-2">
                   <input type="number" value={bcPayload.delay} onChange={(e)=>setBcPayload({...bcPayload, delay: e.target.value})} className="w-24 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-center font-bold text-sm outline-none" />
                   <span className="text-xs font-bold text-slate-400">Milidetik (ms)</span>
                 </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setBcModal({ open: false, targets: [] })} className="px-4 py-2 rounded-xl font-bold text-slate-500 bg-slate-100 text-xs hover:bg-slate-200">Batal</button>
              <button onClick={executeScheduleBroadcast} className="px-4 py-2 rounded-xl font-bold text-white bg-emerald-600 text-xs hover:bg-emerald-700">Mulai Broadcast</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Follow Up */}
      {fuModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2"><CalendarClock size={18} className="text-orange-500"/> Tambah ke Follow Up</h3>
            <p className="text-xs text-slate-500 mb-5">Masukkan {fuModal.targets.length} nomor ini ke dalam jadwal *Sequence*.</p>
            
            <div className="mb-6">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Pilih Campaign Induk</label>
              {campaigns.length > 0 ? (
                <select value={fuPayload.campaignId} onChange={(e)=>setFuPayload({...fuPayload, campaignId: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 text-sm focus:border-orange-400 cursor-pointer">
                  <option value="">-- Pilih Campaign --</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100">Belum ada Campaign aktif. Buat di menu Follow Up terlebih dahulu.</div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setFuModal({ open: false, targets: [] })} className="px-4 py-2 rounded-xl font-bold text-slate-500 bg-slate-100 text-xs hover:bg-slate-200">Batal</button>
              <button onClick={executeAddToFollowUp} disabled={!fuPayload.campaignId} className="px-4 py-2 rounded-xl font-bold text-white bg-orange-500 text-xs hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">Jadwalkan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Media */}
      {mediaModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-black text-slate-800 mb-5 flex items-center gap-2">
              <Paperclip size={18} className="text-blue-500"/> Kirim {mediaModal.type === 'location' ? 'Lokasi' : mediaModal.type === 'image' ? 'Gambar' : 'Dokumen'}
            </h3>
            
            {mediaModal.type === 'location' ? (
              <div className="grid grid-cols-2 gap-3 mb-6">
                 <div className="col-span-2"><label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Koordinat (Latitude & Longitude)</label></div>
                 <input value={mediaPayload.lat} onChange={(e)=>setMediaPayload({...mediaPayload, lat: e.target.value})} placeholder="Latitude (Cth: -6.200)" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm text-slate-700" />
                 <input value={mediaPayload.lng} onChange={(e)=>setMediaPayload({...mediaPayload, lng: e.target.value})} placeholder="Longitude (Cth: 106.816)" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm text-slate-700" />
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">URL Tautan Asli (Public Link)</label>
                  <input value={mediaPayload.url} onChange={(e)=>setMediaPayload({...mediaPayload, url: e.target.value})} placeholder="https://domain.com/file.jpg" className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm text-slate-700" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Caption Teks (Opsional)</label>
                  <input value={mediaPayload.caption} onChange={(e)=>setMediaPayload({...mediaPayload, caption: e.target.value})} placeholder="Ketik caption di sini..." className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-sm text-slate-700" />
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setMediaModal({ open: false, type: 'image' })} className="px-4 py-2 rounded-xl font-bold text-slate-500 bg-slate-100 text-xs hover:bg-slate-200">Batal</button>
              <button onClick={executeSendMedia} disabled={sending} className="px-4 py-2 rounded-xl font-bold text-white bg-blue-600 text-xs hover:bg-blue-700 flex items-center gap-2">
                {sending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14} />} Kirim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inbox() {
  return (
    <ErrorBoundary>
      <InboxComponent />
    </ErrorBoundary>
  );
}