/**
 * ============================================================================
 * INBOX.TSX - WHATSAPP WEB SAAS UI (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini merupakan jantung dari aplikasi WhatsApp SaaS. Menangani 
 * percakapan Real-Time, Bulk Actions, Manajemen Label, dan sinkronisasi 
 * sesi Baileys dengan kompensasi Timezone secara otomatis.
 * ============================================================================
 */

import React, { 
  useEffect, 
  useMemo, 
  useState, 
  useRef, 
  useCallback, 
  ErrorInfo, 
  Component 
} from "react";

import { 
  Activity, 
  Clock, 
  Filter, 
  Tag, 
  CheckCheck, 
  X, 
  Check, 
  Search, 
  Paperclip, 
  Send, 
  Plus, 
  Image as ImageIcon, 
  FileText, 
  MapPin, 
  Trash2, 
  Megaphone, 
  CalendarClock, 
  Layers, 
  MessageSquare, 
  MessageCircle, 
  Users, 
  User, 
  Loader2, 
  AlertTriangle,
  UserPlus,
  ArrowLeft
} from "lucide-react";

import { useConfirm } from "../App";

// ============================================================================
// 1. ERROR BOUNDARY COMPONENT
// ============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null 
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { 
      hasError: true, 
      error 
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Inbox Component Critical Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-[#f8fafd] text-slate-600 p-8 text-center rounded-2xl">
          <AlertTriangle size={64} className="text-rose-500 mb-6" strokeWidth={1.5} />
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
            Terjadi Kesalahan Kritis
          </h2>
          <p className="text-sm font-medium mb-6 max-w-md leading-relaxed">
            Komponen Inbox mengalami gangguan pada mesin perenderan React. 
            Hal ini bisa disebabkan oleh data yang korup dari server atau kesalahan memori.
            Silakan muat ulang halaman.
            <br />
            <span className="text-xs font-mono text-rose-500 mt-4 block bg-rose-50 p-3 rounded-lg border border-rose-100 text-left overflow-auto">
              {this.state.error?.message || "Unknown Runtime Error"}
            </span>
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-[#0b57d0] text-white font-bold text-sm rounded-full shadow-sm hover:bg-[#001d35] active:scale-95 transition-all"
          >
            Muat Ulang Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// 2. API UTILITIES & AUTHENTICATION SERVICES
// ============================================================================

const getApiKey = (): string => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("WA_KEY") || "";
  }
  return "";
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  
  if (key) {
    headers.set("x-api-key", key);
  }
  
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
  
  const res = await fetch(url, { 
    ...init, 
    headers 
  });
  
  const text = await res.text();
  let data;
  try { 
    data = text ? JSON.parse(text) : {}; 
  } catch (e) { 
    throw new Error(`Server Error (HTTP ${res.status}). Respons bukan JSON yang valid.`); 
  }
  
  if (!res.ok) {
    const errorMsg = data?.error || "Terjadi kesalahan yang tidak diketahui pada server API";
    throw new Error(errorMsg);
  }
  
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
// 3. TYPE DEFINITIONS & FORMATTERS
// ============================================================================

export interface SessionRow { 
  session_key: string; 
  status: string; 
}

export interface ConvRow {
  chatId: number;
  remoteJid: string;
  name?: string | null; 
  unreadCount: number;
  lastMessage: { 
    id: number; 
    direction: string; 
    type: string; 
    text: string | null; 
    mediaUrl: string | null; 
    time: string; 
    status: string; 
    pushName?: string | null;
  };
}

export interface MsgRow {
  id: number; 
  direction: "in" | "out"; 
  type: string; 
  text: string | null; 
  media: any; 
  location: any; 
  status: string; 
  error: string | null; 
  time: string;
  participant?: string | null; 
  pushName?: string | null;   
}

export interface LeadRow { 
  to_number: string; 
  has_replied: number; 
}

export interface CustomLabel { 
  name: string; 
  color: string; 
}

export const LABEL_COLORS = [
  'bg-rose-500', 
  'bg-orange-500', 
  'bg-amber-500', 
  'bg-emerald-500', 
  'bg-cyan-500',
  'bg-[#0b57d0]', // Google Blue
  'bg-indigo-500', 
  'bg-purple-500', 
  'bg-slate-800'
];

export const getSenderColor = (jid: string): string => {
  const colors = [
    'text-rose-500', 
    'text-[#0b57d0]', 
    'text-emerald-600', 
    'text-amber-600', 
    'text-purple-500', 
    'text-cyan-600', 
    'text-pink-500', 
    'text-indigo-500'
  ];
  if (!jid) return colors[0];
  let hash = 0;
  for (let i = 0; i < jid.length; i++) {
    hash = jid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export function normalizeDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  let safeStr = dateStr;
  
  if (safeStr.includes(" ") && !safeStr.includes("T")) {
    safeStr = safeStr.replace(" ", "T");
    if (!safeStr.endsWith("Z")) {
      safeStr += "Z"; 
    }
  }
  
  const d = new Date(safeStr);
  d.setHours(d.getHours() + 7); 
  return d;
}

export function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = normalizeDate(dateStr);
  return d.toLocaleTimeString("id-ID", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
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
  
  return d.toLocaleDateString("id-ID", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "2-digit" 
  });
}

export function formatContactName(jid: string, name?: string | null): string {
  const isGroup = jid.includes("@g.us");
  if (name && name.trim() !== "" && name !== jid) return name; 
  if (isGroup) return "Grup Obrolan WA";
  if (!jid) return "Identitas Tidak Diketahui";
  
  const num = jid.split("@")[0];
  if (jid.includes("@lid")) return `~${num} (LID)`;
  if (num.startsWith("62")) return `+62 ${num.slice(2)}`;
  return num; 
}

// ============================================================================
// 4. MODULAR SUB-COMPONENTS (UI ABSTRACTIONS)
// ============================================================================

const EmptyChatState: React.FC = () => (
  <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-white border-l border-slate-100 animate-in fade-in duration-500">
    <div className="w-24 h-24 rounded-full bg-[#f0f4f9] mb-6 flex items-center justify-center text-[#0b57d0]">
      <MessageCircle size={48} strokeWidth={1.5} />
    </div>
    <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">WhatsApp SaaS Enterprise</h2>
    <p className="text-sm font-medium text-slate-500 max-w-sm text-center leading-relaxed">
      Aplikasi terhubung langsung dengan mesin Baileys.<br/>
      Pilih percakapan dari daftar untuk mulai berinteraksi.
    </p>
  </div>
);

interface MessageBubbleProps {
  msg: MsgRow;
  liveTime: Date;
  isGroup: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, liveTime, isGroup }) => {
  const isOut = msg.direction === "out";

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[85%] md:max-w-[70%] px-4 py-3 shadow-sm relative transition-all duration-300 group ${isOut ? "bg-[#0b57d0] text-white rounded-2xl rounded-tr-sm" : "bg-[#f0f4f9] text-[#1f1f1f] rounded-2xl rounded-tl-sm"}`}>
        
        {isGroup && !isOut && (
          <div className={`text-xs font-bold mb-1.5 cursor-pointer hover:underline ${getSenderColor(msg.participant || '')}`}>
             {msg.pushName || formatContactName(msg.participant || "Anggota Grup")}
          </div>
        )}

        {msg.type === 'image' && (
          <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${isOut ? 'bg-white/20 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            <ImageIcon size={14} strokeWidth={2.5}/> Lampiran Gambar
          </div>
        )}
        
        {msg.type === 'document' && (
          <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${isOut ? 'bg-white/20 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            <FileText size={14} strokeWidth={2.5}/> Dokumen Teks
          </div>
        )}
        
        {msg.type === 'location' && (
          <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${isOut ? 'bg-white/20 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            <MapPin size={14} strokeWidth={2.5}/> Lokasi Geografis
          </div>
        )}

        <p className="text-[14px] md:text-[15px] leading-relaxed font-normal break-words whitespace-pre-wrap">
          {msg.text || (msg.type !== 'text' ? '[Isi Lampiran Media Berhasil Disampaikan]' : '')}
        </p>
        
        <div className="text-[10px] mt-1.5 flex justify-end items-center gap-1.5 opacity-70 font-medium">
          {formatTime(msg.time)}
          {isOut && (
            <span className={`text-[14px] ${msg.status === 'read' ? 'text-[#a8c7fa]' : 'text-white/70'}`}>
              {msg.status === 'read' ? <CheckCheck size={14} strokeWidth={2.5} /> : msg.status === 'delivered' ? <CheckCheck size={14} strokeWidth={2} /> : msg.status === 'failed' ? <X size={14} className="text-rose-300" strokeWidth={2.5} /> : <Check size={14} strokeWidth={2} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. MAIN CONTROLLER LOGIC (INBOX COMPONENT)
// ============================================================================

function InboxComponent() {
  const confirm = useConfirm();
  
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
      try {
        const saved = localStorage.getItem("wa_inbox_labels");
        return saved ? JSON.parse(saved) : {};
      } catch { return {}; }
    }
    return {};
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wa_inbox_labels", JSON.stringify(customLabels));
    }
  }, [customLabels]);
  
  const uniqueLabels = useMemo(() => {
    const map = new Map<string, CustomLabel>();
    Object.values(customLabels).forEach(l => {
      if (!map.has(l.name)) map.set(l.name, l);
    });
    return Array.from(map.values());
  }, [customLabels]);

  const [peer, setPeer] = useState<string>("");
  const activePeerRef = useRef<string>("");
  
  useEffect(() => {
    activePeerRef.current = peer;
  }, [peer]);

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
  
  const [mediaModal, setMediaModal] = useState<{ open: boolean; type: 'image' | 'document' | 'location'; }>({ open: false, type: 'image' });
  const [mediaPayload, setMediaPayload] = useState({ url: "", caption: "", lat: "", lng: "" });
  const [bcModal, setBcModal] = useState<{ open: boolean; targets: string[]; }>({ open: false, targets: [] });
  const [bcPayload, setBcPayload] = useState({ text: "", delay: "2000" });
  const [labelModal, setLabelModal] = useState<{ open: boolean; targets: string[]; }>({ open: false, targets: [] });
  const [labelPayload, setLabelPayload] = useState({ name: "Prioritas Tinggi", color: "bg-[#0b57d0]" });
  const [fuModal, setFuModal] = useState<{ open: boolean; targets: string[]; }>({ open: false, targets: [] });
  const [fuPayload, setFuPayload] = useState({ campaignId: "" });
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  const filteredConvs = useMemo(() => {
    let result = [...convs];
    
    result.sort((a, b) => {
      const tA = normalizeDate(a.lastMessage?.time || "").getTime();
      const tB = normalizeDate(b.lastMessage?.time || "").getTime();
      return tB - tA; 
    });

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
        const matchNumber = cleanQ && (numOnly.includes(cleanQ));
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
    if (isAtBottom && messages.length > 0) {
      setTimeout(() => scrollToBottom("smooth"), 100);
    }
  }, [messages, isAtBottom, scrollToBottom]);

  const handleSelectChat = (jid: string) => {
    if (isSelectionMode) {
      togglePeerSelection(jid);
    } else {
      setPeer(jid);
      setConvs(prev => prev.map(c => c.remoteJid === jid ? { ...c, unreadCount: 0 } : c));
      setMsgLimit(100);
      setAttachOpen(false);
      setMessages([]); 
      setTimeout(() => { scrollToBottom("auto"); setIsAtBottom(true); }, 100);
      apiFetch("/ui/conversations/read", { method: "POST", body: JSON.stringify({ sessionKey, peer: jid }) }).catch((e) => {});
    }
  };

  const loadLeads = async () => {
    try { 
      const res = await apiFetch<{ ok: true; data: LeadRow[] }>("/leads?limit=1000"); 
      setLeads(res.data || []); 
    } catch (e) { }
  };

  const loadCampaigns = async () => {
    try { 
      const res = await apiFetch<{ ok: true; data: any[] }>("/followup/campaigns?status=active"); 
      setCampaigns(res.data || []); 
      if (res.data && res.data.length > 0) setFuPayload(p => ({ ...p, campaignId: String(res.data[0].id) })); 
    } catch (e) { }
  };

  const loadSessions = async () => {
    try { 
      const res = await apiFetch<{ ok: true; sessions: any[] }>("/ui/sessions"); 
      const list = (res.sessions || []).map(s => ({ session_key: s.session_key, status: s.status })); 
      setSessions(list); 
      if (!sessionKey && list.length > 0) setSessionKey(list[0].session_key);
    } catch (e: any) { setErr(e.message); } finally { setIsAppLoading(false); }
  };

  const loadConvs = useCallback(async (sk: string) => {
    try { 
      const res = await apiFetch<{ ok: true; conversations: ConvRow[] }>(`/ui/conversations?sessionKey=${encodeURIComponent(sk)}`); 
      const deduped = dedupeByRemoteJid(res.conversations || []); 
      setConvs(deduped.map(c => {
         if (c.remoteJid === activePeerRef.current) return { ...c, unreadCount: 0 };
         return c;
      }));
    } catch (e: any) { setErr(e.message); }
  }, []);

  const loadMessages = useCallback(async (sk: string, p: string, limit: number) => {
    try {
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(`/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(p)}&limit=${limit}`);
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
    const intervalId = setInterval(() => { loadConvs(sessionKey); }, 5000);
    return () => clearInterval(intervalId);
  }, [sessionKey, loadConvs]);

  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer, msgLimit); 
    const intervalId = setInterval(() => { loadMessages(sessionKey, peer, msgLimit); }, 3000);
    return () => clearInterval(intervalId);
  }, [sessionKey, peer, msgLimit, loadMessages]);

  async function sendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/messages/send`, { method: "POST", body: JSON.stringify({ sessionKey, to: peer, text: text.trim() }) });
      setText("");
      await loadMessages(sessionKey, peer, msgLimit);
      await loadConvs(sessionKey);
      scrollToBottom("smooth");
    } catch (e: any) { alert("Operasi Distribusi Gagal: " + e.message); } finally { setSending(false); }
  }

  const togglePeerSelection = (jid: string) => { 
    setSelectedPeers(p => p.includes(jid) ? p.filter(x => x !== jid) : [...p, jid]); 
  };

  // ============================================================================
  // [NEW] EXECUTE MAKE LEAD (CONVERT TO CRM DATABASE)
  // ============================================================================
  async function executeMakeLead(targets: string[]) {
    const isConfirmed = await confirm({
      title: "Konversi Lead",
      message: `Ingin menambahkan ${targets.length} kontak terpilih ke Database Leads Utama CRM?`,
      confirmText: "Ya, Tambahkan"
    });
    
    if (!isConfirmed) return;

    try {
      await apiFetch("/leads/label", {
        method: "POST",
        body: JSON.stringify({
          targets: targets.map(t => t.split('@')[0]),
          label: "Prospek Manual",
          color: "bg-emerald-500"
        })
      });
      alert(`Berhasil! ${targets.length} kontak telah sukses dikonversi ke dalam Database Leads.`);
      setSelectedPeers([]);
      setIsSelectionMode(false);
      loadLeads();
    } catch (e: any) { alert("Gagal melakukan konversi Leads: " + e.message); }
  }

  async function executeDeleteChats() {
    const isConfirmed = await confirm({
      title: "Hapus Obrolan",
      message: `TINDAKAN BERBAHAYA: Yakin musnahkan ${selectedPeers.length} riwayat percakapan secara permanen?`,
      confirmText: "Hapus Permanen",
      isDanger: true
    });
    
    if (!isConfirmed) return;

    try { 
      await apiFetch("/ui/conversations/delete", { method: "POST", body: JSON.stringify({ sessionKey, peers: selectedPeers }) }); 
      if (selectedPeers.includes(peer)) setPeer(""); 
      setSelectedPeers([]); setIsSelectionMode(false); loadConvs(sessionKey); 
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  async function executeScheduleBroadcast() {
    if (!bcPayload.text.trim()) return alert("Teks tidak boleh kosong.");
    try { 
      const cleanTargets = bcModal.targets.map(t => t.split('@')[0]); 
      await apiFetch("/broadcast/create", { method: "POST", body: JSON.stringify({ sessionKey, text: bcPayload.text, delayMs: Number(bcPayload.delay), name: `Broadcast Manual Inbox`, targets: cleanTargets }) }); 
      setBcModal({ open: false, targets: [] }); setBcPayload({ text: "", delay: "2000" }); setSelectedPeers([]); setIsSelectionMode(false); 
      alert(`Eksekusi Disetujui! Menyapa ${cleanTargets.length} tujuan.`); 
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  async function executeAddToFollowUp() {
    if (!fuPayload.campaignId) return alert("Pilih Campaign.");
    try { 
      const cleanTargets = fuModal.targets.map(t => t.split('@')[0]); 
      await apiFetch("/followup/add-targets", { method: "POST", body: JSON.stringify({ sessionKey, campaignId: fuPayload.campaignId, targets: cleanTargets }) }); 
      setFuModal({ open: false, targets: [] }); setSelectedPeers([]); setIsSelectionMode(false); 
      alert(`Sukses disuntikkan ke Follow Up.`); 
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
      apiFetch("/leads/label", { method: "POST", body: JSON.stringify({ targets: labelModal.targets.map(t => t.split('@')[0]), label: labelPayload.name, color: labelPayload.color }) }).catch(()=>{}); 
      setLabelModal({ open: false, targets: [] }); setSelectedPeers([]); setIsSelectionMode(false); 
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  const removeLabel = async (targetNum: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    
    const isConfirmed = await confirm({
      title: "Cabut Label",
      message: "Apakah Anda yakin ingin mencabut label dari kontak ini?",
      confirmText: "Ya, Cabut Label"
    });
    
    if (!isConfirmed) return;

    setCustomLabels(prev => { const next = { ...prev }; delete next[targetNum]; return next; });
  };

  async function executeSendMedia() {
    if (sending) return;
    setSending(true);
    try {
      const isLoc = mediaModal.type === 'location';
      const payload = isLoc ? { sessionKey, to: peer, latitude: Number(mediaPayload.lat), longitude: Number(mediaPayload.lng) } : { sessionKey, to: peer, type: mediaModal.type, url: mediaPayload.url, caption: mediaPayload.caption };
      const endpoint = isLoc ? '/messages/send-location' : '/messages/send-media';
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setMediaModal({ open: false, type: 'image' }); setMediaPayload({ url: "", caption: "", lat: "", lng: "" }); 
      loadMessages(sessionKey, peer, msgLimit); 
    } catch (e: any) { alert("Kesalahan Transmisi Media: " + e.message); } finally { setSending(false); }
  }

  const currentConv = convs.find(c => c.remoteJid === peer);
  const currentLead = leads.find(l => l.to_number === peerNumber);
  const currentLabel = customLabels[peerNumber];

  if (isAppLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-white text-slate-400 gap-4 rounded-2xl border border-slate-100 shadow-sm">
        <Loader2 size={40} className="animate-spin text-[#0b57d0]" />
        <p className="font-bold tracking-widest uppercase text-[10px]">Menyiapkan Ruang Kerja...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white overflow-hidden rounded-2xl border border-slate-100 shadow-sm relative">
      
      {/* SIDEBAR (DAFTAR CHAT) - Responsif untuk HP */}
      <div className={`w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-slate-100 bg-[#f8fafd] shrink-0 h-full ${peer ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                Koneksi Sesi Aktif
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </span>
              <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} className="bg-transparent text-lg font-bold text-slate-800 outline-none cursor-pointer appearance-none w-full hover:text-blue-600 transition-colors">
                {sessions.map(s => <option key={s.session_key} value={s.session_key}>📱 {s.session_key}</option>)}
                {sessions.length === 0 && <option value="">Tidak ada sesi</option>}
              </select>
            </div>
            <button onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedPeers([]); }} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isSelectionMode ? 'bg-[#001d35] text-white hover:bg-[#001d35]/90' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {isSelectionMode ? <X size={18} strokeWidth={2.5}/> : <CheckCheck size={18} strokeWidth={2.5}/>}
            </button>
          </div>

          <div className="relative mb-3">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Telusuri chat..." className="w-full pl-11 pr-10 py-3 rounded-full bg-white border border-slate-200 text-sm font-medium outline-none focus:border-[#0b57d0] focus:ring-2 focus:ring-[#c2e7ff] transition-all shadow-sm" />
            <Search size={16} className="absolute left-4 top-3.5 text-slate-400" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-0.5"><X size={12} strokeWidth={3}/></button>}
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
             <button onClick={() => setActiveFilter('all')} className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${activeFilter === 'all' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>Semua</button>
             <button onClick={() => setActiveFilter('unread')} className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 ${activeFilter === 'unread' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}><div className={`w-1.5 h-1.5 rounded-full ${activeFilter === 'unread' ? 'bg-[#001d35]' : 'bg-emerald-500'}`}></div>Unread</button>
             <button onClick={() => setActiveFilter('personal')} className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 ${activeFilter === 'personal' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}><User size={12}/> Japri</button>
             <button onClick={() => setActiveFilter('group')} className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 ${activeFilter === 'group' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}><Users size={12}/> Grup</button>
             {uniqueLabels.map(l => (
               <button key={l.name} onClick={() => setActiveFilter(`label_${l.name}`)} className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all border flex items-center gap-1.5 ${activeFilter === `label_${l.name}` ? 'bg-[#001d35] text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Tag size={10} /> {l.name}</button>
             ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-hide pb-24">
          {filteredConvs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-80">
               <MessageSquare size={40} className="mb-3 text-slate-300" strokeWidth={1.5} />
               <p className="font-medium text-sm">Tidak ada percakapan.</p>
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
              <div key={c.remoteJid} onClick={() => handleSelectChat(c.remoteJid)} className={`p-3.5 flex items-center gap-3.5 rounded-2xl cursor-pointer transition-colors relative group ${isActive ? "bg-[#c2e7ff]" : isSelected ? "bg-blue-50" : "hover:bg-slate-100/80"}`}>
                {isSelectionMode ? (
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${isSelected ? 'bg-[#0b57d0] border-[#0b57d0] text-white' : 'bg-white border-slate-300'}`}>
                    {isSelected && <CheckCheck size={20} strokeWidth={3} />}
                  </div>
                ) : (
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 relative transition-colors ${isActive ? "bg-[#0b57d0] text-white" : isGroup ? "bg-[#e9eef6] text-[#0b57d0]" : "bg-[#e9eef6] text-[#001d35]"}`}>
                    {isGroup ? <Users size={20} /> : contactDisplayName.charAt(0).toUpperCase()}
                    {isUnread && !isActive && <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#f8fafd] rounded-full group-hover:border-slate-100"></span>}
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className={`text-[15px] truncate pr-2 ${isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{contactDisplayName}</h3>
                    <span className={`text-[11px] shrink-0 ${isUnread ? 'font-bold text-[#0b57d0]' : 'text-slate-500'}`}>{formatChatDate(c.lastMessage?.time, liveTime)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-[13px] truncate pr-2 flex items-center gap-1 ${isUnread ? 'text-slate-800 font-semibold' : 'text-slate-500'}`}>
                      {isOutMsg && <span className={c.lastMessage.status === 'read' ? 'text-[#0b57d0]' : 'text-slate-400'}>{c.lastMessage.status === 'read' ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
                      <span className="truncate">{groupSenderPrefix}{c.lastMessage?.text || '[Lampiran Media]'}</span>
                    </p>
                    {isUnread && !isSelectionMode && <div className="min-w-[20px] h-[20px] rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold px-1.5 shrink-0">{c.unreadCount > 99 ? '99+' : c.unreadCount}</div>}
                  </div>
                  
                  {(isGroup || lLabel || isLead) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {isGroup && <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">Grup</span>}
                      {lLabel && <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white flex items-center gap-1 ${lLabel.color}`}>{lLabel.name} {isActive && <span className="cursor-pointer hover:bg-black/20 rounded p-0.5 ml-0.5" onClick={(e) => removeLabel(cNum, e)}><X size={10} strokeWidth={3} /></span>}</span>}
                      {isLead && <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${isLead.has_replied ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-white text-slate-500 border-slate-200'}`}>{isLead.has_replied ? '🔥 Hot Lead' : '❄️ Cold Lead'}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* SELECTION ACTION BAR */}
        {isSelectionMode && selectedPeers.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#001d35] rounded-full p-2.5 shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom-10 z-50 whitespace-nowrap">
             <span className="text-[11px] font-bold text-[#c2e7ff] px-3">{selectedPeers.length} Dipilih</span>
             <div className="flex gap-1.5">
                <button onClick={() => executeMakeLead(selectedPeers)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors" title="Jadikan Lead CRM"><UserPlus size={16}/></button>
                <button onClick={() => setLabelModal({ open: true, targets: selectedPeers })} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors" title="Atur Tag"><Tag size={16}/></button>
                <button onClick={() => setBcModal({ open: true, targets: selectedPeers })} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors" title="Kirim Pesan Massal"><Megaphone size={16}/></button>
                <button onClick={() => setFuModal({ open: true, targets: selectedPeers })} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 text-white transition-colors" title="Auto Follow Up"><CalendarClock size={16}/></button>
                <div className="w-[1px] h-6 bg-white/20 mx-1 self-center"></div>
                <button onClick={executeDeleteChats} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-rose-500/20 text-rose-400 transition-colors" title="Hapus Chat"><Trash2 size={16}/></button>
             </div>
          </div>
        )}
      </div>

      {/* AREA KANAN: RUANG OBROLAN - Responsif untuk HP */}
      {peer ? (
        <div className={`flex-1 flex flex-col relative bg-white min-w-0 ${peer ? 'flex' : 'hidden md:flex'}`}>
          
          {/* HEADER CHAT */}
          <div className="h-[72px] px-4 md:px-6 flex items-center border-b border-slate-100 bg-white shrink-0 justify-between z-10">
            <div className="flex items-center min-w-0">
              <button onClick={() => setPeer("")} className="md:hidden mr-3 p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                <ArrowLeft size={22} strokeWidth={2.5} />
              </button>
              <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center font-bold text-lg mr-3 md:mr-4 shrink-0 ${peer.includes('@g.us') ? "bg-[#e9eef6] text-[#0b57d0]" : "bg-[#c2e7ff] text-[#001d35]"}`}>
                {peer.includes('@g.us') ? <Users size={20} /> : (currentConv?.name ? currentConv.name.charAt(0) : peer.charAt(0)).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] md:text-[17px] font-bold text-slate-800 truncate">{formatContactName(peer, currentConv?.name)}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[11px] font-medium text-slate-500 truncate">Sesi {sessionKey.split('-')[0]}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 md:gap-2 shrink-0">
              <button onClick={() => executeMakeLead([peer])} className="w-10 h-10 rounded-full text-slate-500 hover:bg-[#e9eef6] hover:text-[#0b57d0] flex items-center justify-center transition-colors" title="Jadikan Lead CRM"><UserPlus size={18} /></button>
              <button onClick={() => setLabelModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-full text-slate-500 hover:bg-[#e9eef6] hover:text-[#0b57d0] flex items-center justify-center transition-colors" title="Atur Tag"><Tag size={18} /></button>
              <button onClick={() => setBcModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-full text-slate-500 hover:bg-[#e9eef6] hover:text-[#0b57d0] hidden sm:flex items-center justify-center transition-colors" title="Kirim Cepat"><Megaphone size={18} /></button>
              <button onClick={() => setFuModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-full text-slate-500 hover:bg-[#e9eef6] hover:text-[#0b57d0] hidden sm:flex items-center justify-center transition-colors" title="Jadwalkan Follow Up"><CalendarClock size={18} /></button>
            </div>
          </div>

          {/* ISI CHAT */}
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scroll-smooth bg-white">
            <div className="flex flex-col items-center mb-6 pt-2">
              <div className="bg-[#f0f4f9] text-[#444746] text-[11px] font-medium px-4 py-2 rounded-lg text-center max-w-sm">
                🔒 Pesan diamankan melalui integrasi sistem Baileys.
              </div>
              {messages.length >= msgLimit && (
                <button onClick={() => { setMsgLimit(m => m + 100); setIsAtBottom(false); }} className="mt-4 px-4 py-2 bg-white border border-slate-200 text-[#0b57d0] font-bold text-[11px] uppercase tracking-wider rounded-full hover:bg-[#f8fafd] shadow-sm transition-colors"><Clock size={14} className="inline mr-1.5" /> Muat Riwayat Sebelumnya</button>
              )}
            </div>
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} liveTime={liveTime} isGroup={peer.includes('@g.us')} />
            ))}
            {sending && (
              <div className="flex justify-end animate-in fade-in duration-300">
                <div className="px-5 py-3 rounded-2xl rounded-br-sm bg-[#f0f4f9] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#444746] animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#444746] animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#444746] animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              </div>
            )}
          </div>

          {/* INPUT BAWAH */}
          <div className="px-4 py-3 md:px-6 md:py-4 bg-white border-t border-slate-100 z-20 relative">
            {attachOpen && (
              <div className="absolute bottom-[100%] left-4 md:left-6 mb-2 bg-white border border-slate-100 p-2 rounded-2xl shadow-lg flex flex-col gap-1 z-50 animate-in slide-in-from-bottom-2 min-w-[200px]">
                <button onClick={() => { setMediaModal({ open: true, type: 'document' }); setAttachOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f0f4f9] rounded-xl text-slate-700 font-medium text-sm w-full text-left transition-colors"><FileText size={18} className="text-[#0b57d0]" /> Kirim Dokumen</button>
                <button onClick={() => { setMediaModal({ open: true, type: 'image' }); setAttachOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f0f4f9] rounded-xl text-slate-700 font-medium text-sm w-full text-left transition-colors"><ImageIcon size={18} className="text-[#0b57d0]" /> Kirim Gambar</button>
                <button onClick={() => { setMediaModal({ open: true, type: 'location' }); setAttachOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f0f4f9] rounded-xl text-slate-700 font-medium text-sm w-full text-left transition-colors"><MapPin size={18} className="text-[#0b57d0]" /> Kirim Lokasi</button>
              </div>
            )}
            <div className="flex items-end gap-2 md:gap-3 bg-[#f0f4f9] p-1.5 md:p-2 rounded-3xl transition-all">
              <button onClick={() => setAttachOpen(!attachOpen)} className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center transition-transform duration-300 rounded-full shrink-0 ${attachOpen ? 'bg-[#0b57d0] text-white rotate-45' : 'text-slate-500 hover:bg-slate-200/50 hover:text-[#0b57d0]'}`}><Plus size={22} strokeWidth={2.5} /></button>
              <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }} className="flex-1 bg-transparent border-none py-2.5 md:py-3 px-2 text-[15px] outline-none resize-none max-h-32 text-slate-800 placeholder-slate-500 leading-relaxed" placeholder="Ketik pesan..." rows={1} />
              <button onClick={sendText} disabled={!text.trim() || sending} className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${text.trim() && !sending ? "bg-[#0b57d0] text-white hover:bg-[#001d35]" : "bg-transparent text-slate-400 cursor-not-allowed"}`}>{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2.5} className="ml-0.5 md:ml-1" />}</button>
            </div>
          </div>
        </div>
      ) : <EmptyChatState />}

      {/* MODALS */}
      {labelModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Tag size={20} className="text-[#0b57d0]" /> Atur Label</h3>
            <p className="text-sm text-slate-500 mb-4">Pilih atau buat label untuk {labelModal.targets.length} kontak terpilih.</p>
            {uniqueLabels.length > 0 && (
              <div className="mb-4"><div className="flex flex-wrap gap-1.5">{uniqueLabels.map(l => (<button key={l.name} onClick={() => setLabelPayload({name: l.name, color: l.color})} className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white transition-all ${l.color} ${labelPayload.name === l.name ? 'ring-2 ring-offset-2 ring-[#0b57d0]' : 'opacity-90 hover:opacity-100'}`}>{l.name}</button>))}</div></div>
            )}
            <div className="mb-6"><input value={labelPayload.name} onChange={(e)=>setLabelPayload({...labelPayload, name: e.target.value})} placeholder="Nama Label Baru..." className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 mb-3 focus:ring-2 focus:ring-[#c2e7ff] transition-all" /><div className="flex flex-wrap gap-2 justify-between">{LABEL_COLORS.map(color => (<button key={color} onClick={() => setLabelPayload({...labelPayload, color})} className={`w-6 h-6 rounded-full transition-transform ${color} ${labelPayload.color === color ? 'ring-2 ring-offset-2 ring-[#0b57d0] scale-110' : 'opacity-50 hover:opacity-100 hover:scale-110'}`} />))}</div></div>
            <div className="flex gap-2 justify-end"><button onClick={() => setLabelModal({ open: false, targets: [] })} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] transition-colors text-sm">Batal</button><button onClick={executeSetLabel} className="px-5 py-2.5 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] transition-colors text-sm">Simpan</button></div>
          </div>
        </div>
      )}

      {bcModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2"><Megaphone size={20} className="text-[#0b57d0]" /> Kirim Pesan Massal</h3>
            <p className="text-sm text-slate-500 mb-4">Akan dikirimkan ke {bcModal.targets.length} nomor tujuan.</p>
            <div className="overflow-y-auto mb-4">
              <textarea rows={5} value={bcPayload.text} onChange={(e)=>setBcPayload({...bcPayload, text: e.target.value})} placeholder="Ketik pesan broadcast..." className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 resize-none focus:ring-2 focus:ring-[#c2e7ff] transition-all mb-4" />
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-600">Jeda (Ms)</span>
                <input type="number" value={bcPayload.delay} onChange={(e)=>setBcPayload({...bcPayload, delay: e.target.value})} className="w-20 text-center px-2 py-1 bg-white border border-slate-200 rounded-lg outline-none font-medium text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-2"><button onClick={() => setBcModal({ open: false, targets: [] })} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] transition-colors text-sm">Batal</button><button onClick={executeScheduleBroadcast} className="px-5 py-2.5 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] transition-colors text-sm flex items-center gap-2"><Check size={16} /> Kirim</button></div>
          </div>
        </div>
      )}
      
      {fuModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2"><CalendarClock size={20} className="text-[#0b57d0]" /> Auto Follow Up</h3>
            <p className="text-sm text-slate-500 mb-4">Daftarkan {fuModal.targets.length} prospek ke workflow.</p>
            <div className="mb-6">
              {campaigns.length > 0 ? (
                <select value={fuPayload.campaignId} onChange={(e)=>setFuPayload({...fuPayload, campaignId: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-[#c2e7ff]">
                  <option value="">Pilih Campaign...</option>
                  {campaigns.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              ) : (
                <div className="p-3 bg-rose-50 rounded-xl text-rose-600 text-sm font-medium">Belum ada campaign aktif.</div>
              )}
            </div>
            <div className="flex gap-2 justify-end"><button onClick={() => setFuModal({ open: false, targets: [] })} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] transition-colors text-sm">Batal</button><button onClick={executeAddToFollowUp} disabled={!fuPayload.campaignId} className="px-5 py-2.5 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] disabled:bg-slate-300 transition-colors text-sm">Jadwalkan</button></div>
          </div>
        </div>
      )}

      {mediaModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Paperclip size={20} className="text-[#0b57d0]" /> Sisipkan Lampiran</h3>
            {mediaModal.type === 'location' ? (
              <div className="space-y-3 mb-6">
                <input value={mediaPayload.lat} onChange={(e)=>setMediaPayload({...mediaPayload, lat: e.target.value})} placeholder="Latitude" className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff]" />
                <input value={mediaPayload.lng} onChange={(e)=>setMediaPayload({...mediaPayload, lng: e.target.value})} placeholder="Longitude" className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff]" />
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                <input value={mediaPayload.url} onChange={(e)=>setMediaPayload({...mediaPayload, url: e.target.value})} placeholder="URL Lampiran Publik" className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff]" />
                <input value={mediaPayload.caption} onChange={(e)=>setMediaPayload({...mediaPayload, caption: e.target.value})} placeholder="Keterangan (Opsional)" className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff]" />
              </div>
            )}
            <div className="flex gap-2 justify-end"><button onClick={() => setMediaModal({ open: false, type: 'image' })} className="px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] transition-colors text-sm">Batal</button><button onClick={executeSendMedia} disabled={sending} className="px-5 py-2.5 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] disabled:bg-slate-300 transition-colors text-sm flex items-center gap-2">{sending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Kirim</button></div>
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