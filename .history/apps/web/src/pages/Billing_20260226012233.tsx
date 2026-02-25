import React, { useEffect, useState } from "react";
import { PackageOpen, Save, Loader2, AlertTriangle, Smartphone, MessageSquare, Megaphone, Plus } from "lucide-react";

import { useConfirm } from "../App";

/** HELPER INTERNAL */
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
  
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Server Backend mengalami gangguan (Status HTTP ${res.status}).`);
  }

  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

export default function Billing() {
  const confirm = useConfirm();

  const [plans, setPlans] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [planForm, setPlanForm] = useState<any>({
    code: "basic",
    name: "Paket Basic",
    price_monthly: 100000,
    currency: "IDR",
    limit_sessions: 1,
    limit_messages_daily: 500,
    limit_broadcast_daily: 5,
    limit_contacts: 1000,
    feature_api: 1,
    feature_webhook: 1,
    feature_inbox: 1,
    feature_broadcast: 1,
    feature_media: 1,
    is_active: 1,
  });

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const p = await apiFetch<any>("admin/plans");
      const loadedPlans = p.plans || p.data || [];
      setPlans(loadedPlans);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();

    const isConfirmed = await confirm({
      title: "Simpan Paket",
      message: `Anda akan menyimpan konfigurasi paket "${planForm.name}". Lanjutkan?`,
      confirmText: "Simpan Paket"
    });

    if (!isConfirmed) return;

    setSaving(true);
    try {
      setErr("");
      await apiFetch<any>("admin/plans", { method: "POST", body: JSON.stringify(planForm) });
      await load();
      
      // Reset form default after save
      setPlanForm({
        code: "",
        name: "",
        price_monthly: 0,
        currency: "IDR",
        limit_sessions: 1,
        limit_messages_daily: 500,
        limit_broadcast_daily: 5,
        limit_contacts: 1000,
        feature_api: 1, feature_webhook: 1, feature_inbox: 1, feature_broadcast: 1, feature_media: 1,
        is_active: 1,
      });

    } catch (e:any) { 
      setErr(e.message); 
    } finally {
      setSaving(false);
    }
  }

  const loadIntoForm = (p: any) => {
    setPlanForm({ ...p });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <PackageOpen className="text-[#0b57d0]" size={28} />
            Kelola Paket (Billing)
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Master Data Paket Langganan untuk penawaran kepada Klien/Tenant.
          </p>
        </div>
      </div>

      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-start gap-3 animate-in zoom-in-95 duration-300">
          <AlertTriangle size={20} className="shrink-0 text-rose-500 mt-0.5" />
          <div className="flex flex-col">
            <span className="font-bold mb-0.5">Kesalahan Sistem</span>
            <span className="opacity-90 leading-relaxed">{err}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8">
          
        {/* FORM TAMBAH / EDIT PLAN */}
        <div className="xl:col-span-4 space-y-5 bg-white p-5 md:p-6 rounded-3xl border border-slate-100 shadow-sm h-max">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Plus size={16} className="text-[#0b57d0]"/> Buat / Edit Paket
          </h3>
          
          <form onSubmit={savePlan} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Kode Paket (Unik)</label>
              <input type="text" placeholder="cth: starter_pro" required value={planForm.code} onChange={e=>setPlanForm({...planForm, code: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all" />
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Paket</label>
              <input type="text" placeholder="cth: Starter Pro" required value={planForm.name} onChange={e=>setPlanForm({...planForm, name: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all" />
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Harga & Mata Uang</label>
              <div className="flex gap-2">
                <input type="number" min="0" placeholder="Harga Bulanan" required value={planForm.price_monthly} onChange={e=>setPlanForm({...planForm, price_monthly: Number(e.target.value)})} className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all" />
                <input type="text" value={planForm.currency} required onChange={e=>setPlanForm({...planForm, currency: e.target.value})} className="w-20 px-3 py-3 rounded-xl bg-[#f0f4f9] border-none text-sm font-bold text-slate-800 outline-none text-center focus:ring-2 focus:ring-[#c2e7ff] transition-all uppercase" />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Limitasi Kuota (Per Bulan/Hari)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Device WA</label>
                  <input type="number" min="1" required value={planForm.limit_sessions} onChange={e=>setPlanForm({...planForm, limit_sessions: Number(e.target.value)})} className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-[#0b57d0] outline-none focus:border-[#0b57d0] text-center transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Pesan /Hari</label>
                  <input type="number" min="0" required value={planForm.limit_messages_daily} onChange={e=>setPlanForm({...planForm, limit_messages_daily: Number(e.target.value)})} className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-[#0b57d0] outline-none focus:border-[#0b57d0] text-center transition-all" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Blast Broadcast /Hari</label>
                  <input type="number" min="0" required value={planForm.limit_broadcast_daily} onChange={e=>setPlanForm({...planForm, limit_broadcast_daily: Number(e.target.value)})} className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-[#0b57d0] outline-none focus:border-[#0b57d0] text-center transition-all" />
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving} className="w-full py-3.5 mt-2 bg-[#0b57d0] hover:bg-[#001d35] disabled:bg-slate-300 text-white rounded-full font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? "Menyimpan..." : "Simpan Paket"}
            </button>
          </form>
        </div>

        {/* TABLE PLANS */}
        <div className="xl:col-span-8">
          <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-20 text-center flex flex-col items-center">
                <Loader2 size={36} className="animate-spin text-[#0b57d0] mb-3" />
                <div className="text-slate-500 font-bold text-xs uppercase tracking-widest">Memuat Paket...</div>
              </div>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#f8fafd] border-b border-slate-100">
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nama Paket</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Harga / Bulan</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kuota Limit</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {plans.map(p=>(
                        <tr key={p.id} className="hover:bg-[#f8fafd] transition-colors group">
                          <td className="px-6 py-4 align-middle">
                            <div className="font-bold text-slate-800 text-[15px]">{p.name}</div>
                            <div className="text-xs font-mono text-slate-400 mt-0.5">{p.code}</div>
                          </td>
                          <td className="px-6 py-4 align-middle font-bold text-emerald-600 text-sm">
                            {p.price_monthly.toLocaleString()} <span className="text-xs text-emerald-600/70">{p.currency}</span>
                          </td>
                          <td className="px-6 py-4 align-middle">
                            <div className="flex gap-3">
                              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-600 shadow-sm" title="Device WA">
                                <Smartphone size={12} className="text-[#0b57d0]" /> {p.limit_sessions}
                              </div>
                              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-600 shadow-sm" title="Pesan per Hari">
                                <MessageSquare size={12} className="text-[#0b57d0]" /> {p.limit_messages_daily}
                              </div>
                              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-600 shadow-sm" title="Broadcast per Hari">
                                <Megaphone size={12} className="text-[#0b57d0]" /> {p.limit_broadcast_daily}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-middle text-right">
                            <button 
                              onClick={() => loadIntoForm(p)} 
                              className="px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-[#f0f4f9] hover:text-[#0b57d0] hover:border-[#c2e7ff] transition-all md:opacity-0 md:group-hover:opacity-100"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                      {plans.length === 0 && (
                        <tr><td colSpan={4} className="px-6 py-12 text-center font-medium text-slate-400">Belum ada paket yang dibuat.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View (Card) */}
                <div className="md:hidden divide-y divide-slate-100">
                  {plans.map(p=>(
                    <div key={p.id} className="p-4 bg-white flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{p.name}</div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">Code: {p.code}</div>
                        </div>
                        <div className="font-bold text-emerald-600 text-sm bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                          {p.price_monthly.toLocaleString()} <span className="text-[10px] uppercase">{p.currency}</span>
                        </div>
                      </div>
                      
                      <div className="bg-[#f8fafd] p-2.5 rounded-xl border border-slate-100 flex justify-between text-center mt-1">
                        <div>
                          <div className="text-[9px] text-slate-400 mb-0.5 flex justify-center"><Smartphone size={12}/></div>
                          <span className="text-xs font-bold text-slate-700">{p.limit_sessions}</span>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 mb-0.5 flex justify-center"><MessageSquare size={12}/></div>
                          <span className="text-xs font-bold text-slate-700">{p.limit_messages_daily}</span>
                        </div>
                        <div>
                          <div className="text-[9px] text-slate-400 mb-0.5 flex justify-center"><Megaphone size={12}/></div>
                          <span className="text-xs font-bold text-slate-700">{p.limit_broadcast_daily}</span>
                        </div>
                      </div>

                      <div className="flex justify-end mt-1">
                        <button 
                          onClick={() => {
                            loadIntoForm(p);
                            window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll ke form
                          }} 
                          className="px-4 py-2 rounded-full bg-[#f0f4f9] text-[#0b57d0] text-xs font-bold transition-colors w-full"
                        >
                          Edit Paket Ini
                        </button>
                      </div>
                    </div>
                  ))}
                  {plans.length === 0 && (
                    <div className="p-10 text-center text-sm font-medium text-slate-400">Belum ada paket yang dibuat.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}