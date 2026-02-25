import React, { useState, useEffect } from "react";

// Catatan: Di lingkungan lokal Anda, hapus blok MOCK API ini dan aktifkan kembali import di bawah:
// import { apiFetch } from "../lib/api";

// --- MOCK API UNTUK PREVIEW ---
let mockKeys = [
  {
    id: 1,
    name: "Aplikasi Utama",
    scopes_json: null,
    last_used_at: new Date().toISOString(),
    revoked_at: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  }
];

const apiFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (path === "api-keys" && init.method === "POST") {
        const body = JSON.parse(init.body as string);
        if (!body.name) return reject(new Error("Name is required"));
        
        const newKey = {
          id: Date.now(),
          name: body.name,
          scopes_json: null,
          last_used_at: null,
          revoked_at: null,
          created_at: new Date().toISOString()
        };
        mockKeys.push(newKey);
        
        // Generate random fake API key
        const randomKey = "live_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        resolve({ data: newKey, apiKey: randomKey } as any);
      } else if (path.startsWith("api-keys/") && init.method === "DELETE") {
        const id = parseInt(path.split("/")[1]);
        const key = mockKeys.find(k => k.id === id);
        if (key) {
          key.revoked_at = new Date().toISOString();
        }
        resolve({ ok: true } as any);
      } else {
        // Default to GET list
        resolve({ data: [...mockKeys].sort((a, b) => b.id - a.id) } as any);
      }
    }, 600); // Simulasi latensi jaringan
  });
};
// --- END MOCK API ---

interface ApiKey {
  id: number;
  name: string;
  scopes_json: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State untuk form create
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // State untuk menampilkan API Key baru (hanya muncul sekali)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<any>("api-keys");
      const data = Array.isArray(res) ? res : res.data || [];
      setKeys(data);
    } catch (err: any) {
      setError(err.message || "Gagal memuat API Keys.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch<any>("api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      });
      
      const generatedKey = res.apiKey || res.data?.apiKey;
      
      setNewlyCreatedKey(generatedKey);
      setNewName("");
      setIsCreating(false);
      fetchKeys(); // Refresh daftar
    } catch (err: any) {
      setError(err.message || "Gagal membuat API Key.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin mencabut (revoke) API Key ini? Tindakan ini tidak dapat dibatalkan dan integrasi yang menggunakannya akan terputus.")) {
      return;
    }

    try {
      await apiFetch(`api-keys/${id}`, { method: "DELETE" });
      fetchKeys();
    } catch (err: any) {
      alert(err.message || "Gagal mencabut API Key.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("API Key berhasil disalin ke clipboard!");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">API Keys</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola akses programatis ke layanan WA SaaS Anda.</p>
        </div>
        <button
          onClick={() => {
            setIsCreating(!isCreating);
            setNewlyCreatedKey(null);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {isCreating ? "Batal" : "+ Buat API Key Baru"}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Form Buat Key Baru */}
      {isCreating && (
        <form onSubmit={handleCreate} className="mb-6 p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Buat API Key Baru</h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Contoh: Integrasi Zapier, Webhook App, dll"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer"
            >
              {creating ? "Membuat..." : "Generate Key"}
            </button>
          </div>
        </form>
      )}

      {/* Alert API Key Baru Dibuat */}
      {newlyCreatedKey && (
        <div className="mb-6 p-5 bg-green-50 border border-green-200 rounded-xl shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="text-green-800 font-semibold mb-1">Berhasil Dibuat! Simpan API Key Anda.</h3>
              <p className="text-green-700 text-sm mb-3">
                Mohon salin API Key di bawah ini. Untuk alasan keamanan, <strong>Anda tidak akan bisa melihat key ini lagi</strong> setelah halaman dimuat ulang.
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-white border border-green-300 text-green-800 px-4 py-2 rounded-lg flex-1 select-all break-all">
                  {newlyCreatedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedKey)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  Salin Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabel API Keys */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat data API Keys...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Belum ada API Key. Silakan buat satu untuk mulai menggunakan API.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
                <th className="p-4 font-semibold">Nama</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Dibuat Pada</th>
                <th className="p-4 font-semibold">Terakhir Digunakan</th>
                <th className="p-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((key) => {
                const isRevoked = !!key.revoked_at;
                return (
                  <tr key={key.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{key.name}</div>
                      {/* Menampilkan prefix sebagai identitas, raw tidak ada di sini */}
                      <div className="text-xs text-gray-400 mt-0.5 font-mono">live_••••••••</div>
                    </td>
                    <td className="p-4">
                      {isRevoked ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {formatDate(key.last_used_at)}
                    </td>
                    <td className="p-4 text-right">
                      {!isRevoked && (
                        <button
                          onClick={() => handleRevoke(key.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}