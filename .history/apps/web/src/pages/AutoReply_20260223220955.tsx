import React, { useState, useEffect } from "react";

// --- MOCK API UNTUK PREVIEW ---
// Catatan: Hapus blok ini dan ganti dengan `apiFetch` asli saat integrasi backend
let mockRules = [
  { id: 1, keyword: "ping", match_type: "exact", reply_text: "PONG! Sistem berjalan lancar 🤖", is_active: true },
  { id: 2, keyword: "harga", match_type: "contains", reply_text: "Halo! Untuk informasi harga, Anda bisa mengunjungi website kami di domain.com/pricing.", is_active: true }
];

const apiFetch = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (init.method === "POST") {
        const body = JSON.parse(init.body as string);
        const newRule = { id: Date.now(), ...body, is_active: true };
        mockRules.push(newRule);
        resolve({ ok: true, data: newRule } as any);
      } else if (init.method === "DELETE") {
        const id = parseInt(path.split("/").pop() || "0");
        mockRules = mockRules.filter(r => r.id !== id);
        resolve({ ok: true } as any);
      } else {
        resolve({ ok: true, data: [...mockRules] } as any);
      }
    }, 500);
  });
};
// --- END MOCK API ---

interface AutoReplyRule {
  id: number;
  keyword: string;
  match_type: "exact" | "contains" | "startswith";
  reply_text: string;
  is_active: boolean;
}

export default function AutoReply() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"exact" | "contains" | "startswith">("exact");
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>("auto-reply");
      setRules(res.data || []);
    } catch (error) {
      console.error("Gagal memuat aturan:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !replyText.trim()) return;

    setSaving(true);
    try {
      await apiFetch("auto-reply", {
        method: "POST",
        body: JSON.stringify({ keyword, match_type: matchType, reply_text: replyText }),
      });
      setKeyword("");
      setReplyText("");
      setMatchType("exact");
      setIsCreating(false);
      fetchRules();
    } catch (err) {
      alert("Gagal menyimpan aturan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus aturan auto-reply ini?")) return;
    try {
      await apiFetch(`auto-reply/${id}`, { method: "DELETE" });
      fetchRules();
    } catch (err) {
      alert("Gagal menghapus");
    }
  };

  const getMatchTypeLabel = (type: string) => {
    switch (type) {
      case "exact": return "Sama Persis";
      case "contains": return "Mengandung Kata";
      case "startswith": return "Diawali Dengan";
      default: return type;
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bot Auto Reply</h1>
          <p className="text-gray-500 text-sm mt-1">Atur balasan otomatis berdasarkan kata kunci pesan masuk.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          {isCreating ? "Batal" : "+ Buat Aturan Baru"}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSave} className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Aturan Balasan Baru</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Kata Kunci (Keyword)</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Contoh: ping, harga, info"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipe Pencocokan</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="exact">Sama Persis (Harus sama persis)</option>
                <option value="contains">Mengandung Kata (Ada di tengah kalimat)</option>
                <option value="startswith">Diawali Dengan (Ada di awal kalimat)</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Teks Balasan (Auto Reply)</label>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Ketik balasan bot di sini..."
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              required
            ></textarea>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-gray-900 hover:bg-black text-white px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer disabled:bg-gray-400"
            >
              {saving ? "Menyimpan..." : "Simpan Aturan"}
            </button>
          </div>
        </form>
      )}

      {/* Tabel Aturan */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat aturan auto-reply...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center">
            <div className="text-4xl mb-3">🤖</div>
            <p>Belum ada aturan Auto Reply.</p>
            <p className="text-sm mt-1">Buat aturan baru untuk membiarkan bot membalas pesan secara otomatis.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
                <th className="p-4 font-semibold w-1/4">Kondisi (Jika pesan...)</th>
                <th className="p-4 font-semibold">Balas Dengan</th>
                <th className="p-4 font-semibold text-center w-24">Status</th>
                <th className="p-4 font-semibold text-right w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="p-4 align-top">
                    <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold mb-1 mr-2">
                      {getMatchTypeLabel(rule.match_type)}
                    </span>
                    <div className="font-mono text-gray-800 text-sm mt-1">"{rule.keyword}"</div>
                  </td>
                  <td className="p-4 align-top">
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{rule.reply_text}</div>
                  </td>
                  <td className="p-4 align-top text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {rule.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="p-4 align-top text-right">
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}