import React, { useEffect, useState } from "react";
import { CreditCard, PackageOpen, Receipt } from "lucide-react";

/** HELPER INTERNAL (Disamakan agar konsisten dan API key terbawa) */
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

export default function Billing() {
  const [tenantId, setTenantId] = useState<number>(1); // Untuk testing admin, Anda bisa kembangkan jadi select box nanti
  const [plans, setPlans] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

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

  const [subPlanId, setSubPlanId] = useState<number>(0);
  const [payForm, setPayForm] = useState<any>({
    subscription_id: null,
    provider: "manual",
    provider_ref: "",
    amount: 0,
    currency: "IDR",
    status: "pending",
  });

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const p = await apiFetch<any>("admin/plans");
      const s = await apiFetch<any>(`admin/tenants/${tenantId}/subscription`);
      const pay = await apiFetch<any>(`admin/tenants/${tenantId}/payments`);
      
      const loadedPlans = p.plans || p.data || [];
      setPlans(loadedPlans);
      setSub(s.subscription || null);
      setPayments(pay.payments || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePlan() {
    try {
      setErr("");
      await apiFetch<any>("admin/plans", { method: "POST", body: JSON.stringify(planForm) });
      alert("Plan berhasil dibuat/diupdate!");
      await load();
    } catch (e:any) { setErr(e.message); }
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      
      {/* HEADER */}
      <div>
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter italic drop-shadow-sm">SaaS Billing</h1>
        <div className="flex items-center gap-3 mt-3">
          <div className="h-1.5 w-10 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></div>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.4em] opacity-80">
            Plans & Payments Engine
          </p>
        </div>
      </div>

      {err && (
        <div className="bg-rose-50 text-rose-500 p-4 rounded-2xl border border-rose-100 font-bold text-sm">
          Error: {err}
        </div>
      )}

      {/* 1. KELOLA PAKET / PLANS */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3.5rem] p-8 md:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.03)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-400/10 rounded-full blur-[80px] pointer-events-none"></div>
        
        <div className="flex items-center gap-4 mb-8 relative z-10">
          <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
            <PackageOpen size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Master Data Paket (Plans)</h2>
            <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-widest">Buat paket yang akan dijual</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
          
          {/* FORM TAMBAH PLAN */}
          <div className="lg:col-span-4 space-y-5 bg-white/60 p-6 rounded-[2rem] border border-white/80">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Buat / Edit Paket</h3>
            
            <div className="space-y-4">
              <input type="text" placeholder="Kode Paket (cth: starter)" value={planForm.code} onChange={e=>setPlanForm({...planForm, code: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none" />
              <input type="text" placeholder="Nama Paket (cth: Starter Pro)" value={planForm.name} onChange={e=>setPlanForm({...planForm, name: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none" />
              
              <div className="flex gap-2">
                <input type="number" placeholder="Harga Bulanan" value={planForm.price_monthly} onChange={e=>setPlanForm({...planForm, price_monthly: Number(e.target.value)})} className="w-full px-5 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none" />
                <input type="text" value={planForm.currency} onChange={e=>setPlanForm({...planForm, currency: e.target.value})} className="w-24 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none text-center" />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Device WA</label>
                  <input type="number" value={planForm.limit_sessions} onChange={e=>setPlanForm({...planForm, limit_sessions: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-blue-600 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Pesan/Hari</label>
                  <input type="number" value={planForm.limit_messages_daily} onChange={e=>setPlanForm({...planForm, limit_messages_daily: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-blue-600 outline-none" />
                </div>
              </div>

              <button onClick={savePlan} className="w-full py-4 mt-2 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-indigo-500/30">
                Simpan Paket
              </button>
            </div>
          </div>

          {/* TABLE PLANS */}
          <div className="lg:col-span-8">
            <div className="overflow-x-auto rounded-[2rem] bg-white border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Paket</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga / Bln</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Limit Device</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Limit Pesan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plans.map(p=>(
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-6 py-5 font-black text-slate-700 text-sm">{p.name} <span className="text-xs font-bold text-slate-400 ml-2">({p.code})</span></td>
                      <td className="px-6 py-5 font-black text-emerald-600 text-sm">{p.price_monthly.toLocaleString()} {p.currency}</td>
                      <td className="px-6 py-5 font-bold text-slate-600 text-sm">{p.limit_sessions}</td>
                      <td className="px-6 py-5 font-bold text-slate-600 text-sm">{p.limit_messages_daily}</td>
                    </tr>
                  ))}
                  {plans.length === 0 && (
                     <tr><td colSpan={4} className="px-6 py-10 text-center font-bold text-slate-400">Belum ada paket yang dibuat.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* 2. HISTORY PEMBAYARAN */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3.5rem] p-8 md:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.03)] relative overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
            <Receipt size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Riwayat Pembayaran Klien</h2>
            <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-widest">Monitor Invoices (Hardcoded Tenant ID: {tenantId})</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[2rem] bg-white border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice / ID</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Metode / Provider</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nominal</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(p=>(
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-6 py-5 font-bold text-slate-700 text-sm">#{p.id} <span className="text-slate-400">| Sub {p.subscription_id}</span></td>
                      <td className="px-6 py-5 font-bold text-slate-600 text-sm uppercase">{p.provider}</td>
                      <td className="px-6 py-5 font-black text-emerald-600 text-sm">{p.amount.toLocaleString()} {p.currency}</td>
                      <td className="px-6 py-5">
                         <span className={`px-3 py-1 rounded border text-[9px] font-black uppercase tracking-widest ${
                           p.status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                           p.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-500 border-rose-100'
                         }`}>
                           {p.status}
                         </span>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                     <tr><td colSpan={4} className="px-6 py-10 text-center font-bold text-slate-400">Belum ada riwayat transaksi.</td></tr>
                  )}
                </tbody>
              </table>
        </div>
      </div>

    </div>
  );
}