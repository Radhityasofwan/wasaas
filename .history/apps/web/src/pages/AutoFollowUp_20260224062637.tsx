import React, { useEffect, useState } from "react";
import { 
  CalendarClock, 
  Plus, 
  Users, 
  Clock, 
  Target, 
  Play, 
  Pause, 
  Trash2,
  CheckCircle2,
  XCircle,
  MessageSquare
} from "lucide-react";

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

// ===== TYPES =====
type CampaignRow = {
  id: number;
  name: string;
  delay_days: number;
  target_time: string;
  trigger_condition: 'always' | 'unreplied' | 'unread';
  status: 'active' | 'paused' | 'completed';
  template_name?: string;
  session_key: string;
};

type TargetRow = {
  id: number;
  to_number: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'canceled';
  scheduled_at: string;
  sent_at?: string;
};

export default function AutoFollowUp() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    session_key: "",
    name: "",
    template_id: "",
    delay_days: 1,
    target_time: "18:00",
    trigger_condition: "unreplied"
  });

  async function loadData() {
    try {
      setLoading(true);
      const [campRes, tplRes, sessRes] = await Promise.all([
        apiFetch<{ data: CampaignRow[] }>("/followup/campaigns").catch(() => ({ data: [] })),
        apiFetch<{ data: any[] }>("/templates").catch(() => ({ data: [] })),
        apiFetch<{ sessions: any[] }>("/ui/sessions").catch(() => ({ sessions: [] }))
      ]);
      setCampaigns(campRes.data || []);
      setTemplates(tplRes.data || []);
      setSessions(sessRes.sessions || []);
      
      if (sessRes.sessions?.length > 0) {
        setFormData(f => ({ ...f, session_key: sessRes.sessions[0].session_key }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadTargets(campaignId: number) {
    try {
      const res = await apiFetch<{ data: TargetRow[] }>(`/followup/campaigns/${campaignId}/targets`);
      setTargets(res.data || []);
    } catch (e) {
      setTargets([]);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      loadTargets(selectedCampaign.id);
    }
  }, [selectedCampaign]);

  async function handleSave() {
    if (!formData.name.trim() || !formData.template_id || !formData.session_key) {
      return alert("Mohon lengkapi semua form (Sesi, Nama, Template)!");
    }
    
    try {
      await apiFetch("/followup/campaigns", {
        method: "POST",
        body: JSON.stringify(formData)
      });
      setModalOpen(false);
      loadData();
      alert("Campaign Follow Up berhasil dibuat!");
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  }

  async function toggleStatus(camp: CampaignRow) {
    const newStatus = camp.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/followup/campaigns/${camp.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus })
      });
      loadData();
      if (selectedCampaign?.id === camp.id) {
        setSelectedCampaign({ ...camp, status: newStatus });
      }
    } catch (e: any) {
      alert("Gagal update status: " + e.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus campaign ini beserta semua antrean target di dalamnya?")) return;
    try {
      await apiFetch(`/followup/campaigns/${id}`, { method: "DELETE" });
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
      loadData();
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  }

  const getStats = () => {
    const stats = { queued: 0, sent: 0, read: 0, replied: 0, failed: 0 };
    targets.forEach(t => {
      if (t.status === 'queued') stats.queued++;
      else if (t.status === 'failed' || t.status === 'canceled') stats.failed++;
      else if (t.status === 'replied') stats.replied++;
      else if (t.status === 'read') stats.read++;
      else stats.sent++; // sent or delivered
    });
    return stats;
  };

  const currentStats = getStats();

  return (
    <div className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem] relative">
      
      {/* SIDEBAR: List Campaigns */}
      <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl shrink-0 relative z-10">
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/20 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20">
               <CalendarClock size={20} strokeWidth={2.5} />
             </div>
             <div>
               <h2 className="text-lg font-black text-slate-800 tracking-tight">Follow Up</h2>
               <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Drip Campaigns</p>
             </div>
          </div>
          <button 
            onClick={() => setModalOpen(true)}
            className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            title="Buat Campaign Baru"
          >
            <Plus size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-hide">
          {campaigns.length === 0 && !loading && (
            <div className="text-center p-6 mt-10">
               <Target size={40} className="mx-auto text-slate-300 mb-3" />
               <p className="text-xs font-bold text-slate-500">Belum ada Campaign.<br/>Buat baru untuk mulai menjadwalkan.</p>
            </div>
          )}
          
          {campaigns.map(camp => (
            <div 
              key={camp.id}
              onClick={() => setSelectedCampaign(camp)}
              className={`p-5 flex flex-col gap-3 rounded-[2rem] cursor-pointer transition-all duration-300 border ${
                selectedCampaign?.id === camp.id 
                  ? "bg-white/90 shadow-xl shadow-orange-500/10 border-white scale-[1.02]" 
                  : "bg-white/40 border-transparent hover:bg-white/60"
              }`}
            >
              <div className="flex justify-between items-start">
                <h3 className="text-sm font-black text-slate-800 truncate">{camp.name}</h3>
                <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest shadow-sm border ${
                  camp.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                  camp.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {camp.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500">
                <div className="flex items-center gap-1.5"><Clock size={12} className="text-orange-500"/> H+{camp.delay_days} | {camp.target_time}</div>
                <div className="flex items-center gap-1.5"><MessageSquare size={12} className="text-blue-500"/> {camp.trigger_condition}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN VIEW: Campaign Details & Targets */}
      {selectedCampaign ? (
        <div className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20">
          
          {/* Header Details */}
          <div className="p-8 border-b border-white/20 bg-white/40 backdrop-blur-xl shrink-0 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">{selectedCampaign.name}</h2>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
                    Template: <span className="text-indigo-600">{selectedCampaign.template_name || 'Tidak Diketahui'}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleStatus(selectedCampaign)} className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all ${selectedCampaign.status === 'active' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                    {selectedCampaign.status === 'active' ? <><Pause size={14}/> Jeda</> : <><Play size={14}/> Aktifkan</>}
                  </button>
                  <button onClick={() => handleDelete(selectedCampaign.id)} className="w-10 h-10 rounded-xl bg-white text-rose-500 flex items-center justify-center shadow-sm border border-rose-100 hover:bg-rose-50 hover:scale-105 transition-all">
                    <Trash2 size={16} strokeWidth={2.5} />
                  </button>
                </div>
             </div>

             {/* Stats Grid */}
             <div className="grid grid-cols-5 gap-3">
                <div className="bg-white/60 p-4 rounded-2xl border border-white flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-800">{targets.length}</span>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Total Target</span>
                </div>
                <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-orange-600">{currentStats.queued}</span>
                  <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest mt-1">Antrean</span>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-blue-600">{currentStats.sent}</span>
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1">Terkirim</span>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-emerald-600">{currentStats.replied}</span>
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Dibalas</span>
                </div>
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-rose-600">{currentStats.failed}</span>
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mt-1">Gagal</span>
                </div>
             </div>
          </div>

          {/* Target List */}
          <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users size={14} /> Daftar Target Eksekusi
            </h4>
            
            <div className="bg-white/50 backdrop-blur-md rounded-[2rem] border border-white overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/60 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white">
                    <th className="py-4 px-6">Nomor Target</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Jadwal Eksekusi</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-xs font-bold text-slate-400">
                        Belum ada target di campaign ini.<br/>Tambahkan melalui menu "Inbox" -> "Bulk Action".
                      </td>
                    </tr>
                  ) : (
                    targets.map(t => (
                      <tr key={t.id} className="border-b border-white/40 hover:bg-white/60 transition-colors">
                        <td className="py-4 px-6 text-sm font-bold text-slate-800">{t.to_number}</td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest shadow-sm ${
                            t.status === 'replied' ? 'bg-emerald-100 text-emerald-700' :
                            t.status === 'queued' ? 'bg-orange-100 text-orange-700' :
                            t.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs font-bold text-slate-500">
                          {new Date(t.scheduled_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
         <div className="flex-1 flex flex-col items-center justify-center bg-white/5 relative border-l border-white/20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-400/5 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="w-32 h-32 rounded-[3.5rem] bg-white/40 border border-white mb-8 flex items-center justify-center text-orange-500 shadow-2xl shadow-orange-500/10 backdrop-blur-3xl transform rotate-3">
            <CalendarClock size={48} strokeWidth={2.5} />
          </div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] relative z-10 text-center">
            Pilih Campaign <br/> Untuk Melihat Detail
          </p>
        </div>
      )}

      {/* MODAL CREATE CAMPAIGN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl border border-white flex flex-col max-h-[90vh]">
            
            <div className="flex items-center justify-between p-8 border-b border-slate-100 shrink-0">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Buat Aturan Follow Up</h3>
              <button onClick={() => setModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <XCircle size={24} strokeWidth={2} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Pilih Sesi</label>
                    <select 
                      value={formData.session_key} 
                      onChange={e => setFormData({...formData, session_key: e.target.value})}
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 appearance-none"
                    >
                      <option value="">-- Sesi WA --</option>
                      {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Nama Campaign</label>
                    <input 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Misal: Follow Up Cold Leads" 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700"
                    />
                 </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Template Pesan</label>
                <select 
                  value={formData.template_id} 
                  onChange={e => setFormData({...formData, template_id: e.target.value})}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 appearance-none"
                >
                  <option value="">-- Pilih Template --</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.message_type})</option>)}
                </select>
              </div>

              <div className="p-6 bg-orange-50/50 border border-orange-100 rounded-[2rem]">
                 <h4 className="text-sm font-black text-orange-800 mb-4 flex items-center gap-2"><Clock size={16}/> Pengaturan Jadwal</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-orange-600/80 uppercase tracking-widest block mb-2">Delay Hari (H+)</label>
                      <input 
                        type="number" min="0"
                        value={formData.delay_days} 
                        onChange={e => setFormData({...formData, delay_days: Number(e.target.value)})}
                        className="w-full px-5 py-3 rounded-xl bg-white border border-orange-200 outline-none font-bold text-slate-700 text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-orange-600/80 uppercase tracking-widest block mb-2">Jam Kirim</label>
                      <input 
                        type="time"
                        value={formData.target_time} 
                        onChange={e => setFormData({...formData, target_time: e.target.value})}
                        className="w-full px-5 py-3 rounded-xl bg-white border border-orange-200 outline-none font-bold text-slate-700 text-center"
                      />
                    </div>
                 </div>
                 <p className="text-[10px] font-bold text-orange-600/70 mt-3 leading-relaxed">
                   Sistem akan menunggu <b>{formData.delay_days} hari</b> sejak nomor ditambahkan, lalu mengeksekusi pesan tepat pada pukul <b>{formData.target_time}</b>.
                 </p>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Kondisi Pengiriman (Trigger)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setFormData({...formData, trigger_condition: 'unreplied'})} className={`py-4 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all flex flex-col items-center gap-1 ${formData.trigger_condition === 'unreplied' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                    <CheckCircle2 size={18}/> Jika Belum Dibalas
                  </button>
                  <button onClick={() => setFormData({...formData, trigger_condition: 'always'})} className={`py-4 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all flex flex-col items-center gap-1 ${formData.trigger_condition === 'always' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                    <Play size={18}/> Kirim Apa Adanya
                  </button>
                </div>
              </div>

            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50 rounded-b-[3rem] shrink-0 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="px-8 py-4 rounded-2xl font-black text-slate-500 bg-white border border-slate-200 text-[11px] uppercase tracking-widest hover:bg-slate-50">Batal</button>
              <button onClick={handleSave} className="px-8 py-4 rounded-2xl font-black text-white bg-orange-500 hover:bg-orange-600 text-[11px] uppercase tracking-widest shadow-lg shadow-orange-500/30 transition-all">Buat Campaign</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}