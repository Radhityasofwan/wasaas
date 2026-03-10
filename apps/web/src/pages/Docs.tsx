import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Key,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldAlert,
  Smartphone,
  Zap,
} from "lucide-react";

type Tab = "auth" | "messages" | "sessions" | "broadcast" | "webhooks" | "admin";

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="bg-[#1f1f1f] rounded-2xl overflow-hidden border border-[#333] shadow-md w-full">
      <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#444]">
        <span className="text-[10px] font-mono text-slate-300">{title}</span>
      </div>
      <div className="overflow-x-auto w-full">
        <pre className="p-4 md:p-5 text-xs md:text-sm font-mono text-slate-200 leading-loose">{code}</pre>
      </div>
    </div>
  );
}

function EndpointCard({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  desc: string;
}) {
  const badgeClass =
    method === "GET"
      ? "bg-[#e9eef6] text-[#0b57d0] border-[#c2e7ff]"
      : method === "POST"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : method === "PUT"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <div className="p-4 rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${badgeClass}`}>
          {method}
        </span>
        <code className="text-xs md:text-sm font-semibold text-slate-700 bg-[#f0f4f9] px-2 py-0.5 rounded break-all">
          {path}
        </code>
      </div>
      <p className="text-xs md:text-sm text-slate-600 mt-2 leading-relaxed">{desc}</p>
    </div>
  );
}

export default function Docs() {
  const [activeTab, setActiveTab] = useState<Tab>("auth");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "auth", label: "Auth & Limits", icon: <Key size={18} /> },
    { id: "messages", label: "Messages", icon: <MessageSquare size={18} /> },
    { id: "sessions", label: "Sessions", icon: <Smartphone size={18} /> },
    { id: "broadcast", label: "Broadcast", icon: <Megaphone size={18} /> },
    { id: "webhooks", label: "Webhooks", icon: <Zap size={18} /> },
    { id: "admin", label: "Admin Billing", icon: <Settings size={18} /> },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20 w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Zap className="text-[#0b57d0]" size={28} />
            Developer API
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">Base URL API: <code>/api</code></p>
        </div>

        <Link
          to="/api-keys"
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0b57d0] text-white font-bold text-sm hover:bg-[#001d35] transition-all shadow-sm w-full md:w-auto shrink-0"
        >
          <span>Buat API Key</span>
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full">
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
              <span className={activeTab === tab.id ? "text-[#001d35]" : "text-slate-400"}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-3xl p-5 md:p-8 lg:p-10 shadow-sm min-h-[500px]">
          {activeTab === "auth" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <section className="space-y-3">
                <h2 className="text-xl md:text-2xl font-bold text-slate-800">Authentication</h2>
                <p className="text-sm text-slate-600">
                  Semua endpoint membutuhkan header <code>x-api-key</code>. Contoh:
                </p>
                <CodeBlock
                  title="cURL"
                  code={`curl --request GET \\
  --url http://localhost:3001/api/health \\
  --header 'x-api-key: live_xxxxxxxxx'`}
                />
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-800">Limit Rules</h2>
                <p className="text-sm text-slate-600">
                  Limit diambil dari snapshot subscription tenant: <code>limit_sessions</code>,{" "}
                  <code>limit_messages_daily</code>, <code>limit_broadcast_daily</code>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-3">
                    <ShieldAlert size={18} className="text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-rose-700">401/403</div>
                      <p className="text-xs text-rose-600">API key tidak valid / revoked / tidak berizin.</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-amber-700">429</div>
                      <p className="text-xs text-amber-600">Limit harian atau limit session tercapai.</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start gap-3">
                    <Key size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-emerald-700">Superadmin</div>
                      <p className="text-xs text-emerald-600">Role <code>admin</code> tidak dibatasi kuota.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Messaging Endpoints</h2>

              <div className="space-y-3">
                <EndpointCard method="POST" path="/api/messages/send" desc="Kirim text message." />
                <EndpointCard
                  method="POST"
                  path="/api/messages/send-interactive"
                  desc="Kirim interactive: buttons, quick_reply, list, cta, template."
                />
                <EndpointCard
                  method="POST"
                  path="/api/messages/send-media"
                  desc="Unified media sender: image, video, document, audio, voice_note, sticker, location."
                />
                <EndpointCard method="POST" path="/api/messages/send-location" desc="Kirim lokasi lat/long." />
              </div>

              <CodeBlock
                title="JSON - send text"
                code={`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "text": "Halo, ini notifikasi dari sistem."
}`}
              />

              <CodeBlock
                title="JSON - send interactive list"
                code={`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "kind": "list",
  "body": "Silakan pilih konfirmasi Anda:",
  "buttonText": "Pilih",
  "sections": [
    {
      "title": "Konfirmasi",
      "rows": [
        { "title": "Ya", "description": "Lanjutkan pesanan", "rowId": "yes" },
        { "title": "Tidak", "description": "Batalkan", "rowId": "no" }
      ]
    }
  ]
}`}
              />

              <CodeBlock
                title="Multipart - send media upload"
                code={`curl --request POST http://localhost:3001/api/messages/send-media \\
  --header 'x-api-key: live_xxx' \\
  --form 'sessionKey=device-01' \\
  --form 'to=628123456789' \\
  --form 'type=image' \\
  --form 'caption=Promo hari ini' \\
  --form 'file=@C:/tmp/promo.jpg'`}
              />

              <CodeBlock
                title="JSON - send media via URL"
                code={`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "type": "document",
  "url": "https://domain.com/invoice.pdf",
  "caption": "Invoice terbaru"
}`}
              />
            </div>
          )}

          {activeTab === "sessions" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Session Endpoints</h2>
              <div className="space-y-3">
                <EndpointCard method="POST" path="/api/sessions/start" desc="Start atau reconnect session." />
                <EndpointCard method="POST" path="/api/sessions/stop" desc="Stop runtime socket session." />
                <EndpointCard method="POST" path="/api/sessions/delete" desc="Hapus session dan auth state lokal." />
                <EndpointCard method="GET" path="/api/sessions/qr?sessionKey=..." desc="Ambil QR session." />
                <EndpointCard method="GET" path="/api/ui/sessions" desc="List sessions untuk inbox/dashboard." />
              </div>

              <CodeBlock
                title="JSON - start session"
                code={`{
  "sessionKey": "device-01"
}`}
              />
            </div>
          )}

          {activeTab === "broadcast" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Broadcast Endpoints</h2>
              <div className="space-y-3">
                <EndpointCard
                  method="POST"
                  path="/api/broadcast/create"
                  desc="Buat broadcast job. Mendukung text/media/location + templateId + schedule + upload file."
                />
                <EndpointCard method="GET" path="/api/broadcast/jobs" desc="List job broadcast tenant." />
                <EndpointCard method="GET" path="/api/broadcast/:id" desc="Detail job." />
                <EndpointCard method="GET" path="/api/broadcast/:id/items" desc="Detail item target per job." />
                <EndpointCard method="POST" path="/api/broadcast/:id/pause" desc="Pause job." />
                <EndpointCard method="POST" path="/api/broadcast/:id/resume" desc="Resume job." />
                <EndpointCard method="POST" path="/api/broadcast/:id/cancel" desc="Cancel job." />
                <EndpointCard method="DELETE" path="/api/broadcast/:id" desc="Hapus job dan item." />
              </div>

              <CodeBlock
                title="JSON - create broadcast"
                code={`{
  "sessionKey": "device-01",
  "name": "Campaign Promo Pagi",
  "msgType": "text",
  "text": "Halo {{nama}}, ada promo untuk Anda",
  "targets": ["628123456789", "628222222222"],
  "delayMs": 1500,
  "scheduledAt": "2026-03-10T10:30"
}`}
              />
            </div>
          )}

          {activeTab === "webhooks" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Webhook Endpoints</h2>
              <div className="space-y-3">
                <EndpointCard method="GET" path="/api/webhooks" desc="Ambil konfigurasi webhook tenant aktif." />
                <EndpointCard method="POST" path="/api/webhooks/set" desc="Set URL, secret, events, dan status webhook." />
                <EndpointCard method="GET" path="/api/push/vapid-public-key" desc="Ambil public key VAPID untuk subscribe browser push." />
                <EndpointCard method="POST" path="/api/push/subscribe" desc="Simpan subscription browser push ke tenant aktif." />
                <EndpointCard method="POST" path="/api/push/test" desc="Kirim test push ke subscription aktif tenant." />
              </div>

              <CodeBlock
                title="JSON - set webhook"
                code={`{
  "url": "https://example.com/webhook/wa",
  "status": "active",
  "events": [
    "message.incoming",
    "message.status",
    "session.update",
    "broadcast.status",
    "broadcast.reply",
    "followup.sent",
    "followup.replied",
    "lead.created"
  ]
}`}
              />

              <CodeBlock
                title="Webhook Headers"
                code={`X-Webhook-Event: message.incoming
X-Webhook-Delivery-Id: <unique-id>
X-Webhook-Tenant: <tenant-id>
X-Webhook-Signature: <hmac-sha256>`}
              />
            </div>
          )}

          {activeTab === "admin" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <h2 className="text-xl md:text-2xl font-bold text-slate-800">Admin & Billing (Superadmin Only)</h2>
              <p className="text-sm text-slate-600">
                Seluruh endpoint di bawah hanya untuk role <code>admin</code>.
              </p>

              <div className="space-y-3">
                <EndpointCard method="GET" path="/api/admin/tenants" desc="List tenant + status subscription + limit snapshot." />
                <EndpointCard method="POST" path="/api/admin/tenants" desc="Buat tenant baru + owner + subscription." />
                <EndpointCard method="PUT" path="/api/admin/tenants/:id/limits" desc="Update status & limit subscription tenant." />
                <EndpointCard method="GET" path="/api/admin/plans" desc="List paket billing." />
                <EndpointCard method="POST" path="/api/admin/plans" desc="Create/update paket billing." />
                <EndpointCard method="GET" path="/api/admin/tenants/:tenantId/subscription" desc="Get subscription terbaru tenant." />
                <EndpointCard method="POST" path="/api/admin/tenants/:tenantId/subscription" desc="Buat subscription baru tenant." />
                <EndpointCard method="POST" path="/api/admin/tenants/:tenantId/subscription/:id/status" desc="Ubah status subscription." />
                <EndpointCard method="GET" path="/api/admin/tenants/:tenantId/payments" desc="List payment tenant." />
                <EndpointCard method="POST" path="/api/admin/tenants/:tenantId/payments" desc="Create payment record." />
              </div>

              <CodeBlock
                title="JSON - update tenant limits"
                code={`{
  "sub_status": "active",
  "limit_sessions": 5,
  "limit_messages_daily": 5000,
  "limit_broadcast_daily": 20
}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
