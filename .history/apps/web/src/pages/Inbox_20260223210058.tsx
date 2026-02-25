import { useEffect, useMemo, useState, useRef } from "react";

// =========================================================================
// CATATAN UNTUK LOKAL ANDA (MATIKS-MACBOOK-PRO):
// Hapus blok fungsi MOCK di bawah ini, lalu aktifkan (uncomment) 3 baris
// import berikut agar menggunakan API asli Anda:
//
// import { apiFetch } from "../lib/api";
// import { dedupeByRemoteJid } from "../lib/dedupe";
// import { sendMedia } from "../lib/upload";
// =========================================================================

// --- MOCK FUNCTION START (AGAR PREVIEW CANVAS TIDAK ERROR) ---
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  if (url.includes("/ui/sessions")) {
    return { ok: true, sessions: [{ session_key: "default-session", status: "connected" }] } as any;
  }
  if (url.includes("/ui/conversations")) {
    return { 
      ok: true, 
      conversations: [
        { chatId: 1, remoteJid: "628123456789@s.whatsapp.net", unreadCount: 0, lastMessage: { id: 1, direction: "in", type: "text", text: "Halo, ada yang bisa dibantu?", time: new Date().toISOString() } },
        { chatId: 2, remoteJid: "628987654321@s.whatsapp.net", unreadCount: 2, lastMessage: { id: 2, direction: "out", type: "text", text: "Baik, terima kasih infonya.", time: new Date(Date.now() - 86400000).toISOString() } }
      ] 
    } as any;
  }
  if (url.includes("/ui/messages")) {
    return { 
      ok: true, 
      remoteJid: "628123456789@s.whatsapp.net", 
      messages: [
        { id: 1, direction: "in", type: "text", text: "Halo, ada yang bisa dibantu?", time: new Date().toISOString(), status: "read" }
      ] 
    } as any;
  }
  return { ok: true } as any;
}
function dedupeByRemoteJid(items: any[]) {
  const seen = new Set();
  return items.filter(item => {
    const duplicate = seen.has(item.remoteJid);
    seen.add(item.remoteJid);
    return !duplicate;
  });
}
async function sendMedia(kind: string, data: any, file: File) {
  return { ok: true };
}
// --- MOCK FUNCTION END ---

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
  // --- STATE LAMA (LOGIKA ASLI) ---
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [peer, setPeer] = useState<string>("");

  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [locModal, setLocModal] = useState(false);
  const [lat, setLat] = useState("-6.2");
  const [lng, setLng] = useState("106.8");
  const [locName, setLocName] = useState("Lokasi");
  const [locAddr, setLocAddr] = useState("");

  // --- STATE TAMBAHAN UI (PENCARIAN, LAMPIRAN & SCROLL) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

  const filteredConvs = useMemo(() => {
    if (!searchQuery) return convs;
    return convs.filter(c => c.remoteJid.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [convs, searchQuery]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ===== LOGIKA DATA ASLI ANDA =====
  async function loadSessions() {
    const res = await apiFetch<{ ok: true; sessions: any[] }>("/ui/sessions");
    const list = (res.sessions || []).map(s => ({ session_key: s.session_key, status: s.status }));
    setSessions(list);
    if (!sessionKey && list.length) setSessionKey(list[0].session_key);
  }

  async function loadConvs(sk: string) {
    const res = await apiFetch<{ ok: true; conversations: ConvRow[] }>(`/ui/conversations?sessionKey=${encodeURIComponent(sk)}`);
    setConvs(dedupeByRemoteJid(res.conversations || []));
    if (!peer && res.conversations?.length) setPeer(res.conversations[0].remoteJid);
  }

  async function loadMessages(sk: string, p: string) {
    const pNum = p.includes("@") ? p.split("@")[0] : p;
    const res = await apiFetch<{ ok: true; remoteJid: string; messages: MsgRow[] }>(
      `/ui/messages?sessionKey=${encodeURIComponent(sk)}&peer=${encodeURIComponent(pNum)}&limit=50`
    );
    setMessages(res.messages || []);
  }

  useEffect(() => {
    (async () => {
      try { setErr(null); await loadSessions(); } catch (e:any) { setErr(e?.message || "error"); }
    })();
  }, []);

  useEffect(() => {
    if (!sessionKey) return;
    loadConvs(sessionKey).catch(e => setErr(e?.message || "error"));
    const t = setInterval(() => loadConvs(sessionKey).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey || !peer) return;
    loadMessages(sessionKey, peer).catch(e => setErr(e?.message || "error"));
    const t = setInterval(() => loadMessages(sessionKey, peer).catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [sessionKey, peer]);

  // ===== ACTIONS ASLI ANDA =====
  async function sendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      setErr(null);
      await apiFetch(`/messages/send`, {
        method: "POST",
        body: JSON.stringify({ sessionKey, to: peerNumber, text: text.trim() }),
      });
      setText("");
      await loadMessages(sessionKey, peer);
      await loadConvs(sessionKey);
      scrollToBottom();
    } catch (e: any) {
      setErr(e?.message || "error");
    } finally {
      setSending(false);
    }
  }

  async function onPickFile(kind: "image"|"document"|"video", file: File | null) {
    if (!file || sending) return;
    setAttachOpen(false);
    setSending(true);
    try {
      setErr(null);
      await sendMedia(kind, { sessionKey, to: peerNumber, caption: text.trim() || undefined }, file);
      setText("");
      await loadMessages(sessionKey, peer);
      await loadConvs(sessionKey);
      scrollToBottom();
    } catch (e:any) {
      setErr(e?.message || "error");
    } finally {
      setSending(false);
    }
  }

  async function sendLocationNow() {
    if (sending) return;
    setSending(true);
    try {
      setErr(null);
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) throw new Error("lat/lng tidak valid");
      await apiFetch(`/messages/send-location`, {
        method: "POST",
        body: JSON.stringify({
          sessionKey,
          to: peerNumber,
          latitude,
          longitude,
          name: locName || undefined,
          address: locAddr || undefined,
        }),
      });
      setLocModal(false);
      await loadMessages(sessionKey, peer);
      await loadConvs(sessionKey);
      scrollToBottom();
    } catch (e:any) {
      setErr(e?.message || "error");
    } finally {
      setSending(false);
    }
  }

  // ===== UI RENDER (WHATSAPP WEB CLONE) =====
  return (
    <div style={{ display: "flex", height: "calc(100vh - 40px)", background: "#0a1014", color: "#e9edef", fontFamily: "Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif" }}>
      
      {/* LEFT PANEL: Sidebar */}
      <div style={{ width: "35%", minWidth: 320, maxWidth: 420, display: "flex", flexDirection: "column", borderRight: "1px solid #222d34", background: "#111b21" }}>
        
        {/* Header Profil */}
        <div style={{ padding: "10px 16px", background: "#202c33", display: "flex", alignItems: "center", gap: 12, height: 60, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#6b7c85", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18 }}>📱</div>
          <select value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} style={{ ...select, flex: 1, height: 36, padding: "0 10px" }}>
            {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} • {s.status}</option>)}
          </select>
        </div>

        {/* Search Bar */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #222d34" }}>
          <div style={{ background: "#202c33", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center" }}>
            <span style={{ opacity: 0.5, marginRight: 10 }}>🔍</span>
            <input 
              value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)}
              placeholder="Cari atau mulai chat baru" 
              style={{ background: "transparent", border: "none", color: "#d1d7db", outline: "none", width: "100%", fontSize: 14 }} 
            />
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: "auto", background: "#111b21" }}>
          {filteredConvs.length === 0 && <div style={{ padding: 20, textAlign: "center", opacity: 0.5, fontSize: 13 }}>Tidak ada obrolan</div>}
          {filteredConvs.map((c) => (
            <div
              key={c.remoteJid}
              onClick={() => setPeer(c.remoteJid)}
              style={{
                display: "flex",
                padding: "0 12px",
                background: peer === c.remoteJid ? "#2a3942" : "transparent",
                cursor: "pointer",
              }}
              className="chat-item-hover"
            >
              <div style={{ padding: "12px 0", marginRight: 15 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#dfe5e7", color: "#111b21", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 20, fontWeight: "bold" }}>
                  {c.remoteJid.charAt(0).toUpperCase()}
                </div>
              </div>
              <div style={{ flex: 1, padding: "12px 0", borderBottom: peer === c.remoteJid ? "none" : "1px solid #222d34", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 16, color: "#e9edef" }}>{c.remoteJid.replace("@s.whatsapp.net", "")}</span>
                  <span style={{ fontSize: 12, color: c.unreadCount > 0 ? "#00a884" : "#8696a0" }}>{c.lastMessage?.time ? formatChatDate(c.lastMessage.time) : ""}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: "#8696a0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                    {c.lastMessage?.direction === "out" ? "✓ " : ""}
                    {c.lastMessage?.type === "image" ? "📷 Foto" : c.lastMessage?.type === "video" ? "🎬 Video" : c.lastMessage?.type === "document" ? "📄 Dokumen" : c.lastMessage?.text || c.lastMessage?.type}
                  </span>
                  {c.unreadCount > 0 && (
                    <div style={{ background: "#00a884", color: "#111b21", fontSize: 12, fontWeight: 500, padding: "2px 6px", borderRadius: 10, minWidth: 20, textAlign: "center" }}>
                      {c.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: Chat Window */}
      {peer ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0b141a", position: "relative" }}>
          
          {/* Default WhatsApp Web background pattern effect (subtle) */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.06, pointerEvents: "none", backgroundImage: 'url("https://static.whatsapp.net/rsrc.php/v3/yl/r/r2-oHq4Dk9J.png")', backgroundSize: "400px" }}></div>

          {/* Chat Header */}
          <div style={{ padding: "10px 16px", background: "#202c33", display: "flex", alignItems: "center", height: 60, flexShrink: 0, zIndex: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#dfe5e7", color: "#111b21", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16, fontWeight: "bold", marginRight: 15 }}>
              {peer.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, color: "#e9edef" }}>{peer.replace("@s.whatsapp.net", "")}</div>
            </div>
            {err && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{err}</div>}
          </div>

          {/* Chat Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 5%", display: "flex", flexDirection: "column", zIndex: 10 }}>
            {messages.slice().reverse().map((m, idx, arr) => {
              const isOut = m.direction === "out";
              const showTail = idx === 0 || arr[idx - 1].direction !== m.direction;
              
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", marginBottom: showTail ? 8 : 2 }}>
                  <div style={{
                    maxWidth: "65%",
                    padding: "6px 7px 8px 9px",
                    borderRadius: 8,
                    borderTopLeftRadius: !isOut && showTail ? 0 : 8,
                    borderTopRightRadius: isOut && showTail ? 0 : 8,
                    background: isOut ? "#005c4b" : "#202c33",
                    position: "relative",
                    boxShadow: "0 1px 0.5px rgba(11,20,26,.13)"
                  }}>
                    {/* Tail SVG Placeholder */}
                    {showTail && (
                      <div style={{ position: "absolute", top: 0, [isOut ? "right" : "left"]: -8, color: isOut ? "#005c4b" : "#202c33" }}>
                        <svg viewBox="0 0 8 13" width="8" height="13"><path opacity=".13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path><path fill="currentColor" d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"></path></svg>
                      </div>
                    )}

                    {/* Media Content */}
                    {m.media?.url && (
                      <div style={{ marginBottom: 4 }}>
                        {m.type === 'image' ? (
                           <img src={m.media.url} alt="media" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 6 }} />
                        ) : m.type === 'video' ? (
                           <video src={m.media.url} controls style={{ width: "100%", maxHeight: 300, borderRadius: 6 }} />
                        ) : (
                           <a href={m.media.url} target="_blank" rel="noreferrer" style={{ display: "block", padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 6, color: "#e9edef", textDecoration: "none" }}>
                             📄 Buka Dokumen {m.media.name ? `(${m.media.name})` : ''}
                           </a>
                        )}
                      </div>
                    )}
                    
                    {m.location && (
                      <div style={{ marginBottom: 4, padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>
                         📍 {m.location.name || "Location"} <br/>
                         <a href={`https://maps.google.com/?q=${m.location.latitude},${m.location.longitude}`} target="_blank" rel="noreferrer" style={{ color:"#53bdeb", fontSize: 13 }}>Buka di Maps</a>
                      </div>
                    )}

                    {/* Text Content */}
                    <div style={{ fontSize: 14.2, lineHeight: "19px", color: "#e9edef", whiteSpace: "pre-wrap", paddingRight: 40 }}>
                      {m.text || (m.type !== "text" && !m.media?.url && !m.location ? `[${m.type}]` : "")}
                    </div>

                    {/* Meta (Time & Status) */}
                    <div style={{ float: "right", marginTop: -14, marginLeft: 10, display: "flex", alignItems: "center", gap: 3, opacity: 0.6, fontSize: 11 }}>
                      <span>{formatTime(m.time)}</span>
                      {isOut && (
                        <span>
                           {m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : m.status === 'sent' ? '✓' : '🕒'}
                        </span>
                      )}
                    </div>
                    {/* Clearfix for float */}
                    <div style={{ clear: "both" }}></div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Footer / Input */}
          <div style={{ padding: "10px 16px", background: "#202c33", display: "flex", alignItems: "flex-end", gap: 10, zIndex: 10 }}>
            
            {/* Attachment Button & Popup */}
            <div style={{ position: "relative", marginBottom: 6 }}>
              <button onClick={() => setAttachOpen(!attachOpen)} style={{ background: "transparent", border: "none", color: "#8696a0", fontSize: 24, cursor: "pointer", padding: "0 8px" }}>
                📎
              </button>
              {attachOpen && (
                <div style={{ position: "absolute", bottom: 50, left: 0, background: "#233138", borderRadius: 16, padding: "12px", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 5px rgba(0,0,0,0.3)" }}>
                  <label style={attachItem}>
                    <div style={{...attachIcon, background: "#007bfc"}}>📄</div> <span style={{fontSize: 14}}>Dokumen</span>
                    <input type="file" style={{display:"none"}} onChange={(e)=>onPickFile("document", e.target.files?.[0] || null)} />
                  </label>
                  <label style={attachItem}>
                    <div style={{...attachIcon, background: "#005c4b"}}>📷</div> <span style={{fontSize: 14}}>Foto/Video</span>
                    <input type="file" accept="image/*,video/*" style={{display:"none"}} onChange={(e)=>{
                       const f = e.target.files?.[0];
                       if(f) onPickFile(f.type.startsWith("video/") ? "video" : "image", f);
                    }} />
                  </label>
                  <button style={{...attachItem, border:"none", width:"100%", textAlign:"left", cursor:"pointer"}} onClick={()=>{ setLocModal(true); setAttachOpen(false); }}>
                     <div style={{...attachIcon, background: "#d3396d"}}>📍</div> <span style={{fontSize: 14, color: "#e9edef"}}>Lokasi</span>
                  </button>
                </div>
              )}
            </div>

            {/* Text Input */}
            <div style={{ flex: 1, background: "#2a3942", borderRadius: 8, padding: "9px 12px" }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder="Ketik pesan"
                rows={1}
                style={{ width: "100%", background: "transparent", border: "none", color: "#e9edef", outline: "none", fontSize: 15, fontFamily: "inherit", resize: "none", maxHeight: 100 }}
              />
            </div>
            
            {/* Send Button */}
            <button 
               onClick={sendText} 
               disabled={!text.trim() || sending}
               style={{ background: "transparent", border: "none", color: text.trim() ? "#00a884" : "#8696a0", fontSize: 24, cursor: text.trim() ? "pointer" : "default", padding: "0 8px", marginBottom: 6 }}
            >
              {sending ? "⏳" : "➤"}
            </button>
          </div>

        </div>
      ) : (
        /* Empty State Window */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#222d34", borderBottom: "6px solid #00a884" }}>
          <div style={{ fontSize: 60, opacity: 0.5, marginBottom: 20 }}>💬</div>
          <h1 style={{ color: "#e9edef", fontWeight: 300, margin: "0 0 10px 0" }}>WhatsApp SaaS Inbox</h1>
          <p style={{ color: "#8696a0", fontSize: 14, maxWidth: 400, textAlign: "center", lineHeight: "1.6" }}>
            Kirim dan terima pesan secara realtime. Pilih kontak dari menu sebelah kiri untuk mulai mengobrol.
          </p>
        </div>
      )}

      {/* Modal Overlay Location */}
      {locModal && (
        <div style={overlay} onClick={()=>setLocModal(false)}>
          <div style={modal} onClick={(e)=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 15 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Kirim Lokasi</div>
              <button style={{background:"transparent", border:"none", color:"#e9edef", cursor:"pointer"}} onClick={()=>setLocModal(false)}>✕</button>
            </div>
            <div style={{ display:"grid", gap:12 }}>
              <input value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="Latitude" style={inp}/>
              <input value={lng} onChange={(e)=>setLng(e.target.value)} placeholder="Longitude" style={inp}/>
              <input value={locName} onChange={(e)=>setLocName(e.target.value)} placeholder="Nama Tempat" style={inp}/>
              <input value={locAddr} onChange={(e)=>setLocAddr(e.target.value)} placeholder="Alamat Lengkap" style={inp}/>
              <button style={{ background:"#00a884", color:"#111b21", fontWeight: 600, padding: 12, borderRadius: 8, border: "none", cursor: "pointer", marginTop: 10 }} onClick={sendLocationNow}>Kirim Lokasi Sekarang</button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Hover Effects */}
      <style>{`
        .chat-item-hover:hover { background: #202c33 !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 6px; }
      `}</style>
    </div>
  );
}

// ===== INLINE STYLES =====
const select: React.CSSProperties = { background: "transparent", border: "none", color: "#e9edef", outline: "none", cursor: "pointer" };
const attachItem: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, color: "#e9edef", cursor: "pointer", padding: "4px 8px", background: "transparent" };
const attachIcon: React.CSSProperties = { width: 40, height: 40, borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18 };
const overlay: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(11,20,26,0.85)", display:"flex", justifyContent:"center", alignItems:"center", zIndex: 999 };
const modal: React.CSSProperties = { width:"min(400px, 92vw)", background:"#202c33", borderRadius: 12, padding: 24, boxShadow: "0 17px 50px 0 rgba(11,20,26,.19), 0 12px 15px 0 rgba(11,20,26,.24)" };
const inp: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius: 8, border:"1px solid #2a3942", background:"#111b21", color:"#e9edef", outline: "none", boxSizing: "border-box" };