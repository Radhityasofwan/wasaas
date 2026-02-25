import { useEffect, useState } from "react";

/**
 * HELPER INTERNAL
 */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

type LeadRow = {
  to_number: string;
  total_broadcasts: number;
  last_sent_at: string;
  last_reply_at: string | null;
  has_replied: number;
  reply_preview: string | null;
};

export default function Leads() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/leads?limit=100&filter=${filter}`);
      setLeads(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [filter]);

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Prospek</h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Klasifikasi Leads & Respon Kontak</p>
        </div>
        <div className="flex gap-3">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white/40 px-6 py-4 rounded-[1.5rem] border border-white text-xs font-black text-slate-600 outline-none focus:bg-white/80 transition-all appearance-none shadow-sm uppercase tracking-widest">
            <option value="all">Semua Status</option>
            <option value="replied">🔥 Hot Leads</option>
            <option value="pending">❄️ Cold Leads</option>
          </select>
          <button onClick={loadData} className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          </button>
        </div>
      </div>

      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/40">
                <th className="px-10 py-8">Nomor WhatsApp</th>
                <th className="px-10 py-8 text-center">Klasifikasi</th>
                <th className="px-10 py-8 text-center">Total Broadcast</th>
                <th className="px-10 py-8">Interaksi Terakhir</th>
                <th className="px-10 py-8">Balasan Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {loading ? (
                <tr><td colSpan={5} className="px-10 py-24 text-center text-slate-300 font-bold animate-pulse uppercase tracking-[0.2em]">Memuat Prospek...</td></tr>
              ) : leads.map((lead) => (
                <tr key={lead.to_number} className="hover:bg-white/40 transition-all">
                  <td className="px-10 py-7">
                    <div className="font-black text-slate-800 text-lg tracking-tighter">{lead.to_number}</div>
                  </td>
                  <td className="px-10 py-7 text-center">
                    {lead.has_replied ? (
                      <span className="px-4 py-2 rounded-full bg-rose-50 text-rose-500 text-[10px] font-black uppercase tracking-widest border border-rose-100 shadow-sm">🔥 Hot Lead</span>
                    ) : (
                      <span className="px-4 py-2 rounded-full bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest border border-slate-200">❄️ Cold Lead</span>
                    )}
                  </td>
                  <td className="px-10 py-7 text-center">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-blue-500 text-xs border border-white mx-auto">{lead.total_broadcasts}</div>
                  </td>
                  <td className="px-10 py-7">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                      {lead.last_reply_at ? <span className="text-blue-500">Balas: {fmtDate(lead.last_reply_at)}</span> : <span>Kirim: {fmtDate(lead.last_sent_at)}</span>}
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    {lead.reply_preview ? (
                      <div className="max-w-xs px-5 py-3 rounded-[1.5rem] bg-white/60 border border-white text-xs font-medium text-slate-600 italic line-clamp-1 shadow-sm">
                        "{lead.reply_preview}"
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Tidak ada Balasan</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && leads.length === 0 && <tr><td colSpan={5} className="px-10 py-24 text-center text-slate-300 font-black uppercase tracking-[0.3em] opacity-40">Belum Ada Data Leads</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}