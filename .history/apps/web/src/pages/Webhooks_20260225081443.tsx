import React, { useEffect, useState } from "react";
import { BookOpen, Terminal, Workflow, Info, CheckCircle2 } from "lucide-react";

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
  
  const url = path.startsWith("http") ? path : `/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
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
  { id: "message.incoming", label: "Pesan Masuk", desc: "Saat ada chat baru dari pelanggan." },
  { id: "message.status", label: "Status Pesan", desc: "Perubahan status (Terkirim, Dibaca)." },
  { id: "session.update", label: "Status Sesi WA", desc: "Saat WA terputus atau terhubung." },
  { id: "broadcast.status", label: "Status Broadcast", desc: "Progres pengiriman pesan massal." },
];

export default function Webhooks() {
  const [url, setUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // State untuk Tab Dokumentasi
  const [docTab, setDocTab] = useState<'awam' | 'programmer'>('awam');

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
      setSecret(res.secret_head);
      alert("Konfigurasi Webhook berhasil disimpan!");
    } catch (e: any) { 
      alert(e.message || "Gagal menyimpan konfigurasi"); 
    } finally { 
      setSaving(false); 
    }
  };

  if (loading) return <div className="p-24 text-center font-black text-slate-300 animate-pulse uppercase tracking-widest">Memuat Konfigurasi...</div>;

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      
      {/* HEADER */}
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Webhook (Integrasi)</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Hubungkan WA dengan Aplikasi Lain Secara Otomatis</p>
      </div>

      {/* CARD 1: FORM PENGATURAN */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-8 md:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.02)] relative overflow-hidden">
        <form onSubmit={handleSave} className="space-y-10 relative z-10">
          
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
          </div>

          <div className="space-y-6">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 block">Data yang ingin dikirim (Event)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {EVENTS.map(ev => (
                <label key={ev.id} className={`p-6 rounded-[2rem] border cursor-pointer transition-all flex flex-col items-center text-center gap-3 ${selected.includes(ev.id) ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' : 'bg-white/60 text-slate-500 border-white hover:bg-white'}`}>
                  <input type="checkbox" className="hidden" checked={selected.includes(ev.id)} onChange={() => setSelected(p => p.includes(ev.id) ? p.filter(x => x !== ev.id) : [...p, ev.id])} />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border shrink-0 ${selected.includes(ev.id) ? 'bg-white/20 border-white/20 text-white' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>{selected.includes(ev.id) ? '✓' : ''}</div>
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-widest leading-tight block">{ev.label}</span>
                    <span className={`text-[10px] mt-1 block font-medium ${selected.includes(ev.id) ? 'text-blue-100' : 'text-slate-400'}`}>{ev.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center pt-10 border-t border-slate-200/50 gap-8">
             <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Kunci Keamanan (Webhook Secret)</span>
                <code className="bg-slate-100/50 px-6 py-3 rounded-xl border border-slate-200 text-xs font-mono text-slate-600 italic">
                  {secret ? `HMAC SHA256 • ${secret}********` : "Belum ter-generate"}
                </code>
             </div>
             <div className="flex items-center gap-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                   <div className={`w-14 h-8 rounded-full border border-slate-200 transition-all relative ${isActive ? 'bg-blue-600 border-blue-600' : 'bg-slate-200 shadow-inner'}`} onClick={() => setIsActive(!isActive)}>
                      <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${isActive ? 'left-7' : 'left-1'}`} />
                   </div>
                   <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{isActive ? 'Aktif' : 'Mati'}</span>
                </label>
                <button type="submit" disabled={saving} className="px-10 py-5 rounded-[2rem] bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest">
                   {saving ? "Menyimpan..." : "Simpan Integrasi"}
                </button>
             </div>
          </div>
        </form>
      </div>

      {/* CARD 2: PUSAT DOKUMENTASI & PANDUAN */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-8 md:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.02)]">
        
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <BookOpen size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Pusat Panduan Webhook</h2>
            <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-widest">Pelajari cara menghubungkan WA dengan aplikasi Anda</p>
          </div>
        </div>

        {/* Analogi Singkat */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-[2rem] p-6 mb-8 flex gap-4 items-start">
          <Info className="text-blue-500 shrink-0 mt-1" size={24} />
          <div>
            <h3 className="text-sm font-black text-slate-800 mb-1">Penjelasan Singkat: Apa itu Webhook?</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Bayangkan Anda sedang menunggu paket kurir. Daripada Anda harus bolak-balik melihat ke luar jendela setiap 5 menit (sangat melelahkan), lebih baik Anda memberikan nomor HP ke kurir. Jadi, kurir akan **otomatis menelepon Anda** tepat saat paket tiba.<br/><br/>
              Webhook bekerja persis seperti itu! Sistem WA kami akan "menelepon" aplikasi Anda secara otomatis setiap kali ada pesan masuk, tanpa perlu Anda mengeceknya berulang kali.
            </p>
          </div>
        </div>

        {/* Tab Navigasi */}
        <div className="flex flex-wrap gap-2 mb-8 bg-slate-100/50 p-2 rounded-[2rem] border border-white w-fit">
          <button 
            onClick={() => setDocTab('awam')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${docTab === 'awam' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Workflow size={16} />
            Panduan Tanpa Coding
          </button>
          <button 
            onClick={() => setDocTab('programmer')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${docTab === 'programmer' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Terminal size={16} />
            Panduan Programmer
          </button>
        </div>

        {/* KONTEN TAB: AWAM / NO-CODE */}
        {docTab === 'awam' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-black text-slate-800">Menyimpan Chat Masuk ke Google Sheets (via Make.com)</h3>
            <p className="text-sm text-slate-600 font-medium">Jika Anda bukan programmer, gunakan platform No-Code seperti Make.com, Zapier, atau Pabbly untuk menerima Webhook ini. Berikut contoh alurnya:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-[2rem] p-8">
                <h4 className="font-black text-blue-600 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">1</span>
                  Dapatkan URL dari Make.com
                </h4>
                <ul className="space-y-3 text-sm text-slate-600 font-medium">
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Buat akun di Make.com dan buat Skenario baru.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Tambahkan modul <strong>"Webhooks"</strong> &rarr; <strong>"Custom Webhook"</strong>.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Klik Add, beri nama (misal: "WA Masuk"), lalu Save.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Make.com akan memberikan URL (Contoh: <code>hook.us1.make...</code>). <strong>Copy URL tersebut!</strong></li>
                </ul>
              </div>

              <div className="bg-white border border-slate-200 rounded-[2rem] p-8">
                <h4 className="font-black text-blue-600 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">2</span>
                  Pasang & Uji Coba di WA SaaS
                </h4>
                <ul className="space-y-3 text-sm text-slate-600 font-medium">
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Paste URL Make.com ke form <strong>"URL Tujuan"</strong> di atas.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Centang event <strong>"Pesan Masuk"</strong>, lalu Simpan.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Coba kirim pesan "Halo" ke nomor Bot WA Anda dari HP lain.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Make.com akan otomatis menangkap pesan tersebut (muncul centang hijau di Make).</li>
                </ul>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-[2rem] p-8">
               <h4 className="font-black text-emerald-600 mb-2 flex items-center gap-2">
                 <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs">3</span>
                 Simpan ke Google Sheets
               </h4>
               <p className="text-sm text-slate-600 font-medium mb-3">Di Make.com, tambahkan modul <strong>Google Sheets (Add a Row)</strong> setelah modul Webhook. Hubungkan akun Google Anda, lalu Anda tinggal <em>drag-and-drop</em> variabel dari Webhook (seperti Nomor Pengirim, Isi Pesan, Waktu) ke dalam kolom Excel Anda. Sangat mudah!</p>
            </div>
          </div>
        )}

        {/* KONTEN TAB: PROGRAMMER / CODING */}
        {docTab === 'programmer' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-2">Struktur Payload & Keamanan (HMAC SHA256)</h3>
              <p className="text-sm text-slate-600 font-medium">Sistem kami mengirimkan data via <code>HTTP POST</code>. Anda diwajibkan untuk merespons dengan HTTP Status <code>200 OK</code> dalam waktu kurang dari 5 detik. Jika tidak, sistem akan melakukan *Retry* (Kirim Ulang) otomatis maksimal 8 kali.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Kolom Payload */}
              <div className="bg-[#0f172a] rounded-[2rem] overflow-hidden border border-slate-800 shadow-2xl">
                <div className="bg-slate-800/50 px-6 py-3 border-b border-slate-700/50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="ml-2 text-[10px] font-mono text-slate-400">POST /your-endpoint (JSON Payload)</span>
                </div>
                <div className="p-6 overflow-x-auto text-[13px] font-mono leading-relaxed">
<pre className="text-emerald-400">
{`{
  "event": "message.incoming",
  "data": {
    "session": "sesi_admin_01",
    "from": "6281234567890@s.whatsapp.net",
    "pushName": "Budi Pelanggan",
    "messageType": "text",
    "text": "Halo, saya mau pesan produk A.",
    "timestamp": "2026-02-25T10:00:00Z"
  }
}`}
</pre>
                </div>
              </div>

              {/* Kolom Contoh Kode Node.js */}
              <div className="bg-[#0f172a] rounded-[2rem] overflow-hidden border border-slate-800 shadow-2xl">
                <div className="bg-slate-800/50 px-6 py-3 border-b border-slate-700/50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="ml-2 text-[10px] font-mono text-slate-400">Node.js / Express Example</span>
                </div>
                <div className="p-6 overflow-x-auto text-[12px] font-mono leading-relaxed">
<pre>
<span className="text-purple-400">const</span> <span className="text-blue-400">express</span> = <span className="text-amber-300">require</span>(<span className="text-emerald-300">'express'</span>);
<span className="text-purple-400">const</span> <span className="text-blue-400">crypto</span> = <span className="text-amber-300">require</span>(<span className="text-emerald-300">'crypto'</span>);
<span className="text-purple-400">const</span> <span className="text-blue-400">app</span> = <span className="text-amber-300">express</span>();

<span className="text-slate-500">{"// Ambil Secret dari UI Dashboard"}</span>
<span className="text-purple-400">const</span> <span className="text-blue-400">SECRET</span> = <span className="text-emerald-300">"GANTI_DENGAN_WEBHOOK_SECRET"</span>;

<span className="text-slate-500">{"// Wajib ambil raw body untuk validasi akurat"}</span>
app.<span className="text-amber-300">use</span>(express.<span className="text-amber-300">json</span>({
  <span className="text-blue-300">verify</span>: (req, res, buf) {`=>`} req.<span className="text-blue-300">rawBody</span> = buf.<span className="text-amber-300">toString</span>()
}));

app.<span className="text-amber-300">post</span>(<span className="text-emerald-300">'/webhook'</span>, (req, res) {`=>`} {`{`}
  <span className="text-purple-400">const</span> <span className="text-blue-400">signature</span> = req.headers[<span className="text-emerald-300">'x-webhook-signature'</span>];
  
  <span className="text-slate-500">{"// 1. Verifikasi Keamanan"}</span>
  <span className="text-purple-400">const</span> <span className="text-blue-400">expected</span> = crypto.<span className="text-amber-300">createHmac</span>(<span className="text-emerald-300">'sha256'</span>, SECRET)
    .<span className="text-amber-300">update</span>(req.<span className="text-blue-300">rawBody</span>).<span className="text-amber-300">digest</span>(<span className="text-emerald-300">'hex'</span>);

  <span className="text-purple-400">if</span> (signature !== expected) {`{`}
    <span className="text-purple-400">return</span> res.<span className="text-amber-300">status</span>(401).<span className="text-amber-300">send</span>(<span className="text-emerald-300">"Unauthorized"</span>);
  {`}`}

  <span className="text-slate-500">{"// 2. Eksekusi Logika & Wajib Balas 200 OK"}</span>
  console.<span className="text-amber-300">log</span>(req.<span className="text-blue-300">body</span>.<span className="text-blue-300">event</span>, req.<span className="text-blue-300">body</span>.<span className="text-blue-300">data</span>);
  res.<span className="text-amber-300">status</span>(200).<span className="text-amber-300">send</span>(<span className="text-emerald-300">"OK"</span>);
{`}`});
</pre>
                </div>
              </div>
            </div>

            {/* List Headers */}
            <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">HTTP Headers yang dikirim Server Kami:</h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-mono text-slate-600">
                <li><strong className="text-blue-600">X-Webhook-Event:</strong> <span className="text-xs text-slate-500">Nama event trigger</span></li>
                <li><strong className="text-blue-600">X-Webhook-Tenant:</strong> <span className="text-xs text-slate-500">ID Tenant pengirim</span></li>
                <li><strong className="text-blue-600">X-Webhook-Delivery-Id:</strong> <span className="text-xs text-slate-500">Mencegah duplikasi data</span></li>
                <li><strong className="text-blue-600">X-Webhook-Signature:</strong> <span className="text-xs text-slate-500">Hash keamanan HMAC</span></li>
              </ul>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}