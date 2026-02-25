import React, { useEffect, useMemo, useState, useRef } from "react";
import { 
  Activity, 
  Clock, 
  Filter, 
  Tag, 
  CheckCheck, 
  X, 
  Check, 
  CheckCircle2,
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
  MessageCircle
} from "lucide-react";

// ============================================================================
// INTERNAL HELPERS & API UTILITIES
// ============================================================================

/**
 * Mengambil API Key dari LocalStorage untuk autentikasi permintaan ke Backend.
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

/**
 * Fungsi fetch wrapper terstandarisasi untuk semua panggilan API di halaman Inbox.
 * Otomatis menyertakan Headers x-api-key dan menangani parsing error dari backend.
 */
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

/**
 * Mencegah duplikasi data percakapan yang mungkin terjadi akibat race-condition
 * saat melakukan fetching ganda.
 */
function dedupeByRemoteJid(items: any[]) {
  const seen = new Set();
  return items.filter(item => {
    const duplicate = seen.has(item.remoteJid);
    seen.add(item.remoteJid);
    return !duplicate;
  });
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type SessionRow = { session_key: string; status: string };

type ConvRow = {
  chatId: number;
  remoteJid: string;
  name?: string | null; // Parameter nama kontak / pushName dari backend
  unreadCount: number;
  lastMessage: { 
    id: number; 
    direction: string; 
    type: string; 
    text: string | null; 
    mediaUrl: string | null; 
    time: string;
    status: string;
  };
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

type CustomLabel = {
  name: string;
  color: string;
};

// ============================================================================
// TIMEZONE & FORMATTING FIXES
// ============================================================================

/**
 * FIX TIMEZONE BUG: Menyelaraskan output waktu dari MySQL (UTC) ke Waktu Lokal (WIB)
 * secara paksa untuk menghindari kesalahan render jam obrolan.
 */
function normalizeDate(dateStr: string) {
  if (!dateStr) return new Date();
  
  // Tangkap string tanggal dari API (MySQL format)
  let safeStr = dateStr;
  if (safeStr.includes(" ") && !safeStr.includes("T")) {
    safeStr = safeStr.replace(" ", "T");
    if (!safeStr.endsWith("Z")) safeStr += "Z"; // Asumsikan UTC
  }
  
  const d = new Date(safeStr);
  
  // Kompensasi selisih +7 Jam (WIB)
  d.setHours(d.getHours() + 7);
  
  return d;
}

/**
 * Format jam menit (Contoh: "18:45")
 */
function formatTime(dateStr: string) {
  if (!dateStr) return "";
  const d = normalizeDate(dateStr);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Format tanggal dinamis: Menampilkan Jam jika hari ini, "Kemarin" jika H-1, 
 * dan DD/MM/YY untuk pesan yang sudah lewat jauh.
 */
function formatChatDate(dateStr: string, nowTime: Date) {
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

/**
 * FEATURE 1: Formatter Nama Prioritas (Push Name)
 * Mengutamakan nama dari database (WA Push Name / Contact Name).
 * Jika tidak ada, baru akan fallback dengan memotong nomor JID.
 */
function formatContactName(jid: string, name?: string | null) {
  // 1. Jika nama tersedia, valid, dan bukan nomor JID aslinya, gunakan namanya.
  if (name && name.trim() !== "" && name !== jid) {
    return name; 
  }
  
  // 2. Fallback jika nama tidak ada
  if (!jid) return "";
  const num = jid.split("@")[0];
  
  if (jid.includes("@lid")) return `~${num} (LID)`;
  if (jid.includes("@g.us")) return `Grup: ${num}`;
  
  if (num.startsWith("62")) {
    return `+62 ${num.slice(2)}`;
  }
  return num;
}

// Konstanta palet warna untuk fitur label
const LABEL_COLORS = [
  'bg-rose-500', 
  'bg-orange-500', 
  'bg-amber-500', 
  'bg-emerald-500', 
  'bg-cyan-500',
  'bg-blue-500', 
  'bg-indigo-500', 
  'bg-purple-500', 
  'bg-slate-800'
];

// ============================================================================
// MAIN COMPONENT: INBOX
// ============================================================================

export default function Inbox() {
  // Global States
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  
  // Realtime Engine
  const [liveTime, setLiveTime] = useState(new Date());

  useEffect(() => {
    // Engine untuk mentrigger re-render setiap 1 detik agar jam relative ("Kemarin", jam "18:00") selalu akurat
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Custom Labels States & Management
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
  
  // Mengekstrak label unik untuk dijadikan UI Filter Chips
  const uniqueLabels = useMemo(() => {
    const map = new Map<string, CustomLabel>();
    Object.values(customLabels).forEach(l => {
      if (!map.has(l.name)) map.set(l.name, l);
    });
    return Array.from(map.values());
  }, [customLabels]);

  // Chat/Message States
  const [peer, setPeer] = useState<string>("");
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'read' | string>('all');
  
  // Bulk Actions & Modals State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [msgLimit, setMsgLimit] = useState(100);
  
  const [mediaModal, setMediaModal] = useState<{ open: boolean, type: 'image'|'document'|'location' }>({ open: false, type: 'image' });
  const [mediaPayload, setMediaPayload] = useState({ url: "", caption: "", lat: "", lng: "" });

  const [bcModal, setBcModal] = useState<{ open: boolean, targets: string[] }>({ open: false, targets: [] });
  const [bcPayload, setBcPayload] = useState({ text: "", delay: "2000" });

  const [labelModal, setLabelModal] = useState<{ open: boolean, targets: string[] }>({ open: false, targets: [] });
  const [labelPayload, setLabelPayload] = useState({ name: "Prospek Baru", color: "bg-blue-500" });
  
  const [fuModal, setFuModal] = useState<{ open: boolean, targets: string[] }>({ open: false, targets: [] });
  const [fuPayload, setFuPayload] = useState({ campaignId: "" });
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // Scroll Management
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  // ============================================================================
  // SORTING & FILTERING ENGINE
  // ============================================================================
  
  const filteredConvs = useMemo(() => {
    // 1. Lakukan pengurutan: Pesan terbaru berada di urutan atas list (Desc)
    let result = [...convs].sort((a, b) => {
      const tA = normalizeDate(a.lastMessage?.time || "").getTime();
      const tB = normalizeDate(b.lastMessage?.time || "").getTime();
      return tB - tA; 
    });

    // 2. Terapkan logika Filter Chips UI
    if (activeFilter === 'unread') {
      result = result.filter(c => c.unreadCount > 0);
    } else if (activeFilter === 'read') {
      result = result.filter(c => c.unreadCount === 0);
    } else if (activeFilter.startsWith('label_')) {
      const lblName = activeFilter.replace('label_', '');
      result = result.filter(c => customLabels[c.remoteJid.split('@')[0]]?.name === lblName);
    }

    // 3. Terapkan logika Text Search Query
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

  // ============================================================================
  // SCROLL & RENDER BEHAVIORS
  // ============================================================================

  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(isBottom);
  };

  // Auto Scroll setiap kali data `messages` berubah dan user sedang di bawah
  useEffect(() => { 
    if (isAtBottom) scrollToBottom("smooth"); 
  }, [messages]);

  // Menangani Pemilihan Chat & UI Optimistis
  const handleSelectChat = (jid: string) => {
    if (isSelectionMode) {
      togglePeerSelection(jid);
    } else {
      setPeer(jid);
      
      // OPTIMISTIC UI UPDATE: Hilangkan unread badge secara instan sebelum API merespons
      setConvs(prev => prev.map(c => c.remoteJid === jid ? { ...c, unreadCount: 0 } : c));
      
      setMsgLimit(100);
      setAttachOpen(false);
      setMessages([]); 
      setTimeout(() => { 
        scrollToBottom("auto"); 
        setIsAtBottom(true); 
      }, 100);
      
      // Auto Read trigger ke Backend saat membuka chat
      apiFetch("/ui/conversations/read", { method: "POST", body: JSON.stringify({ sessionKey, peer: jid }) }).catch(()=>{});
    }
  };

  // ============================================================================
  // DATA FETCHING FUNCTIONS
  // ============================================================================

  async function loadLeads() {
    try {
      const res = await apiFetch<{ ok: true; data: LeadRow[] }>("/leads?limit=1000");
      setLeads(res.data || []);
    } catch (e) { /* silent */ }
  }

  async function loadCampaigns() {
    try {
      const res = await apiFetch<{ ok: true; data: any[] }>("/followup/campaigns?status=active");
      setCampaigns(res.data || []);
      if (res.data?.length > 0) {
        setFuPayload(p => ({ ...p, campaignId: String(res.data[0].id) }));
      }
    } catch (e) { /* silent */ }
  }

  async function loadSessions() {
    try {
      const res = await apiFetch<{ ok: true; sessions: any[] }>("/ui/sessions");
      const list = (res.sessions || []).map(s => ({ session_key: s.session_key, status: s.status }));
      setSessions(list);
      if (!sessionKey && list.length) {
        setSessionKey(list[0].session_key);
      }
    } catch (e: any) { 
      setErr(e.message); 
    }
  }

  async function loadConvs(sk: string) {
    try {
      const res = await apiFetch<{ ok: true; conversations: ConvRow[] }>(`/ui/conversations?sessionKey=${encodeURIComponent(sk)}`);
      setConvs(dedupeByRemoteJid(res.conversations || []));
    } catch (e: any) { 
      setErr(e.message); 
    }
  }

  async function loadMessages(sk: string, p: string, limit: number) {
    try {
      const pNum = p.includes("@") ? p.split("@")[0] : p;
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(
        `/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(pNum)}&limit=${limit}`
      );
      
      setMessages(prev => {
        const newMsgs = res.messages || [];
        
        // ROBUST COMPARATOR FIX: Memastikan pesan baru atau perubahan status SELALU me-render ulang
        if (prev.length !== newMsgs.length) return newMsgs;
        if (prev.length === 0) return newMsgs;
        
        // Loop cepat untuk memverifikasi apakah ada perubahan status read/delivered di elemen mana pun
        let hasChanges = false;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== newMsgs[i].id || prev[i].status !== newMsgs[i].status) {
            hasChanges = true;
            break;
          }
        }
        
        return hasChanges ? newMsgs : prev;
      });
    } catch (e: any) { 
      setErr(e.message); 
    }
  }

  // Initial Boot Loads
  useEffect(() => { 
    loadSessions(); 
    loadLeads(); 
    loadCampaigns(); 
  }, []);

  // Polling Conversations (Setiap 5 detik)
  useEffect(() => {
    if (!sessionKey) return;
    loadConvs(sessionKey);
    const t = setInterval(() => loadConvs(sessionKey), 5000);
    return () => clearInterval(t);
  }, [sessionKey]);

  // Polling Messages untuk Peer Tertentu (Setiap 3 detik)
  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer, msgLimit);
    const t = setInterval(() => loadMessages(sessionKey, peer, msgLimit), 3000);
    return () => clearInterval(t);
  }, [sessionKey, peer, msgLimit]);

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  async function sendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/messages/send`, {
        method: "POST",
        body: JSON.stringify({ sessionKey, to: peerNumber, text: text.trim() }),
      });
      setText("");
      
      // Tunggu muat ulang selesai baru scroll down untuk memastikan mulus
      await loadMessages(sessionKey, peer, msgLimit);
      await loadConvs(sessionKey);
      scrollToBottom("smooth");
    } catch (e: any) { 
      setErr(e.message); 
      alert("Gagal mengirim pesan: " + e.message);
    } finally { 
      setSending(false); 
    }
  }

  const togglePeerSelection = (jid: string) => {
    setSelectedPeers(p => p.includes(jid) ? p.filter(x => x !== jid) : [...p, jid]);
  };

  async function executeDeleteChats() {
    if (!confirm(`Yakin ingin menghapus ${selectedPeers.length} percakapan?\nSeluruh riwayat obrolan nomor ini akan dihapus permanen dari server Anda.`)) return;
    try {
      await apiFetch("/ui/conversations/delete", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey, peers: selectedPeers }) 
      });
      if (selectedPeers.includes(peer)) setPeer(""); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      loadConvs(sessionKey);
    } catch (e: any) { 
      alert("Gagal menghapus percakapan: " + e.message); 
    }
  }

  async function executeScheduleBroadcast() {
    if (!bcPayload.text.trim()) return alert("Pesan penawaran tidak boleh kosong");
    try {
      const cleanTargets = bcModal.targets.map(t => t.split('@')[0]);
      await apiFetch("/broadcast/create", {
        method: "POST",
        body: JSON.stringify({
          sessionKey, 
          text: bcPayload.text, 
          delayMs: Number(bcPayload.delay),
          name: `Inbox Broadcast (${cleanTargets.length} target)`,
          targets: cleanTargets
        }),
      });
      setBcModal({ open: false, targets: [] }); 
      setBcPayload({ text: "", delay: "2000" });
      setSelectedPeers([]); 
      setIsSelectionMode(false);
      alert(`✅ Berhasil! Pesan broadcast ke ${cleanTargets.length} nomor telah dikirim ke antrean mesin pengirim.`);
    } catch (e: any) { 
      alert("Gagal menjadwalkan broadcast: " + e.message); 
    }
  }

  async function executeAddToFollowUp() {
    if (!fuPayload.campaignId) return alert("Pilih campaign / workflow terlebih dahulu");
    try {
      const cleanTargets = fuModal.targets.map(t => t.split('@')[0]);
      await apiFetch("/followup/add-targets", {
        method: "POST",
        body: JSON.stringify({
          sessionKey,
          campaignId: fuPayload.campaignId,
          targets: cleanTargets
        })
      });
      setFuModal({ open: false, targets: [] });
      setSelectedPeers([]);
      setIsSelectionMode(false);
      alert(`✅ Sebanyak ${cleanTargets.length} kontak berhasil dimasukkan ke antrean mesin Auto Follow Up!`);
    } catch (e: any) { 
      alert("Gagal menambah antrean Follow Up: " + e.message); 
    }
  }

  async function executeSetLabel() {
    if (!labelPayload.name.trim()) return;
    try {
      // Simpan lokal di State/LocalStorage
      setCustomLabels(prev => {
        const next = { ...prev };
        labelModal.targets.forEach(t => {
          next[t.split('@')[0]] = { name: labelPayload.name, color: labelPayload.color };
        });
        return next;
      });
      
      // Simpan ke Backend (Sinkronisasi optional)
      apiFetch("/leads/label", {
         method: "POST",
         body: JSON.stringify({ 
           targets: labelModal.targets.map(t=>t.split('@')[0]), 
           label: labelPayload.name, 
           color: labelPayload.color 
         })
      }).catch(() => {}); // silent fail jika endpoint belum ada

      setLabelModal({ open: false, targets: [] });
      setSelectedPeers([]); 
      setIsSelectionMode(false);
    } catch (e: any) { 
      alert("Gagal menyematkan label: " + e.message); 
    }
  }

  const removeLabel = (targetNum: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Hapus label kustom dari kontak ini?")) return;
    
    setCustomLabels(prev => {
      const next = { ...prev };
      delete next[targetNum];
      return next;
    });
  };

  async function executeSendMedia() {
    if (sending) return;
    setSending(true);
    try {
      const isLoc = mediaModal.type === 'location';
      const payload = isLoc 
        ? { sessionKey, to: peerNumber, latitude: Number(mediaPayload.lat), longitude: Number(mediaPayload.lng) }
        : { sessionKey, to: peerNumber, type: mediaModal.type, url: mediaPayload.url, caption: mediaPayload.caption };
      
      const endpoint = isLoc ? '/messages/send-location' : '/messages/send-media';
      
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      
      setMediaModal({ open: false, type: 'image' });
      setMediaPayload({ url: "", caption: "", lat: "", lng: "" });
      loadMessages(sessionKey, peer, msgLimit);
    } catch (e: any) { 
      alert("Pengiriman Gagal: " + e.message); 
    } finally { 
      setSending(false); 
    }
  }

  const currentConv = convs.find(c => c.remoteJid === peer);
  const currentLead = leads.find(l => l.to_number === peerNumber);
  const currentLabel = customLabels[peerNumber];

  // ============================================================================
  // RENDER UI
  // ============================================================================

  return (
    <div className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem] relative">
      
      {/* --------------------------------------------------------------------- */}
      {/* AREA 1: SIDEBAR (DAFTAR PERCAKAPAN) */}
      {/* --------------------------------------------------------------------- */}
      <div className="w-full md:w-[350px] lg:w-[420px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl shrink-0 relative z-10">
        
        {/* Sidebar Header & Session Selector */}
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/20 shrink-0">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pilih Sesi Perangkat</label>
              
              {/* Lencana Indikator Sinkronasi Real-time */}
              <span className="text-[9px] font-black text-emerald-500 tracking-widest flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 shadow-sm" title="Waktu tersinkronisasi realtime">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <div className="relative">
              <select 
                value={sessionKey} 
                onChange={(e) => setSessionKey(e.target.value)} 
                className="bg-transparent text-lg font-black text-slate-800 outline-none cursor-pointer appearance-none pr-8 w-full"
              >
                {sessions.map(s => (
                  <option key={s.session_key} value={s.session_key}>📱 {s.session_key}</option>
                ))}
                {sessions.length === 0 && <option value="">Tidak ada sesi aktif</option>}
              </select>
            </div>
          </div>
          
          <button 
            onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedPeers([]); }}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border transition-all ${
              isSelectionMode 
                ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700' 
                : 'bg-white/60 text-slate-500 border-white hover:text-blue-600 hover:bg-white'
            }`}
            title={isSelectionMode ? "Batalkan Pilihan" : "Mode Pilihan (Bulk Action)"}
          >
            {isSelectionMode ? <X size={20} strokeWidth={3}/> : <CheckCheck size={20} strokeWidth={2.5}/>}
          </button>
        </div>

        {/* Kotak Pencarian & Filter Chips Terpadu */}
        <div className="p-5 shrink-0 border-b border-white/20 bg-white/10">
          <div className="relative mb-3.5">
            <input 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pesan, nomor, atau nama..."
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/50 border border-white/80 text-sm font-semibold outline-none focus:bg-white/90 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
            />
            <Search size={18} className="absolute left-4 top-4 text-slate-400" />
            
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          {/* Slider Filter Canggih (Horizontal Scroll) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
             <button 
               onClick={() => setActiveFilter('all')} 
               className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'all' 
                   ? 'bg-slate-800 text-white shadow-md' 
                   : 'bg-white/60 text-slate-500 hover:bg-white border border-transparent hover:border-slate-200'
               }`}
             >
               Semua Chat
             </button>
             
             <button 
               onClick={() => setActiveFilter('unread')} 
               className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'unread' 
                   ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' 
                   : 'bg-white/60 text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100'
               }`}
             >
               Baru (Belum Dibaca)
             </button>
             
             <button 
               onClick={() => setActiveFilter('read')} 
               className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'read' 
                   ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' 
                   : 'bg-white/60 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100'
               }`}
             >
               Sudah Dibaca
             </button>

             {/* Render Filter Label Tersimpan */}
             {uniqueLabels.map(l => (
               <button 
                 key={l.name} 
                 onClick={() => setActiveFilter(`label_${l.name}`)} 
                 className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm border ${
                   activeFilter === `label_${l.name}` 
                     ? l.color + ' text-white border-transparent' 
                     : 'bg-white/60 text-slate-600 border-white hover:bg-white'
                 }`}
               >
                 <Tag size={12} className="inline mr-1" /> {l.name}
               </button>
             ))}
          </div>
        </div>

        {/* Daftar List Obrolan */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-hide pb-24">
          
          {/* Empty State */}
          {filteredConvs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
               <MessageSquare size={48} className="mb-4" strokeWidth={1.5} />
               <p className="font-semibold text-sm">Tidak ada percakapan ditemukan.</p>
            </div>
          )}

          {filteredConvs.map(c => {
            const cNum = c.remoteJid.split('@')[0];
            const isActive = peer === c.remoteJid && !isSelectionMode;
            const isSelected = selectedPeers.includes(c.remoteJid);
            const isLead = leads.find(l => l.to_number === cNum);
            const lLabel = customLabels[cNum];
            
            // Visual Unread Status Definition (UX Standar WhatsApp)
            const isUnread = c.unreadCount > 0;
            const contactDisplayName = formatContactName(c.remoteJid, c.name);
            
            return (
              <div 
                key={c.remoteJid}
                onClick={() => handleSelectChat(c.remoteJid)}
                className={`p-3.5 flex items-stretch gap-4 rounded-[1.5rem] cursor-pointer transition-all duration-300 relative border ${
                  isActive 
                    ? "bg-white/95 shadow-lg shadow-blue-500/10 border-white scale-[1.02]" 
                    : isSelected 
                        ? "bg-blue-50 border-blue-200" 
                        : "hover:bg-white/60 border-transparent"
                }`}
              >
                {/* Visual Avatar / Selector */}
                {isSelectionMode ? (
                  <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center shrink-0 border-2 transition-all mt-0.5 ${
                    isSelected 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                      : 'bg-white border-slate-200'
                  }`}>
                    {isSelected && <CheckCheck size={20} strokeWidth={3} />}
                  </div>
                ) : (
                  <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center font-black text-xl shrink-0 border border-white shadow-sm relative mt-0.5 ${
                    isActive 
                      ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" 
                      : "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500"
                  }`}>
                    {contactDisplayName.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Konten Chat List (Tengah) */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  
                  {/* Header: Nama */}
                  <h3 className={`text-[15px] truncate tracking-tight mb-0.5 ${
                    isUnread 
                      ? 'font-black text-slate-900' 
                      : 'font-semibold text-slate-700'
                  }`}>
                    {contactDisplayName}
                  </h3>
                  
                  {/* Teks Pratinjau Pesan Terakhir & Centang Read */}
                  <p className={`text-[13px] truncate pr-2 flex items-center gap-1 ${
                    isUnread 
                      ? 'text-slate-800 font-bold' 
                      : 'text-slate-500 font-medium opacity-90'
                  }`}>
                    {c.lastMessage?.direction === 'out' && (
                       <span className={`text-[14px] ${c.lastMessage.status === 'read' ? 'text-cyan-500' : 'text-slate-400'}`}>
                         {c.lastMessage.status === 'read' ? <CheckCheck size={14} /> : <Check size={14} />}
                       </span>
                    )}
                    <span className="truncate">{c.lastMessage?.text || '[Media]'}</span>
                  </p>

                  {/* Tag/Label Container */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {lLabel && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm flex items-center gap-1 ${lLabel.color}`}>
                        {lLabel.name} 
                        {isActive && (
                          <span 
                            className="bg-white/20 hover:bg-white/40 rounded-full p-0.5 ml-1 transition-colors"
                            onClick={(e) => removeLabel(cNum, e)}
                            title="Cabut Label"
                          >
                            <X size={10} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                    )}
                    {isLead && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                        isLead.has_replied 
                          ? 'bg-rose-50 text-rose-500 border-rose-100' 
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}>
                        {isLead.has_replied ? '🔥 Hot Lead' : '❄️ Cold Lead'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Indikator Waktu & Unread Badge (Kanan) - FIX UI WHATSAPP */}
                <div className="flex flex-col items-end justify-start pt-1 gap-1.5 shrink-0">
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${
                    isUnread ? 'text-emerald-500' : 'text-slate-400'
                  }`}>
                    {formatChatDate(c.lastMessage?.time, liveTime)}
                  </span>
                  
                  {/* FIX PENTING: Lencana Notifikasi Angka Chat Baru Masuk */}
                  {isUnread && !isSelectionMode && (
                    <div className="min-w-[22px] h-[22px] rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-black shadow-sm px-1.5 animate-in zoom-in duration-300">
                      {c.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* --------------------------------------------------------------------- */}
        {/* AREA 2: BULK ACTION BAR (Tampil jika Mode Pilihan Aktif) */}
        {/* --------------------------------------------------------------------- */}
        {isSelectionMode && selectedPeers.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900 rounded-[2rem] p-4 shadow-2xl border border-slate-700 flex items-center justify-between animate-in slide-in-from-bottom-6 z-50">
             <span className="text-xs font-black text-white px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
               {selectedPeers.length} Nomor
             </span>
             
             <div className="flex gap-2">
                <button 
                  onClick={() => setLabelModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-indigo-600 rounded-xl text-white transition-colors" 
                  title="Pasang Label Terpadu"
                >
                  <Tag size={18} strokeWidth={2.5}/>
                </button>
                <button 
                  onClick={() => setBcModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-emerald-600 rounded-xl text-white transition-colors" 
                  title="Jadwalkan Broadcast Cepat"
                >
                  <Megaphone size={18} strokeWidth={2.5}/>
                </button>
                <button 
                  onClick={() => setFuModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-orange-500 rounded-xl text-white transition-colors" 
                  title="Jadwalkan Workflow / Auto Follow Up"
                >
                  <CalendarClock size={18} strokeWidth={2.5}/>
                </button>
                
                <div className="w-[1px] h-8 bg-slate-700 mx-1 self-center"></div>
                
                <button 
                  onClick={executeDeleteChats} 
                  className="p-3 bg-slate-800 hover:bg-rose-600 rounded-xl text-rose-400 hover:text-white transition-colors" 
                  title="Hapus Permanen"
                >
                  <Trash2 size={18} strokeWidth={2.5}/>
                </button>
             </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* AREA 3: CHAT VIEW (KOLOM PERCAKAPAN AKTIF) */}
      {/* --------------------------------------------------------------------- */}
      {peer ? (
        <div className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20">
          
          {/* --- Chat Header --- */}
          <div className="h-24 px-8 flex items-center border-b border-white/20 bg-white/40 backdrop-blur-xl z-20 shrink-0 shadow-sm justify-between">
            <div className="flex items-center flex-1 min-w-0">
              {/* Avatar Chat View */}
              <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center font-black text-2xl text-blue-600 border border-slate-100 mr-5 shrink-0 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-blue-50 to-transparent"></div>
                <span className="relative z-10">
                  {(currentConv?.name ? currentConv.name.charAt(0) : peer.charAt(0)).toUpperCase()}
                </span>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 truncate">
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight truncate">
                    {formatContactName(peer, currentConv?.name)}
                  </h2>
                  
                  {/* Label & Status di Header */}
                  {currentLabel && (
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${currentLabel.color}`}>
                      {currentLabel.name}
                    </span>
                  )}
                  {currentLead && (
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border bg-white ${
                      currentLead.has_replied 
                        ? 'text-rose-500 border-rose-200' 
                        : 'text-slate-500 border-slate-200'
                    }`}>
                      {currentLead.has_replied ? '🔥 Target Aktif' : '❄️ Target Pasif'}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)] border border-white"></div>
                  <p className="text-[11px] text-slate-500 font-bold tracking-[0.1em] uppercase">
                    Terhubung End-to-End
                  </p>
                  
                  <span className="text-[9px] ml-3 text-slate-400 bg-white/70 px-2 py-0.5 rounded-md flex items-center gap-1.5 font-bold uppercase tracking-widest border border-slate-200">
                     <Activity size={10} className="text-emerald-500 animate-pulse" /> Sinkronasi Aktif
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions untuk Chat Aktif */}
            <div className="flex gap-2.5">
              <button 
                onClick={() => setLabelModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-indigo-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-105 hover:bg-indigo-50" 
                title="Kelola Label"
              >
                <Tag size={20} strokeWidth={2.5}/>
              </button>
              <button 
                onClick={() => setBcModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-emerald-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-105 hover:bg-emerald-50" 
                title="Tembak Pesan Broadcast"
              >
                <Megaphone size={20} strokeWidth={2.5}/>
              </button>
              <button 
                onClick={() => setFuModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-orange-500 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-105 hover:bg-orange-50" 
                title="Masukkan ke Rangkaian Follow Up"
              >
                <CalendarClock size={20} strokeWidth={2.5}/>
              </button>
            </div>
          </div>

          {/* --- Render Area Bubble Chat --- */}
          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scrollbar-hide scroll-smooth relative bg-slate-50/30"
          >
            <div className="flex flex-col items-center mb-8 gap-4 pt-4">
              <div className="bg-amber-50/80 border border-amber-200 text-amber-800 text-[11px] font-bold px-6 py-3 rounded-2xl max-w-md text-center leading-relaxed shadow-sm backdrop-blur-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                🔒 Seluruh percakapan dienkripsi oleh protokol standar. Kami tidak menyimpan media pada server publik.
              </div>
              
              {messages.length >= msgLimit && (
                <button 
                  onClick={() => { setMsgLimit(m => m + 100); setIsAtBottom(false); }} 
                  className="px-6 py-2.5 bg-white border border-slate-200 text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm hover:scale-105 hover:bg-blue-50 transition-all"
                >
                  <Clock size={12} className="inline mr-2 text-blue-400"/>
                  Tampilkan Riwayat Lebih Lama
                </button>
              )}
            </div>

            {/* UI/UX FIX: Pesan kini diurutkan secara natural tanpa memanggil array.reverse()
                yang mengakibatkan bug di WhatsApp Web view di mana pesan terbalik atau tertahan */}
            {messages.map((m) => {
              const isOut = m.direction === "out";
              return (
                <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[75%] px-6 py-4 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.04)] relative transition-all duration-500 ${
                    isOut 
                      ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm" 
                      : "bg-white backdrop-blur-xl text-slate-800 rounded-bl-sm border border-slate-200"
                  }`}>
                    
                    {/* Media Type Renderer */}
                    {m.type === 'image' && (
                      <div className="mb-3 text-[10px] font-black opacity-90 uppercase tracking-widest bg-black/10 inline-block px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <ImageIcon size={14}/> Gambar Terlampir
                      </div>
                    )}
                    {m.type === 'document' && (
                      <div className="mb-3 text-[10px] font-black opacity-90 uppercase tracking-widest bg-black/10 inline-block px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <FileText size={14}/> Dokumen
                      </div>
                    )}
                    {m.type === 'location' && (
                      <div className="mb-3 text-[10px] font-black opacity-90 uppercase tracking-widest bg-black/10 inline-block px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <MapPin size={14}/> Lokasi Peta
                      </div>
                    )}

                    <p className="text-[15px] leading-relaxed font-medium break-words whitespace-pre-wrap">
                      {m.text || (m.type !== 'text' ? '[Media Berhasil Dikirim]' : '')}
                    </p>
                    
                    <div className="text-[10px] mt-3 flex justify-end items-center gap-2 opacity-70 font-black uppercase tracking-widest">
                      {/* Jam Relatif Live */}
                      {formatTime(m.time)}
                      
                      {/* Indikator Status Pengiriman WhatsApp */}
                      {isOut && (
                        <span className={`text-[14px] ${m.status === 'read' ? 'text-cyan-300 shadow-cyan-500/50 drop-shadow-sm' : 'text-white/70'}`}>
                          {m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* --- Area Input Ketik Pesan & Attachment --- */}
          <div className="p-6 md:p-8 bg-white/70 backdrop-blur-2xl z-20 shrink-0 border-t border-slate-200 relative">
            
            {/* Pop-up Lampiran Menu */}
            {attachOpen && (
              <div className="absolute bottom-28 left-8 bg-white/95 backdrop-blur-xl border border-slate-200 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2 z-50 animate-in slide-in-from-bottom-4 min-w-[240px]">
                <button 
                  onClick={() => { setMediaModal({ open: true, type: 'document' }); setAttachOpen(false); }} 
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50 rounded-[1.2rem] text-slate-700 font-bold transition-all text-sm w-full text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText size={18} strokeWidth={2.5}/>
                  </div>
                  Kirim Dokumen (URL)
                </button>
                <button 
                  onClick={() => { setMediaModal({ open: true, type: 'image' }); setAttachOpen(false); }} 
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-emerald-50 rounded-[1.2rem] text-slate-700 font-bold transition-all text-sm w-full text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ImageIcon size={18} strokeWidth={2.5}/>
                  </div>
                  Kirim Gambar (URL)
                </button>
                <button 
                  onClick={() => { setMediaModal({ open: true, type: 'location' }); setAttachOpen(false); }} 
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-amber-50 rounded-[1.2rem] text-slate-700 font-bold transition-all text-sm w-full text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MapPin size={18} strokeWidth={2.5}/>
                  </div>
                  Bagikan Lokasi
                </button>
              </div>
            )}

            <div className="max-w-4xl mx-auto flex items-end gap-4 bg-white p-3.5 rounded-[2rem] border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)] focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-300 transition-all duration-300">
              
              {/* Tombol Attachment Kiri */}
              <button 
                onClick={() => setAttachOpen(!attachOpen)}
                className={`w-12 h-12 flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-90 rounded-[1.2rem] shrink-0 border ${
                  attachOpen 
                    ? 'bg-blue-600 border-blue-600 text-white rotate-45 shadow-md' 
                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'
                }`}
              >
                <Plus size={22} strokeWidth={3} />
              </button>
              
              {/* Textarea Dinamis */}
              <textarea 
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Kirim pesan dengan menekan Enter (tanpa Shift)
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder="Ketik balasan Anda di sini... (Tekan Enter untuk kirim)"
                className="flex-1 bg-transparent border-none py-3.5 px-3 text-[15px] font-semibold outline-none resize-none max-h-36 text-slate-700 placeholder-slate-400 leading-relaxed"
                rows={1}
              />

              {/* Tombol Kirim Pesan */}
              <button 
                onClick={sendText}
                disabled={!text.trim() || sending}
                className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center transition-all duration-500 shrink-0 ${
                  text.trim() && !sending
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 cursor-pointer" 
                    : "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                }`}
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Send size={20} strokeWidth={2.5} className="ml-1" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // STATE KOSONG (Ketik Belum Ada Chat Dipilih)
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 relative border-l border-slate-200">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none"></div>
          
          <div className="w-32 h-32 rounded-[3.5rem] bg-white border border-slate-100 mb-8 flex items-center justify-center text-blue-500 shadow-2xl shadow-blue-500/10 transform rotate-3 relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-transparent rounded-[3.5rem] opacity-50"></div>
            <MessageCircle size={48} strokeWidth={2} />
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2 relative z-10">WhatsApp Web SaaS</h2>
          <p className="text-sm font-semibold text-slate-500 relative z-10 max-w-sm text-center">
            Pilih salah satu percakapan di samping untuk mulai membalas pesan klien secara Real-Time.
          </p>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 4. MODALS & OVERLAYS SYSTEM */}
      {/* ============================================================================ */}

      {/* 4.A Modal: Atur Label Kustom */}
      {labelModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Tag size={18} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Pasang Label Khusus</h3>
            </div>
            
            <p className="text-xs font-bold text-slate-500 mb-6 bg-slate-50 inline-block px-3 py-1 rounded-md border border-slate-200 mt-2">
              Menerapkan label pada {labelModal.targets.length} nomor terpilih.
            </p>
            
            {/* Quick Pick: Menampilkan Label yang sudah pernah dibuat */}
            {uniqueLabels.length > 0 && (
              <div className="mb-6">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Pilih Dari yang Sudah Ada:</label>
                <div className="flex flex-wrap gap-2">
                  {uniqueLabels.map(l => (
                    <button 
                      key={l.name} 
                      onClick={() => setLabelPayload({name: l.name, color: l.color})} 
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-all hover:scale-105 active:scale-95 ${l.color} ${labelPayload.name === l.name ? 'ring-4 ring-offset-1 ring-blue-500/30' : ''}`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-8">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Atau Buat Label Baru:</label>
               <input 
                 value={labelPayload.name} 
                 onChange={(e)=>setLabelPayload({...labelPayload, name: e.target.value})} 
                 placeholder="Ketik nama label..." 
                 className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 mb-4 focus:bg-white focus:border-blue-400 transition-colors" 
               />
               
               {/* Color Picker Component */}
               <div className="flex flex-wrap gap-3 mt-2">
                 {LABEL_COLORS.map(color => (
                   <button 
                     key={color} 
                     onClick={() => setLabelPayload({...labelPayload, color})} 
                     className={`w-8 h-8 rounded-full cursor-pointer transition-all duration-300 ${color} ${
                       labelPayload.color === color 
                         ? 'ring-4 ring-offset-2 ring-blue-400 scale-110 shadow-lg' 
                         : 'opacity-50 hover:opacity-100 hover:scale-110'
                     }`} 
                   />
                 ))}
               </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button onClick={() => setLabelModal({ open: false, targets: [] })} className="px-6 py-3.5 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95">Batal</button>
              <button onClick={executeSetLabel} className="px-8 py-3.5 rounded-[1.2rem] font-black text-white bg-blue-600 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all">Simpan Label</button>
            </div>
          </div>
        </div>
      )}

      {/* 4.B Modal: Jadwal Broadcast Cepat */}
      {bcModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4 mb-2">
                 <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner border border-emerald-200">
                   <Megaphone size={24} strokeWidth={2.5}/>
                 </div>
                 <div>
                   <h3 className="text-2xl font-black text-slate-800 tracking-tight">Kirim Broadcast</h3>
                   <p className="text-xs font-bold text-emerald-600 mt-1 uppercase tracking-widest">Ke {bcModal.targets.length} Target Terpilih</p>
                 </div>
              </div>
            </div>
            
            <div className="p-8 overflow-y-auto">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Isi Pesan Promosi</label>
              <textarea 
                rows={6} 
                value={bcPayload.text} 
                onChange={(e)=>setBcPayload({...bcPayload, text: e.target.value})} 
                placeholder="Halo {{nama}}, kami ada promo khusus hari ini..." 
                className="w-full px-6 py-4 rounded-[1.5rem] bg-slate-50 border border-slate-200 outline-none font-medium text-slate-700 mb-6 resize-none focus:bg-white focus:border-emerald-400 transition-colors" 
              />
              
              <div className="flex items-center justify-between bg-emerald-50/50 px-6 py-4 rounded-2xl border border-emerald-100">
                 <div>
                   <span className="text-[11px] font-black text-emerald-800 uppercase tracking-widest block">Jeda Anti-Banned</span>
                   <span className="text-[10px] font-semibold text-emerald-600/70 mt-1 block">Waktu jeda antar pengiriman pesan</span>
                 </div>
                 <div className="flex items-center bg-white px-3 py-2 rounded-xl border border-emerald-200 shadow-sm">
                   <input 
                     type="number"
                     value={bcPayload.delay} 
                     onChange={(e)=>setBcPayload({...bcPayload, delay: e.target.value})} 
                     className="w-16 text-center bg-transparent outline-none font-black text-slate-800" 
                   />
                   <span className="text-xs font-bold text-slate-400 ml-1">Ms</span>
                 </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex gap-3 justify-end shrink-0">
              <button onClick={() => setBcModal({ open: false, targets: [] })} className="px-8 py-4 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95">Batal</button>
              <button onClick={executeScheduleBroadcast} className="px-8 py-4 rounded-[1.2rem] font-black text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 transition-all">Mulai Antrean</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 4.C Modal: Tambah ke Sequence Follow Up */}
      {fuModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
            
            <div className="flex items-center gap-4 mb-6">
               <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-[1.5rem] flex items-center justify-center shadow-inner border border-orange-200 transform -rotate-3">
                 <CalendarClock size={28} strokeWidth={2.5}/>
               </div>
               <div>
                 <h3 className="text-3xl font-black text-slate-800 tracking-tight">Auto Follow Up</h3>
                 <p className="text-xs font-bold text-orange-600 mt-1.5 uppercase tracking-widest">{fuModal.targets.length} Target Akan Dijadwalkan</p>
               </div>
            </div>
            
            <div className="mb-10 bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Pilih Workflow / Sequence Tujuan</label>
              
              {campaigns.length > 0 ? (
                <div className="relative">
                  <select 
                    value={fuPayload.campaignId} 
                    onChange={(e)=>setFuPayload({...fuPayload, campaignId: e.target.value})} 
                    className="w-full px-5 py-4 rounded-[1.2rem] bg-white border border-slate-300 outline-none font-black text-slate-700 appearance-none cursor-pointer shadow-sm focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10 transition-all"
                  >
                    <option value="">-- Sentuh untuk Memilih --</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="absolute right-4 top-4 text-slate-400 pointer-events-none">
                    <Layers size={18} />
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-[1.2rem] bg-rose-50 border border-rose-200 text-rose-600 text-sm font-bold leading-relaxed flex gap-3 items-start">
                  <Activity size={20} className="shrink-0 mt-0.5" />
                  Belum ada Campaign / Sequence yang dibuat. Silakan buka menu "Follow Up" di Sidebar Utama untuk membuat jadwal.
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setFuModal({ open: false, targets: [] })} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95"
              >
                Kembali
              </button>
              <button 
                onClick={executeAddToFollowUp} 
                disabled={campaigns.length === 0 || !fuPayload.campaignId} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-white bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed text-[11px] uppercase tracking-widest shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2"
              >
                <Check size={16} strokeWidth={3} />
                Eksekusi Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}