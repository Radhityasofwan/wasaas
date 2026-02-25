import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Building2, Plus, CreditCard, Users, Smartphone, 
  MessageSquare, Megaphone, Edit3, X, Loader2, Target 
} from "lucide-react";

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
  
  // Perbaikan: Baca sebagai text dulu agar tidak crash jika backend error mengembalikan HTML
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("Backend Error (Not JSON):", text);
    throw new Error(`Server Backend mengalami gangguan (Status HTTP ${res.status}). Silakan cek terminal/console backend.`);
  }

  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

interface TenantRow {
  tenant_id: number;
  tenant_name: string;
  tenant_active: number;
  owner_email: string;
  owner_name: string;
  sub_status: string;
  plan_name: string;
  limit_sessions: number;
  limit_messages_daily: number;
  limit_broadcast_daily: number;
  created_at: string;
}

interface PlanRow {
  id: number;
  code: string;
  name: string;
  price_monthly: number;
}

export default function Admin() {
  const nav = useNavigate();
  const confirm = useConfirm();

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  
  // Add Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: "",
    email: "",
    password: "",
    plan_id: 1
  });
  
  // Form State (Edit)
  const [formLimits, setFormLimits] = useState({
    limit_sessions: 1,
    limit_messages_daily: 50,
    limit_broadcast_daily: 1,
    sub_status: "trial",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        apiFetch<any>("admin/tenants").catch(() => ({ data: [] })),
        apiFetch<any>("admin/plans").catch(() => ({ data: [], plans: [] }))
      ]);
      
      setTenants(tRes.data || []);
      
      // FIX: Sinkronisasi format JSON antara admin_routes dan billing_routes
      const loadedPlans = pRes.data || pRes.plans || [];
      setPlans(loadedPlans);
      
      if (loadedPlans.length > 0) {
        setNewTenant(prev => ({ ...prev, plan_id: loadedPlans[0].id }));
      }
    } catch (err) {
      console.error("Gagal memuat data admin", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openEditModal = (tenant: TenantRow) => {
    setEditingTenant(tenant);
    setFormLimits({
      limit_sessions: tenant.limit_sessions,
      limit_messages_daily: tenant.limit_messages_daily,
      limit_broadcast_daily: tenant.limit_broadcast_daily,
      sub_status: tenant.sub_status || "trial",
    });
    setEditModalOpen(true);
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    const isConfirmed = await confirm({
      title: "Simpan Konfigurasi Klien",
      message: `Terapkan perubahan status dan limit (Kuota) untuk klien ${editingTenant.tenant_name}?`,
      confirmText: "Ya, Simpan"
    });

    if (!isConfirmed) return;

    setSaving(true);
    
    try {
      await apiFetch(`admin/tenants/${editingTenant.tenant_id}/limits`, {
        method: "PUT",
        body: JSON.stringify({
          sub_status: formLimits.sub_status,
          limit_sessions: formLimits.limit_sessions,
          limit_messages_daily: formLimits.limit_messages_daily,
          limit_broadcast_daily: formLimits.limit_broadcast_daily
        })
      });
      setEditModalOpen(false);
      loadData(); 
    } catch (err) {
      alert("Gagal mengupdate konfigurasi limit.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (plans.length === 0) {
      alert("Gagal: Anda belum memiliki Paket (Plan) di database. Buat paket di menu Billing terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("admin/tenants", {
        method: "POST",
        body: JSON.stringify(newTenant)
      });
      setAddModalOpen(false);
      setNewTenant({ name: "", email: "", password: "", plan_id: plans[0]?.id || 1 });
      loadData();
    } catch (err: any) {
      alert("Gagal membuat klien baru: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const activeTenants = tenants.filter(t => t.sub_status === 'active').length;
  const totalSessionsAllowed = tenants.reduce((acc, t) => acc + (t.limit_sessions || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER & STATS */}
      <div className="flex flex-col xl:flex-row justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Building2 className="text-[#0b57d0]" size={28} />
            SaaS Admin
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Superadmin Control Panel: Manajemen klien dan sumber daya.
          </p>
          
          <div className="mt-5 flex flex-wrap gap-3">
            <button 
              onClick={() => setAddModalOpen(true)}
              className="px-6 py-2.5 bg-[#0b57d0] text-white rounded-full font-bold text-sm hover:bg-[#001d35] transition-all shadow-sm flex items-center gap-2"
            >
              <Plus size={16} /> Tambah Klien Baru
            </button>
            <button 
              onClick={() => nav('/billing')}
              className="px-6 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-full font-bold text-sm hover:bg-[#f0f4f9] hover:text-[#0b57d0] transition-all flex items-center gap-2"
            >
              <CreditCard size={16} /> Kelola Paket (Billing)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap md:flex-nowrap gap-3 md:gap-4 shrink-0">
           <div className="bg-white border border-slate-100 rounded-2xl p-4 md:p-5 shadow-sm flex-1 md:min-w-[140px]">
             <div className="text-[10px] md:text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total Klien</div>
             <div className="text-2xl md:text-3xl font-bold text-slate-800">{tenants.length}</div>
           </div>
           <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 md:p-5 shadow-sm flex-1 md:min-w-[140px]">
             <div className="text-[10px] md:text-[11px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Active Subs</div>
             <div className="text-2xl md:text-3xl font-bold text-emerald-700">{activeTenants}</div>
           </div>
           <div className="bg-[#f0f4f9] border border-[#c2e7ff] rounded-2xl p-4 md:p-5 shadow-sm w-full md:w-auto md:min-w-[140px]">
             <div className="text-[10px] md:text-[11px] text-[#0b57d0] font-bold uppercase tracking-wider mb-1">Total WA Slots</div>
             <div className="text-2xl md:text-3xl font-bold text-[#001d35]">{totalSessionsAllowed}</div>
           </div>
        </div>
      </div>

      {/* TABLE DATA TENANTS */}
      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
        
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center">
            <Loader2 size={36} className="animate-spin text-[#0b57d0] mb-3" />
            <div className="text-slate-500 font-bold text-xs uppercase tracking-widest">Menyinkronkan Database...</div>
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center border border-dashed border-slate-200 m-6 rounded-3xl bg-[#f8fafd]">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#0b57d0] mb-4 shadow-sm border border-slate-100">
              <Building2 size={32} />
            </div>
            <div className="text-slate-800 font-bold text-lg mb-1">Belum ada Klien (Tenant)</div>
            <p className="text-slate-500 text-sm font-medium">Klik tombol "Tambah Klien Baru" di atas untuk membuat akun klien pertama Anda.</p>
          </div>
        ) : (
          <>
            {/* Tampilan Desktop (Tabel) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#f8fafd] border-b border-slate-100">
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Klien / Tenant</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Paket & Status</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Alokasi Limit Kuota</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tenants.map((t) => (
                    <tr key={t.tenant_id} className="hover:bg-[#f8fafd] transition-colors">
                      <td className="px-6 py-5 align-middle">
                        <div className="font-bold text-slate-800 text-[15px] mb-0.5">{t.tenant_name}</div>
                        <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                          <Users size={12} className="text-slate-400" />
                          {t.owner_email || 'No Owner Email'}
                        </div>
                      </td>
                      <td className="px-6 py-5 align-middle">
                        <div className="font-bold text-slate-700 text-xs mb-1.5">{t.plan_name || 'N/A'}</div>
                        <span className={`inline-block px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded border ${
                          t.sub_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          t.sub_status === 'trial' ? 'bg-[#f0f4f9] text-[#0b57d0] border-[#c2e7ff]' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {t.sub_status}
                        </span>
                      </td>
                      <td className="px-6 py-5 align-middle">
                        <div className="flex gap-4">
                          <div className="flex flex-col bg-white border border-slate-100 p-2 rounded-xl text-center min-w-[60px] shadow-sm">
                            <Smartphone size={14} className="text-slate-400 mx-auto mb-1" />
                            <span className="text-xs font-bold text-slate-700">{t.limit_sessions}</span>
                          </div>
                          <div className="flex flex-col bg-white border border-slate-100 p-2 rounded-xl text-center min-w-[60px] shadow-sm">
                            <MessageSquare size={14} className="text-slate-400 mx-auto mb-1" />
                            <span className="text-xs font-bold text-slate-700">{t.limit_messages_daily}</span>
                          </div>
                          <div className="flex flex-col bg-white border border-slate-100 p-2 rounded-xl text-center min-w-[60px] shadow-sm">
                            <Megaphone size={14} className="text-slate-400 mx-auto mb-1" />
                            <span className="text-xs font-bold text-slate-700">{t.limit_broadcast_daily}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right align-middle">
                        <button 
                          onClick={() => openEditModal(t)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-[#f0f4f9] hover:text-[#0b57d0] hover:border-[#c2e7ff] transition-all"
                        >
                          <Edit3 size={14} /> Kelola Limit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tampilan Mobile (Card List) */}
            <div className="lg:hidden divide-y divide-slate-100">
               {tenants.map((t) => (
                  <div key={t.tenant_id} className="p-4 bg-white flex flex-col gap-3">
                     <div className="flex justify-between items-start">
                        <div>
                           <h3 className="font-bold text-slate-800 text-sm">{t.tenant_name}</h3>
                           <p className="text-[11px] font-medium text-slate-500 mt-0.5">{t.owner_email || 'No Owner Email'}</p>
                        </div>
                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border shrink-0 ${
                          t.sub_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          t.sub_status === 'trial' ? 'bg-[#f0f4f9] text-[#0b57d0] border-[#c2e7ff]' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {t.sub_status}
                        </span>
                     </div>
                     
                     <div className="bg-[#f8fafd] p-3 rounded-xl border border-slate-100 mt-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                          Paket: <span className="text-slate-800">{t.plan_name || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-center">
                           <div>
                              <div className="text-[9px] text-slate-400 mb-0.5 flex justify-center"><Smartphone size={12}/></div>
                              <span className="text-xs font-bold text-slate-700">{t.limit_sessions}</span>
                           </div>
                           <div>
                              <div className="text-[9px] text-slate-400 mb-0.5 flex justify-center"><MessageSquare size={12}/></div>
                              <span className="text-xs font-bold text-slate-700">{t.limit_messages_daily}</span>
                           </div>
                           <div>
                              <div className="text-[9px] text-slate-400 mb-0.5 flex justify-center"><Megaphone size={12}/></div>
                              <span className="text-xs font-bold text-slate-700">{t.limit_broadcast_daily}</span>
                           </div>
                        </div>
                     </div>

                     <div className="flex justify-end mt-1">
                        <button 
                          onClick={() => openEditModal(t)}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-[#f0f4f9] transition-colors"
                        >
                          <Edit3 size={14} /> Kelola Status & Limit
                        </button>
                     </div>
                  </div>
               ))}
            </div>
          </>
        )}
      </div>

      {/* MODAL: ADD NEW TENANT */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="flex justify-between items-start p-5 md:p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-slate-800">Tambah Klien Baru</h2>
                <p className="text-xs font-medium text-slate-500 mt-1">Registrasi Akun Tenant (Workspace)</p>
              </div>
              <button onClick={() => setAddModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="p-5 md:p-6 space-y-5 overflow-y-auto max-h-[70vh] scrollbar-hide">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Bisnis / Perusahaan</label>
                <input 
                  type="text" required placeholder="Contoh: PT. Maju Jaya"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({...newTenant, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Email Pemilik (Login)</label>
                  <input 
                    type="email" required placeholder="owner@domain.com"
                    value={newTenant.email}
                    onChange={(e) => setNewTenant({...newTenant, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Password Akses</label>
                  <input 
                    type="text" required placeholder="Minimal 6 karakter" minLength={6}
                    value={newTenant.password}
                    onChange={(e) => setNewTenant({...newTenant, password: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                   <label className="text-xs font-bold text-slate-700">Pilih Paket Awal (Plan)</label>
                   {plans.length === 0 && (
                     <button type="button" onClick={() => nav('/billing')} className="text-[10px] font-bold text-[#0b57d0] hover:underline">Buat Paket Dulu →</button>
                   )}
                </div>
                <select 
                  required
                  value={newTenant.plan_id} 
                  onChange={(e) => setNewTenant({...newTenant, plan_id: parseInt(e.target.value)})}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 font-medium text-slate-800 outline-none cursor-pointer focus:ring-2 focus:ring-[#c2e7ff]"
                >
                  {plans.length === 0 ? (
                    <option value="">-- Anda belum membuat Plan / Paket --</option>
                  ) : (
                    plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (IDR {p.price_monthly.toLocaleString()})</option>
                    ))
                  )}
                </select>
                <p className="text-[10px] text-slate-500 mt-2">Jika daftar kosong, tutup modal ini dan buat paket di menu "Kelola Paket (Billing)".</p>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setAddModalOpen(false)} className="px-6 py-2.5 rounded-full font-bold text-sm text-slate-600 hover:bg-[#f0f4f9] transition-colors">Batal</button>
                <button type="submit" disabled={saving || plans.length === 0} className="px-6 py-2.5 rounded-full font-bold text-sm text-white bg-[#0b57d0] hover:bg-[#001d35] disabled:bg-slate-300 transition-all flex items-center gap-2 shadow-sm">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {saving ? "Menyimpan..." : "Buat Akun Klien"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT LIMITS */}
      {editModalOpen && editingTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="flex justify-between items-start p-5 md:p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-slate-800">Edit Klien</h2>
                <p className="text-xs font-bold text-[#0b57d0] mt-1 bg-[#e9eef6] inline-block px-2 py-0.5 rounded">{editingTenant.tenant_name}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLimits} className="p-5 md:p-6 space-y-6 overflow-y-auto max-h-[70vh] scrollbar-hide">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Status Berlangganan (Subscription)</label>
                <select 
                  value={formLimits.sub_status} 
                  onChange={(e) => setFormLimits({...formLimits, sub_status: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none font-bold text-slate-800 outline-none cursor-pointer focus:ring-2 focus:ring-[#c2e7ff]"
                >
                  <option value="trial">Trial (Uji Coba)</option>
                  <option value="active">Active (Berbayar)</option>
                  <option value="past_due">Past Due (Telat Bayar)</option>
                  <option value="canceled">Canceled (Dibatalkan)</option>
                  <option value="expired">Expired (Kadaluarsa)</option>
                </select>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Target size={14} className="text-[#0b57d0]"/> Atur Limit (Kuota)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Device WA</label>
                     <input 
                       type="number" min="0" required
                       value={formLimits.limit_sessions}
                       onChange={(e) => setFormLimits({...formLimits, limit_sessions: parseInt(e.target.value) || 0})}
                       className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 font-bold text-[#0b57d0] outline-none focus:border-[#0b57d0] text-center transition-colors"
                     />
                   </div>
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Pesan /Hari</label>
                     <input 
                       type="number" min="0" required
                       value={formLimits.limit_messages_daily}
                       onChange={(e) => setFormLimits({...formLimits, limit_messages_daily: parseInt(e.target.value) || 0})}
                       className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 font-bold text-[#0b57d0] outline-none focus:border-[#0b57d0] text-center transition-colors"
                     />
                   </div>
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Blast /Hari</label>
                     <input 
                       type="number" min="0" required
                       value={formLimits.limit_broadcast_daily}
                       onChange={(e) => setFormLimits({...formLimits, limit_broadcast_daily: parseInt(e.target.value) || 0})}
                       className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 font-bold text-[#0b57d0] outline-none focus:border-[#0b57d0] text-center transition-colors"
                     />
                   </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setEditModalOpen(false)} className="px-6 py-2.5 rounded-full font-bold text-sm text-slate-600 hover:bg-[#f0f4f9] transition-colors">Batal</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-full bg-[#0b57d0] text-white font-bold text-sm shadow-sm hover:bg-[#001d35] transition-all flex items-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}