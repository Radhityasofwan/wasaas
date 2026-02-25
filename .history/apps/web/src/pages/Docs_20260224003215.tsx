import React, { useState } from "react";
import { Link } from "react-router-dom";

type Tab = "auth" | "messages" | "sessions" | "webhooks";

export default function Docs() {
  const [activeTab, setActiveTab] = useState<Tab>("auth");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "auth", label: "Otentikasi", icon: "🔑" },
    { id: "messages", label: "Kirim Pesan", icon: "💬" },
    { id: "sessions", label: "Sesi & Device", icon: "📱" },
    { id: "webhooks", label: "Webhooks", icon: "⚡" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter italic drop-shadow-sm">Developer API</h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-1.5 w-10 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></div>
            <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.4em] opacity-80">
              Dokumentasi Integrasi HTTP REST
            </p>
          </div>
        </div>
        
        <Link 
          to="/api-keys"
          className="px-8 py-4 bg-white/60 border border-white text-blue-600 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-white hover:scale-105 transition-all shadow-sm flex items-center gap-2 w-max"
        >
          <span>Buat API Key</span>
          <span>→</span>
        </Link>
      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* SIDEBAR TABS (Kiri) */}
        <div className="w-full xl:w-[280px] shrink-0 flex xl:flex-col gap-3 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-4 px-6 py-5 rounded-[2rem] text-[12px] font-black uppercase tracking-widest transition-all duration-500 whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02]"
                  : "bg-white/40 border border-white text-slate-500 hover:bg-white/80 hover:text-slate-800"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT AREA (Kanan) */}
        <div className="flex-1 bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-8 md:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.03)] overflow-hidden relative min-h-[500px]">
          
          {/* Efek Blur Latar Konten */}
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-400/10 rounded-full blur-[80px] pointer-events-none"></div>

          {/* TAB 1: AUTHENTICATION */}
          {activeTab === "auth" && (
            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
              <div className="space-y-4">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Otentikasi API</h2>
                <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-2xl">
                  Seluruh endpoint API dilindungi dan membutuhkan otentikasi. Anda harus menyertakan API Key aktif Anda pada setiap HTTP Request melalui header <code className="bg-rose-50 text-rose-500 px-2 py-1 rounded-md font-bold border border-rose-100">x-api-key</code>.
                </p>
              </div>

              <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                <div className="flex gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <pre className="text-[13px] font-mono text-slate-300 overflow-x-auto leading-loose">
<span className="text-pink-400">curl</span> --request GET \
  --url https://api.domainanda.com/v1/sessions \
  --header <span className="text-emerald-400">'x-api-key: ak_live_xxxxxxxxx'</span> \
  --header <span className="text-emerald-400">'Content-Type: application/json'</span>
                </pre>
              </div>

              <div className="p-6 rounded-[2rem] bg-blue-50/50 border border-blue-100 flex gap-4">
                <div className="text-2xl">💡</div>
                <p className="text-xs font-bold text-blue-800 leading-relaxed">
                  Jaga kerahasiaan API Key Anda. Jangan pernah mengekspos API Key pada kode frontend (seperti React/Vue client-side) atau di repositori publik (GitHub). Lakukan pemanggilan API melalui server backend Anda sendiri.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: MESSAGES */}
          {activeTab === "messages" && (
            <div className="space-y-12 animate-in slide-in-from-right-8 duration-500">
              {/* Send Text */}
              <section className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Kirim Pesan Teks</h2>
                  <div className="flex items-center gap-4">
                    <span className="px-4 py-1.5 bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-200 shadow-sm">POST</span>
                    <code className="text-sm font-bold text-slate-500">/v1/messages/send-text</code>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                  <div className="flex gap-2 mb-6">
                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                  </div>
                  <pre className="text-[13px] font-mono text-blue-300 overflow-x-auto leading-loose">
{`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "text": "Halo! Ini pesan notifikasi dari sistem."
}`}
                  </pre>
                </div>
              </section>

              <div className="h-[1px] w-full bg-slate-200/50" />

              {/* Send Media */}
              <section className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Kirim Media (Gambar/Dokumen)</h2>
                  <div className="flex items-center gap-4">
                    <span className="px-4 py-1.5 bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-200 shadow-sm">POST</span>
                    <code className="text-sm font-bold text-slate-500">/v1/messages/send-media</code>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                  <pre className="text-[13px] font-mono text-purple-300 overflow-x-auto leading-loose">
{`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "type": "image", // image, document, video, audio
  "url": "https://domain.com/invoice.pdf",
  "caption": "Berikut adalah tagihan Anda bulan ini."
}`}
                  </pre>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: SESSIONS */}
          {activeTab === "sessions" && (
            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
              <div className="space-y-4">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Cek Status Sesi</h2>
                <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-2xl">
                  Gunakan endpoint ini untuk memantau apakah nomor WhatsApp (device) Anda sedang dalam status terhubung (<code className="text-emerald-500 font-bold">connected</code>) atau terputus.
                </p>
              </div>

              <div className="flex items-center gap-4 mt-6 mb-4">
                <span className="px-4 py-1.5 bg-blue-100 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-200 shadow-sm">GET</span>
                <code className="text-sm font-bold text-slate-500">/v1/sessions</code>
              </div>

              <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                 <div className="text-xs text-slate-500 font-black mb-4 tracking-widest uppercase">Response Sukses (200 OK)</div>
                <pre className="text-[13px] font-mono text-emerald-300 overflow-x-auto leading-loose">
{`{
  "ok": true,
  "data": [
    {
      "session_key": "device-01",
      "status": "connected",
      "phone_number": "62895412144456"
    }
  ]
}`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: WEBHOOKS */}
          {activeTab === "webhooks" && (
            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
              <div className="space-y-4">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Webhook Events & Keamanan</h2>
                <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-3xl">
                  Sistem kami akan mengirimkan HTTP POST ke URL Webhook Anda setiap kali terjadi event tertentu (pesan masuk, status terkirim/dibaca, perubahan sesi). 
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-8 rounded-[2rem] bg-white border border-slate-100 shadow-sm">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center font-black mb-4">1</div>
                  <h3 className="font-black text-slate-800 mb-2">message.incoming</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">Triggered saat nomor WhatsApp Anda menerima pesan teks atau media baru dari pelanggan.</p>
                </div>
                <div className="p-8 rounded-[2rem] bg-white border border-slate-100 shadow-sm">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center font-black mb-4">2</div>
                  <h3 className="font-black text-slate-800 mb-2">message.status</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">Triggered saat status pesan berubah menjadi <span className="italic">sent, delivered,</span> atau <span className="italic">read</span> (centang biru).</p>
                </div>
              </div>

              <div className="p-8 rounded-[2.5rem] bg-slate-800 text-white mt-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/20 rounded-full blur-[50px]"></div>
                <h3 className="text-lg font-black tracking-tight mb-4 relative z-10">Verifikasi Signature (Keamanan)</h3>
                <p className="text-[13px] text-slate-300 leading-relaxed font-medium relative z-10">
                  Untuk memastikan request webhook benar-benar berasal dari server kami, kami menyertakan header <code className="bg-slate-900 px-2 py-1 rounded text-rose-400 font-mono">X-Webhook-Signature</code>. Generate hash HMAC-SHA256 dari raw request body menggunakan <strong className="text-white">Webhook Secret</strong> Anda, lalu cocokkan dengan header tersebut.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="px-12 py-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-blue-600/20 mt-12">
        <div className="space-y-2 text-center md:text-left">
          <h3 className="text-2xl font-black tracking-tighter italic">Butuh bantuan integrasi lanjutan?</h3>
          <p className="text-[13px] font-bold opacity-80 leading-relaxed max-w-xl">
            Tim *developer support* kami siap membantu Anda menyambungkan ERP, CRM, atau sistem bisnis Anda ke infrastruktur WhatsApp kami.
          </p>
        </div>
        <button className="px-10 py-5 bg-white text-blue-600 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 shrink-0">
          Hubungi Engineer
        </button>
      </div>
      
    </div>
  );
}