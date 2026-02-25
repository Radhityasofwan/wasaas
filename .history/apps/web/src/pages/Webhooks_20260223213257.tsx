import React, { useState, useEffect } from "react";

// Catatan: Di lingkungan lokal Anda, hapus blok MOCK API ini dan aktifkan kembali import di bawah:
// import { apiFetch } from "../lib/api";

// --- MOCK API UNTUK PREVIEW ---
let mockWebhook = {
  id: 1,
  url: "https://myapp.com/api/webhook",
  is_active: true,
  secret_head: "a8b3f9c2",
  events: ["message.incoming", "session.update"]
};

const apiFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (path === "webhooks" && (!init.method || init.method === "GET")) {
        resolve({ ok: true, data: mockWebhook.url ? mockWebhook : null } as any);
      } else if (path === "webhooks/set" && init.method === "POST") {
        const body = JSON.parse(init.body as string);
        mockWebhook = {
          ...mockWebhook,
          url: body.url,
          is_active: body.status === "active",
          events: body.events || [],
          secret_head: mockWebhook.secret_head || Math.random().toString(16).slice(2, 10)
        };
        resolve({ 
          ok: true, 
          id: mockWebhook.id, 
          url: mockWebhook.url, 
          is_active: mockWebhook.is_active ? 1 : 0,
          secret_head: mockWebhook.secret_head,
          events: mockWebhook.events
        } as any);
      } else {
        reject(new Error("Route not found in mock"));
      }
    }, 600);
  });
};
// --- END MOCK API ---

const AVAILABLE_EVENTS = [
  { id: "message.incoming", label: "Pesan Masuk", desc: "Menerima pesan baru dari kontak" },
  { id: "message.status", label: "Status Pesan", desc: "Update status pesan (Terkirim, Dibaca, Gagal)" },
  { id: "session.update", label: "Status Sesi WA", desc: "Perubahan koneksi (Connected, Disconnected)" },
  { id: "broadcast.status", label: "Status Broadcast", desc: "Progres dan hasil pengiriman WA Blast" },
];

export default function Webhooks() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [url, setUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [secretHead, setSecretHead] = useState<string>("");

  useEffect(() => {
    fetchWebhook();
  }, []);

  const fetchWebhook = async () => {
    setLoading(true);
    try {
      // Panggil rute GET /webhooks yang baru kita buat
      const res = await apiFetch<any>("webhooks");
      if (res.data) {
        setUrl(res.data.url || "");
        setIsActive(res.data.is_active);
        setSelectedEvents(res.data.events || []);
        setSecretHead(res.data.secret_head || "");
      } else {
        // Default selection jika belum ada webhook
        setSelectedEvents(["message.incoming", "message.status", "session.update", "broadcast.status"]);
      }
    } catch (error: any) {
      console.error("Gagal memuat webhook:", error);
      // Fallback diam-diam agar user tetap bisa set webhook baru
    } finally {
      setLoading(false);
    }
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await apiFetch<any>("webhooks/set", {
        method: "POST",
        body: JSON.stringify({
          url: url.trim(),
          status: isActive ? "active" : "inactive",
          events: selectedEvents
        }),
      });

      setSecretHead(res.secret_head);
      setMessage({ type: "success", text: "Konfigurasi Webhook berhasil disimpan!" });
      
      // Hilangkan pesan sukses setelah 3 detik
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal menyimpan Webhook." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Memuat konfigurasi Webhook...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Webhooks</h1>
        <p className="text-gray-500 text-sm mt-1">
          Terima *update* real-time (pesan masuk, status blast, dll) langsung ke server Anda.
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <form onSubmit={handleSave} className="p-6">
          
          {/* Endpoint URL */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Endpoint URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.domain-anda.com/wa-webhook"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
            <p className="text-xs text-gray-500 mt-2">
              URL ini harus dapat menerima *request* HTTP POST. Pastikan server Anda merespons dengan status 200 OK.
            </p>
          </div>

          {/* Events Selection */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Pilih Event yang Dikirim</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AVAILABLE_EVENTS.map((evt) => (
                <label 
                  key={evt.id} 
                  className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedEvents.includes(evt.id) ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    checked={selectedEvents.includes(evt.id)}
                    onChange={() => toggleEvent(evt.id)}
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-gray-900">{evt.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{evt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
            {selectedEvents.length === 0 && (
              <p className="text-red-500 text-xs mt-2">Pilih minimal satu event untuk dikirim.</p>
            )}
          </div>

          <hr className="border-gray-100 mb-6" />

          {/* Secret Key & Status */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Webhook Secret</label>
              <div className="flex items-center gap-2">
                <code className="bg-gray-100 border border-gray-200 text-gray-800 px-3 py-1.5 rounded-md text-sm font-mono">
                  {secretHead ? `${secretHead}••••••••••••••••` : "Belum di-*generate*"}
                </code>
              </div>
              <p className="text-xs text-gray-500 mt-2 max-w-md">
                Gunakan secret ini untuk memverifikasi HMAC SHA256 *signature* pada *header* <code className="text-[10px] bg-gray-100 p-0.5 rounded">X-Webhook-Signature</code>.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {isActive ? "Aktif" : "Nonaktif"}
                </span>
              </label>

              <button
                type="submit"
                disabled={saving || selectedEvents.length === 0}
                className="bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white px-6 py-2.5 rounded-lg font-medium transition-colors cursor-pointer"
              >
                {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}