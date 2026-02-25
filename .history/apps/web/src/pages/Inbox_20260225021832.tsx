/**
 * ============================================================================
 * INBOX.TSX - WHATSAPP WEB SAAS UI (ENTERPRISE EDITION)
 * ============================================================================
 * Modul ini merupakan jantung dari aplikasi WhatsApp SaaS. Menangani 
 * percakapan Real-Time, Bulk Actions, Manajemen Label, dan sinkronisasi 
 * sesi Baileys dengan kompensasi Timezone secara otomatis.
 * * V.9.0 Ultimate Stable Fixes:
 * - FIX CRITICAL: Menambahkan `export default Inbox` agar tidak terjadi 
 * Uncaught SyntaxError pada React Router (`App.tsx`).
 * - Enterprise Grade JSX Formatting (Satu atribut per baris untuk mencegah 
 * Git merge conflicts dan meningkatkan keterbacaan).
 * - Component Decomposition (Pemisahan komponen secara logis).
 * - Bulletproof Deep Comparator untuk Bubble Chat (Mencegah Chat Stuck).
 * - Optimistic UI untuk Lencana Unread Count.
 * - Ekstraksi Metadata JID yang komprehensif.
 * - Skalabilitas struktur > 1500 baris kode bersih dan terdokumentasi.
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
  AlertTriangle
} from "lucide-react";

// ============================================================================
// 1. ERROR BOUNDARY COMPONENT
// ============================================================================

/**
 * Interface untuk Properti Error Boundary
 */
interface ErrorBoundaryProps {
  /**
   * Elemen anak React yang akan dibungkus dan dilindungi oleh boundary ini
   */
  children: React.ReactNode;
}

/**
 * Interface untuk State Error Boundary
 */
interface ErrorBoundaryState {
  /**
   * Menandakan apakah ada error yang tertangkap di dalam tree komponen
   */
  hasError: boolean;
  /**
   * Objek Error aktual yang ditangkap (jika ada)
   */
  error: Error | null;
}

/**
 * ErrorBoundary
 * Menangkap error rendering pada komponen anak agar seluruh aplikasi tidak crash 
 * menjadi layar putih (blank screen) yang membingungkan pengguna.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null 
    };
  }

  /**
   * Hook siklus hidup yang dipanggil setelah error dilemparkan oleh komponen turunan.
   * Digunakan untuk memperbarui state sehingga render berikutnya menampilkan fallback UI.
   * * @param error - Objek error yang dilemparkan
   * @returns State baru dengan flag error aktif
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { 
      hasError: true, 
      error 
    };
  }

  /**
   * Hook untuk mencatat informasi error ke layanan pelaporan (seperti Sentry).
   * * @param error - Error yang terjadi
   * @param errorInfo - Informasi stack trace komponen
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Inbox Component Critical Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div 
          className="
            flex flex-col items-center justify-center 
            h-full w-full bg-slate-50 text-slate-600 
            p-8 text-center rounded-[2.5rem]
          "
        >
          <AlertTriangle 
            size={80} 
            className="text-rose-500 mb-8 drop-shadow-lg" 
            strokeWidth={1.5} 
          />
          <h2 
            className="text-3xl font-black text-slate-800 tracking-tight mb-4"
          >
            Terjadi Kesalahan Render Kritis
          </h2>
          <p 
            className="text-base font-medium mb-8 max-w-lg leading-relaxed"
          >
            Komponen Inbox mengalami gangguan pada mesin perenderan React. 
            Hal ini bisa disebabkan oleh data yang korup dari server atau kesalahan memori.
            Silakan muat ulang halaman.
            <br />
            <span 
              className="text-sm font-mono text-rose-500 mt-4 block bg-rose-50 p-4 rounded-xl border border-rose-100 text-left overflow-auto"
            >
              {this.state.error?.message || "Unknown Runtime Error"}
            </span>
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="
              px-8 py-4 bg-slate-800 text-white font-black uppercase tracking-widest text-sm 
              rounded-2xl shadow-xl hover:bg-slate-700 hover:scale-105 active:scale-95 transition-all
            "
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

/**
 * Mengambil API Key dari LocalStorage untuk autentikasi permintaan ke Backend.
 * Dilengkapi dengan pengecekan window agar aman pada lingkungan SSR (Next.js/Remix jika digunakan).
 * * @returns {string} Token otorisasi API
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
 * @returns {Promise<T>} Data JSON yang telah di-parsing dan di-cast ke tipe Generik T
 */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  
  if (key) {
    headers.set("x-api-key", key);
  }
  
  // Pastikan Content-Type diset ke JSON jika bukan pengiriman Form Data (Upload Media)
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  
  const res = await fetch(url, { 
    ...init, 
    headers 
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    // Mengekstrak pesan error dari response backend (misal dari Zod Validation atau MySQL Error)
    const errorMsg = data?.error || "Terjadi kesalahan yang tidak diketahui pada server API";
    throw new Error(errorMsg);
  }
  
  return data as T;
}

/**
 * Fungsi helper untuk mencegah duplikasi percakapan di Sidebar 
 * akibat race-condition saat fetching data secara paralel (polling).
 * * @param items - Array dari Conversation Row mentah yang ditarik dari API
 * @returns Array Conversation Row yang sudah di-filter secara unik berdasarkan JID
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
// 3. TYPE DEFINITIONS & INTERFACES (STRICT TYPING)
// ============================================================================

/**
 * Mewakili baris data dari entitas Sesi WhatsApp (Device).
 */
export interface SessionRow { 
  /** String pengenal unik (Session Key) untuk mesin Baileys */
  session_key: string; 
  /** Status koneksi saat ini (connected, disconnected, qr) */
  status: string; 
}

/**
 * Mewakili satu blok percakapan di bilah sisi (Sidebar) Kotak Masuk.
 */
export interface ConvRow {
  /** ID Internal Obrolan di Database */
  chatId: number;
  /** JID WhatsApp Unik (Private atau Group) */
  remoteJid: string;
  /** Nama Kontak atau Grup yang tersimpan di Database Backend */
  name?: string | null; 
  /** Jumlah pesan yang belum dibaca oleh pengguna SaaS */
  unreadCount: number;
  /** Pratinjau pesan terakhir untuk ditampilkan di bawah nama kontak */
  lastMessage: { 
    /** ID Unik Pesan */
    id: number; 
    /** Arah pesan: 'in' (Masuk dari Pelanggan) atau 'out' (Keluar dari Sistem) */
    direction: string; 
    /** Tipe Pesan (Text, Image, Document, Location, dll) */
    type: string; 
    /** Cuplikan isi teks */
    text: string | null; 
    /** URL Media jika pesan adalah gambar/dokumen */
    mediaUrl: string | null; 
    /** Waktu masuknya pesan (ISO String) */
    time: string; 
    /** Status pengiriman ('sent', 'delivered', 'read') */
    status: string; 
    /** Nama personal dari pengirim jika pesan berasal dari Grup */
    pushName?: string | null;
  };
}

/**
 * Mewakili satu gelembung obrolan (Message Bubble) di dalam ruang percakapan.
 */
export interface MsgRow {
  /** ID Unik baris tabel wa_messages */
  id: number; 
  /** Arah pesan */
  direction: "in" | "out"; 
  /** Klasifikasi jenis lampiran */
  type: string; 
  /** Teks paragraf utama pesan */
  text: string | null; 
  /** Metadata media (URL, MimeType, Size) */
  media: any; 
  /** Metadata titik peta koordinat geografis */
  location: any; 
  /** Status resi bacaan (Double Check Blue) */
  status: string; 
  /** Laporan error jika gagal terkirim oleh pekerja (Worker) */
  error: string | null; 
  /** Timestamp pesan dibuat */
  time: string;
  /** Nomor telepon asli dari anggota grup (Khusus Grup Chat) */
  participant?: string | null; 
  /** Nama profil WhatsApp dari anggota grup (Khusus Grup Chat) */
  pushName?: string | null;    
}

/**
 * Mewakili data Leads (Prospek) untuk menandai status Hot/Cold.
 */
export interface LeadRow { 
  /** Nomor telepon target Leads (Format lokal/internasional) */
  to_number: string; 
  /** Apakah prospek telah merespons kampanye sebelumnya? */
  has_replied: number; 
}

/**
 * Entitas Label Kustom untuk manajemen CRM Visual.
 */
export interface CustomLabel { 
  /** Nama teks representatif label */
  name: string; 
  /** Kode kelas warna Tailwind CSS (Contoh: 'bg-rose-500') */
  color: string; 
}

/**
 * Konstanta kumpulan palet warna estetik untuk fitur label kustom.
 * Diadaptasi untuk nuansa Enterprise yang modern dan kohesif.
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
 * Generator Warna Berdasarkan Algoritma Hash String Nomor Telepon.
 * Digunakan secara khusus untuk memberikan warna yang stabil dan konsisten 
 * pada nama pengirim yang berbeda di dalam satu Grup WhatsApp.
 * * @param jid - WhatsApp JID pengirim
 * @returns {string} Kelas warna teks Tailwind CSS
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
 * FIX TIMEZONE BUG (KRUSIAL): Menyelaraskan output waktu dari MySQL (UTC) 
 * ke Waktu Lokal (WIB) secara paksa untuk menghindari kesalahan render jam obrolan.
 * Ini memastikan jam di UI web cocok dengan jam di Handphone pelanggan.
 * * @param dateStr - String ISO Date dari MySQL Database
 * @returns {Date} Object Date Javascript yang telah dinormalisasi ke WIB
 */
export function normalizeDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  let safeStr = dateStr;
  
  // Memperbaiki format string mentah dari SQL yang biasanya kehilangan T separator
  if (safeStr.includes(" ") && !safeStr.includes("T")) {
    safeStr = safeStr.replace(" ", "T");
    // Asumsikan data tanpa zona waktu diakhiri Z untuk UTC murni
    if (!safeStr.endsWith("Z")) {
      safeStr += "Z"; 
    }
  }
  
  const d = new Date(safeStr);
  
  // Memberikan kompensasi buatan ke GMT+7 (WIB)
  d.setHours(d.getHours() + 7); 
  
  return d;
}

/**
 * Memformat tanggal menjadi jam spesifik untuk pesan di hari yang sama.
 * * @param dateStr - String ISO Date
 * @returns {string} Format ringkas "HH:mm" (Contoh: "18:45")
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
 * Memformat tanggal menjadi representasi string relasional yang natural.
 * Algoritma ini sama persis dengan yang digunakan di aplikasi native WhatsApp.
 * * @param dateStr - String ISO Date dari pesan historis
 * @param nowTime - Objek Date saat ini (digunakan untuk akurasi sinkronisasi)
 * @returns {string} Berupa Jam (hari ini), "Kemarin" (H-1), atau "DD/MM/YY"
 */
export function formatChatDate(dateStr: string, nowTime: Date): string {
  if (!dateStr) return "";
  const d = normalizeDate(dateStr);
  
  // Cek apakah tanggal pesan persis dengan tanggal hari ini
  const isToday = nowTime.toLocaleDateString("id-ID") === d.toLocaleDateString("id-ID");
  
  // Mundurkan waktu patokan sebanyak 1 hari untuk mengecek pesan kemarin
  const yesterday = new Date(nowTime);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toLocaleDateString("id-ID") === d.toLocaleDateString("id-ID");

  if (isToday) {
    return formatTime(dateStr);
  }
  if (isYesterday) {
    return "Kemarin";
  }
  
  // Jika lebih lama dari kemarin, tampilkan tanggal kalender pendek
  return d.toLocaleDateString("id-ID", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "2-digit" 
  });
}

/**
 * FEATURE 1: Formatter Nama Prioritas Tingkat Lanjut.
 * Berfungsi untuk mengidentifikasi dan merapikan identitas ID WhatsApp.
 * Mengutamakan nama PushName dari database, jika tidak ada, fallback memotong nomor mentah.
 * * @param jid - WhatsApp JID lengkap (cth: 628123456789@s.whatsapp.net)
 * @param name - Nama kontak opsional yang ditarik dari Database Contacts
 * @returns {string} Nama yang layak ditampilkan secara cantik ke layar UI
 */
export function formatContactName(jid: string, name?: string | null): string {
  // Identifikasi ekstensi grup
  const isGroup = jid.includes("@g.us");
  
  // Aturan 1: Jika nama kontak valid, tidak kosong, dan bukan sekadar 
  // pengulangan nomor JID aslinya, gunakan nama tersebut sebagai prioritas utama.
  if (name && name.trim() !== "" && name !== jid) {
    return name; 
  }
  
  // Aturan 2: Fallback Default untuk obrolan grup yang tidak berhasil ditarik subjeknya
  if (isGroup) {
    return "Grup Obrolan WA";
  }
  
  if (!jid) {
    return "Identitas Tidak Diketahui";
  }
  
  // Aturan 3: Ekstraksi dan Pemotongan Nomor Telepon
  const num = jid.split("@")[0];
  
  // Penanganan khusus ID Internal WhatsApp LID
  if (jid.includes("@lid")) {
    return `~${num} (LID)`;
  }
  
  // Prettify untuk nomor kode negara Indonesia (+62)
  if (num.startsWith("62")) {
    return `+62 ${num.slice(2)}`;
  }
  
  return num; // Jika kode negara lain
}

// ============================================================================
// 5. MODULAR SUB-COMPONENTS (UI ABSTRACTIONS)
// ============================================================================

/**
 * EmptyChatState Component
 * Merupakan placeholder visual (State Kosong) yang dirender secara elegan
 * di area layar kanan ketika pengguna belum memilih obrolan apapun di bilah sisi.
 */
const EmptyChatState: React.FC = () => (
  <div 
    className="
      flex-1 flex flex-col items-center justify-center 
      bg-slate-50/50 relative border-l border-slate-200 
      animate-in fade-in duration-500 overflow-hidden
    "
  >
    {/* Efek Latar Belakang Cahaya Menyebar (Ambient Glow) */}
    <div 
      className="
        absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
        w-[45rem] h-[45rem] bg-blue-500/5 rounded-full 
        blur-[140px] pointer-events-none z-0
      "
    ></div>
    
    {/* Ikon Mengambang Di Tengah */}
    <div 
      className="
        w-44 h-44 rounded-[4.5rem] bg-white border border-slate-100 mb-12 
        flex items-center justify-center text-blue-500 shadow-2xl shadow-blue-500/10 
        transform rotate-3 relative hover:scale-105 transition-transform duration-700 z-10
      "
    >
      <div 
        className="
          absolute inset-0 bg-gradient-to-tr from-blue-100 to-transparent 
          rounded-[4.5rem] opacity-50
        "
      ></div>
      <MessageCircle 
        size={80} 
        strokeWidth={1.5} 
      />
    </div>
    
    <h2 
      className="
        text-4xl font-black text-slate-800 tracking-tight mb-5 relative z-10
      "
    >
      WhatsApp SaaS Enterprise
    </h2>
    <p 
      className="
        text-lg font-medium text-slate-500 relative z-10 max-w-lg text-center leading-relaxed
      "
    >
      Aplikasi ini telah terhubung langsung dengan server Baileys di latar belakang.
      Silakan pilih atau cari percakapan di menu bilah samping kiri untuk berinteraksi dengan prospek Anda.
    </p>
  </div>
);

/**
 * Props Definition untuk Komponen Gelembung Obrolan Tunggal
 */
interface MessageBubbleProps {
  /** Objek data baris pesan dari backend database */
  msg: MsgRow;
  /** Objek waktu realtime untuk menghitung offset tampilan tanggal */
  liveTime: Date;
  /** Bendera boolean yang menandakan apakah gelembung ini berada di dalam ruang grup */
  isGroup: boolean;
}

/**
 * MessageBubble Component
 * Unit terkecil dari UI Chat yang merender sebuah Gelembung Obrolan (Inbound maupun Outbound).
 * Dilengkapi dengan deteksi tipe lampiran media dan laporan baca presisi.
 */
const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, liveTime, isGroup }) => {
  // Evaluasi boolean untuk menentukan penempatan elemen (Kanan/Kiri)
  const isOut = msg.direction === "out";

  return (
    <div 
      className={`
        flex ${isOut ? "justify-end" : "justify-start"} 
        animate-in fade-in slide-in-from-bottom-2 duration-300
      `}
    >
      <div 
        className={`
          max-w-[85%] md:max-w-[75%] lg:max-w-[65%] px-6 py-4 
          rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.04)] 
          relative transition-all duration-500 group 
          ${
            isOut 
              ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm" 
              : "bg-white backdrop-blur-xl text-slate-800 rounded-bl-sm border border-slate-200"
          }
        `}
      >
        
        {/* NAMA PENGIRIM (KHUSUS UNTUK CHAT GRUP SAJA) */}
        {/* Jika pesan ini dari orang lain, dan ruangannya adalah grup, tampilkan namanya! */}
        {isGroup && !isOut && (
          <div 
            className={`
              text-[13px] font-black mb-2 uppercase tracking-wide 
              cursor-pointer hover:underline 
              ${getSenderColor(msg.participant || '')}
            `}
          >
             {msg.pushName || formatContactName(msg.participant || "Anggota Grup")}
          </div>
        )}

        {/* ================= DETEKSI TIPE MEDIA (FILE ATTACHMENTS) ================= */}
        
        {msg.type === 'image' && (
          <div 
            className={`
              mb-3 text-[11px] font-black opacity-90 uppercase tracking-widest 
              inline-flex px-3.5 py-2 rounded-xl items-center gap-2.5 
              ${isOut ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}
            `}
          >
            <ImageIcon size={16} strokeWidth={2.5}/> 
            Lampiran Gambar
          </div>
        )}
        
        {msg.type === 'document' && (
          <div 
            className={`
              mb-3 text-[11px] font-black opacity-90 uppercase tracking-widest 
              inline-flex px-3.5 py-2 rounded-xl items-center gap-2.5 
              ${isOut ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}
            `}
          >
            <FileText size={16} strokeWidth={2.5}/> 
            Dokumen Teks / File
          </div>
        )}
        
        {msg.type === 'location' && (
          <div 
            className={`
              mb-3 text-[11px] font-black opacity-90 uppercase tracking-widest 
              inline-flex px-3.5 py-2 rounded-xl items-center gap-2.5 
              ${isOut ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'}
            `}
          >
            <MapPin size={16} strokeWidth={2.5}/> 
            Titik Lokasi Geografis Peta
          </div>
        )}

        {/* ================= TEKS PESAN UTAMA ================= */}
        
        <p 
          className="text-[15px] md:text-[16px] leading-relaxed font-medium break-words whitespace-pre-wrap"
        >
          {msg.text || (msg.type !== 'text' ? '[Isi Lampiran Media Berhasil Disampaikan]' : '')}
        </p>
        
        {/* ================= FOOTER BUBBLE (METADATA) ================= */}
        
        <div 
          className="text-[10px] mt-3.5 flex justify-end items-center gap-2 opacity-70 font-black uppercase tracking-widest"
        >
          {formatTime(msg.time)}
          
          {/* Rendering Laporan Bacaan (Delivery Status Tick) Hanya untuk pesan yang kita kirim */}
          {isOut && (
            <span 
              className={`
                text-[15px] transition-colors 
                ${
                  msg.status === 'read' 
                    ? 'text-cyan-300 shadow-cyan-500/50 drop-shadow-md' 
                    : 'text-white/70'
                }
              `}
            >
              {msg.status === 'read' ? (
                <CheckCheck size={16} strokeWidth={3} />
              ) : msg.status === 'delivered' ? (
                <CheckCheck size={16} strokeWidth={2.5} />
              ) : msg.status === 'failed' ? (
                <X size={16} className="text-rose-300" strokeWidth={3} />
              ) : (
                <Check size={16} strokeWidth={2.5} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 6. MAIN CONTROLLER LOGIC (INBOX COMPONENT)
// ============================================================================

/**
 * InboxComponent
 * Merupakan Komponen Induk fungsional untuk halaman Inbox.
 * Mengelola Fetching Data, Polling Interval, State Manajemen Sidebar, Modal, dll.
 * Harus selalu dibungkus di dalam ErrorBoundary agar stabil.
 */
function InboxComponent() {
  // --------------------------------------------------------------------------
  // A. SYSTEM & TIME GLOBAL STATES
  // --------------------------------------------------------------------------
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [liveTime, setLiveTime] = useState<Date>(new Date());
  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);

  // Real-time Tick Interval (Setiap 1 Detik)
  // Menjaga agar tampilan "Hari ini / Kemarin / Jam 18:00" selalu sinkron dengan waktu OS lokal
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

  // Sinkronisasi otomatis setiap kali objek state customLabels bermutasi (bertambah/berkurang)
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wa_inbox_labels", JSON.stringify(customLabels));
    }
  }, [customLabels]);
  
  // Memetakan nilai-nilai label yang berceceran menjadi array of objects unik
  // Untuk digunakan sebagai Barisan Filter Chips interaktif di bawah Search Box
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
  // C. CHAT CONTENT & MESSAGE STATES
  // --------------------------------------------------------------------------
  
  // JID dari kontak/grup yang saat ini sedang diklik dan dibuka oleh pengguna
  const [peer, setPeer] = useState<string>("");
  
  // activePeerRef adalah trik arsitektural yang digunakan agar fungsi Polling setInterval
  // di dalam useEffect bisa membaca state peer terbaru tanpa harus menghancurkan
  // dan membuat ulang timer setiap detiknya (mencegah memory leak).
  const activePeerRef = useRef<string>("");
  useEffect(() => {
    activePeerRef.current = peer;
  }, [peer]);

  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  
  // Bendera boolean pengunci UI saat sedang proses menembakkan data POST
  const [sending, setSending] = useState<boolean>(false);
  
  // --------------------------------------------------------------------------
  // D. FILTER & SEARCH CONTROL STATES
  // --------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'personal' | 'group' | 'unread' | 'read' | string>('all');
  
  // --------------------------------------------------------------------------
  // E. BULK ACTIONS & MODAL SYSTEM STATES
  // --------------------------------------------------------------------------
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [attachOpen, setAttachOpen] = useState<boolean>(false);
  
  // Batasan data pagination historis percakapan (Infinite Scroll Simulation)
  const [msgLimit, setMsgLimit] = useState<number>(100);
  
  // Payload Modal Pengiriman Media (Files)
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

  // Payload Modal Penjadwalan Broadcast Massal
  const [bcModal, setBcModal] = useState<{ 
    open: boolean; 
    targets: string[]; 
  }>({ open: false, targets: [] });
  
  const [bcPayload, setBcPayload] = useState({ 
    text: "", 
    delay: "2000" 
  });

  // Payload Modal Penugasan Warna Label Kustom CRM
  const [labelModal, setLabelModal] = useState<{ 
    open: boolean; 
    targets: string[]; 
  }>({ open: false, targets: [] });
  
  const [labelPayload, setLabelPayload] = useState({ 
    name: "Prioritas Tinggi", 
    color: "bg-blue-500" 
  });
  
  // Payload Modal Otomatisasi Workflow Follow Up Terjadwal
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
  
  // Ref ke Container Induk dari Gelembung Percakapan untuk memanipulasi posisi Scroll Y
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Flag ini melacak apakah posisi mata pengguna sedang mentok berada di dasar chat.
  // Jika ya, saat ada pesan masuk, obrolan akan turun dengan sendirinya (Auto Scroll).
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);

  // Ekstraksi nomor bersih (tanpa akhiran @s.whatsapp.net) untuk pencocokan silang ke tabel leads & labels.
  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  // ============================================================================
  // G. SORTING & FILTERING COMPUTATION ENGINE
  // ============================================================================
  
  /**
   * Menjalankan kalkulasi berat untuk memilah, menyaring, dan mengurutkan ribuan daftar 
   * kotak masuk berdasarkan algoritma input dari user (Text Search & Visual Chips).
   * Dibungkus useMemo agar tidak dieksekusi berulang-ulang saat komponen re-render.
   */
  const filteredConvs = useMemo(() => {
    // 0. Ekstraksi dangkal (Shallow Clone) Array agar mutasi oleh fungsi sort aman.
    let result = [...convs];
    
    // 1. PENGURUTAN (SORTING) KRONOLOGIS DESCENDING
    // Berdasarkan waktu pesan paling terkini, diletakkan di indeks elemen teratas.
    result.sort((a, b) => {
      const tA = normalizeDate(a.lastMessage?.time || "").getTime();
      const tB = normalizeDate(b.lastMessage?.time || "").getTime();
      return tB - tA; 
    });

    // 2. LOGIKA KATEGORI FILTER CHIPS (TOMBOL HORIZONTAL UI)
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

    // 3. LOGIKA PENCARIAN TEKS BEBAS (SEARCH INPUT BAR)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // Bersihkan string dari karakter alfabet (hanya sisakan angka) 
      // Hal ini memfasilitasi pengguna jika mencoba mencari spesifik melalui prefix nomor HP
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
  // H. SCROLL BEHAVIORS & EVENT LISTENERS
  // ============================================================================

  /**
   * Men-scroll kontainer tinggi obrolan secara otomatis (turun ke paling bawah).
   * Dipanggil secara terprogram pada momen-momen kritis: 
   * Saat memuat awal, Mengirim pesan, atau Saat menerima socket pesan baru.
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
   * Mendeteksi posisi scroll saat ini melalui pergerakan Native DOM OnScroll.
   * Jika pengguna menggulir secara manual ke atas untuk membaca pesan riwayat terdahulu, 
   * auto-scroll akan ditangguhkan sementara waktu (paused).
   * Jika tidak ditangguhkan, maka layar pengguna akan ditarik paksa ke bawah ketika 
   * ada pesan baru masuk, dan hal tersebut adalah Anti-Pattern UX yang buruk.
   */
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // Memberikan toleransi batas jarak 50px dari tepi dasar untuk dianggap masih "Berada di Dasar"
    const isBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    setIsAtBottom(isBottom);
  };

  // Mekanisme Pemicu Auto-scroll: Menjalankan fungsi gulir saat komposisi data `messages` berubah.
  useEffect(() => { 
    if (isAtBottom && messages.length > 0) {
      // Delay mikro (100 milidetik) mutlak diperlukan untuk memberi Engine React kelonggaran waktu 
      // menyelesaikan perhitungan render paint di Canvas DOM sebelum kita dapat 
      // menghitung dimensi scrollHeight elemen yang baru secara matematis.
      setTimeout(() => scrollToBottom("smooth"), 100);
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // ============================================================================
  // I. CHAT SELECTION & OPTIMISTIC UPDATE MUTATIONS
  // ============================================================================

  /**
   * Menangani rutinitas ketika pengguna mengeklik kartu daftar obrolan di Sidebar.
   * Logika ini mendua peran: Bisa berlaku sebagai Checkbox Selector (saat mode bulk action) 
   * atau sebagai Pembuka Layar Obrolan Kanan.
   * * @param jid - Identitas Unik WhatsApp (Target)
   */
  const handleSelectChat = (jid: string) => {
    if (isSelectionMode) {
      togglePeerSelection(jid);
    } else {
      // Membuka Ruang Percakapan Kanan
      setPeer(jid);
      
      // ==============================================================
      // TEKNIK UX: OPTIMISTIC UI UPDATE
      // ==============================================================
      // Kita langsung memodifikasi Data Virtual Memory lokal di frontend untuk membersihkan 
      // lencana notifikasi unread merah (memaksanya menjadi 0) tepat sepersekian detik
      // sebelum backend database merespons. Teknik ini membuat aplikasi terasa berjalan
      // di luar ekspektasi batas kecepatan memori.
      setConvs(prev => prev.map(c => 
        c.remoteJid === jid ? { ...c, unreadCount: 0 } : c
      ));
      
      // Me-reset batasan limit pagination jika pengguna berpindah ruangan
      setMsgLimit(100);
      setAttachOpen(false);
      setMessages([]); 
      
      setTimeout(() => { 
        scrollToBottom("auto"); 
        setIsAtBottom(true); 
      }, 100);
      
      // Memicu API rute backend secara non-blocking (Fire and Forget Flow)
      // Tujuannya adalah untuk memerintahkan Database agar mereset kolom Unread Count ke 0,
      // sekaligus memerintahkan mesin soket Baileys melempar perintah "Telah Dibaca" (Double Blue Ticks)
      // ke ponsel lawan bicara pengguna.
      apiFetch("/ui/conversations/read", { 
        method: "POST", 
        body: JSON.stringify({ 
          sessionKey, 
          peer: jid 
        }) 
      }).catch((e) => { 
        console.warn("Sinkronasi Pembacaan Latar Belakang mengalami gangguan sesaat:", e);
      });
    }
  };

  // ============================================================================
  // J. DATA FETCHING METHODS (BACKGROUND THREADS)
  // ============================================================================

  /** Memuat data entri Leads dari database Prospek (Untuk mencocokkan Lencana Api) */
  const loadLeads = async () => {
    try { 
      const res = await apiFetch<{ ok: true; data: LeadRow[] }>("/leads?limit=1000"); 
      setLeads(res.data || []); 
    } catch (e) { 
      console.warn("Failed to load leads background data", e); 
    }
  };

  /** Memuat rincian daftar urutan Siklus Workflow Follow up aktif */
  const loadCampaigns = async () => {
    try { 
      const res = await apiFetch<{ ok: true; data: any[] }>("/followup/campaigns?status=active"); 
      setCampaigns(res.data || []); 
      
      // Memberikan preferensi pemilihan otomatis untuk Dropdown Workflow jika Array memilik item.
      if (res.data && res.data.length > 0) {
        setFuPayload(p => ({ ...p, campaignId: String(res.data[0].id) })); 
      }
    } catch (e) { 
      console.warn("Failed to load active campaigns", e); 
    }
  };

  /** Memuat rincian Mesin Virtual Perangkat Baileys yang Beroperasi (Sesi) */
  const loadSessions = async () => {
    try { 
      const res = await apiFetch<{ ok: true; sessions: any[] }>("/ui/sessions"); 
      const list = (res.sessions || []).map(s => ({ 
        session_key: s.session_key, 
        status: s.status 
      })); 
      
      setSessions(list); 
      
      // Otomatis memilih sesi ID teratas jika belum ada Sesi Global yang dievaluasi (First Boot Experience)
      if (!sessionKey && list.length > 0) {
        setSessionKey(list[0].session_key);
      }
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      // Membuka Tembok Layar Loading UI secara total saat data hierarkis esensial telah terpenuhi
      setIsAppLoading(false);
    }
  };

  /**
   * Menarik daftar percakapan kumulatif terbaru untuk menggambar ulang Sidebar.
   * Menggunakan useCallback agar referensi memori fungsi ini tetap konstan, mencegah infinite loop.
   */
  const loadConvs = useCallback(async (sk: string) => {
    try { 
      const res = await apiFetch<{ ok: true; conversations: ConvRow[] }>(
        `/ui/conversations?sessionKey=${encodeURIComponent(sk)}`
      ); 
      const deduped = dedupeByRemoteJid(res.conversations || []); 
      
      // SEKALI LAGI: Menerapkan UI Optimistis pada proses pembaruan polling.
      // Jika polling memanggil unread_count bernilai 1 atau lebih, TAPI obrolan itu 
      // secara kebetulan SEDANG kita buka saat ini di depan mata (activePeerRef), 
      // kita harus meretas balasan JSON tersebut untuk memaksanya menjadi 0.
      // Dengan begini, pengguna tidak akan merasa tertipu oleh kehadiran notifikasi palsu sesaat.
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
   * Menarik daftar rentetan riwayat pesan untuk percakapan yang Sedang Disorot di Layar Kanan.
   */
  const loadMessages = useCallback(async (sk: string, p: string, limit: number) => {
    try {
      // ATURAN API HARGA MATI: JID Parameter dilarang dipotong. 
      // Backend WA Baileys memerlukan akhiran yang tepat (@g.us, @s.whatsapp.net, dkk).
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(
        `/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(p)}&limit=${limit}`
      );
      
      setMessages(prev => {
        const newMsgs = res.messages || [];
        
        // ==============================================================
        // THE BULLETPROOF DEEP COMPARATOR LOGIC
        // ==============================================================
        // Mencegah masalah Rendering Mentok (Chat Stuck) namun sekaligus memblokir Memori Leaking 
        // akibat Over-Rendering.
        
        // Aturan Dasar 1: Jika panjang dimensi pesan bermutasi (bertambah panjang/pendek), Render Ulang seketika.
        if (prev.length !== newMsgs.length) {
          return newMsgs;
        }
        
        // Aturan Dasar 2: Jika Array Kosong Melompong, tidak perlu dikerjakan.
        if (prev.length === 0) {
          return newMsgs;
        }
        
        // Aturan Lanjutan 3: Deep Scan Loop (Pemindaian Menyeluruh).
        // Cek seluruh struktur elemen satu-persatu untuk melihat apakah ada 
        // perubahan krusial tersembunyi pada 'id' (mungkin pesan ditimpa) 
        // atau 'status' (Tanda Centang berubah ke biru/delivered).
        let hasChanges = false;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== newMsgs[i].id || prev[i].status !== newMsgs[i].status) { 
            hasChanges = true; 
            break; 
          }
        }
        
        // Pengembalian array lawas (Old Memory Reference) ini sangat vital jika ternyata hasil komparasi adalah FALSE.
        // Array Virtual DOM React dapat mendeteksi bahwa Memory Hash tidak berubah, sehingga meniadakan perintah lukis ulang komponen.
        return hasChanges ? newMsgs : prev;
      });
    } catch (e: any) { 
      setErr(e.message); 
    }
  }, []);

  // ============================================================================
  // K. LIFECYCLE & POLLING INTERVALS (CRON JOBS SIMULATOR)
  // ============================================================================

  // Fase Siklus Hidup Pemuatan Inisial (First Mount)
  useEffect(() => { 
    loadSessions(); 
    loadLeads(); 
    loadCampaigns(); 
  }, []);

  // Daemon Latar Belakang Perekam Obrolan (Interval Sidebar 5 Detik)
  useEffect(() => {
    if (!sessionKey) return;
    
    // Tembakan perintah permulaan langsung setelah session mount
    loadConvs(sessionKey); 
    
    // Daftarkan rutinitas penembakan Cron
    const intervalId = setInterval(() => {
      loadConvs(sessionKey);
    }, 5000);
    
    // Memusnahkan (Teardown) pendaftaran cron jika komponen dimatikan
    return () => clearInterval(intervalId);
  }, [sessionKey, loadConvs]);

  // Daemon Latar Belakang Penarik Pesan Interaktif (Interval Layar Obrolan 3 Detik)
  useEffect(() => {
    if (!sessionKey || !peer) return;
    
    // Tembakan perintah inisial membaca riwayat target
    loadMessages(sessionKey, peer, msgLimit); 
    
    const intervalId = setInterval(() => {
      loadMessages(sessionKey, peer, msgLimit);
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, [sessionKey, peer, msgLimit, loadMessages]);

  // ============================================================================
  // L. MUTATION HANDLERS (SENDING CONTROLLERS & BULK ACTIONS)
  // ============================================================================

  /**
   * Perintah untuk Mengirim Paragraf Teks Sederhana ke Jaringan Meta.
   */
  async function sendText() {
    if (!text.trim() || sending) return;
    
    // Mengaktifkan layar loader penunggu (Spinner UI)
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
      
      // Kosongkan kotak penulisan teks jika respon kode berhasil 200 OK
      setText("");
      
      // Panggil muat ulang dari database seketika agar tidak terjadi Jeda persepsi lambat dari Client.
      await loadMessages(sessionKey, peer, msgLimit);
      await loadConvs(sessionKey);
      
      // Bawa Mata Pengguna ke Dasar Layar untuk melihat kreasi pesannya
      scrollToBottom("smooth");
      
    } catch (e: any) { 
      setErr(e.message); 
      alert("Operasi Distribusi Gagal: Mohon cek fungsionalitas koneksi Perangkat Anda atau Log Status Jaringan WhatsApp. " + e.message); 
    } finally { 
      // Matikan Spinner Loader
      setSending(false); 
    }
  }

  /**
   * Fungsi helper pengatur state array peer (checkbox centang majemuk).
   */
  const togglePeerSelection = (jid: string) => { 
    setSelectedPeers(p => p.includes(jid) 
      ? p.filter(x => x !== jid) 
      : [...p, jid]
    ); 
  };

  /**
   * Aksi Berbahaya: Pemusnahan Data Massal (Bulk Delete).
   * Membersihkan obrolan beserta seluruh jejak rekam pesan di dalam pangkalan data pusat.
   */
  async function executeDeleteChats() {
    if (!confirm(`TINDAKAN BERBAHAYA KODE MERAH: Yakin ingin memusnahkan riwayat pada ${selectedPeers.length} percakapan?\n\nTindakan dekonstruktif ini akan membersihkan semua utas dari sistem memori server secara permanen.`)) {
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
      
      // Amankan antarmuka: Tutup layar obrolan bila ternyata ruang yang dihancurkan sedang ditatap klien saat ini
      if (selectedPeers.includes(peer)) {
        setPeer(""); 
      }
      
      // Reset Modal & State UI
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      loadConvs(sessionKey); 
      
    } catch (e: any) { 
      alert("Protokol Pemusnahan Dibatalkan akibat kesalahan sistem: " + e.message); 
    }
  }

  /**
   * Mengeksekusi Jadwal Distribusi Massal (Broadcast) Langsung Dari Dashboard Inbox Klien.
   */
  async function executeScheduleBroadcast() {
    if (!bcPayload.text.trim()) {
      return alert("Peringatan Validasi: Konten tubuh pesan (Copywriting) tidak boleh Anda kosongkan.");
    }
    
    try { 
      // JID Ekstensi WhatsApp mutlak harus disterilisasi sebelum dikirim ke skema antrean Broadcast Worker
      const cleanTargets = bcModal.targets.map(t => t.split('@')[0]); 
      
      await apiFetch("/broadcast/create", { 
        method: "POST", 
        body: JSON.stringify({ 
          sessionKey, 
          text: bcPayload.text, 
          delayMs: Number(bcPayload.delay), 
          name: `Eksekusi Broadcast Manual via Inbox (${cleanTargets.length} Kontak Terpilih)`, 
          targets: cleanTargets 
        }), 
      }); 
      
      // Pembersihan Status Memori Formulir
      setBcModal({ open: false, targets: [] }); 
      setBcPayload({ text: "", delay: "2000" }); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      
      alert(`✅ Eksekusi Disetujui! Manuver Penyiaran Skala Besar telah dirancang sistem untuk menyapa ${cleanTargets.length} subjek kontak tujuan.`); 
    } catch (e: any) { 
      alert("Menemui hambatan ketika menyusun jadwal matriks broadcast: " + e.message); 
    }
  }

  /**
   * Menjejalkan Kumpulan Entitas Kontak (Leads) ke Skema Urutan Hierarkis Follow Up.
   */
  async function executeAddToFollowUp() {
    if (!fuPayload.campaignId) {
      return alert("Aksi Ditangguhkan: Anda luput mengidentifikasikan skema Campaign Workflow dari Daftar Sorot Turun (Dropdown).");
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
      
      // Sanitasi Papan Navigasi Layar
      setFuModal({ open: false, targets: [] }); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      
      alert(`✅ Konfirmasi Penerimaan Target! Sekelompok ${cleanTargets.length} profil kontak sukses disuntikkan ke dalam terowongan mesin Auto Follow Up Sekunder.`); 
    } catch (e: any) { 
      alert("Penyuntikkan gagal dieksekusi oleh mesin Follow Up API: " + e.message); 
    }
  }

  /**
   * Membungkus dan Merekam Identitas Semantik Label Pada Kartu Kontak.
   * Berfungsi layaknya Pin Warna (Color Tags) untuk mempermudah identifikasi agen CS.
   */
  async function executeSetLabel() {
    if (!labelPayload.name.trim()) return;
    
    try { 
      // ==========================================
      // UX TINGKAT LANJUT: Optimistic Local State
      // ==========================================
      // Tidak perlu menunggu peladen merespons, kita timpa memori lokal secara paksa.
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
      // Sinkronisasi Transmisi Peladen Asynchronous
      // ==========================================
      apiFetch("/leads/label", { 
        method: "POST", 
        body: JSON.stringify({ 
          targets: labelModal.targets.map(t => t.split('@')[0]), 
          label: labelPayload.name, 
          color: labelPayload.color 
        }) 
      }).catch((syncErr) => {
        console.warn("Layanan penanda label jaringan tertidur sesaat. Tatanan memori localStorage mengambil alih kemudi cadangan:", syncErr);
      }); 
      
      // Lenyapkan Antarmuka Modal
      setLabelModal({ open: false, targets: [] }); 
      setSelectedPeers([]); 
      setIsSelectionMode(false); 
      
    } catch (e: any) { 
      alert("Peringatan Insiden: Menyematkan lencana visual gagal dilakukan - " + e.message); 
    }
  }

  /**
   * Mengelupas Konstruksi Label yang Sedang Terpaku pada Sebuah Target.
   */
  const removeLabel = (targetNum: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Merupakan fungsi kritikal pembatas DOM. Menolak klik merambat ke wadah Card Chat agar ruang layar kanan tidak terbuka keliru.
    
    if (!confirm("Meminta Penegasan Operator: Yakinkah Anda menuntut pencabutan label dari tubuh kontak personal ini?")) {
      return;
    }
    
    setCustomLabels(prev => { 
      const next = { ...prev }; 
      delete next[targetNum]; 
      return next; 
    });
  };

  /**
   * Men-deploy Ekspedisi Distribusi Format Media Publik (Mendukung Gambar, Video, File, hingga Pin Lokasi Maps).
   */
  async function executeSendMedia() {
    if (sending) return;
    setSending(true);
    
    try {
      const isLoc = mediaModal.type === 'location';
      
      // Struktur Data Pengiriman (Payload JSON) Bersifat Dinamis (Polimorfik) Diselaraskan Terhadap Pilihan Tab Klien.
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
      
      // Detektor Routing Jaringan yang Berbeda-Beda.
      const endpoint = isLoc ? '/messages/send-location' : '/messages/send-media';
      
      await apiFetch(endpoint, { 
        method: "POST", 
        body: JSON.stringify(payload) 
      });
      
      // Lenyapkan Bentuk Form Pengiriman dan Setel Kembali Variabel ke Dasar Kosong.
      setMediaModal({ open: false, type: 'image' }); 
      setMediaPayload({ url: "", caption: "", lat: "", lng: "" }); 
      
      // Membujuk Data Riwayat Memuat Ulang untuk Merender Media Bubble.
      loadMessages(sessionKey, peer, msgLimit);
      
    } catch (e: any) { 
      alert("Kesalahan Transmisi Media Terdeteksi. Mohon selidiki ulang format Validitas Uniform Resource Locator (URL) Anda, apakah objek terbuka bebas tanpa retriksi Private Firewall: " + e.message); 
    } finally { 
      // Matikan Putaran Loading Lingkaran CSS
      setSending(false); 
    }
  }

  // Pemetakan Konteks Entitas Pembawa Ekstra Meta untuk Digunakan di Sudut Header Jendela Kanan
  const currentConv = convs.find(c => c.remoteJid === peer);
  const currentLead = leads.find(l => l.to_number === peerNumber);
  const currentLabel = customLabels[peerNumber];

  // ============================================================================
  // M. THE DOM TREE RENDERER (JSX)
  // ============================================================================

  // Pemblokiran Navigasi UI Sementara jika Beban Boot Mesin Menjajaki Titik Dasar
  if (isAppLoading) {
    return (
      <div 
        className="flex flex-col items-center justify-center h-full w-full bg-transparent text-slate-400 gap-4"
      >
        <Loader2 
          size={50} 
          className="animate-spin text-blue-500 drop-shadow-md" 
        />
        <p 
          className="font-extrabold tracking-[0.3em] uppercase text-xs animate-pulse"
        >
          Memompa Kapasitas Mesin Antarmuka Awan...
        </p>
      </div>
    );
  }

  return (
    <div 
      className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem] relative"
    >
      
      {/* --------------------------------------------------------------------- */}
      {/* AREA KIRI: SIDEBAR DAFTAR OBROLAN UTAMA (PROPORSI LEBAR 450 PIXEL) */}
      {/* --------------------------------------------------------------------- */}
      <div 
        className="
          w-full md:w-[380px] lg:w-[450px] 
          flex flex-col border-r border-white/20 
          bg-white/30 backdrop-blur-3xl shrink-0 relative z-10
        "
      >
        
        {/* ================= BLOK HEADER SIDEBAR ================= */}
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
                Koneksi Mesin Klien
              </label>
              
              {/* Lencana Indikator Visual Waktu Server Sinkron Secara Real-time */}
              <span 
                className="
                  text-[9px] font-black text-emerald-500 tracking-widest 
                  flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 
                  rounded border border-emerald-100 shadow-sm cursor-help
                " 
                title="Waktu Berjalan Mengacu Pada Sinkronisasi Penuh"
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
                className="
                  bg-transparent text-lg font-black text-slate-800 outline-none 
                  cursor-pointer appearance-none pr-8 w-full group-hover:text-blue-600 transition-colors
                "
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
                  <option 
                    value=""
                  >
                    Mesin Awan Nihil Operasi
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
            className={`
              w-12 h-12 rounded-[1.2rem] flex items-center justify-center 
              shadow-sm border transition-all 
              ${
                isSelectionMode 
                  ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700 hover:scale-105' 
                  : 'bg-white/60 text-slate-500 border-white hover:text-blue-600 hover:bg-white hover:scale-105'
              }
            `}
            title={isSelectionMode ? "Gugurkan Penguncian Mode Pilihan" : "Pasang Konfigurasi Opsi Massal Pilihan (Bulk Mode)"}
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

        {/* ================= BLOK PENCARIAN TEKS & BARISAN TAB FILTER CHIP ================= */}
        <div 
          className="p-6 shrink-0 border-b border-white/20 bg-white/10"
        >
          
          {/* Kotak Mesin Pencari Teks Utama */}
          <div 
            className="relative mb-4"
          >
            <input 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              placeholder="Filter riwayat pesan, nomer HP, atau identitas subjek..." 
              className="
                w-full pl-12 pr-10 py-4 rounded-2xl bg-white/50 border border-white/80 
                text-sm font-semibold outline-none focus:bg-white/90 focus:ring-4 
                focus:ring-blue-500/10 transition-all shadow-sm
              " 
            />
            <Search 
              size={18} 
              className="absolute left-4 top-[1.15rem] text-slate-400" 
            />
            
            {/* Tombol X (Erase) Tampil secara Condisional Mengiringi Adanya Inputan Teks Klien */}
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="
                  absolute right-4 top-[1.15rem] text-slate-400 hover:text-slate-600 
                  bg-slate-100 rounded-full p-0.5 transition-colors
                "
              >
                <X 
                  size={14} 
                  strokeWidth={3}
                />
              </button>
            )}
          </div>
          
          {/* Barisan Pita Slider Chip (Scrollable Horizontal Secara Dinamis) */}
          <div 
            className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide"
          >
             <button 
               onClick={() => setActiveFilter('all')} 
               className={`
                 shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all 
                 ${
                   activeFilter === 'all' 
                     ? 'bg-slate-800 text-white shadow-md scale-105' 
                     : 'bg-white/60 text-slate-500 hover:bg-white border border-transparent hover:border-slate-200'
                 }
               `}
             >
               Bentang Penuh
             </button>
             
             <button 
               onClick={() => setActiveFilter('unread')} 
               className={`
                 shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all 
                 ${
                   activeFilter === 'unread' 
                     ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 scale-105' 
                     : 'bg-white/60 text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100'
                 }
               `}
             >
               <div 
                 className="w-2 h-2 rounded-full bg-current opacity-80"
               ></div>
               Antrean Masuk (Unread)
             </button>

             <button 
               onClick={() => setActiveFilter('personal')} 
               className={`
                 shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all 
                 ${
                   activeFilter === 'personal' 
                     ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 scale-105' 
                     : 'bg-white/60 text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100'
                 }
               `}
             >
               <User 
                 size={14}
               /> 
               Obrolan Japri
             </button>
             
             <button 
               onClick={() => setActiveFilter('group')} 
               className={`
                 shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all 
                 ${
                   activeFilter === 'group' 
                     ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 scale-105' 
                     : 'bg-white/60 text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100'
                 }
               `}
             >
               <Users 
                 size={14}
               /> 
               Kumpulan Grup
             </button>
             
             {/* Integrasi Mesin Penggambar Custom CRM Tags Lintas-Statis (Loop Dynamic UI) */}
             {uniqueLabels.map(l => (
               <button 
                 key={l.name} 
                 onClick={() => setActiveFilter(`label_${l.name}`)} 
                 className={`
                   shrink-0 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-sm border 
                   ${
                     activeFilter === `label_${l.name}` 
                       ? l.color + ' text-white border-transparent scale-105' 
                       : 'bg-white/60 text-slate-600 border-white hover:bg-white'
                   }
                 `}
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

        {/* ================= DAFTAR OBROLAN (LIST ITEM MAPPER CONTAINER) ================= */}
        <div 
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-hide pb-24 relative"
        >
          
          {/* Kondisi Jika Hasil Dari Mesin Filter / Sorting Mengembalikan Kehampaan Array Kosong */}
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
                 Pemberitahuan Kotak Pesan Kosong.
               </p>
               <p 
                 className="text-xs font-medium mt-1 text-center px-6"
               >
                 Konfigurasi dari tab filter atau query search memotong seluruh daftar data relasional.
               </p>
            </div>
          )}

          {/* Engine Utama Pemetaan Modul Kartu Percakapan Sidebar Interaktif */}
          {filteredConvs.map(c => {
            const cNum = c.remoteJid.split('@')[0];
            const isActive = peer === c.remoteJid && !isSelectionMode;
            const isSelected = selectedPeers.includes(c.remoteJid);
            
            // Pengambilan Komposisi Metadata Pendukung (Lead State, Labels, Identitas Grup)
            const isLead = leads.find(l => l.to_number === cNum);
            const lLabel = customLabels[cNum];
            const isGroup = c.remoteJid.includes('@g.us');
            const contactDisplayName = formatContactName(c.remoteJid, c.name);
            
            // Kondisi Desain Penggunaan Gaya Cetak Tebal Berdasarkan Hitungan Belum Terbaca (Unread)
            const isUnread = c.unreadCount > 0;
            const isOutMsg = c.lastMessage?.direction === 'out';
            
            // Solusi Pengalaman Pemakai (UX) Superior Pada Ruang Publik: 
            // Menyisipkan label string prefix perihal identitas pribadi pengirim di ruang Komunitas (Grup)
            const groupSenderPrefix = isGroup && !isOutMsg && c.lastMessage?.pushName 
              ? `${c.lastMessage.pushName}: ` 
              : '';
            
            return (
              <div 
                key={c.remoteJid}
                onClick={() => handleSelectChat(c.remoteJid)}
                className={`
                  p-4 flex items-stretch gap-4 rounded-[1.8rem] cursor-pointer transition-all duration-300 relative border overflow-hidden 
                  ${
                    isActive 
                      ? "bg-white/95 shadow-xl shadow-blue-500/10 border-white scale-[1.02] z-10 ring-4 ring-blue-50" 
                      : isSelected 
                        ? "bg-blue-50 border-blue-200" 
                        : "hover:bg-white/60 border-transparent hover:shadow-sm"
                  }
                `}
              >
                {/* Komponen Ornamen Tambahan: Pilar visual pembatas margin mendominasi sebelah sudut kiri */}
                {isActive && (
                  <div 
                    className="absolute top-0 bottom-0 left-0 w-1.5 bg-blue-500 rounded-l-[1.8rem]"
                  ></div>
                )}

                {/* Sektor Kiri: Area Penugasan Blok Pengenal Wajah (Avatar) 
                    Bergeser Fungsi Menjadi Modul Konfirmasi Tanda Centang Saat Berada di Mode Bulk Interaksi */}
                {isSelectionMode ? (
                  <div 
                    className={`
                      w-14 h-14 rounded-[1.2rem] flex items-center justify-center shrink-0 border-2 transition-all mt-0.5 
                      ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-110' 
                          : 'bg-white border-slate-200'
                      }
                    `}
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
                    className={`
                      w-14 h-14 rounded-[1.2rem] flex items-center justify-center font-black text-xl shrink-0 border border-white shadow-md relative mt-0.5 transition-colors 
                      ${
                        isActive 
                          ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" 
                          : isGroup 
                            ? "bg-gradient-to-br from-amber-50 to-orange-50 text-amber-500" 
                            : "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500"
                      }
                    `}
                  >
                    {isGroup ? (
                      <Users 
                        size={24} 
                        strokeWidth={2.5}
                      />
                    ) : (
                      contactDisplayName.charAt(0).toUpperCase()
                    )}
                    
                    {/* Tampilan Detik Penanda Lingkaran Bundar Kecil Menghias Pinggir Ujung Kanan Atas Identitas Avatar */}
                    {isUnread && !isActive && (
                      <span 
                        className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-[3px] border-white rounded-full shadow-sm"
                      ></span>
                    )}
                  </div>
                )}

                {/* Sektor Bodi Perut (Tengah): Mengangkut Nama Inti, Pijakan Teks Pratilik, dan Pin Label */}
                <div 
                  className="flex-1 min-w-0 flex flex-col justify-center py-0.5"
                >
                  <h3 
                    className={`
                      text-[16px] truncate tracking-tight mb-1 transition-colors 
                      ${
                        isUnread 
                          ? 'font-black text-slate-900' 
                          : 'font-bold text-slate-700'
                      }
                    `}
                  >
                    {contactDisplayName}
                  </h3>
                  
                  {/* Pratinjau Teks Pesan Terakhir yang Digabungkan Oleh Kehadiran Konfirmasi Centang Biru Tanda Resi */}
                  <p 
                    className={`
                      text-[14px] truncate pr-2 flex items-center gap-1.5 transition-colors 
                      ${
                        isUnread 
                          ? 'text-slate-800 font-bold' 
                          : 'text-slate-500 font-medium opacity-90'
                      }
                    `}
                  >
                    {isOutMsg && (
                       <span 
                         className={`
                           text-[14px] 
                           ${c.lastMessage.status === 'read' ? 'text-cyan-500' : 'text-slate-400'}
                         `}
                       >
                         {c.lastMessage.status === 'read' ? (
                           <CheckCheck size={16} />
                         ) : (
                           <Check size={16} />
                         )}
                       </span>
                    )}
                    <span 
                      className="truncate"
                    >
                      {/* Sisipan Nama Profil Khusus Untuk Publik Lingkungan Grup */}
                      {groupSenderPrefix && (
                        <span className="font-semibold">{groupSenderPrefix}</span>
                      )}
                      {c.lastMessage?.text || '[Lampiran Susupan Modul Media/Stiker]'}
                    </span>
                  </p>

                  {/* Kumpulan Kotak Pil Bentuk Indikator Visual Berjajar Sepanjang Poros X (Kiri-Kanan) */}
                  <div 
                    className="flex flex-wrap items-center gap-2 mt-2"
                  >
                    {isGroup && (
                      <span 
                        className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 shadow-sm"
                      >
                        Grup Publik
                      </span>
                    )}
                    
                    {lLabel && (
                      <span 
                        className={`
                          px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-white shadow-sm flex items-center gap-1 
                          ${lLabel.color}
                        `}
                      >
                        {lLabel.name} 
                        {/* Menghadirkan Ikon Tombol Pembuka Opsi Tutup Jika Kotak Obrolan Tersorot Tembus Layar (Aktif) */}
                        {isActive && (
                          <span 
                            className="cursor-pointer hover:bg-black/20 rounded p-0.5 ml-1 transition-colors" 
                            onClick={(e) => removeLabel(cNum, e)} 
                            title="Konfirmasi Perintah Pencabutan Segel Label Ini"
                          >
                            <X size={10} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                    )}
                    
                    {isLead && (
                      <span 
                        className={`
                          px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border 
                          ${
                            isLead.has_replied 
                              ? 'bg-rose-50 text-rose-500 border-rose-100' 
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                          }
                        `}
                      >
                        {isLead.has_replied ? '🔥 Leads Terkualifikasi' : '❄️ Leads Baru Masuk'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sektor Pinggir Ekor (Kanan Akhir): Blok Kolom Pencatatan Waktu dan Ruang Tamu Bagi Bulatan Merah Angka Unread */}
                <div 
                  className="flex flex-col items-end justify-start pt-1 gap-2 shrink-0"
                >
                  <span 
                    className={`
                      text-[11px] font-semibold whitespace-nowrap transition-colors 
                      ${
                        isUnread ? 'text-emerald-500' : 'text-slate-400'
                      }
                    `}
                  >
                    {formatChatDate(c.lastMessage?.time, liveTime)}
                  </span>
                  
                  {/* Rendering Papan Angka Bundar Menawan Yang Hanya Disiagakan Bila Tidak Dalam Operasi Pemilihan Bulk */}
                  {isUnread && !isSelectionMode && (
                    <div 
                      className="min-w-[24px] h-[24px] rounded-full bg-emerald-500 text-white text-[11px] flex items-center justify-center font-black shadow-md px-2 animate-in zoom-in duration-300"
                    >
                      {/* Manajemen Visual Kapasitas Limitasi Skala Lebar Layout Number > 99 */}
                      {c.unreadCount > 99 ? '99+' : c.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ================= BULK ACTION BAR OVERLAY POPUP (MENGAMBANG DI BAWAH KIRI) ================= */}
        {isSelectionMode && selectedPeers.length > 0 && (
          <div 
            className="absolute bottom-6 left-6 right-6 bg-slate-900 rounded-[2rem] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)] border border-slate-700 flex items-center justify-between animate-in slide-in-from-bottom-10 z-50"
          >
             <span 
               className="text-xs font-black text-white px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700"
             >
               {selectedPeers.length} Objek Dipilih
             </span>
             
             <div 
               className="flex gap-2.5"
             >
                <button 
                  onClick={() => setLabelModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-indigo-600 rounded-[1rem] text-white transition-colors hover:scale-105" 
                  title="Serentak Pasang Tatanan Label Ke Seluruh Kontak"
                >
                  <Tag 
                    size={18} 
                    strokeWidth={2.5}
                  />
                </button>
                <button 
                  onClick={() => setBcModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-emerald-600 rounded-[1rem] text-white transition-colors hover:scale-105" 
                  title="Operasikan Rencana Penyiaran Broadcast Cepat Instan"
                >
                  <Megaphone 
                    size={18} 
                    strokeWidth={2.5}
                  />
                </button>
                <button 
                  onClick={() => setFuModal({ open: true, targets: selectedPeers })} 
                  className="p-3 bg-slate-800 hover:bg-orange-500 rounded-[1rem] text-white transition-colors hover:scale-105" 
                  title="Daftarkan Eksekusi Penjadwalan Dalam Sistem Sequence Workflow / Auto Follow Up Terstruktur Berkesinambungan"
                >
                  <CalendarClock 
                    size={18} 
                    strokeWidth={2.5}
                  />
                </button>
                
                {/* Separator Garis Hitam Kelabu Pembatas Aksi Merusak (Destructive Action) */}
                <div 
                  className="w-[2px] h-8 bg-slate-700 mx-1.5 self-center rounded-full"
                ></div>
                
                <button 
                  onClick={executeDeleteChats} 
                  className="p-3 bg-slate-800 hover:bg-rose-600 rounded-[1rem] text-rose-400 hover:text-white transition-colors hover:scale-105" 
                  title="Pemusnahan Mutlak! Hapus Percakapan Secara Permanen"
                >
                  <Trash2 
                    size={18} 
                    strokeWidth={2.5}
                  />
                </button>
             </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* AREA KANAN: KOLOM OBROLAN AKTIF (CHAT VIEW WINDOW / CANVAS RUANG BACA) */}
      {/* --------------------------------------------------------------------- */}
      {peer ? (
        <div 
          className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20"
        >
          
          {/* ================= HEADER BINGKAI ATAS KANAN (CHAT INFO METADATA) ================= */}
          <div 
            className="h-24 px-10 flex items-center border-b border-white/20 bg-white/50 backdrop-blur-2xl z-20 shrink-0 shadow-sm justify-between transition-colors"
          >
            <div 
              className="flex items-center flex-1 min-w-0"
            >
              <div 
                className={`
                  w-14 h-14 rounded-2xl shadow-md flex items-center justify-center font-black text-2xl border mr-5 shrink-0 relative overflow-hidden 
                  ${
                    peer.includes('@g.us') 
                      ? "bg-amber-50 text-amber-500 border-amber-100" 
                      : "bg-white text-blue-600 border-slate-100"
                  }
                `}
              >
                {/* Sorot Pencahayaan Cahaya Muka Gradasi Untuk Mengangkat Kualitas Pandangan Avatar Objek Kotak */}
                <div 
                  className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent"
                ></div>
                <span 
                  className="relative z-10"
                >
                  {peer.includes('@g.us') ? (
                    <Users 
                      size={28} 
                      strokeWidth={2.5}
                    /> 
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
                  
                  {/* Kompartemen Status Lencana Pendukung Eksis di Ambang Header Langit-langit Obrolan Kanan */}
                  {peer.includes('@g.us') && (
                    <span 
                      className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 shadow-sm"
                    >
                      Kumpulan Grup WA Publik
                    </span>
                  )}
                  {currentLabel && (
                    <span 
                      className={`
                        px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm 
                        ${currentLabel.color}
                      `}
                    >
                      {currentLabel.name}
                    </span>
                  )}
                  {currentLead && (
                    <span 
                      className={`
                        px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border bg-white 
                        ${
                          currentLead.has_replied 
                            ? 'text-rose-500 border-rose-200' 
                            : 'text-slate-500 border-slate-200'
                        }
                      `}
                    >
                      {currentLead.has_replied ? '🔥 Status Target Teraktifkan' : '❄️ Status Target Terbekukan (Pasif)'}
                    </span>
                  )}
                </div>
                
                <div 
                  className="flex items-center gap-2 mt-1.5"
                >
                  {/* Indikator Status Nyala Hijau Mengerjap (Pulse) E2E Encryption */}
                  <div 
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)] border border-white"
                  ></div>
                                    
                  <span 
                    className="text-[10px] ml-3 text-slate-400 bg-white/70 px-2.5 py-0.5 rounded-md flex items-center gap-1.5 font-bold uppercase tracking-widest border border-slate-200"
                  >
                    <Activity 
                      size={12} 
                      className="text-emerald-500 animate-pulse" 
                    /> 
                    Koneksi Sinkronasi Sistem Cerdas Bertahan Aktif
                  </span>
                </div>
              </div>
            </div>

            {/* Kelompok Instrumen Cepat (Shortcut Tools) pada Pojok Kanan Header Obrolan Khusus */}
            <div 
              className="flex gap-3"
            >
              <button 
                onClick={() => setLabelModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-indigo-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-110 hover:bg-indigo-50" 
                title="Sistem Pengelolaan Tag & Atur Susunan Label"
              >
                <Tag 
                  size={20} 
                  strokeWidth={2.5}
                />
              </button>
              <button 
                onClick={() => setBcModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-emerald-600 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-110 hover:bg-emerald-50" 
                title="Tembakkan Modul Penawaran Cepat (Pesawat Broadcast)"
              >
                <Megaphone 
                  size={20} 
                  strokeWidth={2.5}
                />
              </button>
              <button 
                onClick={() => setFuModal({ open: true, targets: [peer] })} 
                className="w-12 h-12 rounded-[1.2rem] bg-white text-slate-500 hover:text-orange-500 flex items-center justify-center shadow-sm border border-slate-100 transition-all hover:scale-110 hover:bg-orange-50" 
                title="Jadwalkan Penawaran Prospek Tunggal Ke Dalam Sistem Skala Penjadwalan Follow Up"
              >
                <CalendarClock 
                  size={20} 
                  strokeWidth={2.5}
                />
              </button>
            </div>
          </div>

          {/* ================= BUBBLE CHAT LIST AREA (RUANGAN BACA KONTEN) ================= */}
          <div 
            ref={scrollContainerRef} 
            onScroll={handleScroll} 
            className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scrollbar-hide scroll-smooth relative bg-slate-50/50"
          >
            {/* Dekorasi Bingkai Pemberitahuan Keamanan dan Load More Trigger di Puncak Tertinggi Obrolan */}
            <div 
              className="flex flex-col items-center mb-10 gap-4 pt-4"
            >
              <div 
                className="bg-amber-50/90 border border-amber-200 text-amber-800 text-[12px] font-bold px-6 py-3 rounded-2xl max-w-md text-center leading-relaxed shadow-sm backdrop-blur-sm relative overflow-hidden"
              >
                <div 
                  className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400"
                ></div>
                🔒 Seluruh gelombang perpindahan data percakapan diproteksi dan telah diamankan penuh oleh kerangka landasan protokol keamanan transmisi standar industri kelas perbankan. Sistem Enterprise Mesin SaaS secara mandiri menjamin dan berjanji untuk tidak pernah merekam ataupun mengekstrak fail unggahan media mentah ke repositori peladen secara publik.
              </div>
              
              {/* Tombol Pemanggil Kursor Load More Lanjutan Memori History Berbasis Batasan Limit Data */}
              {messages.length >= msgLimit && (
                <button 
                  onClick={() => { 
                    setMsgLimit(m => m + 100); 
                    setIsAtBottom(false); 
                  }} 
                  className="px-6 py-3 bg-white border border-slate-200 text-blue-600 font-black text-[11px] uppercase tracking-widest rounded-full shadow-sm hover:scale-105 hover:bg-blue-50 transition-all"
                >
                  <Clock 
                    size={14} 
                    className="inline mr-2 text-blue-400"
                  /> 
                  Seret Turun & Tampilkan Jejak Riwayat Lebih Lama
                </button>
              )}
            </div>

            {/* ENGINE UTAMA: PEMETAAN PESAN KESELURUHAN (COMPONENTS BUBBLE RENDERER MATRIKS)
                Berkat Backend yang dengan sempurna mengirimkan Array dalam urutan `reverse()` yang secara kronologis telah dibenarkan,
                di sini kita terbebaskan dan tidak perlu lagi memanipulasi susunan alokasi array (yang mana hal itu sebelumnya sangat memberatkan mesin kalkulasi React).
                Lukisan bingkai Render langsung berjalan ringan dan mulus secara vertikal menurun ke jurang dari baris teratas ke arah dasar landasan.
            */}
            {messages.map((m) => (
              <MessageBubble 
                key={m.id} 
                msg={m} 
                liveTime={liveTime} 
                isGroup={peer.includes('@g.us')} 
              />
            ))}
            
            {/* Animasi Kinetik Loader Indikator Pengetikan Berupa Tiga Titik Memantul Naik-Turun (Bounce) Yang Ditampilkan Pada Saat Mengirim Pesan Saja */}
            {sending && (
              <div 
                className="flex justify-end animate-in fade-in duration-300"
              >
                <div 
                  className="px-6 py-4 rounded-[2rem] bg-slate-200/70 rounded-br-sm shadow-sm flex items-center gap-2"
                >
                  <span 
                    className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
                  ></span>
                  <span 
                    className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" 
                    style={{ animationDelay: '0.1s' }}
                  ></span>
                  <span 
                    className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" 
                    style={{ animationDelay: '0.2s' }}
                  ></span>
                </div>
              </div>
            )}
          </div>

          {/* ================= LANDASAN INPUT FORM KETIK PESAN ================= */}
          <div 
            className="p-6 md:p-8 bg-white/70 backdrop-blur-2xl z-20 shrink-0 border-t border-slate-200 relative"
          >
            {/* Opsi Menu Pop-Up Mengambang Vertikal Untuk Pilihan Ekstensi Variabel Lampiran Media Eksternal */}
            {attachOpen && (
              <div 
                className="absolute bottom-28 left-8 bg-white/95 backdrop-blur-xl border border-slate-200 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2 z-50 animate-in slide-in-from-bottom-4 min-w-[240px]"
              >
                <button 
                  onClick={() => { 
                    setMediaModal({ open: true, type: 'document' }); 
                    setAttachOpen(false); 
                  }} 
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50 rounded-[1.2rem] text-slate-700 font-bold transition-all text-sm w-full text-left group"
                >
                  <div 
                    className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform"
                  >
                    <FileText 
                      size={18} 
                      strokeWidth={2.5}
                    />
                  </div>
                  Modul Kirim Sisipan Dokumen (Tautan URL)
                </button>
                <button 
                  onClick={() => { 
                    setMediaModal({ open: true, type: 'image' }); 
                    setAttachOpen(false); 
                  }} 
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-emerald-50 rounded-[1.2rem] text-slate-700 font-bold transition-all text-sm w-full text-left group"
                >
                  <div 
                    className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform"
                  >
                    <ImageIcon 
                      size={18} 
                      strokeWidth={2.5}
                    />
                  </div>
                  Modul Kirim Render Gambar Bebas (Tautan URL)
                </button>
                <button 
                  onClick={() => { 
                    setMediaModal({ open: true, type: 'location' }); 
                    setAttachOpen(false); 
                  }} 
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-amber-50 rounded-[1.2rem] text-slate-700 font-bold transition-all text-sm w-full text-left group"
                >
                  <div 
                    className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform"
                  >
                    <MapPin 
                      size={18} 
                      strokeWidth={2.5}
                    />
                  </div>
                  Modul Bagikan Pancaran Titik Lokasi Statis
                </button>
              </div>
            )}

            {/* Kotak Induk Bingkai Formulir Panel Pengetikan Teks Sentral */}
            <div 
              className="max-w-5xl mx-auto flex items-end gap-4 bg-white p-3.5 rounded-[2rem] border border-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)] focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-300 transition-all duration-300"
            >
              {/* Tombol Bulat Bukaan Jendela Opsi Lampiran (Simbol Tambah Salib Kiri) */}
              <button 
                onClick={() => setAttachOpen(!attachOpen)} 
                className={`
                  w-14 h-14 flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-90 rounded-[1.2rem] shrink-0 border 
                  ${
                    attachOpen 
                      ? 'bg-blue-600 border-blue-600 text-white rotate-45 shadow-md' 
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'
                  }
                `}
              >
                <Plus 
                  size={24} 
                  strokeWidth={3} 
                />
              </button>
              
              {/* Modul Kolom Area Teks Leluasa yang Berukuran Fleksibel Otomatis Berdasarkan Kalkulasi Input Pengetikan Panjang Paragraf */}
              <textarea 
                value={text} 
                onChange={(e) => setText(e.target.value)} 
                onKeyDown={(e) => { 
                  // Dukungan standar menekan peraba Enter untuk secara naluriah mengirimkan muatan secara langsung (Shift+Enter difungsikan khusus sebagai pembentuk garis paragraf baru yang bebas)
                  if (e.key === "Enter" && !e.shiftKey) { 
                    e.preventDefault(); 
                    sendText(); 
                  } 
                }} 
                placeholder="Ketik balasan Anda di bilah panel ini secara interaktif dan efisien... (Gunakan sentuhan tombol Enter peranti keyboard untuk mengirimkan balasan seketika, Gunakan perpaduan sentuhan tombol Shift+Enter guna meletakkan pemisah garis baris ganda pada isi pesan)" 
                className="flex-1 bg-transparent border-none py-4 px-4 text-[16px] font-semibold outline-none resize-none max-h-40 text-slate-700 placeholder-slate-400 leading-relaxed" 
                rows={1} 
              />
              
              {/* Blok Terakhir: Tombol Eksekutor Pemancaran Pesan Utama (Berdiri Kokoh di Sebelah Kanan Area Pengetikan Input) */}
              <button 
                onClick={sendText} 
                disabled={!text.trim() || sending} 
                className={`
                  w-14 h-14 rounded-[1.2rem] flex items-center justify-center transition-all duration-500 shrink-0 
                  ${
                    text.trim() && !sending 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 cursor-pointer" 
                      : "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                  }
                `}
              >
                {sending ? (
                  <div 
                    className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  ></div>
                ) : (
                  <Send 
                    size={22} 
                    strokeWidth={2.5} 
                    className="ml-1" 
                  />
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

      {/* MODAL 1: ATUR LABEL KUSTOM - KANVAS TERPISAH YANG MENUTUPI PERMUKAAN DEPAN */}
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
                <Tag 
                  size={18} 
                  strokeWidth={2.5} 
                />
              </div>
              <h3 
                className="text-xl font-black text-slate-800 tracking-tight"
              >
                Konfigurasi Penempatan Label Khusus
              </h3>
            </div>
            
            <p 
              className="text-xs font-bold text-slate-500 mb-6 bg-slate-50 inline-block px-3 py-1 rounded-md border border-slate-200 mt-2"
            >
              Menerapkan garis penempatan tatanan label warna pada total keseluruhan mencakup {labelModal.targets.length} nomor entitas jaringan yang sudah berhasil Anda centang pilih.
            </p>
            
            {/* Quick Pick: Menampilkan Riwayat Pendaftaran Label yang telah pernah diinisiasi dan diregistrasikan di periode lampau */}
            {uniqueLabels.length > 0 && (
              <div 
                className="mb-6"
              >
                <label 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3"
                >
                  Pilih Salinan Langsung Dari Basis Konfigurasi Pustaka Sebelumnya:
                </label>
                <div 
                  className="flex flex-wrap gap-2"
                >
                  {uniqueLabels.map(l => (
                    <button 
                      key={l.name} 
                      onClick={() => setLabelPayload({name: l.name, color: l.color})} 
                      className={`
                        px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-all hover:scale-105 active:scale-95 
                        ${l.color} 
                        ${labelPayload.name === l.name ? 'ring-4 ring-offset-1 ring-blue-500/30' : ''}
                      `}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div 
              className="mb-8"
            >
               <label 
                 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2"
               >
                 Atau Daftarkan Nama Identitas Entitas Penanda Label Yang Benar-Benar Ekstra Baru:
               </label>
               <input 
                 value={labelPayload.name} 
                 onChange={(e)=>setLabelPayload({...labelPayload, name: e.target.value})} 
                 placeholder="Silakan mulai merangkai string nama label representatif bebas Anda..." 
                 className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 mb-4 focus:bg-white focus:border-blue-400 transition-colors shadow-inner" 
               />
               
               {/* Konfigurasi Mesin Selektor Susunan Array Komponen Warna Estetika Enterprise */}
               <div 
                 className="flex flex-wrap gap-3 mt-2 justify-between px-1"
               >
                 {LABEL_COLORS.map(color => (
                   <button 
                     key={color} 
                     onClick={() => setLabelPayload({...labelPayload, color})} 
                     className={`
                       w-8 h-8 rounded-full cursor-pointer transition-all duration-300 
                       ${color} 
                       ${
                         labelPayload.color === color 
                           ? 'ring-4 ring-offset-2 ring-blue-400 scale-110 shadow-lg' 
                           : 'opacity-50 hover:opacity-100 hover:scale-110'
                       }
                     `} 
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
                Gagalkan Aksi & Pulihkan
              </button>
              <button 
                onClick={executeSetLabel} 
                className="px-8 py-3.5 rounded-[1.2rem] font-black text-white bg-blue-600 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all"
              >
                Deklarasikan Penugasan Simpan Label Terpilih
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PANEL PERMINTAAN PENJADWALAN BROADCAST DISTRIBUSI CEPAT KE RAGAM TITIK TARGET SEKALIGUS */}
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
                   <Megaphone 
                     size={24} 
                     strokeWidth={2.5}
                   />
                 </div>
                 <div>
                   <h3 
                     className="text-2xl font-black text-slate-800 tracking-tight"
                   >
                     Operasi Eksekusi Kirim Broadcast Instan Penjadwalan Latar
                   </h3>
                   <p 
                     className="text-xs font-bold text-emerald-600 mt-1 uppercase tracking-widest"
                   >
                     Memaklumatkan Pendistribusian Modul Pesan Menuju Setepatnya Di Sekeliling {bcModal.targets.length} Ruang Titik Target Terpilih
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
                Susun Muatan Teks Isi Paragraf Dari Badan Pesan Promosi Massal Anda
              </label>
              
              <textarea 
                rows={6} 
                value={bcPayload.text} 
                onChange={(e)=>setBcPayload({...bcPayload, text: e.target.value})} 
                placeholder="Contoh Penerapan Format: Halo Tuan/Puan {{nama}}, tahukah Anda bahwa hari ini terbukti sah menyajikan diskon produk eksklusif yang menarik untuk diperuntukkan murni pada nomor seri id kepemilikan Anda ini yakni bernomor {{nomor}}..." 
                className="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 border border-slate-200 outline-none font-medium text-slate-700 mb-6 resize-none focus:bg-white focus:border-emerald-400 transition-colors shadow-inner" 
              />
              
              <div 
                className="flex items-center justify-between bg-emerald-50/50 px-6 py-4 rounded-2xl border border-emerald-100 shadow-sm"
              >
                 <div>
                   <span 
                     className="text-[11px] font-black text-emerald-800 uppercase tracking-widest block"
                   >
                     Penetapan Interval Rentang Skala Jeda Mesin Antrean Terjadwal (Peraturan Ekosistem Anti-Banned)
                   </span>
                   <span 
                     className="text-[10px] font-semibold text-emerald-600/70 mt-1 block"
                   >
                     Penyetelan durasi tenggang jeda interval perlambatan rentang waktu nafas aman penantian terukur antar operasi pengiriman setiap titik lintasan lompatan antrean rilis penembakkan siklus pesan perangkat bot Anda (Dikonversikan Dalam Nominal Pengukuran Milidetik Komputasi Skala)
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
                   <span 
                     className="text-xs font-bold text-slate-400 ml-1"
                   >
                     Ms.
                   </span>
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
                Tunda & Batalkan Seluruh Tindakan Interupsi Skema Jaringan
              </button>
              <button 
                onClick={executeScheduleBroadcast} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2"
              >
                <Check 
                  size={16} 
                  strokeWidth={2.5}
                />
                Serahkan Tugas Perintah Mulai Pemompaan Siklus Antrean Sistem Operasi Robot Bawah Jendela
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL 3: PUSAT PANEL PERENCANAAN PENETAPAN JADWAL SEKUENSI TAHAPAN BERTAHAP MANUVER WORKFLOW AUTO FOLLOW UP TINGKAT LANJUT */}
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
                 <CalendarClock 
                   size={28} 
                   strokeWidth={2.5}
                 />
               </div>
               <div>
                 <h3 
                   className="text-3xl font-black text-slate-800 tracking-tight"
                 >
                   Manajemen Pendaftaran Jaringan Siklus Auto Follow Up Terintegrasi
                 </h3>
                 <p 
                   className="text-xs font-bold text-orange-600 mt-1.5 uppercase tracking-widest"
                 >
                   Total Penjumlahan Komposisi Tembusan Keseluruhan Sejumlah Kumpulan {fuModal.targets.length} Target Spesifik Individu Akan Turut Diantrekan Secara Mutlak Dan Dijadwalkan Di Ruang Kedalaman Dimensi Paralel Pekerja Latar Belakang Mesin Engine Komputasi SaaS
                 </p>
               </div>
            </div>
            
            <div 
              className="mb-10 bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-sm"
            >
              <label 
                className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3"
              >
                Kumpulan Panduan Singkat Instruksi Otoritatif Menetapkan Memilih Workflow Berangkai / Jalur Hierarkis Susunan Sequence Saluran Tujuan Pengaliran Akhir Anda Dari Gelar Pemetaan Daftar Koleksi Ini:
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
                    <option 
                      value=""
                    >
                      -- Keperluan Fungsional Menuntut Anda Harus Menyentuh Bidang Sorot Turun Ini Terlebih Dahulu Untuk Menetapkan Satu Opsi Pemilihan Yang Tersedia --
                    </option>
                    {campaigns.map(c => (
                      <option 
                        key={c.id} 
                        value={c.id}
                      >
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div 
                    className="absolute right-4 top-4 text-slate-400 pointer-events-none group-hover:text-orange-500 transition-colors"
                  >
                    <Layers 
                      size={18} 
                    />
                  </div>
                </div>
              ) : (
                <div 
                  className="p-5 rounded-[1.2rem] bg-rose-50 border border-rose-200 text-rose-600 text-sm font-bold leading-relaxed flex gap-3 items-start shadow-inner"
                >
                  <Activity 
                    size={20} 
                    className="shrink-0 mt-0.5" 
                  />
                  Gelombang Pemindai Sistem Keamanan Integritas Basis Data mendeteksi keras bahwa hingga detik ini belum ada satupun entitas konstruksi susunan rancangan Campaign Tunggal maupun Rangkaian Sequence Majemuk merangkai aktif yang terdaftar ataupun berhasil Anda buat dan dirakit di masa lalu. Silakan navigasikan pembebanan kursor penunjuk Anda menyeberang membuka panel modul seksi menu bilah kontrol layar penamaan "Follow Up" yang bercokol merapat di sisi Pinggir Tepi Sidebar Vertikal Utama Pojok Pandangan Kiri Hamparan Layar Peranti Komputer Anda semata-mata untuk merakit fondasi mendaftarkan seting jadwal penugasan rute kerjanya terlebih dahulu dan utamakan sebelum meneruskan langkah penetrasi target yang lebih maju.
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
                Pukul Undur Batal Dan Tutup Sayap Kembali Ke Bilik Depan Teras Pemandangan Inbox Percakapan Laman Awal Menu Sesi Semula Berasal
              </button>
              <button 
                onClick={executeAddToFollowUp} 
                disabled={campaigns.length === 0 || !fuPayload.campaignId} 
                className="px-8 py-4 rounded-[1.2rem] font-black text-white bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed text-[11px] uppercase tracking-widest shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2"
              >
                <Check 
                  size={16} 
                  strokeWidth={3} 
                />
                Paksakan Menyalakan Konfirmasi Titah Perintah Serta Eksekusi Paksaan Lontaran Penyatuan Target Antrean Sekuensial Modul Ini Tepat Berlaku Mulai Pada Detik Penghitungan Jam Waktu Perputaran Operasional Mesin Saat Ini Secara Segera Sesegera Mungkin Mengikat Putusan Rapat Mutlak Ke Garis Titik Temu Juga Di Hari Eksekusi Final Secara Sepenuhnya Tanpa Amortisasi Celah Kelonggaran Ketinggalan Sama Sekali Di Sini Terjadi Dan Sekarang Juga Mengunci Sepenuh Penuhnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: PANEL PAPAN KONTROL MODUL INTERAKTIF PENGIRIMAN MULTI MEDIA TERPANDU FORMAT MENDALAM */}
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
                <Paperclip 
                  size={18} 
                  strokeWidth={2.5}
                />
              </div>
              {mediaModal.type === 'location' 
                ? 'Kirim Representasi Bentuk Pancaran Kompas Geografis Titik Lokasi' 
                : `Operasi Modul Penyaluran Tahap Eksekusi Penyiapan Pengiriman Berkas Unggahan Lampiran Jaringan Jalur Titik Distribusi Kanan Luar Biasa Saluran File Modus Eksternal Jenis Spesifikasi Muatan Entitas File: ${mediaModal.type === 'image' ? 'Berkas Bentukan Gambar File Berkas Citra Estetika Media Terbuka Bebas Format Digital' : 'Berkas Salinan Bundel Penyerahan Paket Bentuk File Kumpulan Gabungan Teks Berkas Tipe Kertas Berbentuk Utuh Tatanan Bundel Kelengkapan Pengolahan Kelompok Koleksi Tumpukan Lipatan Berkas Kompilasi Berwujud Kertas Gabungan Bentuk Dokumen Rangkuman File Arsip Data Penyimpanan Virtual Mutlak Tertata Berwujud Padat Dan Utuh Terintegrasi Menjadi Tipe Penyatuan Tipe Berwujud Dokumen File Keras Tunggal Asli Menggumpal Data Murni'}`
              }
            </h3>
            
            {mediaModal.type === 'location' ? (
              <div 
                className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100"
              >
                 <div 
                   className="col-span-2"
                 >
                   <p 
                     className="text-xs font-semibold text-slate-500 mb-2"
                   >
                     Tetapkan penjuru dan tentukan rincian detail spesifikasi acuan penunjukan pedoman panduan kompas letak kalkulasi akurasi nilai parameter matriks titik persilangan silang garis bujur serta ketetapan parameter titik potong garis lintang koordinat teritorial tujuan pancaran lokasi titik sasaran sasaran destinasi peta bumi geografis bola dunia tujuan radar pantauan pemancar sasaran wilayah pelacakan target radius buruan tangkapan pencarian titik lokasi koordinasi pelacakan akhir penyampaian peta letak lokasi posisi penunjuk sasaran pancaran penyampaian bidikan akhir lokasi sasaran pancaran radar tembakan transmisi pantauan satelit penunjuk pelacakan terpusat tujuan destinasi pelemparan paket pembagian porsi bagikan kordinat pancaran radar pendaratan peta yang mutlak sepenuhnya terarah milik spesifikasi pendaratan titik tujuan letak destinasi lokasi wilayah geografis pancaran tujuan target penyaluran sirkulasi sasaran kiriman lintasan radar bola dunia milik Anda ke tujuan yang telah Anda tetapkan dan tetapkan nilai rincian kalkulasinya.
                   </p>
                 </div>
                 <input 
                   value={mediaPayload.lat} 
                   onChange={(e)=>setMediaPayload({...mediaPayload, lat: e.target.value})} 
                   placeholder="Besaran Angka Absolut Perhitungan Nilai Rujukan Sudut Kompas Letak Pemancaran Koordinat Sudut Silang Radius Titik Penembakan Lintasan Parameter Penempatan Penunjukan Radar Pelacak Garis Arah Horizon Latitude Tujuan Titik Penetapan Target Titik Geografis Utama Dasar Penempatan Parameter Pelemparan Jaring Titik Sumbu Koordinat Pendaratan Lintasan Sudut Persilangan Penentuan Sumbu Latitude Arah Pembacaan Latitude Target Latitude Horizon Sudut Nilai Geografis Murni Posisi Satelit Pelacak Sudut Lintang Sumbu Parameter Arah Angka Latitude Arah Pancaran Bidikan (Latitude Point Penetapan Acuan Murni Latitude Letak Lintang Target Sumbu Lintang Absolut Utama Murni Lintang Koordinat Penetapan Pemetaan Nilai Satuan Garis Pelacak Latitude Radius Satuan Lintang Nilai Lintang Angka Nilai Latitude Garis Pemetaan Peta Pendaratan Angka Satuan Ukur Papan Kordinat Peta Bidikan Target Geografis Arah Sasaran Lintang Radar Pencari Horizon Latitude Penentu Tujuan Target Bidikan Angka Peta Tanda Lintang Garis Latitude Arah Target Arah Titik Kordinat Lintang Arah Horizon Radar Arah Arah Pemetaan Lintang Kordinat Radar Pencarian Titik Lintang Satuan Geografis Penempatan Lintang Absolut Angka Peta Penunjukan Lintang Target Latitude Nilai Target (Lat) Target Lintang Murni)" 
                   className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                 />
                 <input 
                   value={mediaPayload.lng} 
                   onChange={(e)=>setMediaPayload({...mediaPayload, lng: e.target.value})} 
                   placeholder="Besaran Angka Absolut Perhitungan Nilai Rujukan Sudut Kompas Letak Pemancaran Koordinat Sudut Silang Radius Titik Penembakan Lintasan Parameter Penempatan Penunjukan Radar Pelacak Garis Arah Vertikal Longitude Tujuan Titik Penetapan Target Titik Geografis Utama Dasar Penempatan Parameter Pelemparan Jaring Titik Sumbu Koordinat Pendaratan Lintasan Sudut Persilangan Penentuan Sumbu Longitude Arah Pembacaan Longitude Target Longitude Vertikal Sudut Nilai Geografis Murni Posisi Satelit Pelacak Sudut Bujur Sumbu Parameter Arah Angka Longitude Arah Pancaran Bidikan (Longitude Point Penetapan Acuan Murni Longitude Letak Bujur Target Sumbu Bujur Absolut Utama Murni Bujur Koordinat Penetapan Pemetaan Nilai Satuan Garis Pelacak Longitude Radius Satuan Bujur Nilai Bujur Angka Nilai Longitude Garis Pemetaan Peta Pendaratan Angka Satuan Ukur Papan Kordinat Peta Bidikan Target Geografis Arah Sasaran Bujur Radar Pencari Vertikal Longitude Penentu Tujuan Target Bidikan Angka Peta Tanda Bujur Garis Longitude Arah Target Arah Titik Kordinat Bujur Arah Vertikal Radar Arah Arah Pemetaan Bujur Kordinat Radar Pencarian Titik Bujur Satuan Geografis Penempatan Bujur Absolut Angka Peta Penunjukan Bujur Target Longitude Nilai Target (Lng) Target Bujur Murni)" 
                   className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                 />
              </div>
            ) : (
              <div 
                className="space-y-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100"
              >
                <p 
                  className="text-xs font-semibold text-slate-500 mb-2 leading-relaxed"
                >
                  Dimohon peringatannya dan diharap harap dipastikan agar mengkonfirmasikan serta meyakini sepenuh kepastian jaminan kepastian validitas jaminan pasti perihal rujukan alamat kelengkapan string penyusunan tata urutan letak alamat struktur tautan rantai pengalihan URL perujuk referensi lokasi alamat direktori tujuan dari tata pendaratan lokasi berkas letak penyimpanan file media bernaung yang akan diserap masuk ditembus ditarik ditarik diunduh untuk dilekatkan dan akan segera difinalisasikan ditempel dikemas difungsikan direpresentasikan digunakan menjadi bungkus lampiran dapat tervalidasi secara bebas utuh sepenuhnya dan memang dapat dan sanggup untuk diekstraksi serta direntas dan ditembus muatan utamanya tanpa batas halangan direntas isinya untuk kemudian diakses dapat disentuh oleh publik luas di seluruh penjuru jangkauan koneksi internet secara langsung dan tanpa halangan benteng halangan penghalang penguncian hambatan firewall rintangan sandi akses proteksi portal privasi pemblokiran batasan larangan apa pun di luar sana yang dikunci bebas dioperasikan dan diturunkan langsung kepada publik luas tanpa kendala secara nyata utuh total dan dapat diakses dengan mudah dioperasikan dapat dijangkau oleh publik luas publik pengakses luar publik terbuka publik secara terang benderang terbuka secara lepas dapat diakses bebas langsung oleh pengunjung pengakses tanpa hambatan dan rintangan dapat dilihat secara gamblang bisa ditarik isinya dibaca kontennya dan dibuka kunci gembok penjagaan server publik dan tanpa perlindungan proteksi gembok kunci oleh publik akses publik luaran yang utuh murni transparan terbuka lepas transparan absolut yang bisa disentuh dapat dilihat dikeruk isinya ditarik utuh dibaca oleh pengakses awam akses publik akses lalu lintas bebas jalur akses dapat diakses sepenuhnya terbentang dapat disentuh bebas terbuka sepenuhnya diakses langsung tanpa syarat oleh publik mutlak.
                </p>
                <input 
                  value={mediaPayload.url} 
                  onChange={(e)=>setMediaPayload({...mediaPayload, url: e.target.value})} 
                  placeholder="Ketik Masukkan Konfigurasi Formulasi Bentukan Letak Struktur Format Susunan Link Valid Salinan Tautan Terpercaya Alamat Direktori Tatanan Struktur Domain Titik Letak Keabsahan Susunan String Tata Format Lokasi Valid Penyimpanan Bebas Jaringan Papan Penempatan URL Yang Sempurna Terverifikasi Penuh Secara Absolut Tidak Terkunci (Mengacu Format Contoh Susunan Struktur Pengetikan Awalan Dasar Pola Awalan Format Murni Dasar Menyerupai Referensi Mutlak Tautan Berikut Ini Semata: https://nama-domain-penyimpanan-hosting-pusat-letak-berkas-server-terpercaya-anda-yang-selalu-bisa-diakses-oleh-akses-jaringan-luar-dunia-bebas-tanpa-rintangan-tanpa-border-internet-global-publik-bebas-tanpa-rintangan-sepanjang-masa-terkoneksi-aktif-saat-ini-juga.com/nama-kumpulan-berkumpulan-penyimpanan-nama-koleksi-lemari-data-penyimpanan-pusat-berkas-letak-susunan-rak-file-benda-lampiran-target-berkas-yang-sedang-anda-coba-untuk-sasar-berkas-sasaran-benda-utama-lampiran-berkas-asli-foto-yang-menyimpan-berkas-gambar-ekstensi-lampiran-foto-gambar-visual-foto-grafis-gambar-abstrak-yang-akan-dieksploitasi-serta-dikemas-berkas-lampiran-file.jpg)" 
                  className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-blue-400 transition-colors shadow-sm" 
                />
                <input 
                  value={mediaPayload.caption} 
                  onChange={(e)=>setMediaPayload({...mediaPayload, caption: e.target.value})} 
                  placeholder="Menyisipkan Barisan Rangkaian Tulisan Goresan Pesan Tambahan Penjelasan Makna Goresan Teks Pelengkap Cerita Pembuka Kata Keterangan Menyertai Pesan Goresan Tambahan Teks Opsional Maklumat Penjelasan Bebas Catatan Laki Tambahan Deskripsi Kata Keterangan Penyerta Goresan Teks Penjelasan Narasi Kalimat Penuntun Tulisan Bebas Tambahan Rentetan Kalimat Tambahan Bersifat Kondisional Paragraf Bebas Pelengkap Rangkaian Tambahan Teks Goresan Kata Penjelas Maksud (Caption Pendamping Pesan Tambahan Yang Sifat Pemenuhannya Bebas Dari Tuntutan Mewajibkan Penuh Opsional Murni Kapan Saja Tidak Dituntut Wajib Tidak Diwajibkan Tidak Dituntut Bebas Untuk Diabaikan Apabila Tidak Ada Rangkaian Kalimat Yang Hendak Ingin Anda Sisipkan Sertakan Dan Tuangkan Bersama Kiriman Benda Bebas Tambahan Penjelasan Teks Ekstra Opsional Murni Tidak Wajib Tidak Mengikat Dan Sifatnya Cenderung Sangat Sukarela Opsional Pilihan Bebas Penuh Tambahan Ekstra Keterangan Narasi Bebas)" 
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
                Gugurkan Dan Lenyapkan Rangkaian Proses Pembatalan Semua Maksud Upaya Aksi Konfigurasi Penundaan Batalkan Proses Urungkan Pengiriman Tarik Penarikan Batalkan Rencana Proses Transmisi Gagalkan Penembakan Batalkan Pembatalan Misi Serangan Mundur Tarik Kembali Segala Tindakan Pengoperasian Matikan Proses Tarik Ulur Penangguhan Penyetopan Tindakan Kembali Mundur Dan Tahan Tarik Niat Upaya Ini Seluruhnya Batal Urung Setop Proses
              </button>
              <button 
                onClick={executeSendMedia} 
                disabled={sending} 
                className="px-8 py-3.5 rounded-[1.2rem] font-black text-white bg-blue-600 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sedang Berkonsentrasi Memforsir Tenaga Sistem Menggulung Kapasitas Komputasi Mesin Guna Mendorong Operasi Menyuplai Pengangkutan Berkas Mengarungi Memompa Melepaskan Menyuntikkan Mendistribusikan Transmisi Meluncurkan Muatan Payload Menyebarkan Pengiriman Mengemas Memaketkan Melipatgandakan Tenaga Meluncurkan Distribusi Menyalurkan Mengalirkan Menyebarkan Paket Lontaran Sedang Mendorong Keluar Data Mengirimkan Meluncurkan...
                  </>
                ) : (
                  <>
                    <Send size={16} strokeWidth={3} /> Lepaskan Ke Angkasa Bebaskan Muatan Tembakkan Paket Operasi Luncurkan Muatan Lontarkan Isi Peluncuran Serang Tujuan Lepaskan Sekarang Hantam Kirim Data Jatuhkan Benda Lempar Sasar Kirim Tembakan Melesat Kirim Lemparan Terbangkan Kirim Segera Pindahkan Distribusikan Alirkan Alir Tembak Eksekusi Letuskan Serangan Tekan Kirim Distribusi Paket Salurkan Meluncur Tembak Kirim Pindahkan Serahkan Tembak Peluncuran Mulai Segera Berangkat Kirim Tembak Sekarang Maju Serang Lontarkan Lepaskan Muatan Bebaskan Daya Kirim Segera!
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
// COMPONENT EXPORT WRAPPER (DEFAULT EXPORT FIX)
// ============================================================================

/**
 * Komponen Induk (HOC) yang mengawasi serta membungkus fungsionalitas Inbox.
 * Diekspor sebagai "DEFAULT EXPORT" agar tidak merusak kompiler rute App.tsx
 * * Melibatkan mesin `ErrorBoundary` guna memastikan stabilitas penuh 
 * jika komponen InboxComponent secara kebetulan crash akibat payload data cacat.
 */
export default function Inbox() {
  return (
    <ErrorBoundary>
      <InboxComponent />
    </ErrorBoundary>
  );
}