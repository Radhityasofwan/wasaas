import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Key, MessageSquare, Smartphone, Zap, ArrowRight, ShieldAlert, AlertTriangle } from "lucide-react";

type Tab = "auth" | "messages" | "sessions" | "webhooks";

export default function Docs() {
  const [activeTab, setActiveTab] = useState<Tab>("auth");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "auth", label: "Otentikasi & Limit", icon: <Key size={18} /> },
    { id: "messages", label: "Kirim Pesan", icon: <MessageSquare size={18} /> },
    { id: "sessions", label: "Sesi & Device", icon: <Smartphone size={18} /> },
    { id: "webhooks", label: "Webhooks", icon: <Zap size={18} /> },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20 w-full">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <TerminalIcon className="text-[#0b57d0]" size={28} />
            Developer API
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Dokumentasi Integrasi HTTP REST.
          </p>
        </div>
        
        <Link 
          to="/api-keys"
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0b57d0] text-white font-bold text-sm hover:bg-[#001d35] active:scale-95 transition-all shadow-sm w-full md:w-auto shrink-0"
        >
          <span>Buat API Key</span>
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full">
        
        {/* SIDEBAR TABS (Kiri / Atas) */}
        <div className="w-full lg:w-[240px] shrink-0 flex lg:flex-col gap-2 overflow-x-auto scrollbar-hide bg-white p-2 rounded-2xl lg:rounded-3xl border border-slate-100 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 md:px-5 md:py-3.5 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-[#c2e7ff] text-[#001d35]"
                  : "bg-transparent text-slate-500 hover:bg-[#f0f4f9] hover:text-slate-800"
              }`}
            >
              <span className={activeTab === tab.id ? "text-[#001d35]" : "text-slate-400"}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT AREA (Kanan / Bawah) - DITAMBAHKAN min-w-0 AGAR TIDAK MELEBAR */}
        <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-3xl p-5 md:p-8 lg:p-10 shadow-sm min-h-[500px]">
          
          {/* TAB 1: AUTHENTICATION */}
          {activeTab === "auth" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <section className="space-y-4">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Otentikasi API</h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                  Seluruh endpoint API dilindungi dan membutuhkan otentikasi. Anda harus menyertakan API Key aktif Anda pada setiap HTTP Request melalui header <code className="bg-[#f0f4f9] text-[#0b57d0] px-2 py-0.5 rounded font-mono text-xs">x-api-key</code>.
                </p>

                {/* DITAMBAHKAN w-full dan overflow-hidden */}
                <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md mt-4 w-full">
                  <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#444] flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                    <span className="ml-2 text-[10px] font-mono text-slate-300">Contoh Request (cURL)</span>
                  </div>
                  <div className="overflow-x-auto w-full">
                    <pre className="p-4 md:p-5 text-xs md:text-sm font-mono text-slate-300 leading-loose">
<span className="text-[#c792ea]">curl</span> --request GET \
  --url https://api.domainanda.com/v1/sessions \
  --header <span className="text-[#c3e88d]">'x-api-key: ak_live_xxxxxxxxx'</span> \
  --header <span className="text-[#c3e88d]">'Content-Type: application/json'</span>
                    </pre>
                  </div>
                </div>
              </section>

              <hr className="border-slate-100" />

              <section className="space-y-5">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Rate Limits & Error Codes</h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                  Berdasarkan paket (plan) Anda, sistem menerapkan pembatasan pada level tenant (`enforce.ts` & `auth.ts`). Berikut adalah kode error yang mungkin dikembalikan:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-3">
                    <ShieldAlert size={20} className="text-rose-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-rose-700 font-bold text-sm block mb-1">HTTP 401 / 403</span>
                      <p className="text-xs text-rose-600/90 font-medium leading-relaxed">API Key tidak valid, tidak ditemukan, atau telah dicabut (revoked).</p>
                    </div>
                  </div>
                  <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                    <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-amber-700 font-bold text-sm block mb-1">HTTP 429</span>
                      <p className="text-xs text-amber-600/90 font-medium leading-relaxed break-words">
                        <code className="bg-white/60 px-1 rounded border border-amber-200 inline-block mb-1 w-max max-w-full truncate">message_limit_reached</code><br/>
                        Kuota pesan harian Anda telah habis.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: MESSAGES */}
          {activeTab === "messages" && (
            <div className="space-y-10 animate-in slide-in-from-right-4 duration-300">
              {/* Send Text */}
              <section className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Kirim Pesan Teks</h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-200">POST</span>
                    <code className="text-sm font-bold text-slate-600 bg-[#f0f4f9] px-2 py-0.5 rounded break-all">/v1/messages/send-text</code>
                  </div>
                </div>

                <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md w-full">
                  <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#444] flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-300">JSON Request Body</span>
                  </div>
                  <div className="overflow-x-auto w-full">
                    <pre className="p-4 md:p-5 text-xs md:text-sm font-mono text-[#82aaff] leading-loose">
{`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "text": "Halo! Ini pesan notifikasi dari sistem."
}`}
                    </pre>
                  </div>
                  <div className="bg-[#1a1a1a] p-4 border-t border-[#333]">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Response (Sukses)</div>
                    <code className="text-xs font-mono text-[#c3e88d] break-all">{`{ "ok": true, "messageId": "BAE5..." }`}</code>
                  </div>
                </div>
              </section>

              <hr className="border-slate-100" />

              {/* Send Media */}
              <section className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Kirim Media (Gambar/Dokumen)</h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-200">POST</span>
                    <code className="text-sm font-bold text-slate-600 bg-[#f0f4f9] px-2 py-0.5 rounded break-all">/v1/messages/send-media</code>
                  </div>
                </div>

                <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md w-full">
                  <div className="overflow-x-auto w-full">
                    <pre className="p-4 md:p-5 text-xs md:text-sm font-mono text-[#c792ea] leading-loose">
{`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "type": "document", // Tersedia: image, document, video
  "url": "https://domain.com/invoice.pdf",
  "caption": "Berikut adalah tagihan Anda bulan ini."
}`}
                    </pre>
                  </div>
                </div>
              </section>

              <hr className="border-slate-100" />

              {/* Send Location */}
              <section className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Kirim Lokasi Peta</h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-200">POST</span>
                    <code className="text-sm font-bold text-slate-600 bg-[#f0f4f9] px-2 py-0.5 rounded break-all">/v1/messages/send-location</code>
                  </div>
                </div>

                <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md w-full">
                  <div className="overflow-x-auto w-full">
                    <pre className="p-4 md:p-5 text-xs md:text-sm font-mono text-[#ffcb6b] leading-loose">
{`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "name": "Kantor Pusat",
  "address": "Jl. Sudirman No. 1, Jakarta"
}`}
                    </pre>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: SESSIONS */}
          {activeTab === "sessions" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Cek Status Sesi</h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                  Gunakan endpoint ini untuk memantau apakah nomor WhatsApp (device) Anda sedang dalam status terhubung (<code className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">connected</code>) atau terputus.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-3 py-1 bg-[#e9eef6] text-[#0b57d0] text-[10px] font-bold uppercase tracking-wider rounded-md border border-[#c2e7ff]">GET</span>
                <code className="text-sm font-bold text-slate-600 bg-[#f0f4f9] px-2 py-0.5 rounded break-all">/v1/sessions</code>
              </div>

              <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md mt-4 w-full">
                 <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#444] flex items-center">
                    <span className="text-[10px] font-mono text-slate-300">Response (200 OK)</span>
                 </div>
                <div className="overflow-x-auto w-full">
                  <pre className="p-4 md:p-5 text-xs md:text-sm font-mono text-[#c3e88d] leading-loose">
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
            </div>
          )}

          {/* TAB 4: WEBHOOKS */}
          {activeTab === "webhooks" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Webhook Events & Keamanan</h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                  Sistem kami akan mengirimkan HTTP POST ke URL Webhook Anda setiap kali terjadi aktivitas. Berikut adalah format event yang akan Anda terima.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-[#f8fafd] border border-slate-100">
                  <div className="w-8 h-8 bg-white text-[#0b57d0] rounded-full flex items-center justify-center font-bold mb-3 shadow-sm border border-slate-200">1</div>
                  <h3 className="font-bold text-slate-800 mb-1.5 text-sm">message.incoming</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Nomor WhatsApp Anda menerima pesan teks/media baru.</p>
                </div>
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <div className="w-8 h-8 bg-white text-emerald-600 rounded-full flex items-center justify-center font-bold mb-3 shadow-sm border border-emerald-200">2</div>
                  <h3 className="font-bold text-slate-800 mb-1.5 text-sm">message.status</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Status pesan keluar berubah (<span className="italic">sent, delivered, read</span>).</p>
                </div>
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100">
                  <div className="w-8 h-8 bg-white text-amber-600 rounded-full flex items-center justify-center font-bold mb-3 shadow-sm border border-amber-200">3</div>
                  <h3 className="font-bold text-slate-800 mb-1.5 text-sm">session.update</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Sesi WA terputus atau terhubung ulang.</p>
                </div>
              </div>

              <div className="p-5 md:p-8 rounded-3xl bg-[#001d35] text-white mt-8 shadow-sm overflow-hidden w-full">
                <h3 className="text-lg font-bold tracking-tight mb-3">Custom Headers & HMAC Signature</h3>
                <p className="text-sm text-[#c2e7ff] leading-relaxed mb-6">
                  Setiap request dari sistem kami akan membawa header wajib berikut:
                </p>
                <div className="space-y-3 w-full">
                  <div className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4 w-full">
                    <code className="text-xs bg-[#0b57d0] px-2 py-1 rounded text-white font-mono w-max md:w-48 shrink-0 break-all">X-Webhook-Event</code>
                    <span className="text-xs text-slate-300">Tipe event (contoh: message.incoming)</span>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4 w-full">
                    <code className="text-xs bg-[#0b57d0] px-2 py-1 rounded text-white font-mono w-max md:w-48 shrink-0 break-all">X-Webhook-Delivery-Id</code>
                    <span className="text-xs text-slate-300">ID unik pengiriman (untuk mencegah duplikasi)</span>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4 w-full">
                    <code className="text-xs bg-[#0b57d0] px-2 py-1 rounded text-white font-mono w-max md:w-48 shrink-0 break-all">X-Webhook-Tenant</code>
                    <span className="text-xs text-slate-300">ID Tenant SaaS Anda</span>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4 pt-2 w-full">
                    <code className="text-xs bg-rose-500/20 border border-rose-500/50 px-2 py-1 rounded text-rose-300 font-mono w-max md:w-48 shrink-0 break-all">X-Webhook-Signature</code>
                    <span className="text-xs text-slate-300">Validasi HMAC-SHA256 dari request body menggunakan rahasia (secret) Anda.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="p-6 md:p-10 bg-[#f0f4f9] rounded-3xl border border-[#c2e7ff] flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden">
        <div className="space-y-1 text-center md:text-left min-w-0">
          <h3 className="text-lg font-bold text-slate-800">Butuh Bantuan Integrasi?</h3>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xl break-words">
            Tim developer kami siap membantu Anda menyambungkan ERP, CRM, atau sistem bisnis internal Anda.
          </p>
        </div>
        <button className="px-8 py-3.5 bg-white text-[#0b57d0] border border-slate-200 rounded-full font-bold text-sm hover:bg-[#e9eef6] active:scale-95 transition-all shadow-sm shrink-0 whitespace-nowrap">
          Hubungi Engineer
        </button>
      </div>
      
    </div>
  );
}

// Icon Helper untuk Judul
function TerminalIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}