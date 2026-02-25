import React, { useEffect, useState } from "react";

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
  const data = await res.json();
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
      // Fetch Tenants and Master Plans
      const [tRes, pRes] = await Promise.all([
        apiFetch<any>("admin/tenants").catch(() => ({ data: [] })),
        apiFetch<any>("admin/plans").catch(() => ({ data: [] }))
      ]);
      
      setTenants(tRes.data || []);
      const loadedPlans = pRes.data || [];
      setPlans(loadedPlans);
      
      // Default set plan_id untuk form tambah klien
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
      loadData(); // Refresh table
    } catch (err) {
      alert("Gagal mengupdate konfigurasi limit.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (plans.length === 0) {
      alert("Gagal: Anda belum memiliki Paket (Plan) di database. Tambahkan data di tabel plans terlebih dahulu.");
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
      loadData(); // Refresh table
    } catch (err: any) {
      alert("Gagal membuat klien baru: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Kalkulasi Statistik
  const activeTenants = tenants.filter(t => t.sub_status === 'active').length;
  const totalSessionsAllowed = tenants.reduce((acc, t) => acc + (t.limit_sessions || 0), 0);

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      
      {/* HEADER & STATS */}
      <div className="flex flex-col xl:flex-row justify-between gap-8">
        <div>
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter italic drop-shadow-sm">SaaS Admin</h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-1.5 w-10 bg-gradient-to-r from-rose-500 to-orange-500 rounded-full"></div>
            <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.4em] opacity-80">
              Superadmin Control Panel
            </p>
          </div>
          
          <div className="mt-8">
            <button 
              onClick={() => setAddModalOpen(true)}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2"
            >
              <span>+ Tambah Klien Baru</span>
            </button>
          </div>
        </div>

        <div className="flex gap-4">
           <div className="bg-white/40 backdrop-blur-xl border border-white rounded-[2rem] p-6 shadow-sm min-w-[160px]">
             <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Total Klien</div>
             <div className="text-3xl font-black text-slate-800">{tenants.length}</div>
           </div>
           <div className="bg-white/40 backdrop-blur-xl border border-white rounded-[2rem] p-6 shadow-sm min-w-[160px]">
             <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Active Subs</div>
             <div className="text-3xl font-black text-emerald-600">{activeTenants}</div>
           </div>
           <div className="bg-white/40 backdrop-blur-xl border border-white rounded-[2rem] p-6 shadow-sm min-w-[160px] hidden md:block">
             <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Total WA Slots</div>
             <div className="text-3xl font-black text-blue-600">{totalSessionsAllowed}</div>
           </div>
        </div>
      </div>

      {/* TABLE DATA */}
      <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3.5rem] overflow-hidden shadow-sm relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-400/5 rounded-full blur-[80px] pointer-events-none"></div>
        
        {loading ? (
          <div className="p-24 text-center">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
            <div className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs">Menyinkronkan Database...</div>
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-24 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 mx-auto mb-6 text-4xl font-black">🏢</div>
            <div className="text-slate-500 font-black text-xl tracking-tight mb-2">Belum ada Klien (Tenant)</div>
            <p className="text-slate-400 text-sm font-medium">Klik tombol "Tambah Klien Baru" di atas untuk membuat akun klien pertama Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/20 border-b border-white/40">
                  <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Klien / Tenant</th>
                  <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Paket & Status</th>
                  <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">Alokasi Limit</th>
                  <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {tenants.map((t) => (
                  <tr key={t.tenant_id} className="group hover:bg-white/50 transition-colors">
                    <td className="px-10 py-8">
                      <div className="font-black text-slate-800 text-lg mb-1">{t.tenant_name}</div>
                      <div className="text-xs font-bold text-slate-400">{t.owner_email || 'No Owner Email'}</div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="font-black text-slate-700 uppercase text-xs tracking-widest mb-2">{t.plan_name || 'N/A'}</div>
                      <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md border ${
                        t.sub_status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        t.sub_status === 'trial' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        'bg-rose-50 text-rose-500 border-rose-100'
                      }`}>
                        {t.sub_status}
                      </span>
                    </td>
                    <td className="px-10 py-8">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4 max-w-[180px]">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Device WA:</span>
                          <span className="text-xs font-black text-slate-700 bg-white/60 px-2 rounded">{t.limit_sessions}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 max-w-[180px]">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Msg/Hari:</span>
                          <span className="text-xs font-black text-slate-700 bg-white/60 px-2 rounded">{t.limit_messages_daily}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 max-w-[180px]">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Broadcast:</span>
                          <span className="text-xs font-black text-slate-700 bg-white/60 px-2 rounded">{t.limit_broadcast_daily}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right align-middle">
                      <button 
                        onClick={() => openEditModal(t)}
                        className="px-6 py-3 rounded-2xl bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 shadow-lg shadow-slate-800/20 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        Kelola Limit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD NEW TENANT */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white/95 backdrop-blur-3xl rounded-[3rem] p-10 sm:p-12 shadow-2xl border border-white relative overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8">
            
            <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Tambah Klien Baru</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Registrasi Akun Tenant</p>
              </div>
              <button onClick={() => setAddModalOpen(false)} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 hover:text-rose-500 transition-colors">✕</button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-6 relative z-10">
              
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nama Bisnis / Perusahaan</label>
                <input 
                  type="text" required placeholder="Contoh: PT. Maju Jaya"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({...newTenant, name: e.target.value})}
                  className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Pemilik (Login)</label>
                  <input 
                    type="email" required placeholder="owner@domain.com"
                    value={newTenant.email}
                    onChange={(e) => setNewTenant({...newTenant, email: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Password Akses</label>
                  <input 
                    type="text" required placeholder="Minimal 6 karakter" minLength={6}
                    value={newTenant.password}
                    onChange={(e) => setNewTenant({...newTenant, password: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pilih Paket Awal (Plan)</label>
                <select 
                  required
                  value={newTenant.plan_id} 
                  onChange={(e) => setNewTenant({...newTenant, plan_id: parseInt(e.target.value)})}
                  className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {plans.length === 0 ? (
                    <option value="">-- Tabel paket kosong, tambahkan di DB --</option>
                  ) : (
                    plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (IDR {p.price_monthly.toLocaleString()})</option>
                    ))
                  )}
                </select>
                <p className="text-[10px] text-slate-500 font-medium">Limit (Device, Pesan, Broadcast) akan otomatis disesuaikan dengan konfigurasi paket yang dipilih.</p>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                <button type="button" onClick={() => setAddModalOpen(false)} className="px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100">Batal</button>
                <button type="submit" disabled={saving || plans.length === 0} className={`px-10 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-lg transition-all ${plans.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white shadow-blue-500/30 hover:scale-105 active:scale-95'}`}>
                  {saving ? "Membuat..." : "Buat Akun Klien"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT LIMITS & SUBSCRIPTION */}
      {editModalOpen && editingTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white/95 backdrop-blur-3xl rounded-[3rem] p-10 sm:p-12 shadow-2xl border border-white relative overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8">
            
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Edit Klien</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{editingTenant.tenant_name}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 hover:text-rose-500 transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveLimits} className="space-y-8 relative z-10">
              
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Status Berlangganan (Subscription)</label>
                <select 
                  value={formLimits.sub_status} 
                  onChange={(e) => setFormLimits({...formLimits, sub_status: e.target.value})}
                  className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="trial">Trial (Uji Coba)</option>
                  <option value="active">Active (Berbayar)</option>
                  <option value="past_due">Past Due (Telat Bayar)</option>
                  <option value="canceled">Canceled (Dibatalkan)</option>
                  <option value="expired">Expired (Kadaluarsa)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Maks. Device WA</label>
                   <input 
                     type="number" min="0" required
                     value={formLimits.limit_sessions}
                     onChange={(e) => setFormLimits({...formLimits, limit_sessions: parseInt(e.target.value) || 0})}
                     className="w-full px-6 py-4 rounded-2xl bg-white/60 border border-slate-200 font-black text-xl text-blue-600 outline-none focus:bg-white"
                   />
                 </div>
                 <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Pesan Harian /Device</label>
                   <input 
                     type="number" min="0" required
                     value={formLimits.limit_messages_daily}
                     onChange={(e) => setFormLimits({...formLimits, limit_messages_daily: parseInt(e.target.value) || 0})}
                     className="w-full px-6 py-4 rounded-2xl bg-white/60 border border-slate-200 font-black text-xl text-blue-600 outline-none focus:bg-white"
                   />
                 </div>
                 <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Maks. Broadcast /Hari</label>
                   <input 
                     type="number" min="0" required
                     value={formLimits.limit_broadcast_daily}
                     onChange={(e) => setFormLimits({...formLimits, limit_broadcast_daily: parseInt(e.target.value) || 0})}
                     className="w-full px-6 py-4 rounded-2xl bg-white/60 border border-slate-200 font-black text-xl text-blue-600 outline-none focus:bg-white"
                   />
                 </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                <button type="button" onClick={() => setEditModalOpen(false)} className="px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100">Batal</button>
                <button type="submit" disabled={saving} className="px-10 py-4 rounded-[1.5rem] bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all">
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