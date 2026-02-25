import React, { useEffect, useMemo, useState, useRef } from "react";
import { Activity, Clock, Filter, Tag, CheckCheck, X } from "lucide-react";

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
  name?: string; 
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
type CustomLabel = {
  name: string;
  color: string;
};

// ===== HELPERS =====
function normalizeDate(dateStr: string) {
  if (!dateStr) return new Date();
  let safeStr = dateStr;
  if (safeStr.includes(" ") && !safeStr.includes("T")) {
    safeStr = safeStr.replace(" ", "T");
    if (!safeStr.endsWith("Z")) safeStr += "Z";
  }
  const d = new Date(safeStr);
  d.setHours(d.getHours() + 7); // Kompensasi UTC to WIB
  return d;
}

function formatTime(dateStr: string) {
  if (!dateStr) return "";
  const d = normalizeDate(dateStr);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

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

function formatContactName(jid: string, name?: string) {
  if (name && name.trim() !== "" && name !== jid) return name; 
  if (!jid) return "";
  const num = jid.split("@")[0];
  if (jid.includes("@lid")) return `~${num} (LID)`;
  if (jid.includes("@g.us")) return `Grup: ${num}`;
  if (num.startsWith("62")) return `+62 ${num.slice(2)}`;
  return num;
}

export default function Inbox() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [liveTime, setLiveTime] = useState(new Date());

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | string>('all');

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
    if (typeof window !== "undefined") localStorage.setItem("wa_inbox_labels", JSON.stringify(customLabels));
  }, [customLabels]);
  
  // Extract Unique Labels for Filter Chips
  const uniqueLabels = useMemo(() => {
    const map = new Map<string, CustomLabel>();
    Object.values(customLabels).forEach(l => {
      if (!map.has(l.name)) map.set(l.name, l);
    });
    return Array.from(map.values());
  }, [customLabels]);

  const [peer, setPeer] = useState<string>("");
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [msgLimit, setMsgLimit] = useState(100);
  
  const [mediaModal, setMediaModal] = useState<{ open: boolean, type: 'image'|'document'|'location' }>({ open: false, type: 'image' });
  const [mediaPayload, setMediaPayload] = useState({ url: "", caption: "", lat: "", lng: "" });

  const [bcModal, setBcModal] = useState<{ open: boolean, targets: string[] }>({ open: false, targets: [] });
  const [bcPayload, setBcPayload] = useState({ text: "", delay: "2000" });

  const [labelModal, setLabelModal] = useState<{ open: boolean, targets: string[] }>({ open: false, targets: [] });
  const [labelPayload, setLabelPayload] = useState({ name: "VIP", color: "bg-amber-500" });
  
  const [fuModal, setFuModal] = useState<{ open: boolean, targets: string[] }>({ open: false, targets: [] });
  const [fuPayload, setFuPayload] = useState({ campaignId: "" });
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  // SMART SORTING & FILTERING
  const filteredConvs = useMemo(() => {
    let result = [...convs].sort((a, b) => {
      const tA = normalizeDate(a.lastMessage?.time || "").getTime();
      const tB = normalizeDate(b.lastMessage?.time || "").getTime();
      return tB - tA; 
    });

    // 1. Search Query Filter
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

    // 2. Chips Filter (Unread & Labels)
    if (activeFilter === 'unread') {
      result = result.filter(c => c.unreadCount > 0);
    } else if (activeFilter.startsWith('label_')) {
      const lblName = activeFilter.replace('label_', '');
      result = result.filter(c => customLabels[c.remoteJid.split('@')[0]]?.name === lblName);
    }

    return result;
  }, [convs, searchQuery, customLabels, activeFilter]);

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

  useEffect(() => { if (isAtBottom) scrollToBottom("smooth"); }, [messages.length]);

  useEffect(() => {
    if (peer) {
      setMsgLimit(100);
      setAttachOpen(false);
      setMessages([]); 
      setTimeout(() => { scrollToBottom("auto"); setIsAtBottom(true); }, 100);
      
      // Auto Read trigger
      apiFetch("/ui/conversations/read", { method: "POST", body: JSON.stringify({ sessionKey, peer }) }).catch(()=>{});
    }
  }, [peer]);

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
      if (res.data?.length > 0) setFuPayload(p => ({ ...p, campaignId: String(res.data[0].id) }));
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
    } catch (e: any) { setErr(e.message); }
  }

  async function loadMessages(sk: string, p: string, limit: number) {
    try {
      const pNum = p.includes("@") ? p.split("@")[0] : p;
      const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(`/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(pNum)}&limit=${limit}`);
      setMessages(prev => {
        const newMsgs = res.messages || [];
        if (prev.length === newMsgs.length && prev[0]?.id === newMsgs[0]?.id && prev[0]?.status === newMsgs[0]?.status) return prev;
        return newMsgs;
      });
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => { loadSessions(); loadLeads(); loadCampaigns(); }, []);

  useEffect(() => {
    if (!sessionKey) return;
    loadConvs(sessionKey);
    const t = setInterval(() => loadConvs(sessionKey), 5000);
    return () => clearInterval(t);
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer, msgLimit);
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
      scrollToBottom("smooth");
    } catch (e: any) { setErr(e.message); } finally { setSending(false); }
  }

  const togglePeerSelection = (jid: string) => setSelectedPeers(p => p.includes(jid) ? p.filter(x => x !== jid) : [...p, jid]);

  async function executeDeleteChats() {
    if (!confirm(`Yakin ingin menghapus ${selectedPeers.length} percakapan?`)) return;
    try {
      await apiFetch("/ui/conversations/delete", { method: "POST", body: JSON.stringify({ sessionKey, peers: selectedPeers }) });
      if (selectedPeers.includes(peer)) setPeer(""); 
      setSelectedPeers([]); setIsSelectionMode(false); loadConvs(sessionKey);
    } catch (e: any) { alert("Error: " + e.message); }
  }

  async function executeScheduleBroadcast() {
    if (!bcPayload.text.trim()) return alert("Pesan tidak boleh kosong");
    try {
      const cleanTargets = bcModal.targets.map(t => t.split('@')[0]);
      await apiFetch("/broadcast/create", {
        method: "POST",
        body: JSON.stringify({ sessionKey, text: bcPayload.text, delayMs: Number(bcPayload.delay), name: `Inbox Broadcast (${cleanTargets.length} target)`, targets: cleanTargets }),
      });
      setBcModal({ open: false, targets: [] }); setBcPayload({ text: "", delay: "2000" });
      setSelectedPeers([]); setIsSelectionMode(false);
      alert(`✅ Broadcast ke ${cleanTargets.length} nomor berhasil dikirim ke antrean!`);
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  async function executeAddToFollowUp() {
    if (!fuPayload.campaignId) return alert("Pilih campaign terlebih dahulu");
    try {
      const cleanTargets = fuModal.targets.map(t => t.split('@')[0]);
      await apiFetch("/followup/add-targets", {
        method: "POST",
        body: JSON.stringify({ sessionKey, campaignId: fuPayload.campaignId, targets: cleanTargets })
      });
      setFuModal({ open: false, targets: [] }); setSelectedPeers([]); setIsSelectionMode(false);
      alert(`✅ ${cleanTargets.length} target berhasil ditambahkan ke antrean Auto Follow Up!`);
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  async function executeSetLabel() {
    if (!labelPayload.name.trim()) return;
    try {
      setCustomLabels(prev => {
        const next = { ...prev };
        labelModal.targets.forEach(t => next[t.split('@')[0]] = { name: labelPayload.name, color: labelPayload.color });
        return next;
      });
      apiFetch("/leads/label", { method: "POST", body: JSON.stringify({ targets: labelModal.targets.map(t=>t.split('@')[0]), label: labelPayload.name, color: labelPayload.color }) }).catch(() => {});
      setLabelModal({ open: false, targets: [] }); setSelectedPeers([]); setIsSelectionMode(false);
    } catch (e: any) { alert("Gagal: " + e.message); }
  }

  const removeLabel = (targetNum: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
      await apiFetch(isLoc ? '/messages/send-location' : '/messages/send-media', { method: "POST", body: JSON.stringify(payload) });
      setMediaModal({ open: false, type: 'image' }); setMediaPayload({ url: "", caption: "", lat: "", lng: "" }); loadMessages(sessionKey, peer, msgLimit);
    } catch (e: any) { alert("Pengiriman Gagal: " + e.message); } finally { setSending(false); }
  }

  const currentConv = convs.find(c => c.remoteJid === peer);
  const currentLead = leads.find(l => l.to_number === peerNumber);
  const currentLabel = customLabels[peerNumber];

  return (
    <div className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem] relative">
      
      {/* SIDEBAR */}
      <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl shrink-0 relative z-10">
        
        {/* Sidebar Header */}
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/20 shrink-0">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pilih Sesi</label>
              <span className="text-[9px] font-black text-emerald-500 tracking-widest flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} className="bg-transparent text-sm font-black text-slate-800 outline-none cursor-pointer appearance-none">
              {sessions.map(s => <option key={s.session_key} value={s.session_key}>📱 {s.session_key}</option>)}
            </select>
          </div>
          <button 
            onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedPeers([]); }}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm border transition-all ${isSelectionMode ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/60 text-slate-500 border-white hover:text-blue-600'}`}
          >
            <CheckCheck size={18} strokeWidth={2.5}/>
          </button>
        </div>

        {/* Search & Filter Chips */}
        <div className="p-4 shrink-0 border-b border-white/20 bg-white/10">
          <div className="relative mb-3">
            <input 
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pesan atau nama..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/50 border border-white/80 text-sm font-medium outline-none focus:bg-white/90 transition-all shadow-sm"
            />
            <Filter size={16} className="absolute left-4 top-3.5 text-slate-400" />
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
             <button onClick={() => setActiveFilter('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white/60 text-slate-500 hover:bg-white'}`}>Semua</button>
             <button onClick={() => setActiveFilter('unread')} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeFilter === 'unread' ? 'bg-emerald-500 text-white' : 'bg-white/60 text-emerald-600 hover:bg-white'}`}>Belum Dibaca</button>
             {uniqueLabels.map(l => (
               <button key={l.name} onClick={() => setActiveFilter(`label_${l.name}`)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${activeFilter === `label_${l.name}` ? l.color + ' text-white border-transparent' : 'bg-white/60 text-slate-600 hover:bg-white'}`}>
                 {l.name}
               </button>
             ))}
          </div>
        </div>

        {/* List Convs */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 scrollbar-hide pb-24">
          {filteredConvs.map(c => {
            const cNum = c.remoteJid.split('@')[0];
            const isActive = peer === c.remoteJid && !isSelectionMode;
            const isSelected = selectedPeers.includes(c.remoteJid);
            const isLead = leads.find(l => l.to_number === cNum);
            const lLabel = customLabels[cNum];
            const isUnread = c.unreadCount > 0;
            const contactDisplayName = formatContactName(c.remoteJid, c.name);
            
            return (
              <div 
                key={c.remoteJid}
                onClick={() => isSelectionMode ? togglePeerSelection(c.remoteJid) : setPeer(c.remoteJid)}
                className={`p-3.5 flex items-center gap-3.5 rounded-[1.5rem] cursor-pointer transition-all duration-300 ${
                  isActive ? "bg-white/90 shadow-md shadow-blue-500/10 border border-white scale-[1.02]" :
                  isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-white/60 border border-transparent"
                }`}
              >
                {/* Avatar */}
                {isSelectionMode ? (
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border-2 transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200'}`}>
                    {isSelected && <CheckCheck size={18} strokeWidth={3} />}
                  </div>
                ) : (
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 border border-white shadow-sm ${
                    isActive ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white" : "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500"
                  }`}>
                    {contactDisplayName.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    {/* UI FIX: Tebalkan font jika unread */}
                    <h3 className={`text-[14px] truncate tracking-tight ${isUnread ? 'font-black text-slate-900' : 'font-extrabold text-slate-800'}`}>
                      {contactDisplayName}
                    </h3>
                    <span className={`text-[9px] font-bold uppercase tracking-tighter shrink-0 ${isUnread ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {formatChatDate(c.lastMessage?.time, liveTime)}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {lLabel && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-white shadow-sm flex items-center gap-1 ${lLabel.color}`}>
                        {lLabel.name} 
                        {isActive && <X size={8} className="cursor-pointer hover:scale-125" onClick={(e) => removeLabel(cNum, e)} />}
                      </span>
                    )}
                    {isLead && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                        isLead.has_replied ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}>
                        {isLead.has_replied ? '🔥 Hot' : '❄️ Cold'}
                      </span>
                    )}
                  </div>
                  
                  {/* UI FIX: Bedakan preview text */}
                  <p className={`text-[12px] truncate ${isUnread ? 'text-slate-800 font-bold' : 'text-slate-500 font-medium opacity-80'}`}>
                    {c.lastMessage?.direction === 'out' && <span className="text-blue-500 font-black mr-1">✓</span>}
                    {c.lastMessage?.text || '[Media]'}
                  </p>
                </div>

                {/* Indikator Unread */}
                {isUnread && !isSelectionMode && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] flex items-center justify-center font-black shadow-lg shrink-0 animate-pulse">
                    {c.unreadCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* BULK ACTION BAR */}
        {isSelectionMode && selectedPeers.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900 rounded-[2rem] p-4 shadow-2xl border border-slate-700 flex items-center justify-between animate-in slide-in-from-bottom-6 z-50">
             <span className="text-xs font-black text-white px-2">{selectedPeers.length} Dipilih</span>
             <div className="flex gap-2">
                <button onClick={() => setLabelModal({ open: true, targets: selectedPeers })} className="p-2.5 bg-slate-800 hover:bg-indigo-600 rounded-xl text-white transition-colors" title="Beri Label"><Tag size={16} strokeWidth={2.5}/></button>
                <button onClick={() => setBcModal({ open: true, targets: selectedPeers })} className="p-2.5 bg-slate-800 hover:bg-emerald-600 rounded-xl text-white transition-colors" title="Jadwalkan Broadcast"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg></button>
                <button onClick={() => setFuModal({ open: true, targets: selectedPeers })} className="p-2.5 bg-slate-800 hover:bg-orange-500 rounded-xl text-white transition-colors" title="Jadwalkan Follow Up"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>
                <button onClick={executeDeleteChats} className="p-2.5 bg-slate-800 hover:bg-rose-600 rounded-xl text-white transition-colors" title="Hapus"><Trash2 size={16} strokeWidth={2.5}/></button>
             </div>
          </div>
        )}
      </div>

      {/* CHAT VIEW */}
      {peer ? (
        <div className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20">
          
          <div className="h-24 px-8 flex items-center border-b border-white/20 bg-white/40 backdrop-blur-xl z-20 shrink-0 shadow-sm justify-between">
            <div className="flex items-center flex-1 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-blue-500 border border-white mr-5 shrink-0">
                {(currentConv?.name ? currentConv.name.charAt(0) : peer.charAt(0)).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 truncate">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight truncate">{formatContactName(peer, currentConv?.name)}</h2>
                  {currentLabel && (
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest text-white shadow-sm ${currentLabel.color}`}>
                      {currentLabel.name}
                    </span>
                  )}
                  {currentLead && (
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                      currentLead.has_replied ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}>
                      {currentLead.has_replied ? '🔥 Hot Lead' : '❄️ Cold Lead'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                  <p className="text-[10px] text-slate-500 font-bold tracking-[0.1em] uppercase">Terhubung E2E</p>
                  <span className="text-[8px] ml-2 text-slate-400 bg-white/50 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold uppercase tracking-widest">
                     <Activity size={10} className="text-emerald-500 animate-pulse" /> Live
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setLabelModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-xl bg-white text-slate-500 hover:text-indigo-600 flex items-center justify-center shadow-sm border border-white transition-all hover:scale-110" title="Ubah Label"><Tag size={18} strokeWidth={2.5}/></button>
              <button onClick={() => setBcModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-xl bg-white text-slate-500 hover:text-emerald-600 flex items-center justify-center shadow-sm border border-white transition-all hover:scale-110" title="Kirim Broadcast"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg></button>
              <button onClick={() => setFuModal({ open: true, targets: [peer] })} className="w-10 h-10 rounded-xl bg-white text-slate-500 hover:text-orange-500 flex items-center justify-center shadow-sm border border-white transition-all hover:scale-110" title="Jadwalkan Follow Up"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>
            </div>
          </div>

          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 scrollbar-hide scroll-smooth relative"
          >
            <div className="flex flex-col items-center mb-8 gap-4">
              <div className="bg-amber-50/80 border border-amber-100 text-amber-700 text-[10px] font-bold px-6 py-3 rounded-xl max-w-sm text-center leading-relaxed shadow-sm backdrop-blur-sm">
                🔒 Riwayat pesan disinkronkan secara End-to-End. Pesan Anda aman dan tidak dapat dibaca oleh pihak ketiga.
              </div>
              
              {messages.length >= msgLimit && (
                <button onClick={() => { setMsgLimit(m => m + 100); setIsAtBottom(false); }} className="px-5 py-2 bg-white/80 border border-white text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm hover:scale-105 transition-all">
                  Muat Pesan Sebelumnya
                </button>
              )}
            </div>

            {/* FIX: Hapus .reverse() agar pesan terbaru selalu di bawah seperti WA Asli */}
            {messages.map((m) => {
              const isOut = m.direction === "out";
              return (
                <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[75%] px-6 py-4 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.04)] relative transition-all duration-500 ${
                    isOut ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-none" : "bg-white/90 backdrop-blur-xl text-slate-700 rounded-tl-none border border-white"
                  }`}>
                    {m.type === 'image' && <div className="mb-2 text-xs font-black opacity-80 uppercase tracking-widest">📷 Gambar</div>}
                    {m.type === 'document' && <div className="mb-2 text-xs font-black opacity-80 uppercase tracking-widest">📄 Dokumen</div>}
                    {m.type === 'location' && <div className="mb-2 text-xs font-black opacity-80 uppercase tracking-widest">📍 Lokasi Peta</div>}

                    <p className="text-[15px] leading-relaxed font-medium break-words">{m.text || (m.type !== 'text' ? '[Lampiran]' : '')}</p>
                    
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

          {/* Input Area */}
          <div className="p-6 md:p-8 bg-transparent z-20 shrink-0 border-t border-white/20 relative">
            {attachOpen && (
              <div className="absolute bottom-28 left-8 bg-white/95 backdrop-blur-xl border border-white/80 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2 z-50 animate-in slide-in-from-bottom-4 min-w-[220px]">
                <button onClick={() => { setMediaModal({ open: true, type: 'document' }); setAttachOpen(false); }} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-2xl text-slate-700 font-bold transition-all text-sm w-full text-left">
                  <span className="text-blue-500 text-xl drop-shadow-sm">📄</span> Kirim URL Dokumen
                </button>
                <button onClick={() => { setMediaModal({ open: true, type: 'image' }); setAttachOpen(false); }} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-2xl text-slate-700 font-bold transition-all text-sm w-full text-left">
                  <span className="text-emerald-500 text-xl drop-shadow-sm">📷</span> Kirim URL Gambar
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
                <Plus size={20} strokeWidth={3} />
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

      {/* MODAL LABELS */}
      {labelModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl border border-white">
            <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">Tandai Label Kustom</h3>
            <p className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-widest">{labelModal.targets.length} Nomor Dipilih</p>
            
            {/* Quick Pick Existing Labels */}
            {uniqueLabels.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {uniqueLabels.map(l => (
                  <span key={l.name} onClick={() => setLabelPayload({name: l.name, color: l.color})} className={`cursor-pointer px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition-transform hover:scale-105 ${l.color}`}>
                    {l.name}
                  </span>
                ))}
              </div>
            )}

            <input value={labelPayload.name} onChange={(e)=>setLabelPayload({...labelPayload, name: e.target.value})} placeholder="Ketik label baru..." className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 mb-4" />
            <div className="flex gap-2 mb-8">
              {['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-slate-800'].map(color => (
                <div key={color} onClick={() => setLabelPayload({...labelPayload, color})} className={`w-8 h-8 rounded-full cursor-pointer border-4 ${color} ${labelPayload.color === color ? 'border-blue-200 scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`} />
              ))}
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setLabelModal({ open: false, targets: [] })} className="px-6 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 text-xs uppercase tracking-widest">Batal</button>
              <button onClick={executeSetLabel} className="px-6 py-3 rounded-xl font-bold text-white bg-blue-600 text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LAINNYA (DIPERSINGKAT UNTUK RUANG) */}
      {bcModal.open && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in"><div className="w-full max-w-lg bg-white rounded-[3rem] p-10 shadow-2xl border border-white"><h3 className="text-3xl font-black text-slate-800 tracking-tight mb-1">Jadwalkan Broadcast</h3><textarea rows={5} value={bcPayload.text} onChange={(e)=>setBcPayload({...bcPayload, text: e.target.value})} placeholder="Ketik pesan..." className="w-full px-6 py-4 rounded-[2rem] bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 mb-8 resize-none mt-4" /><div className="flex gap-3 justify-end"><button onClick={() => setBcModal({ open: false, targets: [] })} className="px-8 py-4 rounded-2xl font-black text-slate-500 bg-slate-100 text-[10px] uppercase tracking-widest">Batal</button><button onClick={executeScheduleBroadcast} className="px-8 py-4 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 transition-all">Mulai Broadcast</button></div></div></div>)}
      {fuModal.open && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in"><div className="w-full max-w-lg bg-white rounded-[3rem] p-10 shadow-2xl border border-white"><h3 className="text-3xl font-black text-slate-800 tracking-tight mb-6">Auto Follow Up</h3><select value={fuPayload.campaignId} onChange={(e)=>setFuPayload({...fuPayload, campaignId: e.target.value})} className="w-full px-6 py-4 rounded-[2rem] bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 appearance-none cursor-pointer mb-8">{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="flex gap-3 justify-end"><button onClick={() => setFuModal({ open: false, targets: [] })} className="px-8 py-4 rounded-2xl font-black text-slate-500 bg-slate-100 text-[10px] uppercase tracking-widest">Batal</button><button onClick={executeAddToFollowUp} className="px-8 py-4 rounded-2xl font-black text-white bg-orange-500 hover:bg-orange-600 text-[10px] uppercase tracking-widest shadow-lg shadow-orange-500/30 transition-all">Tambahkan Target</button></div></div></div>)}

    </div>
  );
}