import React, { useEffect, useState } from "react";
import { BookOpen, Terminal, Workflow, Info, CheckCircle2, Zap, Check, Lock, Loader2, Save } from "lucide-react";

import { useConfirm } from "../App";

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
  
  // FIX: Normalisasi Proxy Vite
  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
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
  const confirm = useConfirm();

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
    
    if (selected.length === 0) {
      return alert("Pilih minimal 1 Event Subscription.");
    }

    const isConfirmed = await confirm({
      title: "Simpan Konfigurasi",
      message: "Terapkan perubahan pada integrasi Webhook?",
      confirmText: "Simpan Integrasi"
    });

    if (!isConfirmed) return;

    setSaving(true);
    try {
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400 gap-4">
        <Loader2 size={40} className="animate-spin text-[#0b57d0]" />
        <p className="font-bold tracking-widest uppercase text-xs">Memuat Konfigurasi...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center shrink-0">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
              Webhook (Integrasi)
            </h1>
            <p className="text-sm text-slate-500 mt-1 md:mt-2">
              Hubungkan sistem WA dengan aplikasi pihak ketiga secara otomatis.
            </p>
          </div>
        </div>
      </div>

      {/* CARD 1: FORM PENGATURAN */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm">
        <form onSubmit={handleSave} className="space-y-8">
          
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 block ml-1">URL Tujuan (Endpoint Penerima)</label>
            <input 
              type="url" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              className="w-full px-5 py-4 rounded-full bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] shadow-sm transition-all text-sm md:text-base" 
              placeholder="Contoh: https://hook.us1.make.com/xxxxxxxxx" 
              required 
            />
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-700 block ml-1">Data yang Ingin Dikirim (Event)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {EVENTS.map(ev => {
                const isSelected = selected.includes(ev.id);
                return (
                  <label key={ev.id} className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${isSelected ? 'bg-[#f0f4f9] border-[#c2e7ff]' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input type="checkbox" className="hidden" checked={isSelected} onChange={() => setSelected(p => p.includes(ev.id) ? p.filter(x => x !== ev.id) : [...p, ev.id])} />
                    <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${isSelected ? 'bg-[#0b57d0] text-white' : 'bg-slate-100 text-slate-300 border border-slate-300'}`}>
                      {isSelected && <Check size={14} strokeWidth={3} />}
                    </div>
                    <div>
                      <span className={`text-sm font-bold block leading-tight ${isSelected ? 'text-[#0b57d0]' : 'text-slate-700'}`}>{ev.label}</span>
                      <span className="text-[11px] mt-1 block font-medium text-slate-500 leading-relaxed">{ev.desc}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between pt-6 border-t border-slate-100 gap-6">
             <div className="space-y-2 flex-1 w-full max-w-md">
                <span className="text-xs font-bold text-slate-700 block ml-1">Kunci Keamanan (Webhook Secret)</span>
                <div className="bg-[#f8fafd] px-4 py-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
                   <code className="text-xs md:text-sm font-mono text-slate-600 truncate">
                     {secret ? `HMAC SHA256 • ${secret}********` : "Belum ter-generate"}
                   </code>
                   <Lock size={16} className="text-slate-400 shrink-0" />
                </div>
             </div>
             
             <div className="flex flex-row items-center justify-between lg:justify-end gap-6 w-full lg:w-auto mt-4 lg:mt-0">
                <label className="flex items-center gap-3 cursor-pointer group">
                   <div className={`w-12 h-6 rounded-full transition-all relative ${isActive ? 'bg-[#0b57d0]' : 'bg-slate-300'}`} onClick={() => setIsActive(!isActive)}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isActive ? 'translate-x-7' : 'translate-x-1'}`} />
                   </div>
                   <span className="text-xs font-bold uppercase text-slate-600 tracking-wider">{isActive ? 'Aktif' : 'Mati'}</span>
                </label>
                <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#0b57d0] text-white font-bold text-sm shadow-sm hover:bg-[#001d35] active:scale-95 disabled:bg-slate-300 transition-all shrink-0">
                   {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                   Simpan Konfigurasi
                </button>
             </div>
          </div>
        </form>
      </div>

      {/* CARD 2: PUSAT DOKUMENTASI & PANDUAN */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm">
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-[#f0f4f9] text-[#0b57d0] rounded-full flex items-center justify-center shrink-0">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">Panduan Integrasi</h2>
            <p className="text-slate-500 text-sm mt-0.5">Pelajari cara menyambungkan data ke aplikasi Anda</p>
          </div>
        </div>

        {/* Analogi Singkat */}
        <div className="bg-[#f8fafd] border border-slate-100 rounded-2xl p-5 md:p-6 mb-6 flex flex-col sm:flex-row gap-4 items-start">
          <Info className="text-[#0b57d0] shrink-0 mt-0.5" size={24} />
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Penjelasan: Apa itu Webhook?</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Bayangkan Anda sedang menunggu paket dari kurir. Daripada Anda mengecek ke luar jendela setiap 5 menit (memakan waktu), lebih baik memberikan nomor HP Anda ke kurir agar mereka <strong>otomatis menelepon</strong> saat paket tiba.<br/><br/>
              Webhook bekerja seperti itu! Sistem kami akan otomatis mengirim data ke aplikasi Anda secara *Real-Time* saat ada pesan masuk, tanpa perlu Anda mengeceknya berulang kali secara manual.
            </p>
          </div>
        </div>

        {/* Tab Navigasi */}
        <div className="flex flex-wrap gap-2 mb-6 bg-white p-1.5 rounded-full border border-slate-100 w-fit shadow-sm">
          <button 
            onClick={() => setDocTab('awam')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-colors ${docTab === 'awam' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-transparent text-slate-500 hover:bg-[#f0f4f9] hover:text-slate-800'}`}
          >
            <Workflow size={16} />
            Panduan Tanpa Coding
          </button>
          <button 
            onClick={() => setDocTab('programmer')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-colors ${docTab === 'programmer' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-transparent text-slate-500 hover:bg-[#f0f4f9] hover:text-slate-800'}`}
          >
            <Terminal size={16} />
            Panduan Programmer
          </button>
        </div>

        {/* KONTEN TAB: AWAM / NO-CODE */}
        {docTab === 'awam' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <h3 className="text-base md:text-lg font-bold text-slate-800">Menyimpan Chat Masuk ke Google Sheets (via Make.com)</h3>
            <p className="text-sm text-slate-600 font-medium">Gunakan platform No-Code seperti Make.com, Zapier, atau Pabbly untuk menerima Webhook ini. Berikut contoh alurnya:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                <h4 className="font-bold text-[#0b57d0] mb-3 flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-[#f0f4f9] flex items-center justify-center text-xs shrink-0">1</span>
                  Dapatkan URL dari Make.com
                </h4>
                <ul className="space-y-3 text-sm text-slate-600 font-medium">
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Buat akun di Make.com dan buat Skenario baru.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Tambahkan modul <strong>"Webhooks"</strong> &rarr; <strong>"Custom Webhook"</strong>.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Klik Add, beri nama (misal: "WA Masuk"), lalu Save.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Make.com akan memberikan URL (Contoh: <code>hook.us1.make...</code>). <strong>Copy URL tersebut!</strong></li>
                </ul>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                <h4 className="font-bold text-[#0b57d0] mb-3 flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-[#f0f4f9] flex items-center justify-center text-xs shrink-0">2</span>
                  Pasang & Uji Coba di WA SaaS
                </h4>
                <ul className="space-y-3 text-sm text-slate-600 font-medium">
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Paste URL dari Make.com ke form <strong>"URL Tujuan"</strong> di atas.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Centang event <strong>"Pesan Masuk"</strong>, lalu Simpan.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Coba kirim pesan "Halo" ke nomor WA Anda dari HP lain.</li>
                  <li className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> Make.com akan otomatis menangkap data pesan tersebut.</li>
                </ul>
              </div>
            </div>

            <div className="bg-[#f8fafd] border border-slate-100 rounded-2xl p-5 md:p-6 shadow-sm">
               <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-sm">
                 <span className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs shrink-0">3</span>
                 Simpan ke Google Sheets
               </h4>
               <p className="text-sm text-slate-600 font-medium leading-relaxed">
                 Di Make.com, tambahkan modul <strong>Google Sheets (Add a Row)</strong> setelah modul Webhook. Hubungkan akun Google Anda, lalu Anda tinggal <em>drag-and-drop</em> variabel dari Webhook (seperti Nomor Pengirim, Isi Pesan, Waktu) ke dalam kolom Excel Anda.
               </p>
            </div>
          </div>
        )}

        {/* KONTEN TAB: PROGRAMMER / CODING */}
        {docTab === 'programmer' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h3 className="text-base md:text-lg font-bold text-slate-800 mb-2">Struktur Payload & Keamanan (HMAC SHA256)</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Sistem kami mengirimkan data via <code>HTTP POST</code>. Endpoint Anda diwajibkan untuk merespons dengan HTTP Status <code>200 OK</code> dalam waktu kurang dari 5 detik. Jika gagal, sistem akan melakukan *Retry* (Kirim Ulang) otomatis maksimal 8 kali.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Kolom Payload */}
              <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md">
                <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#444] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="ml-2 text-[10px] font-mono text-slate-300">POST /your-endpoint (JSON)</span>
                </div>
                <div className="p-5 overflow-x-auto text-xs font-mono leading-relaxed text-[#c3e88d]">
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
                </div>
              </div>

              {/* Kolom Contoh Kode Node.js */}
              <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md">
                <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#444] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="ml-2 text-[10px] font-mono text-slate-300">Node.js / Express Example</span>
                </div>
                <div className="p-5 overflow-x-auto text-xs font-mono leading-relaxed">
<span className="text-[#c792ea]">const</span> <span className="text-[#82aaff]">express</span> = <span className="text-[#ffcb6b]">require</span>(<span className="text-[#c3e88d]">'express'</span>);
<br />
<span className="text-[#c792ea]">const</span> <span className="text-[#82aaff]">crypto</span> = <span className="text-[#ffcb6b]">require</span>(<span className="text-[#c3e88d]">'crypto'</span>);
<br />
<span className="text-[#c792ea]">const</span> <span className="text-[#82aaff]">app</span> = <span className="text-[#ffcb6b]">express</span>();
<br /><br />
<span className="text-slate-500">{"// Ambil Secret dari UI Dashboard"}</span>
<br />
<span className="text-[#c792ea]">const</span> <span className="text-[#82aaff]">SECRET</span> = <span className="text-[#c3e88d]">"WEBHOOK_SECRET_ANDA"</span>;
<br /><br />
<span className="text-slate-500">{"// Wajib ambil raw body untuk validasi akurat"}</span>
<br />
app.<span className="text-[#ffcb6b]">use</span>(express.<span className="text-[#ffcb6b]">json</span>({"{"}
<br />
&nbsp;&nbsp;<span className="text-[#89ddff]">verify</span>: (req, res, buf) {`=>`} req.<span className="text-[#89ddff]">rawBody</span> = buf.<span className="text-[#ffcb6b]">toString</span>()
<br />
{"}"}));
<br /><br />
app.<span className="text-[#ffcb6b]">post</span>(<span className="text-[#c3e88d]">'/webhook'</span>, (req, res) {`=>`} {"{"}
<br />
&nbsp;&nbsp;<span className="text-[#c792ea]">const</span> <span className="text-[#82aaff]">signature</span> = req.headers[<span className="text-[#c3e88d]">'x-webhook-signature'</span>];
<br />
&nbsp;&nbsp;
<br />
&nbsp;&nbsp;<span className="text-slate-500">{"// 1. Verifikasi Keamanan"}</span>
<br />
&nbsp;&nbsp;<span className="text-[#c792ea]">const</span> <span className="text-[#82aaff]">expected</span> = crypto.<span className="text-[#ffcb6b]">createHmac</span>(<span className="text-[#c3e88d]">'sha256'</span>, SECRET)
<br />
&nbsp;&nbsp;&nbsp;&nbsp;.<span className="text-[#ffcb6b]">update</span>(req.<span className="text-[#89ddff]">rawBody</span>).<span className="text-[#ffcb6b]">digest</span>(<span className="text-[#c3e88d]">'hex'</span>);
<br />
&nbsp;&nbsp;
<br />
&nbsp;&nbsp;<span className="text-[#c792ea]">if</span> (signature !== expected) {"{"}
<br />
&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-[#c792ea]">return</span> res.<span className="text-[#ffcb6b]">status</span>(401).<span className="text-[#ffcb6b]">send</span>(<span className="text-[#c3e88d]">"Unauthorized"</span>);
<br />
&nbsp;&nbsp;{"}"}
<br />
&nbsp;&nbsp;
<br />
&nbsp;&nbsp;<span className="text-slate-500">{"// 2. Eksekusi Logika & Wajib Balas 200 OK"}</span>
<br />
&nbsp;&nbsp;console.<span className="text-[#ffcb6b]">log</span>(req.<span className="text-[#89ddff]">body</span>.<span className="text-[#89ddff]">event</span>, req.<span className="text-[#89ddff]">body</span>.<span className="text-[#89ddff]">data</span>);
<br />
&nbsp;&nbsp;res.<span className="text-[#ffcb6b]">status</span>(200).<span className="text-[#ffcb6b]">send</span>(<span className="text-[#c3e88d]">"OK"</span>);
<br />
{"}"});
                </div>
              </div>
            </div>

            {/* List Headers */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 mb-3">HTTP Headers yang dikirim Server:</h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-mono text-slate-600">
                <li className="bg-[#f0f4f9] p-2.5 rounded-lg border border-slate-100"><strong className="text-[#0b57d0]">X-Webhook-Event:</strong> <span className="text-xs text-slate-500 block mt-1">Nama event trigger</span></li>
                <li className="bg-[#f0f4f9] p-2.5 rounded-lg border border-slate-100"><strong className="text-[#0b57d0]">X-Webhook-Tenant:</strong> <span className="text-xs text-slate-500 block mt-1">ID Tenant pengirim</span></li>
                <li className="bg-[#f0f4f9] p-2.5 rounded-lg border border-slate-100"><strong className="text-[#0b57d0]">X-Webhook-Delivery-Id:</strong> <span className="text-xs text-slate-500 block mt-1">Identifikasi unik request</span></li>
                <li className="bg-[#f0f4f9] p-2.5 rounded-lg border border-slate-100"><strong className="text-[#0b57d0]">X-Webhook-Signature:</strong> <span className="text-xs text-slate-500 block mt-1">Hash keamanan HMAC</span></li>
              </ul>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}