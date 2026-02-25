import React, { useEffect, useState } from "react";

/**
 * HELPER INTERNAL: apiFetch
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  // FIX: Menggunakan path langsung tanpa sisipan '/api' secara kaku
  const url = path.startsWith("http") ? path : `/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  // Penanganan Error HTML 404/500
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Server Backend mengalami gangguan (HTTP ${res.status}).`);
  }

  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

const EVENTS = [
  { id: "message.incoming", label: "Pesan Masuk" },
  { id: "message.status", label: "Status Pesan" },
  { id: "session.update", label: "Status Sesi WA" },
  { id: "broadcast.status", label: "Status Broadcast" },
];

export default function Webhooks() {
  const [url, setUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<any>("webhooks");
        if (res.data) {
          setUrl(res.data.url); 
          setIsActive(res.data.is_active);
          setSelected(res.data.events || []); 
          setSecret(res.data.secret_head);
        } else {
          setSelected(EVENTS.map(e => e.id));
        }
      } catch (e) {
        console.error("Gagal load webhook:", e);
      } finally { 
        setLoading(false); 
      }
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setSaving(true);
    try {
      if (selected.length === 0) {
         throw new Error("Pilih minimal 1 Event Subscription.");
      }
      const res = await apiFetch<any>("webhooks/set", { 
        method: "POST", 
        body: JSON.stringify({ url, status: isActive ? "active" : "inactive", events: selected }) 
      });
      setSecret(res.secret_head); // Update Secret di UI
      alert("Konfigurasi Webhook berhasil disimpan!");
    } catch (e: any) { 
      alert(e.message || "Gagal menyimpan konfigurasi"); 
    } finally { 
      setSaving(false); 
    }
  };

  if (loading) return <div className="p-24 text-center font-black text-slate-300 animate-pulse uppercase tracking-widest">Memuat Konfigurasi...</div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Webhook (Integrasi)</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Hubungkan WA dengan Aplikasi Lain Otomatis</p>
      </div>

      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-10 shadow-sm">
        <form onSubmit={handleSave} className="space-y-10">
          
          {/* BAGIAN URL YANG SUDAH DIPERBAIKI (USER FRIENDLY) */}
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 block mb-2">URL Tujuan (Alamat Penerima)</label>
              <input 
                type="url" 
                value={url} 
                onChange={(e) => setUrl(e.target.value)} 
                className="w-full px-8 py-5 rounded-[2rem] bg-white border border-slate-200 font-bold text-slate-800 outline-none focus:ring-[6px] focus:ring-blue-500/10 focus:border-blue-400 shadow-sm transition-all" 
                placeholder="Contoh: https://hook.us1.make.com/xxxxxxxxx" 
                required 
              />
            </div>
            
            <div className="bg-blue-50/70 border border-blue-100 rounded-[1.5rem] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xl shrink-0 shadow-inner">
                ?
              </div>
              <div>
                <p className="text-sm font-black text-slate-700 mb-1">Bingung harus diisi apa?</p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-2xl">
                  Kolom di atas adalah alamat link (URL) agar sistem kami bisa mengirimkan data pesan masuk ke sistem Anda. 
                  Jika Anda bukan programmer, Anda bisa mendapatkan URL ini dengan membuat <strong>"Custom Webhook"</strong> di platform automasi tanpa coding (no-code) berikut:
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-widest shadow-sm hover:scale-105 transition-transform cursor-default">
                    🚀 Make.com
                  </span>
                  <span className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-widest shadow-sm hover:scale-105 transition-transform cursor-default">
                    ⚡ Zapier
                  </span>
                  <span className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-widest shadow-sm hover:scale-105 transition-transform cursor-default">
                    🔗 Pabbly Connect
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 block">Data yang ingin dikirim (Event)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {EVENTS.map(ev => (
                <label key={ev.id} className={`p-6 rounded-[2rem] border cursor-pointer transition-all flex flex-col items-center text-center gap-3 ${selected.includes(ev.id) ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' : 'bg-white/60 text-slate-500 border-white hover:bg-white'}`}>
                  <input type="checkbox" className="hidden" checked={selected.includes(ev.id)} onChange={() => setSelected(p => p.includes(ev.id) ? p.filter(x => x !== ev.id) : [...p, ev.id])} />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border ${selected.includes(ev.id) ? 'bg-white/20 border-white/20 text-white' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>{selected.includes(ev.id) ? '✓' : ''}</div>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{ev.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center pt-10 border-t border-white/40 gap-8">
             <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Kunci Keamanan (Webhook Secret)</span>
                <code className="bg-slate-100/50 px-6 py-3 rounded-xl border border-white text-xs font-mono text-slate-600 italic">
                  {secret ? `HMAC SHA256 • ${secret}********` : "Belum ter-generate"}
                </code>
             </div>
             <div className="flex items-center gap-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                   <div className={`w-14 h-8 rounded-full border border-white transition-all relative ${isActive ? 'bg-blue-600' : 'bg-slate-200 shadow-inner'}`} onClick={() => setIsActive(!isActive)}>
                      <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${isActive ? 'left-7' : 'left-1'}`} />
                   </div>
                   <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{isActive ? 'Aktif' : 'Mati'}</span>
                </label>
                <button type="submit" disabled={saving} className="px-14 py-6 rounded-[2rem] bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">
                   {saving ? "Menyimpan..." : "Simpan Integrasi"}
                </button>
             </div>
          </div>
        </form>
      </div>
    </div>
  );
}