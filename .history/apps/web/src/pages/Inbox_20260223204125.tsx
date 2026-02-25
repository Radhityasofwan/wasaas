import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { dedupeByRemoteJid } from "../lib/dedupe";
import { sendMedia } from "../lib/upload";

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

export default function Inbox() {
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

  const peerNumber = useMemo(() => peer.includes("@") ? peer.split("@")[0] : peer, [peer]);

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
    } catch (e: any) {
      setErr(e?.message || "error");
    } finally {
      setSending(false);
    }
  }

  async function onPickFile(kind: "image"|"document"|"video", file: File | null) {
    if (!file || sending) return;
    setSending(true);
    try {
      setErr(null);
      await sendMedia(kind, { sessionKey, to: peerNumber, caption: text.trim() || undefined }, file);
      setText("");
      await loadMessages(sessionKey, peer);
      await loadConvs(sessionKey);
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
    } catch (e:any) {
      setErr(e?.message || "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12, height: "calc(100vh - 28px)" }}>
      {/* LEFT: Conversations */}
      <div style={{ border: "1px solid #1f2c33", borderRadius: 14, overflow: "hidden", background: "#111b21" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #1f2c33" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={sessionKey} onChange={(e)=>setSessionKey(e.target.value)} style={select}>
              {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
            </select>
            <button onClick={() => loadConvs(sessionKey)} style={btn}>Refresh</button>
          </div>
          {err && <div style={{ color: "#ff6b6b", marginTop: 8, fontSize: 13 }}>{err}</div>}
        </div>

        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 140px)" }}>
          {convs.map((c) => (
            <div
              key={c.remoteJid}
              onClick={() => setPeer(c.remoteJid)}
              style={{
                padding: 12,
                borderBottom: "1px solid #1f2c33",
                background: peer === c.remoteJid ? "#0b141a" : "transparent",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.remoteJid}</div>
                {c.unreadCount > 0 && <div style={badge}>{c.unreadCount}</div>}
              </div>
              <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.lastMessage?.direction === "out" ? "You: " : ""}{c.lastMessage?.text || c.lastMessage?.type}
              </div>
              <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
                {new Date(c.lastMessage?.time).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Chat */}
      <div style={{ border: "1px solid #1f2c33", borderRadius: 14, overflow: "hidden", background: "#0b141a", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #1f2c33", background: "#111b21" }}>
          <div style={{ fontWeight: 800 }}>{peer || "Select chat"}</div>
          <div style={{ marginTop: 8, display:"flex", gap:8, flexWrap:"wrap" }}>
            <label style={pill}>
              📷 Image
              <input type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>onPickFile("image", e.target.files?.[0] || null)} />
            </label>
            <label style={pill}>
              📄 Document
              <input type="file" style={{ display:"none" }} onChange={(e)=>onPickFile("document", e.target.files?.[0] || null)} />
            </label>
            <label style={pill}>
              🎬 Video
              <input type="file" accept="video/*" style={{ display:"none" }} onChange={(e)=>onPickFile("video", e.target.files?.[0] || null)} />
            </label>
            <button style={pillBtn} onClick={()=>setLocModal(true)}>📍 Location</button>
            {sending && <span style={{ opacity: 0.7, fontSize: 12 }}>sending…</span>}
          </div>
        </div>

        <div style={{ padding: 12, overflow: "auto" }}>
          {messages.slice().reverse().map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{
                maxWidth: "72%",
                padding: "10px 12px",
                borderRadius: 14,
                background: m.direction === "out" ? "#005c4b" : "#202c33",
                border: "1px solid #1f2c33",
                fontSize: 13
              }}>
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {m.text || (m.type !== "text" ? `[${m.type}]` : "")}
                  {m.media?.url ? (
                    <div style={{ marginTop: 8 }}>
                      <a href={m.media.url} target="_blank" rel="noreferrer" style={{ color:"#9be6d4" }}>Open media</a>
                    </div>
                  ) : null}
                  {m.location ? (
                    <div style={{ marginTop: 8, opacity: 0.9 }}>
                      📍 {m.location.name || "Location"} ({m.location.latitude}, {m.location.longitude})
                    </div>
                  ) : null}
                </div>
                <div style={{ marginTop: 6, opacity: 0.7, fontSize: 11, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <span>{new Date(m.time).toLocaleTimeString()}</span>
                  <span>{m.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #1f2c33", background: "#111b21", display: "flex", gap: 8 }}>
          <input
            value={text}
            onChange={(e)=>setText(e.target.value)}
            placeholder="Type a message / caption..."
            style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" }}
            onKeyDown={(e)=>{ if (e.key==="Enter") sendText(); }}
          />
          <button onClick={sendText} style={{ ...btn, background: "#00a884", color: "#001a12", fontWeight: 800 }}>Send</button>
        </div>
      </div>

      {locModal && (
        <div style={overlay} onClick={()=>setLocModal(false)}>
          <div style={modal} onClick={(e)=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight: 900 }}>Send Location</div>
              <button style={btn} onClick={()=>setLocModal(false)}>Close</button>
            </div>
            <div style={{ marginTop: 10, display:"grid", gap:8 }}>
              <input value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="latitude" style={inp}/>
              <input value={lng} onChange={(e)=>setLng(e.target.value)} placeholder="longitude" style={inp}/>
              <input value={locName} onChange={(e)=>setLocName(e.target.value)} placeholder="name" style={inp}/>
              <input value={locAddr} onChange={(e)=>setLocAddr(e.target.value)} placeholder="address (optional)" style={inp}/>
              <button style={{ ...btn, background:"#00a884", color:"#001a12", fontWeight: 900 }} onClick={sendLocationNow}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const select: React.CSSProperties = { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #1f2c33", background: "#0b141a", color: "#e9edef" };
const badge: React.CSSProperties = { background: "#00a884", color: "#001a12", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800 };
const pill: React.CSSProperties = { padding:"8px 10px", borderRadius: 999, border:"1px solid #1f2c33", cursor:"pointer", fontSize: 12, background:"#0b141a" };
const pillBtn: React.CSSProperties = { ...pill, color:"#e9edef" };

const overlay: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"grid", placeItems:"center", zIndex: 50 };
const modal: React.CSSProperties = { width:"min(520px, 92vw)", background:"#111b21", border:"1px solid #1f2c33", borderRadius: 16, padding: 14 };
const inp: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius: 10, border:"1px solid #1f2c33", background:"#0b141a", color:"#e9edef" };
