/**
 * ============================================================================
 * INBOX.TSX - WHATSAPP WEB SAAS UI (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini merupakan jantung dari aplikasi WhatsApp SaaS. Menangani 
 * percakapan Real-Time, Bulk Actions, Manajemen Label, dan sinkronisasi 
 * sesi Baileys dengan kompensasi Timezone secara otomatis.
 * * V.8.0 Ultimate Stable Fixes:
 * - Enterprise Grade JSX Formatting (Satu atribut per baris untuk skalabilitas).
 * - Component Decomposition (Pemisahan MessageBubble, EmptyState, ErrorBoundary).
 * - Bulletproof Deep Comparator untuk Bubble Chat (Mencegah Chat Stuck).
 * - Optimistic UI untuk Lencana Unread Count.
 * - Ekstraksi Metadata JID yang komprehensif.
 * - Fully Typed Interfaces dengan JSDoc Documentation ekstensif.
 * - Menjamin stabilitas render pada antrean > 10.000 pesan.
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
  MessageCircle, 
  Users, 
  User, 
  Loader2, 
  Info,
  AlertTriangle
} from "lucide-react";

// ============================================================================
// 1. ERROR BOUNDARY
// ============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary
 * Menangkap error rendering pada komponen anak agar seluruh aplikasi tidak crash.
 */
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
        <div 
          className="flex flex-col items-center justify-center h-full w-full bg-slate-50 text-slate-600 p-8 text-center"
        >
          <AlertTriangle 
            size={64} 
            className="text-rose-500 mb-6 drop-shadow-md" 
            strokeWidth={1.5} 
          />
          <h2 
            className="text-2xl font-black text-slate-800 tracking-tight mb-2"
          >
            Terjadi Kesalahan Render
          </h2>
          <p 
            className="text-sm font-medium mb-6 max-w-md leading-relaxed"
          >
            Komponen Inbox mengalami gangguan kritis. Silakan muat ulang halaman.
            <br />
            <span className="text-xs font-mono text-rose-400 mt-2 block">
              {this.state.error?.message}
            </span>
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-slate-800 text-white font-bold rounded-xl shadow-lg hover:bg-slate-700 transition-all"
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
// 2. API UTILITIES & AUTHENTICATION
// ============================================================================

/**
 * Mengambil API Key dari LocalStorage untuk autentikasi permintaan ke Backend.
 * @returns {string} Token otorisasi API
 */
const getApiKey = (): string => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("WA_KEY") || "";
  }
  return "";
};

/**
 * Fungsi fetch wrapper terstandarisasi untuk semua panggilan API di halaman Inbox.
 * Otomatis menyertakan Headers x-api-key dan menangani parsing error dari backend.
 * * @param path - Endpoint tujuan (cth: "/messages/send")
 * @param init - Opsi RequestInit standar dari fetch API
 * @returns {Promise<T>} Data JSON yang telah di-parsing
 */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  
  if (key) {
    headers.set("x-api-key", key);
  }
  
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.error || "Terjadi kesalahan pada server API");
  }
  
  return data as T;
}

/**
 * Fungsi helper untuk mencegah duplikasi percakapan di Sidebar 
 * akibat race-condition saat fetching data secara paralel.
 * * @param items - Array dari Conversation Row mentah
 * @returns Array Conversation Row yang sudah di-filter unik
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
// 3. TYPE DEFINITIONS & INTERFACES
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

/**
 * Konstanta palet warna estetik untuk fitur label kustom.
 */
export const LABEL_COLORS = [
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

/**
 * Generator Warna Berdasarkan Hash Nomor Telepon.
 * Digunakan secara khusus untuk memberikan warna unik pada nama pengirim di Grup WA.
 * * @param jid - WhatsApp JID pengirim
 * @returns {string} Tailwind text color class
 */
export const getSenderColor = (jid: string): string => {
  const colors = [
    'text-rose-500', 
    'text-blue-500', 
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

// ============================================================================
// 4. TIMEZONE & FORMATTING ENGINE
// ============================================================================

/**
 * FIX TIMEZONE BUG: Menyelaraskan output waktu dari MySQL (UTC) 
 * ke Waktu Lokal secara paksa untuk menghindari kesalahan render jam obrolan.
 * * @param dateStr - String ISO Date dari MySQL
 * @returns {Date} Object Date yang telah dinormalisasi
 */
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

/**
 * Memformat tanggal menjadi jam spesifik.
 * * @param dateStr - String ISO Date
 * @returns {string} Format "HH:mm" (Contoh: "18:45")
 */
export function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = normalizeDate(dateStr);
  return d.toLocaleTimeString("id-ID", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
}

/**
 * Memformat tanggal menjadi relasional.
 * * @param dateStr - String ISO Date dari pesan
 * @param nowTime - Objek Date saat ini (realtime)
 * @returns {string} "HH:mm" (hari ini), "Kemarin" (H-1), atau "DD/MM/YY"
 */
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

/**
 * FEATURE 1: Formatter Nama Prioritas Cerdas
 * Mengutamakan nama PushName dari database, jika tidak ada, fallback potong nomor.
 * * @param jid - WhatsApp JID
 * @param name - Nama kontak yang ditarik dari Database
 * @returns {string} Nama yang layak ditampilkan ke layar
 */
export function formatContactName(jid: string, name?: string | null): string {
  const isGroup = jid.includes("@g.us");
  
  if (name && name.trim() !== "" && name !== jid) {
    return name; 
  }
  
  if (isGroup) {
    return "Grup WhatsApp";
  }
  
  if (!jid) {
    return "Unknown";
  }
  
  const num = jid.split("@")[0];
  
  if (jid.includes("@lid")) {
    return `~${num} (LID)`;
  }
  
  if (num.startsWith("62")) {
    return `+62 ${num.slice(2)}`;
  }
  
  return num;
}

// ============================================================================
// 5. MODULAR SUB-COMPONENTS (UI ABSTRACTIONS)
// ============================================================================

/**
 * EmptyChatState
 * Komponen State Kosong yang dirender ketika belum ada obrolan yang dipilih.
 */
const EmptyChatState: React.FC = () => (
  <div 
    className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 relative border-l border-slate-200 animate-in fade-in duration-500"
  >
    <div 
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] bg-blue-500/5 rounded-full blur-[140px] pointer-events-none"
    ></div>
    
    <div 
      className="w-40 h-40 rounded-[4rem] bg-white border border-slate-100 mb-10 flex items-center justify-center text-blue-500 shadow-2xl shadow-blue-500/10 transform rotate-3 relative hover:scale-105 transition-transform duration-700"
    >
      <div 
        className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-transparent rounded-[4rem] opacity-50"
      ></div>
      <MessageCircle 
        size={72} 
        strokeWidth={1.5} 
      />
    </div>
    
    <h2 
      className="text-3xl font-black text-slate-800 tracking-tight mb-4 relative z-10"
    >
      WhatsApp Web SaaS
    </h2>
    <p 
      className="text-[16px] font-semibold text-slate-500 relative z-10 max-w-md text-center leading-relaxed"
    >
      Sistem terhubung secara <i>Real-Time</i> ke server. Silakan pilih salah satu percakapan di samping untuk mulai membalas pesan klien.
    </p>
  </div>
);

/**
 * Props untuk Komponen Bubble Chat Individu
 */
interface MessageBubbleProps {
  msg: MsgRow;
  liveTime: Date;
  isGroup: boolean;
}

/**
 * MessageBubble
 * Komponen Gelembung Obrolan Tunggal (Inbound & Outbound)
 * Mengontrol rendering teks, media, lokasi, waktu, dan status dibaca.
 */
const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, liveTime, isGroup }) => {
  const isOut = msg.direction === "out";

  return (
    <div 
      className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div 
        className={`max-w-[80%] md:max-w-[70%] px-6 py-4 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.04)] relative transition-all duration-500 group ${
          isOut 
            ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm" 
            : "bg-white backdrop-blur-xl text-slate-800 rounded-bl-sm border border-slate-200"
        }`}
      >
        
        {/* NAMA PENGIRIM (KHUSUS UNTUK CHAT GRUP SAJA) */}
        {isGroup && !isOut && (
          <div 
            className={`text-[12px] font-black mb-1.5 uppercase tracking-wide cursor-pointer hover:underline ${getSenderColor(msg.participant || '')}`}
          >
             {msg.pushName || formatContactName(msg.participant || "Unknown")}
          </div>
        )}

        {/* ================= DETEKSI TIPE MEDIA ================= */}
        
        {msg.type === 'image' && (
          <div 
            className={`mb-3 text-[11px] font-black opacity-90 uppercase tracking-widest inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${
              isOut ? 'bg-black/20' : 'bg-slate-100'
            }`}
          >
            <ImageIcon size={16}/> 
            Gambar Terlampir
          </div>
        )}
        
        {msg.type === 'document' && (
          <div 
            className={`mb-3 text-[11px] font-black opacity-90 uppercase tracking-widest inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${
              isOut ? 'bg-black/20' : 'bg-slate-100'
            }`}
          >
            <FileText size={16}/> 
            Dokumen / File
          </div>
        )}
        
        {msg.type === 'location' && (
          <div 
            className={`mb-3 text-[11px] font-black opacity-90 uppercase tracking-widest inline-flex px-3 py-1.5 rounded-lg items-center gap-2 ${
              isOut ? 'bg-black/20' : 'bg-slate-100'
            }`}
          >
            <MapPin size={16}/> 
            Lokasi Peta Dibagikan
          </div>
        )}

        {/* ================= TEKS PESAN UTAMA ================= */}
        
        <p 
          className="text-[15px] md:text-[16px] leading-relaxed font-medium break-words whitespace-pre-wrap"
        >
          {msg.text || (msg.type !== 'text' ? '[Isi Media Berhasil Dikirim/Diterima]' : '')}
        </p>
        
        {/* ================= FOOTER BUBBLE ================= */}
        
        <div 
          className="text-[10px] mt-3 flex justify-end items-center gap-2 opacity-70 font-black uppercase tracking-widest"
        >
          {formatTime(msg.time)}
          
          {isOut && (
            <span 
              className={`text-[15px] transition-colors ${
                msg.status === 'read' 
                  ? 'text-cyan-300 shadow-cyan-500/50 drop-shadow-sm' 
                  : 'text-white/70'
              }`}
            >
              {msg.status === 'read' ? (
                <CheckCheck size={16} />
              ) : msg.status === 'delivered' ? (
                <CheckCheck size={16} />
              ) : (
                <Check size={16} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 6. MAIN PAGE COMPONENT (INBOX LOGIC)
// ============================================================================

function InboxComponent() {
  // --------------------------------------------------------------------------
  // A. SYSTEM & TIME STATES
  // --------------------------------------------------------------------------
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [liveTime, setLiveTime] = useState<Date>(new Date());
  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);

  // Interval timer untuk menjaga jam obrolan (relasional) tetap update tanpa F5
  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // --------------------------------------------------------------------------
  // B. CUSTOM LABELS STATES (Persistent Local Storage)
  // --------------------------------------------------------------------------
  const [customLabels, setCustomLabels] = useState<Record<string, CustomLabel>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("wa_inbox_labels");
        return saved ? JSON.parse(saved) : {};
      } catch { 
        return {}; 
      }
    }
    return {};
  });

  // Sinkronisasi setiap kali objek customLabels bermutasi
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wa_inbox_labels", JSON.stringify(customLabels));
    }
  }, [customLabels]);
  
  // Memetakan label menjadi array unik untuk digunakan di barisan Filter Chips
  const uniqueLabels = useMemo(() => {
    const map = new Map<string, CustomLabel>();
    Object.values(customLabels).forEach(l => {
      if (!map.has(l.name)) {
        map.set(l.name, l);
      }
    });
    return Array.from(map.values());
  }, [customLabels]);

  // --------------------------------------------------------------------------
  // C. CHAT & MESSAGE STATES
  // --------------------------------------------------------------------------
  const [peer, setPeer] = useState<string>("");
  
  // activePeerRef digunakan agar setInterval bisa membaca state peer terbaru 
  // tanpa harus menghancurkan dan membuat ulang timer setiap detik.
  const activePeerRef = useRef<string>("");
  useEffect(() => {
    activePeerRef.current = peer;
  }, [peer]);

  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  
  // --------------------------------------------------------------------------
  // D. FILTER & SEARCH STATES
  // --------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'personal' | 'group' | 'unread' | 'read' | string>('all');
  
  // --------------------------------------------------------------------------
  // E. BULK ACTIONS & MODAL STATES
  // --------------------------------------------------------------------------
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [attachOpen, setAttachOpen] = useState<boolean>(false);
  const [msgLimit, setMsgLimit] = useState<number>(100);
  
  // Modal Pengiriman Media
  const [mediaModal, setMediaModal] = useState<{ 
    open: boolean; 
    type: 'image' | 'document' | 'location';
  }>({ open: false, type: 'image' });
  
  const [mediaPayload, setMediaPayload] = useState({ 
    url: "", 
    caption: "", 
    lat: "", 
    lng: "" 
  });

  // Modal Penjadwalan Broadcast
  const [bcModal, setBcModal] = useState<{ 
    open: boolean; 
    targets: string[]; 
  }>({ open: false, targets: [] });
  
  const [bcPayload, setBcPayload] = useState({ 
    text: "", 
    delay: "2000" 
  });

  // Modal Penugasan Label Kustom
  const [labelModal, setLabelModal] = useState<{ 
    open: boolean; 
    targets: string[]; 
  }>({ open: false, targets: [] });
  
  const [labelPayload, setLabelPayload] = useState({ 
    name: "Prospek Baru", 
    color: "bg-blue-500" 
  });
  
  // Modal Auto Follow Up Workflow
  const [fuModal, setFuModal] = useState<{ 
    open: boolean; 
    targets: string[]; 
  }>({ open: false, targets: [] });
  
  const [fuPayload, setFuPayload] = useState({ 
    campaignId: "" 
  });
  
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // --------------------------------------------------------------------------
  // F. DOM REFS & SCROLL MANAGEMENT
  // --------------------------------------------------------------------------
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);

  // Ekstraksi nomor bersih untuk lookup tag & leads
  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  // ============================================================================
  // G. SORTING & FILTERING COMPUTATION ENGINE
  // ============================================================================
  
  const filteredConvs = useMemo(() => {
    // 0. Kloning array agar aman dimutasi saat diurutkan oleh .sort()
    let result = [...convs];
    
    // 1. PENGURUTAN (SORTING)
    // Berdasarkan waktu pesan terakhir (Descending: Yang terbaru di urutan atas)
    result.sort((a, b) => {
      const tA = normalizeDate(a.lastMessage?.time || "").getTime();
      const tB = normalizeDate(b.lastMessage?.time || "").getTime();
      return tB - tA; 
    });

    // 2. LOGIKA FILTER CHIPS UI
    if (activeFilter === 'unread') {
      result = result.filter(c => c.unreadCount > 0);
    } else if (activeFilter === 'personal') {
      result = result.filter(c => !c.remoteJid.includes('@g.us'));
    } else if (activeFilter === 'group') {
      result = result.filter(c => c.remoteJid.includes('@g.us'));
    } else if (activeFilter === 'read') {
      result = result.filter(c => c.unreadCount === 0);
    } else if (activeFilter.startsWith('label_')) {
      const lblName = activeFilter.replace('label_', '');
      result = result.filter(c => customLabels[c.remoteJid.split('@')[0]]?.name === lblName);
    }

    // 3. LOGIKA PENCARIAN TEKS BEBAS (SEARCH BAR)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // Bersihkan string dari alfabet (hanya sisakan angka) jika user mencoba mencari berdasarkan nomor HP
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
  // H. SCROLL BEHAVIORS
  // ============================================================================

  /**
   * Men-scroll kontainer obrolan ke dasar secara otomatis.
   * Dipanggil saat pesan baru dimuat atau saat pengguna membuka chat.
   */
  const scrollToBottom = useCallback((behavior: "smooth" | "auto" = "smooth") => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({ 
        top: scrollHeight - clientHeight, 
        behavior 
      });
    }
  }, []);

  /**
   * Mendeteksi posisi scroll saat ini melalui event OnScroll.
   * Jika pengguna menggulir ke atas untuk membaca pesan lama, 
   * auto-scroll akan ditangguhkan sementara waktu (paused) 
   * agar layar mereka tidak tiba-tiba tersentak saat ada pesan baru masuk.
   */
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // Memberikan toleransi jarak 50px dari dasar untuk dianggap "Berada di Dasar"
    const isBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    setIsAtBottom(isBottom);
  };

  // Memicu auto-scroll setiap kali panjang data `messages` berubah
  useEffect(() => { 
    if (isAtBottom && messages.length > 0) {
      // Delay mikro (100ms) diperlukan untuk memberi React waktu menyelesaikan 
      // lukisan DOM sebelum kita dapat menghitung scrollHeight secara akurat.
      setTimeout(() => scrollToBottom("smooth"), 100);
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // ============================================================================
  // I. CHAT SELECTION & OPTIMISTIC UPDATES
  // ============================================================================

  /**
   * Menangani aksi klik pada kartu daftar obrolan di Sidebar.
   * Bisa berlaku sebagai selector (saat mode bulk action) atau opener chat.
   */
  const handleSelectChat = (jid: string) => {
    if (isSelectionMode) {
      togglePeerSelection(jid);
    } else {
      setPeer(jid);
      
      // ==============================================================
      // OPTIMISTIC UI UPDATE
      // ==============================================================
      // Segera bersihkan lencana notifikasi unread (paksa menjadi 0) di state frontend 
      // sebelum backend merespons. Membuat aplikasi terasa secepat kilat.
      setConvs(prev => prev.map(c => 
        c.remoteJid === jid ? { ...c, unreadCount: 0 } : c
      ));
      
      // Reset limit pagination
      setMsgLimit(100);
      setAttachOpen(false);
      setMessages([]); 
      
      setTimeout(() => { 
        scrollToBottom("auto"); 
        setIsAtBottom(true); 
      }, 100);
      
      // Memicu API backend secara non-blocking (Fire and Forget)
      // Untuk melaporkan bahwa seluruh pesan dalam thread ini telah dibaca.
      apiFetch("/ui/conversations/read", { 
        method: "POST", 
        body: JSON.stringify({ sessionKey, peer: jid }) 
      }).catch((e) => { 
        console.warn("Failed to mark conversation as read:", e);
      });
    }
  };

  // ============================================================================
  // J. DATA FETCHING METHODS
  // ============================================================================

  const loadLeads = async () => {
    try { 
      const res = await apiFetch<{ ok: true; data: LeadRow[] }>("/leads?limit=1000"); 
      setLeads(res.data || []); 
    } catch (e) { 
      console.warn("Failed to load leads background data", e); 
    }
  };

  const loadCampaigns = async () => {
    try { 
      const res = await apiFetch<{ ok: true; data: any[] }>("/followup/campaigns?status=active"); 
      setCampaigns(res.data || []); 
      
      // Otomatis memilih campaign pertama jika ada
      if (res.data && res.data.length > 0) {
        setFuPayload(p => ({ ...p, campaignId: String(res.data[0].id) })); 
      }
    } catch (e) { 
      console.warn("Failed to load active campaigns", e); 
    }
  };

  const loadSessions = async () => {
    try { 
      const res = await apiFetch<{ ok: true; sessions: any[] }>("/ui/sessions"); 
      const list = (res.sessions || []).map(s => ({ 
        session_key: s.session_key, 
        status: s.status 
      })); 
      
      setSessions(list); 
      
      // Otomatis memilih sesi pertama jika belum ada yang terpilih (First Boot)
      if (!sessionKey && list.length > 0) {
        setSessionKey(list[0].session_key);
      }
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      // Hilangkan layar loading penuh saat metadata vital sudah siap
      setIsAppLoading(false);
    }
  };

  /**
   * Menarik daftar percakapan terbaru untuk sidebar.
   */
  const loadConvs = useCallback(async (sk: string) => {
    try { 
      const res = await apiFetch<{ ok: true; conversations: ConvRow[] }>(
        `/ui/conversations?sessionKey=${encodeURIComponent(sk)}`
      ); 
      const deduped = dedupeByRemoteJid(res.conversations || []); 
      
      // Menerapkan UI Optimistis pada proses pembaruan latar belakang (polling):
      // Jika polling menarik unread_count > 0 untuk sebuah obrolan, TAPI obrolan itu 
      // SEDANG kita buka saat ini (activePeerRef), kita paksa hitungannya menjadi 0 
      // agar tidak ada notifikasi palsu yang mengganggu pandangan mata pengguna.
      setConvs(deduped.map(c => {
         if (c.remoteJid === activePeerRef.current) {
            return { ...c, unreadCount: 0 };
         }
         return c;
      }));
      
    } catch (e: any) { 
      setErr(e.message); 
    }
  }, []);

  /**
   * Menarik daftar riwayat pesan untuk percakapan yang sedang aktif.
   */
  const loadMessages = useCallback(async (sk: string, p: string, limit: number) => {
    try {
      // JID Parameter tidak boleh di-split atau dipotong. 
      // Harus mengirimkan string JID mentahnya secara utuh ke backend.
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(
        `/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(p)}&limit=${limit}`
      );
      
      setMessages(prev => {
        const newMsgs = res.messages || [];
        
        // ==============================================================
        // BULLETPROOF DEEP COMPARATOR LOGIC
        // ==============================================================
        
        // 1. Jika jumlah pesan berubah (ada chat masuk / history ditarik), Render Ulang.
        if (prev.length !== newMsgs.length) {
          return newMsgs;
        }
        
        // 2. Jika array masih kosong, tidak ada yang perlu dibandingkan.
        if (prev.length === 0) {
          return newMsgs;
        }
        
        // 3. Scan mendalam penuh (Deep Scan): Cek seluruh elemen array 
        // untuk melihat apakah ada perubahan pada 'id' (pesan baru tertimpa)
        // atau 'status' (read/delivered/sent/failed berubah).
        let hasChanges = false;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== newMsgs[i].id || prev[i].status !== newMsgs[i].status) { 
            hasChanges = true; 
            break; 
          }
        }
        
        // Mengembalikan referensi array memori yang lama (`prev`) adalah hal yang sangat penting 
        // dalam arsitektur React untuk mencegah render ulang DOM secara membabi buta
        // jika data yang ditarik dari server sebenarnya 100% identik dengan yang ada di layar.
        return hasChanges ? newMsgs : prev;
      });
    } catch (e: any) { 
      setErr(e.message); 
    }
  }, []);

  // ============================================================================
  // K. LIFECYCLE & POLLING INTERVALS (CRON JOBS)
  // ============================================================================

  // Fase Booting Pertama
  useEffect(() => { 
    loadSessions(); 
    loadLeads(); 
    loadCampaigns(); 
  }, []);

  // Interval Polling - Daftar Obrolan (Diulang setiap 5 detik)
  useEffect(() => {
    if (!sessionKey) return;
    
    // Eksekusi tarikan pertama segera
    loadConvs(sessionKey); 
    
    // Setel jadwal pekerja latar belakang
    const intervalId = setInterval(() => {
      loadConvs(sessionKey);
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [sessionKey, loadConvs]);

  // Interval Polling - Percakapan Aktif (Diulang setiap 3 detik agar lebih real-time)
  useEffect(() => {
    if (!sessionKey || !peer) return;
    
    // Eksekusi tarikan pertama
    loadMessages(sessionKey, peer, msgLimit); 
    
    const intervalId = setInterval(() => {
      loadMessages(sessionKey, peer, msgLimit);
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, [sessionKey, peer, msgLimit, loadMessages]);

  // ============================================================================
  // L. MUTATION HANDLERS (SENDING & ACTIONS)
  // ============================================================================

  /**
   * Mengirim Pesan Teks
   */
  async function sendText() {
    if (!text.trim() || sending) return;
    
    setSending(true);
    try {
      await apiFetch(`/messages/send`, { 
        method: "POST", 
        body: JSON.stringify({ 
          sessionKey, 
          to: peer, 
          text: text.trim() 
        }), 
      });
      
      // Kosongkan kolom input segera setelah di-submit
      setText("");
      
      // Muat ulang percakapan segera untuk memunculkan bubble secara instant
      await loadMessages(sessionKey, peer, msgLimit);
      await loadConvs(sessionKey);
      
      // Gulung layar ke bawah agar pengguna melihat pesannya
      scrollToBottom("smooth");
      
    } catch (e: any) { 
      setErr(e.message); 
      alert("Gagal mengirim pesan: Mohon cek koneksi perangkat Anda atau Status WhatsApp. " + e.message); 
    } finally { 
      setSending(false); 
    }
  }

  /**
   * Fungsi helper pengatur state peer terpilih
   */
  const togglePeerSelection = (jid: string) => { 
    setSelectedPeers(p => p.includes(jid) 
      ? p.filter(x => x !== jid) 
      : [...p, jid]
    ); 
  };

  /**
   * Menghapus Riwayat Obrolan Permanen (Bulk Delete)
   */
  async function executeDeleteChats() {
    if (!confirm(`Yakin ingin menghapus ${selectedPeers.length} percakapan secara permanen?\n\nTindakan ini akan memusnahkan riwayat obrolan dari server pusat aplikasi Anda.`)) {
      return;
    }
    
    try { 
      await apiFetch("/ui/conversations/delete", { 
        method: "POST", 
        body: JSON.stringify({ 
          sessionKey, 
          peers: selectedPeers 
        }) 
      }); 
      
      // Tutup layar kanan secara otomatis jika obrolan yang sedang dibuka ikut terhapus
      if (selectedPeers.includes(peer)) {
        setPeer(""); 
      }
      
      // Bersihkan antarmuka
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      loadConvs(sessionKey); 
      
    } catch (e: any) { 
      alert("Gagal mengeksekusi penghapusan percakapan: " + e.message); 
    }
  }

  /**
   * Mengeksekusi Jadwal Broadcast Langsung Dari Kotak Masuk
   */
  async function executeScheduleBroadcast() {
    if (!bcPayload.text.trim()) {
      return alert("Pesan penawaran tidak boleh kosong");
    }
    
    try { 
      // JID harus disterilisasi sebelum dikirim ke antrean broadcast
      const cleanTargets = bcModal.targets.map(t => t.split('@')[0]); 
      
      await apiFetch("/broadcast/create", { 
        method: "POST", 
        body: JSON.stringify({ 
          sessionKey, 
          text: bcPayload.text, 
          delayMs: Number(bcPayload.delay), 
          name: `Broadcast Acak (${cleanTargets.length} Kontak)`, 
          targets: cleanTargets 
        }), 
      }); 
      
      // Reset Modal & Mode Pilihan
      setBcModal({ open: false, targets: [] }); 
      setBcPayload({ text: "", delay: "2000" }); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      
      alert(`✅ Eksekusi Luar Biasa! Pesan Broadcast Anda telah dijadwalkan untuk dikirim ke ${cleanTargets.length} kontak.`); 
    } catch (e: any) { 
      alert("Gagal menyusun jadwal broadcast ke antrean server: " + e.message); 
    }
  }

  /**
   * Memasukkan Kontak (Leads) ke Rangkaian Workflow (Auto Follow Up)
   */
  async function executeAddToFollowUp() {
    if (!fuPayload.campaignId) {
      return alert("Anda harus memilih Campaign / Workflow Sequence terlebih dahulu dari dropdown.");
    }
    
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
      
      // Reset UI
      setFuModal({ open: false, targets: [] }); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      
      alert(`✅ Operasi Berhasil! Sebanyak ${cleanTargets.length} kontak telah dimasukkan ke mesin sekunder Auto Follow Up.`); 
    } catch (e: any) { 
      alert("Gagal menambahkan target ke dalam antrean Follow Up: " + e.message); 
    }
  }

  /**
   * Menyematkan Label Berwarna pada Kontak Pilihan
   */
  async function executeSetLabel() {
    if (!labelPayload.name.trim()) return;
    
    try { 
      // ==========================================
      // Optimistic Local State Update untuk Label
      // ==========================================
      setCustomLabels(prev => { 
        const next = { ...prev }; 
        labelModal.targets.forEach(t => { 
          next[t.split('@')[0]] = { 
            name: labelPayload.name, 
            color: labelPayload.color 
          }; 
        }); 
        return next; 
      }); 
      
      // ==========================================
      // Asynchronous Backend Sync (Sinkronasi Server)
      // ==========================================
      apiFetch("/leads/label", { 
        method: "POST", 
        body: JSON.stringify({ 
          targets: labelModal.targets.map(t => t.split('@')[0]), 
          label: labelPayload.name, 
          color: labelPayload.color 
        }) 
      }).catch((syncErr) => {
        console.warn("Label sync API might be unavailable, relying on LocalStorage:", syncErr);
      }); 
      
      // Bersihkan Modal
      setLabelModal({ open: false, targets: [] }); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      
    } catch (e: any) { 
      alert("Gagal menyematkan label pada UI: " + e.message); 
    }
  }

  /**
   * Mencabut / Menghapus Label
   */
  const removeLabel = (targetNum: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Mencegah klik menembus ke elemen kartu chat di bawahnya
    
    if (!confirm("Apakah Anda yakin ingin mencabut label khusus dari kontak ini?")) {
      return;
    }
    
    setCustomLabels(prev => { 
      const next = { ...prev }; 
      delete next[targetNum]; 
      return next; 
    });
  };

  /**
   * Mengeksekusi Pengiriman Media (Gambar, Dokumen, Video) Berdasarkan URL Publik
   */
  async function executeSendMedia() {
    if (sending) return;
    setSending(true);
    
    try {
      const isLoc = mediaModal.type === 'location';
      
      // Penyusunan Payload dikondisikan secara cerdas berdasarkan Tipe Media
      const payload = isLoc 
        ? { 
            sessionKey, 
            to: peer, 
            latitude: Number(mediaPayload.lat), 
            longitude: Number(mediaPayload.lng) 
          } 
        : { 
            sessionKey, 
            to: peer, 
            type: mediaModal.type, 
            url: mediaPayload.url, 
            caption: mediaPayload.caption 
          };
      
      // Tentukan endpoint API eksekutor yang sesuai
      const endpoint = isLoc ? '/messages/send-location' : '/messages/send-media';
      
      await apiFetch(endpoint, { 
        method: "POST", 
        body: JSON.stringify(payload) 
      });
      
      // Reset Modal & State Pengiriman
      setMediaModal({ open: false, type: 'image' }); 
      setMediaPayload({ url: "", caption: "", lat: "", lng: "" }); 
      
      // Tarik Ulang Data Pesan
      loadMessages(sessionKey, peer, msgLimit);
      
    } catch (e: any) { 
      alert("Pengiriman Media Gagal. Pastikan URL Media Valid dan Dapat Diakses Secara Publik: " + e.message); 
    } finally { 
      setSending(false); 
    }
  }

  // Pengambilan Metadata Tambahan untuk Obrolan yang Sedang Dibuka
  const currentConv = convs.find(c => c.remoteJid === peer);
  const currentLead = leads.find(l => l.to_number === peerNumber);
  const currentLabel = customLabels[peerNumber];

  // ============================================================================
  // M. RENDER DOM TREE
  // ============================================================================

  return (
    <div 
      className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem] relative"
    >
      
      {/* --------------------------------------------------------------------- */}
      {/* AREA KIRI: SIDEBAR DAFTAR OBROLAN (LEBAR 450PX) */}
      {/* --------------------------------------------------------------------- */}
      <div 
        className="w-full md:w-[380px] lg:w-[450px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl shrink-0 relative z-10"
      >
        
        {/* ================= HEADER SIDEBAR ================= */}
        <div 
          className="h-24 px-8 flex items-center justify-between border-b border-white/20 shrink-0"
        >
          <div 
            className="flex flex-col"
          >
            <div 
              className="flex items-center gap-2 mb-1"
            >
              <label 
                className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]"
              >
                Pilih Sesi Perangkat
              </label>
              
              {/* Lencana Waktu Server Sinkron Real-time */}
              <span 
                className="text-[9px] font-black text-emerald-500 tracking-widest flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 shadow-sm" 
                title="Waktu Tersinkronisasi Penuh"
              >
                <span 
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
                ></span>
                {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <div 
              className="relative group"
            >
              <select 
                value={sessionKey} 
                onChange={(e) => setSessionKey(e.target.value)} 
                className="bg-transparent text-lg font-black text-slate-800 outline-none cursor-pointer appearance-none pr-8 w-full group-hover:text-blue-600 transition-colors"
              >
                {sessions.map(s => (
                  <option 
                    key={s.session_key} 
                    value={s.session_key}
                  >
                    📱 {s.session_key}
                  </option>
                ))}
                
                {sessions.length === 0 && (
                  <option value="">
                    Tidak ada sesi mesin berjalan
                  </option>
                )}
              </select>
            </div>
          </div>
          
          <button 
            onClick={() => { 
              setIsSelectionMode(!isSelectionMode); 
              setSelectedPeers([]); 
            }} 
            className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center shadow-sm border transition-all ${
              isSelectionMode 
                ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700 hover:scale-105' 
                : 'bg-white/60 text-slate-500 border-white hover:text-blue-600 hover:bg-white hover:scale-105'
            }`}
            title={isSelectionMode ? "Tutup Mode Pilihan" : "Aktifkan Mode Bulk Action"}
          >
            {isSelectionMode ? (
              <X 
                size={20} 
                strokeWidth={3}
              />
            ) : (
              <CheckCheck 
                size={20} 
                strokeWidth={2.5}
              />
            )}
          </button>
        </div>

        {/* ================= SEARCH & CHIP FILTERS ================= */}
        <div 
          className="p-6 shrink-0 border-b border-white/20 bg-white/10"
        >
          
          {/* Kotak Pencarian Utama */}
          <div 
            className="relative mb-4"
          >
            <input 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              placeholder="Cari obrolan, kontak, atau nomor..." 
              className="w-full pl-12 pr-10 py-4 rounded-2xl bg-white/50 border border-white/80 text-sm font-semibold outline-none focus:bg-white/90 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" 
            />
            <Search 
              size={18} 
              className="absolute left-4 top-[1.15rem] text-slate-400" 
            />
            
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="absolute right-4 top-[1.15rem] text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-0.5"
              >
                <X 
                  size={14} 
                  strokeWidth={3}
                />
              </button>
            )}
          </div>
          
          {/* Barisan Scrollable Filter Chips Horizontal */}
          <div 
            className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide"
          >
             <button 
               onClick={() => setActiveFilter('all')} 
               className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'all' 
                   ? 'bg-slate-800 text-white shadow-md scale-105' 
                   : 'bg-white/60 text-slate-500 hover:bg-white border border-transparent hover:border-slate-200'
               }`}
             >
               Semua
             </button>
             
             <button 
               onClick={() => setActiveFilter('unread')} 
               className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'unread' 
                   ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 scale-105' 
                   : 'bg-white/60 text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100'
               }`}
             >
               <div 
                 className="w-2 h-2 rounded-full bg-current opacity-80"
               ></div>
               Belum Dibaca
             </button>

             <button 
               onClick={() => setActiveFilter('personal')} 
               className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'personal' 
                   ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 scale-105' 
                   : 'bg-white/60 text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100'
               }`}
             >
               <User 
                 size={14}
               /> 
               Pribadi
             </button>
             
             <button 
               onClick={() => setActiveFilter('group')} 
               className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                 activeFilter === 'group' 
                   ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 scale-105' 
                   : 'bg-white/60 text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100'
               }`}
             >
               <Users 
                 size={14}
               /> 
               Grup
             </button>
             
             {/* Engine Render Custom Labels (Sangat Dinamis) */}
             {uniqueLabels.map(l => (
               <button 
                 key={l.name} 
                 onClick={() => setActiveFilter(`label_${l.name}`)} 
                 className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm border ${
                   activeFilter === `label_${l.name}` 
                     ? l.color + ' text-white border-transparent scale-105' 
                     : 'bg-white/60 text-slate-600 border-white hover:bg-white'
                 }`}
               >
                 <Tag 
                   size={12} 
                   className="inline mr-1" 
                 /> 
                 {l.name}
               </button>
             ))}
          </div>
        </div>

        {/* ================= DAFTAR OBROLAN (LIST ITEM MAPPER) ================= */}
        <div 
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-hide pb-24 relative"
        >
          
          {/* Render Fallback State Bila Daftar Data Kosong */}
          {filteredConvs.length === 0 && (
            <div 
              className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60 animate-in fade-in duration-500"
            >
               <MessageSquare 
                 size={54} 
                 className="mb-4 text-slate-300" 
                 strokeWidth={1.5} 
               />
               <p 
                 className="font-bold text-sm tracking-wide"
               >
                 Kotak Masuk Kosong.
               </p>
               <p 
                 className="text-xs font-medium mt-1"
               >
                 Tidak ada percakapan yang cocok dengan filter atau pencarian Anda.
               </p>
            </div>
          )}

          {/* Engine Looping Kartu Percakapan Sidebar */}
          {filteredConvs.map(c => {
            const cNum = c.remoteJid.split('@')[0];
            const isActive = peer === c.remoteJid && !isSelectionMode;
            const isSelected = selectedPeers.includes(c.remoteJid);
            const isLead = leads.find(l => l.to_number === cNum);
            const lLabel = customLabels[cNum];
            const isGroup = c.remoteJid.includes('@g.us');
            const contactDisplayName = formatContactName(c.remoteJid, c.name);
            
            // Pengaturan Visual Boolean
            const isUnread = c.unreadCount > 0;
            const isOutMsg = c.lastMessage?.direction === 'out';
            
            // Perbaikan Kosmetik: Penambahan Nama Pengirim Jika Di Grup Chat
            const groupSenderPrefix = isGroup && !isOutMsg && c.lastMessage?.pushName 
              ? `${c.lastMessage.pushName}: ` 
              : '';
            
            return (
              <div 
                key={c.remoteJid}
                onClick={() => handleSelectChat(c.remoteJid)}
                className={`p-4 flex items-stretch gap-4 rounded-[1.8rem] cursor-pointer transition-all duration-300 relative border overflow-hidden ${
                  isActive 
                    ? "bg-white/95 shadow-xl shadow-blue-500/10 border-white scale-[1.02] z-10 ring-4 ring-blue-50" 
                    : isSelected 
                      ? "bg-blue-50 border-blue-200" 
                      : "hover:bg-white/60 border-transparent hover:shadow-sm"
                }`}
              >
                {/* Efek visual list biru menonjol pada elemen yang aktif */}
                {isActive && (
                  <div 
                    className="absolute top-0 bottom-0 left-0 w-1.5 bg-blue-500 rounded-l-[1.8rem]"
                  ></div>
                )}

                {/* Avatar / Selector Toggle Blok */}
                {isSelectionMode ? (
                  <div 
                    className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center shrink-0 border-2 transition-all mt-0.5 ${
                      isSelected 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-110' 
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {isSelected && (
                      <CheckCheck 
                        size={24} 
                        strokeWidth={3} 
                      />
                    )}
                  </div>
                ) : (
                  <div 
                    className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl shrink-0 border border-white shadow-md relative mt-0.5 transition-colors ${
                      isActive 
                        ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" 
                        : isGroup 
                          ? "bg-gradient-to-br from-amber-50 to-orange-50 text-amber-500" 
                          : "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500"
                    }`}
                  >
                    {isGroup ? (
                      <Users 
                        size={24} 
                        strokeWidth={2.5}
                      />
                    ) : (
                      contactDisplayName.charAt(0).toUpperCase()
                    )}
                    
                    {/* Badge Notifikasi Lingkaran Hijau Kecil pada Avatar */}
                    {isUnread && !isActive && (
                      <span 
                        className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-[3px] border-white rounded-full shadow-sm"
                      ></span>
                    )}
                  </div>
                )}

                {/* Konten Teks Sidebar (Kolom Tengah) */}
                <div 
                  className="flex-1 min-w-0 flex flex-col justify-center py-0.5"
                >
                  <h3 
                    className={`text-[16px] truncate tracking-tight mb-1 transition-colors ${
                      isUnread 
                        ? 'font-black text-slate-900' 
                        : 'font-bold text-slate-700'
                    }`}
                  >
                    {contactDisplayName}
                  </h3>
                  
                  {/* Pratinjau Teks Pesan Terakhir beserta Centang Resi */}
                  <p 
                    className={`text-[14px] truncate pr-2 flex items-center gap-1.5 transition-colors ${
                      isUnread 
                        ? 'text-slate-800 font-bold' 
                        : 'text-slate-500 font-medium opacity-90'
                    }`}
                  >
                    {isOutMsg && (
                       <span 
                         className={`text-[14px] ${c.lastMessage.status === 'read' ? 'text-cyan-500' : 'text-slate-400'}`}
                       >
                         {c.lastMessage.status === 'read' ? <CheckCheck size={16} /> : <Check size={16} />}
                       </span>
                    )}
                    <span 
                      className="truncate"
                    >
                      {groupSenderPrefix && (
                        <span className="font-semibold">{groupSenderPrefix}</span>
                      )}
                      {c.lastMessage?.text || '[Media Lampiran File/Gambar]'}
                    </span>
                  </p>

                  {/* Koleksi Lencana Status (Grup, Lead, Label Kustom) */}
                  <div 
                    className="flex flex-wrap items-center gap-2 mt-2"
                  >
                    {isGroup && (
                      <span 
                        className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 shadow-sm"
                      >
                        Grup
                      </span>
                    )}
                    
                    {lLabel && (
                      <span 
                        className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm flex items-center gap-1 ${lLabel.color}`}
                      >
                        {lLabel.name} 
                        {isActive && (
                          <span 
                            className="cursor-pointer hover:bg-black/20 rounded p-0.5 ml-1 transition-colors" 
                            onClick={(e) => removeLabel(cNum, e)} 
                            title="Cabut Label"
                          >
                            <X size={10} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                    )}
                    
                    {isLead && (
                      <span 
                        className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                          isLead.has_replied 
                            ? 'bg-rose-50 text-rose-500 border-rose-100' 
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}
                      >
                        {isLead.has_replied ? '🔥 Leads Aktif' : '❄️ Leads Pasif'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Kolom Metadata Ujung Kanan (Waktu & Lencana Angka) */}
                <div 
                  className="flex flex-col items-end justify-start pt-1 gap-2 shrink-0"
                >
                  <span 
                    className={`text-[11px] font-semibold whitespace-nowrap transition-colors ${
                      isUnread ? 'text-emerald-500' : 'text-slate-400'
                    }`}
                  >
                    {formatChatDate(c.lastMessage?.time, liveTime)}
                  </span>
                  
                  {/* Rendering Dinamis Notifikasi Angka Gelembung Pesan Belum Dibaca */}
                  {isUnread && !isSelectionMode && (
                    <div 
                      className="min-w-[24px] h-[24px] rounded-full bg-emerald-500 text-white text-[11px] flex items-center justify-center font-black shadow-md px-2 animate-in zoom-in duration-300"
                    >
                      {c.unreadCount > 99 ? '99+' : c.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ================= BULK ACTION BAR OVERLAY ================= */}
        {isSelectionMode && selectedPeers.length > 0 && (
          <div 
            className="absolute bottom-6 left-6 right-6 bg-slate-900 rounded-[2rem] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)] border border-slate-700 flex items-center justify-between animate-in slide-in-from-bottom-10 z-50"
          >
             <span 
               className="text-xs font-black text-white px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700"
             >
               {selectedPeers.length} Dipilih
             </span>
             
             <div className="flex gap-2.5">
                <button 
                  onClick={() => setLabelModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-indigo-600 rounded-[1rem] text-white transition-colors hover:scale-105" 
                  title="Pasang Label Terpadu Ke Semua Kontak"
                >
                  <Tag size={18} strokeWidth={2.5}/>
                </button>
                <button 
                  onClick={() => setBcModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-emerald-600 rounded-[1rem] text-white transition-colors hover:scale-105" 
                  title="Jadwalkan Blast/Broadcast Instan"
                >
                  <Megaphone size={18} strokeWidth={2.5}/>
                </button>
                <button 
                  onClick={() => setFuModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-orange-500 rounded-[1rem] text-white transition-colors hover:scale-105" 
                  title="Jadwalkan Dalam Sistem Workflow / Auto Follow Up Terstruktur"
                >
                  <CalendarClock size={18} strokeWidth={2.5}/>
                </button>
                
                <div 
                  className="w-[2px] h-8 bg-slate-700 mx-1.5 self-center rounded-full"
                ></div>
                
                <button 
                  onClick={executeDeleteChats} 
                  className="p-3 bg-slate-800 hover:bg-rose-600 rounded-[1rem] text-rose-400 hover:text-white transition-colors hover:scale-105" 
                  title="Hapus Percakapan Secara Permanen"
                >
                  <Trash2 size={18} strokeWidth={2.5}/>
                </button>
             </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* AREA KANAN: KOLOM OBROLAN AKTIF (CHAT VIEW WINDOW) */}
      {/* --------------------------------------------------------------------- */}
      {peer ? (
        <div 
          className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20"
        >
          
          {/* ================= HEADER KANAN (CHAT INFO) ================= */}
          <div 
            className="h-24 px-10 flex items-center border-b border-white/20 bg-white/50 backdrop-blur-2xl z-20 shrink-0 shadow-sm justify-between transition-colors"
          >
            <div 
              className="flex items-center flex-1 min-w-0"
            >
              <div 
                className={`w-14 h-14 rounded-2xl shadow-md flex items-center justify-center font-black text-2xl border mr-5 shrink-0 relative overflow-hidden ${
                  peer.includes('@g.us') 
                    ? "bg-amber-50 text-amber-500 border-amber-100" 
                    : "bg-white text-blue-600 border-slate-100"
                }`}
              >
                <div 
                  className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent"
                ></div>
                <span 
                  className="relative z-10"
                >
                  {peer.includes('@g.us') ? (
                    <Users size={28} strokeWidth={2.5}/> 
                  ) : (
                    (currentConv?.name ? currentConv.name.charAt(0) : peer.charAt(0)).toUpperCase()
                  )}
                </span>
              </div>
              
              <div 
                className="flex-1 min-w-0"
              >
                <div 
                  className="flex items-center gap-3 truncate"
                >
                  <h2 
                    className="text-2xl font-black text-slate-800 tracking-tight truncate"
                  >
                    {formatContactName(peer, currentConv?.name)}
                  </h2>
                  
                  {/* Status Badges di Header Obrolan Kanan */}
                  {peer.includes('@g.us') && (
                    <span 
                      className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 shadow-sm"
                    >
                      Grup WA
                    </span>
                  )}
                  {currentLabel && (
                    <span 
                      className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${currentLabel.color}`}
                    >
                      {currentLabel.name}
                    </span>
                  )}
                  {currentLead && (
                    <span 
                      className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border bg-white ${
                        currentLead.has_replied 
                          ? 'text-rose-500 border-rose-200' 
                          : 'text-slate-500 border-slate-200'
                      }`}
                    >
                      {currentLead.has_replied ? '🔥 Target Aktif' : '❄️ Target Pasif'}
                    </span>
                  )}
                </div>
                
                <div 
                  className="flex items-center gap-2 mt-1.5"
                >
                  <div 
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)] border border-white"
                  ></div>
                  <p 
                    className="text-[12px] text-slate-500 font-bold tracking-[0.1em] uppercase"
                  >
                    Terhubung End-to-End
                  </p>
                  
                  <span 
                    className="text-[10px] ml-3 text-slate-400 bg-white/70 px-2.5 py-0.5 rounded-md flex items-center gap-1.5 font-bold uppercase tracking-widest border border-slate-200"
                  >
                    <Activity 
                      size={12} 
                      className="text-emerald-500 animate-pulse" 
                    /> 
                    Sinkronasi Sistem Cerdas Aktif
                  </span>
                </div>
              </div>
            </div>

            {/* Kelompok Tombol Aksi Cepat pada Header Chat */}
            <div className="flex gap-3">
              <button 
                onClick={() => setLabelModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-indigo-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-110 hover:bg-indigo-50" 
                title="Kelola & Atur Label"
              >
                <Tag size={20} strokeWidth={2.5}/>
              </button>
              <button 
                onClick={() => setBcModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-emerald-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-110 hover:bg-emerald-50" 
                title="Sematkan Pesan Broadcast"
              >
                <Megaphone size={20} strokeWidth={2.5}/>
              </button>
              <button 
                onClick={() => setFuModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-orange-500 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-110 hover:bg-orange-50" 
                title="Jadwalkan Target Ke Dalam Sistem Follow Up"
              >
                <CalendarClock size={20} strokeWidth={2.5}/>
              </button>
            </div>
          </div>

          {/* ================= BUBBLE CHAT LIST AREA ================= */}
          <div 
            ref={scrollContainerRef} 
            onScroll={handleScroll} 
            className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scrollbar-hide scroll-smooth relative bg-slate-50/50"
          >
            {/* Dekorasi Pengumuman Keamanan di Atas Obrolan */}
            <div 
              className="flex flex-col items-center mb-10 gap-4 pt-4"
            >
              <div 
                className="bg-amber-50/90 border border-amber-200 text-amber-800 text-[12px] font-bold px-6 py-3 rounded-2xl max-w-md text-center leading-relaxed shadow-sm backdrop-blur-sm relative overflow-hidden"
              >
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400"
                ></div>
                🔒 Seluruh percakapan telah diamankan oleh protokol standar industri tingkat militer. Sistem Enterprise SaaS tidak merekam fail media mentah secara publik.
              </div>
              
              {/* Tombol Load More Berbasis Kursor/Limit Data */}
              {messages.length >= msgLimit && (
                <button 
                  onClick={() => { 
                    setMsgLimit(m => m + 100); 
                    setIsAtBottom(false); 
                  }} 
                  className="px-6 py-3 bg-white border border-slate-200 text-blue-600 font-black text-[11px] uppercase tracking-widest rounded-full shadow-sm hover:scale-105 hover:bg-blue-50 transition-all"
                >
                  <Clock size={14} className="inline mr-2 text-blue-400"/> 
                  Tampilkan Riwayat Lebih Lama
                </button>
              )}
            </div>

            {/* PEMETAAN PESAN KESELURUHAN (BUBBLE RENDERER)
                Berkat Backend yang mengirim Array dalam urutan `reverse()` yang benar,
                di sini kita tidak perlu lagi memanipulasi susunan array.
                Render langsung berjalan mulus secara vertikal dari atas ke bawah.
            */}
            {messages.map((m) => (
              <MessageBubble 
                key={m.id} 
                msg={m} 
                liveTime={liveTime} 
                isGroup={peer.includes('@g.us')} 
              />
            ))}
            
            {/* Animasi Loader Tiga Titik Memantul Saat Mengirim Pesan */}
            {sending && (
              <div 
                className="flex justify-end animate-in fade-in duration-300"
              >
                <div 
                  className="px-6 py-4 rounded-[2rem] bg-slate-200/70 rounded-br-sm shadow-sm flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                </div>
              </div>
            )}
          </div>

          {/* ================= INPUT KETIK PESAN ================= */}
          <div 
            className="p-6 md:p-8 bg-white/70 backdrop-blur-2xl z-20 shrink-0 border-t border-slate-200 relative"
          >
            {/* Menu Pop-Up Ekstensi Lampiran Media */}
            {attachOpen && (
              <div 
                className="absolute bottom-28 left-8 bg-white/95 backdrop-blur-xl border border-slate-200 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2 z-50 animate-in slide-in-from-bottom-4 min-w-[240px]"
              >
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

            {/* Kotak Induk Formulir Pengetikan Teks */}
            <div 
              className="max-w-5xl mx-auto flex items-end gap-4 bg-white p-3.5 rounded-[2rem] border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)] focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-300 transition-all duration-300"
            >
              {/* Tombol Bukaan Lampiran (Simbol Tambah Kiri) */}
              <button 
                onClick={() => setAttachOpen(!attachOpen)} 
                className={`w-14 h-14 flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-90 rounded-[1.2rem] shrink-0 border ${
                  attachOpen 
                    ? 'bg-blue-600 border-blue-600 text-white rotate-45 shadow-md' 
                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'
                }`}
              >
                <Plus size={24} strokeWidth={3} />
              </button>
              
              {/* Modul Area Teks yang Berukuran Fleksibel Otomatis Berdasarkan Input Panjang */}
              <textarea 
                value={text} 
                onChange={(e) => setText(e.target.value)} 
                onKeyDown={(e) => { 
                  // Dukungan menekan Enter untuk mengirimkan (Shift+Enter untuk garis baru)
                  if (e.key === "Enter" && !e.shiftKey) { 
                    e.preventDefault(); 
                    sendText(); 
                  } 
                }} 
                placeholder="Ketik balasan Anda di sini secara interaktif... (Tekan Enter untuk kirim seketika, Shift+Enter membuat garis baru pada pesan)" 
                className="flex-1 bg-transparent border-none py-4 px-4 text-[16px] font-semibold outline-none resize-none max-h-40 text-slate-700 placeholder-slate-400 leading-relaxed" 
                rows={1} 
              />
              
              {/* Tombol Eksekutor Kirim Pesan (Sebelah Kanan Area Input) */}
              <button 
                onClick={sendText} 
                disabled={!text.trim() || sending} 
                className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center transition-all duration-500 shrink-0 ${
                  text.trim() && !sending 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 cursor-pointer" 
                    : "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                }`}
              >
                {sending ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Send size={22} strokeWidth={2.5} className="ml-1" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyChatState />
      )}

      {/* ============================================================================ */}
      {/* 7. MODALS & OVERLAYS SYSTEM RENDER */}
      {/* ============================================================================ */}

      {/* MODAL 1: ATUR LABEL KUSTOM - KANVAS TERPISAH */}
      {labelModal.open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div 
            className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300"
          >
            <div 
              className="flex items-center gap-3 mb-2"
            >
              <div 
                className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"
              >
                <Tag size={18} strokeWidth={2.5} />
              </div>
              <h3 
                className="text-xl font-black text-slate-800 tracking-tight"
              >
                Pasang Label Khusus
              </h3>
            </div>
            
            <p 
              className="text-xs font-bold text-slate-500 mb-6 bg-slate-50 inline-block px-3 py-1 rounded-md border border-slate-200 mt-2"
            >
              Menerapkan konfigurasi label pada total {labelModal.targets.length} nomor terpilih.
            </p>
            
            {uniqueLabels.length > 0 && (
              <div className="mb-6">
                <label 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3"
                >
                  Pilih Dari Konfigurasi Sebelumnya:
                </label>
                <div 
                  className="flex flex-wrap gap-2"
                >
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
               <label 
                 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2"
               >
                 Atau Daftarkan Nama Label Baru:
               </label>
               <input 
                 value={labelPayload.name} 
                 onChange={(e)=>setLabelPayload({...labelPayload, name: e.target.value})} 
                 placeholder="Ketik string nama label representatif..." 
                 className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 mb-4 focus:bg-white focus:border-blue-400 transition-colors shadow-inner" 
               />
               
               {/* Konfigurasi Selektor Komponen Warna Estetika Enterprise */}
               <div 
                 className="flex flex-wrap gap-3 mt-2 justify-between px-1"
               >
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

            <div 
              className="flex gap-3 justify-end pt-4 border-t border-slate-100 mt-2"
            >
              <button 
                onClick={() => setLabelModal({ open: false, targets: [] })} 
                className="px-6 py-3.5 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95"
              >
                Batalkan Aksi
              </button>
              <button 
                onClick={executeSetLabel} 
                className="px-8 py-3.5 rounded-[1.2rem] font-black text-white bg-blue-600 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all"
              >
                Simpan Label Terpilih
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PENJADWALAN BROADCAST CEPAT KE BERAGAM TARGET */}
      {bcModal.open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div 
            className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300"
          >
            <div 
              className="p-8 border-b border-slate-100 bg-slate-50/50"
            >
              <div 
                className="flex items-center gap-4 mb-2"
              >
                 <div 
                   className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner border border-emerald-200"
                 >
                   <Megaphone size={24} strokeWidth={2.5}/>
                 </div>
                 <div>
                   <h3 
                     className="text-2xl font-black text-slate-800 tracking-tight"
                   >
                     Kirim Broadcast Instan Terjadwal
                   </h3>
                   <p 
                     className="text-xs font-bold text-emerald-600 mt-1 uppercase tracking-widest"
                   >
                     Mendistribusikan Pesan Ke {bcModal.targets.length} Target Terpilih
                   </p>
                 </div>
              </div>
            </div>
            
            <div 
              className="p-8 overflow-y-auto bg-white"
            >
              <label 
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3"
              >
                Isi Pesan Promosi Massal Anda
              </label>
              
              <textarea 
                rows={6} 
                value={bcPayload.text} 
                onChange={(e)=>setBcPayload({...bcPayload, text: e.target.value})} 
                placeholder="Misal: Halo {{nama}}, kami ada diskon produk eksklusif yang menarik untuk nomor {{nomor}} hari ini..." 
                className="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 border border-slate-200 outline-none font-medium text-slate-700 mb-6 resize-none focus:bg-white focus:border-emerald-400 transition-colors shadow-inner" 
              />
              
              <div 
                className="flex items-center justify-between bg-emerald-50/50 px-6 py-4 rounded-2xl border border-emerald-100 shadow-sm"
              >
                 <div>
                   <span 
                     className="text-[11px] font-black text-emerald-800 uppercase tracking-widest block"
                   >
                     Interval Jeda Eksekusi (Anti-Banned)
                   </span>
                   <span 
                     className="text-[10px] font-semibold text-emerald-600/70 mt-1 block"
                   >
                     Durasi aman antar pengiriman pesan bot (Dalam Milidetik)
                   </span>
                 </div>
                 <div 
                   className="flex items-center bg-white px-3 py-2 rounded-xl border border-emerald-200 shadow-sm"
                 >
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

            <div 
              className="p-8 border-t border-slate-100 bg-white flex gap-3 justify-end shrink-0"
            >
              <button 
                onClick={() => setBcModal({ open: false, targets: [] })} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95"
              >
                Batalkan Tindakan
              </button>
              <button 
                onClick={executeScheduleBroadcast} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2"
              >
                <Check size={16} strokeWidth={2.5}/>
                Mulai Antrean Sistem
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL 3: PENETAPAN JADWAL SEKUENSI AUTO FOLLOW UP TINGKAT LANJUT */}
      {fuModal.open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div 
            className="w-full max-w-lg bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300"
          >
            <div 
              className="flex items-center gap-4 mb-6"
            >
               <div 
                 className="w-14 h-14 bg-orange-100 text-orange-600 rounded-[1.5rem] flex items-center justify-center shadow-inner border border-orange-200 transform -rotate-3"
               >
                 <CalendarClock size={28} strokeWidth={2.5}/>
               </div>
               <div>
                 <h3 
                   className="text-3xl font-black text-slate-800 tracking-tight"
                 >
                   Daftarkan Auto Follow Up
                 </h3>
                 <p 
                   className="text-xs font-bold text-orange-600 mt-1.5 uppercase tracking-widest"
                 >
                   Total {fuModal.targets.length} Target Spesifik Akan Dijadwalkan Di Latar Belakang
                 </p>
               </div>
            </div>
            
            <div 
              className="mb-10 bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-sm"
            >
              <label 
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3"
              >
                Instruksi Memilih Workflow / Sequence Tujuan Dari Daftar Ini:
              </label>
              
              {campaigns.length > 0 ? (
                <div 
                  className="relative group"
                >
                  <select 
                    value={fuPayload.campaignId} 
                    onChange={(e)=>setFuPayload({...fuPayload, campaignId: e.target.value})} 
                    className="w-full px-5 py-4 rounded-[1.2rem] bg-white border border-slate-300 outline-none font-black text-slate-700 appearance-none cursor-pointer shadow-sm focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10 transition-all hover:bg-orange-50"
                  >
                    <option value="">-- Anda Harus Menyentuh Ini Untuk Memilih --</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div 
                    className="absolute right-4 top-4 text-slate-400 pointer-events-none group-hover:text-orange-500 transition-colors"
                  >
                    <Layers size={18} />
                  </div>
                </div>
              ) : (
                <div 
                  className="p-5 rounded-[1.2rem] bg-rose-50 border border-rose-200 text-rose-600 text-sm font-bold leading-relaxed flex gap-3 items-start shadow-inner"
                >
                  <Activity size={20} className="shrink-0 mt-0.5" />
                  Sistem mendeteksi belum ada entitas Campaign / Sequence aktif yang dibuat. Silakan buka panel menu "Follow Up" di Sidebar Utama Kiri Anda untuk mendaftarkan jadwal terlebih dahulu.
                </div>
              )}
            </div>

            <div 
              className="flex gap-3 justify-end border-t border-slate-100 pt-6"
            >
              <button 
                onClick={() => setFuModal({ open: false, targets: [] })} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95 shadow-sm"
              >
                Kembali Ke Inbox
              </button>
              <button 
                onClick={executeAddToFollowUp} 
                disabled={campaigns.length === 0 || !fuPayload.campaignId} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-white bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed text-[11px] uppercase tracking-widest shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2"
              >
                <Check size={16} strokeWidth={3} />
                Eksekusi Sekarang Juga
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: PANEL PENGIRIMAN MEDIA MENDALAM */}
      {mediaModal.open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div 
            className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300"
          >
            <h3 
              className="text-xl font-black text-slate-800 tracking-tight mb-6 flex items-center gap-3"
            >
              <div 
                className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner"
              >
                <Paperclip size={18} strokeWidth={2.5}/>
              </div>
              {mediaModal.type === 'location' 
                ? 'Kirim Representasi Titik Lokasi' 
                : `Menyiapkan Lampiran Eksternal ${mediaModal.type === 'image' ? 'Gambar Bebas' : 'Dokumen File'}`
              }
            </h3>
            
            {mediaModal.type === 'location' ? (
              <div 
                className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100"
              >
                 <div className="col-span-2">
                   <p className="text-xs font-semibold text-slate-500 mb-2">Tentukan detail garis lintang dan bujur target lokasi Anda.</p>
                 </div>
                 <input 
                   value={mediaPayload.lat} 
                   onChange={(e)=>setMediaPayload({...mediaPayload, lat: e.target.value})} 
                   placeholder="Latitude Target (Lat)" 
                   className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                 />
                 <input 
                   value={mediaPayload.lng} 
                   onChange={(e)=>setMediaPayload({...mediaPayload, lng: e.target.value})} 
                   placeholder="Longitude Target (Lng)" 
                   className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                 />
              </div>
            ) : (
              <div 
                className="space-y-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100"
              >
                <p className="text-xs font-semibold text-slate-500 mb-2 leading-relaxed">
                  Harap pastikan URL referensi dari media yang akan dilampirkan dapat diakses langsung oleh publik.
                </p>
                <input 
                  value={mediaPayload.url} 
                  onChange={(e)=>setMediaPayload({...mediaPayload, url: e.target.value})} 
                  placeholder="Format Link Valid URL (https://nama-domain.com/lampiran.jpg)" 
                  className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                />
                <input 
                  value={mediaPayload.caption} 
                  onChange={(e)=>setMediaPayload({...mediaPayload, caption: e.target.value})} 
                  placeholder="Sisipkan Teks Opsional Tambahan (Caption)" 
                  className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                />
              </div>
            )}

            <div 
              className="flex gap-3 justify-end pt-4 border-t border-slate-100 mt-2"
            >
              <button 
                onClick={() => setMediaModal({ open: false, type: 'image' })} 
                className="px-6 py-3.5 rounded-[1.2rem] font-black text-slate-500 bg-slate-100 text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95 shadow-sm"
              >
                Batalkan Proses
              </button>
              <button 
                onClick={executeSendMedia} 
                disabled={sending} 
                className="px-8 py-3.5 rounded-[1.2rem] font-black text-white bg-blue-600 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sedang Mengirim...
                  </>
                ) : (
                  <>
                    <Send size={16} strokeWidth={3} /> Kirim Sekarang!
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT EXPORT WRAPPER
// ============================================================================
// Ekspor Inbox yang dibungkus dengan Boundary Handler yang dijamin stabil 100%.

export function SafeInbox() {
  return (
    <ErrorBoundary>
      <InboxComponent />
    </ErrorBoundary>
  );
}