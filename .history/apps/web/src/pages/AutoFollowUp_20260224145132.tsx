import React, { useEffect, useState, useRef, useMemo } from "react";
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
  MessageSquare,
  RefreshCw,
  Activity,
  ArrowDownCircle, 
  CopyPlus,
  Layers
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

// FEATURE 1: WORKFLOW SEQUENCE TYPES
type WorkflowStep = {
  id: string; // local id for rendering
  template_id: string;
  delay_days: number;
  target_time: string;
  trigger_condition: 'always' | 'unreplied';
};

export default function AutoFollowUp() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [workerLoading, setWorkerLoading] = useState(false);

  // FEATURE: Live Clock State
  const [liveTime, setLiveTime] = useState(new Date());
  
  const selectedCampRef = useRef(selectedCampaign);
  useEffect(() => { selectedCampRef.current = selectedCampaign; }, [selectedCampaign]);

  // FEATURE 1: Form State for WORKFLOW BUILDER
  const [formBase, setFormBase] = useState({
    session_key: "",
    base_name: "", // Akan menjadi "Series Welcome - Langkah 1", "Langkah 2", dst.
  });
  
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([
    { id: crypto.randomUUID(), template_id: "", delay_days: 1, target_time: "10:00", trigger_condition: "unreplied" }
  ]);

  // UI/UX FEATURE: GROUPING SEQUENCE
  const groupedCampaigns = useMemo(() => {
    const groups: Record<string, CampaignRow[]> = {};
    campaigns.forEach(camp => {
      // Deteksi pola " - Step " untuk mengelompokkan
      const baseName = camp.name.includes(" - Step ") ? camp.name.split(" - Step ")[0] : camp.name;
      if (!groups[baseName]) groups[baseName] = [];
      groups[baseName].push(camp);
    });
    
    // Convert ke array dan urutkan step berdasarkan delay_days
    return Object.entries(groups).map(([baseName, camps]) => ({
      baseName,
      isSequence: camps.length > 1 || camps[0].name.includes(" - Step "),
      campaigns: camps.sort((a, b) => a.delay_days - b.delay_days)
    }));
  }, [campaigns]);

  // REALTIME CLOCK ENGINE
  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadData(showLoading = false) {
    try {
      if (showLoading) setLoading(true);
      const [campRes, tplRes, sessRes] = await Promise.all([
        apiFetch<{ data: CampaignRow[] }>("/followup/campaigns").catch(() => ({ data: [] })),
        apiFetch<{ data: any[] }>("/templates").catch(() => ({ data: [] })),
        apiFetch<{ sessions: any[] }>("/ui/sessions").catch(() => ({ sessions: [] }))
      ]);
      setCampaigns(campRes.data || []);
      setTemplates(tplRes.data || []);
      setSessions(sessRes.sessions || []);
      
      if (sessRes.sessions?.length > 0 && !formBase.session_key) {
        setFormBase(f => ({ ...f, session_key: sessRes.sessions[0].session_key }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function loadTargets(campaignId: number) {
    try {
      const res = await apiFetch<{ data: TargetRow[] }>(`/followup/campaigns/${campaignId}/targets`);
      setTargets(res.data || []);
    } catch (e) {}
  }

  // REALTIME POLLING ENGINE
  useEffect(() => {
    loadData(true);
    const pollTimer = setInterval(() => {
      loadData(false);
      if (selectedCampRef.current?.id) {
        loadTargets(selectedCampRef.current.id);
      }
    }, 5000);
    return () => clearInterval(pollTimer);
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      loadTargets(selectedCampaign.id);
    }
  }, [selectedCampaign]);

  // FEATURE 1: MULTI-STEP SAVE LOGIC
  async function handleSaveSequence() {
    if (!formBase.base_name.trim() || !formBase.session_key) {
      return alert("Nama Sequence dan Sesi wajib diisi!");
    }
    
    // Validasi apakah setiap step punya template
    const invalidStep = workflowSteps.find(s => !s.template_id);
    if (invalidStep) return alert("Pastikan semua langkah (Step) telah memilih Template Pesan!");

    try {
      // Loop saving: Membuat multiple campaigns di backend agar kompatibel dengan schema lama
      const promises = workflowSteps.map((step, index) => {
        const stepName = workflowSteps.length > 1 ? `${formBase.base_name} - Step ${index + 1}` : formBase.base_name;
        return apiFetch("/followup/campaigns", {
          method: "POST",
          body: JSON.stringify({
            session_key: formBase.session_key,
            name: stepName,
            template_id: step.template_id,
            delay_days: step.delay_days,
            target_time: step.target_time,
            trigger_condition: step.trigger_condition
          })
        });
      });

      await Promise.all(promises);

      setModalOpen(false);
      
      // Reset Form
      setFormBase(f => ({ ...f, base_name: "" }));
      setWorkflowSteps([{ id: crypto.randomUUID(), template_id: "", delay_days: 1, target_time: "10:00", trigger_condition: "unreplied" }]);
      
      loadData(true);
      alert(`Berhasil membuat ${workflowSteps.length} rangkaian Follow Up!`);
    } catch (e: any) {
      alert("Gagal menyimpan rangkaian: " + e.message);
    }
  }

  const addWorkflowStep = () => {
    // Otomatis tambahkan delay dari step sebelumnya
    const lastStep = workflowSteps[workflowSteps.length - 1];
    setWorkflowSteps([...workflowSteps, { 
      id: crypto.randomUUID(), 
      template_id: "", 
      delay_days: lastStep.delay_days + 1, // Otomatis H+1 dari step sebelumnya
      target_time: lastStep.target_time, 
      trigger_condition: "unreplied" 
    }]);
  };

  const removeWorkflowStep = (id: string) => {
    if (workflowSteps.length === 1) return;
    setWorkflowSteps(workflowSteps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, key: string, val: any) => {
    setWorkflowSteps(workflowSteps.map(s => s.id === id ? { ...s, [key]: val } : s));
  };

  async function toggleStatus(camp: CampaignRow) {
    const newStatus = camp.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/followup/campaigns/${camp.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus })
      });
      loadData(false);
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
      loadData(true);
    } catch (e: any) {
      alert("Gagal hapus: " + e.message);
    }
  }

  async function triggerWorker() {
    try {
      setWorkerLoading(true);
      await apiFetch("/followup/trigger-worker", { method: "POST" });
      setTimeout(() => {
        loadData(false);
        if (selectedCampaign) loadTargets(selectedCampaign.id);
        setWorkerLoading(false);
      }, 1500);
    } catch (e: any) {
      alert("Gagal memicu sinkronisasi worker: " + e.message);
      setWorkerLoading(false);
    }
  }

  const getStats = () => {
    const stats = { queued: 0, sent: 0, read: 0, replied: 0, failed: 0 };
    targets.forEach(t => {
      if (t.status === 'queued') stats.queued++;
      else if (t.status === 'failed' || t.status === 'canceled') stats.failed++;
      else if (t.status === 'replied') stats.replied++;
      else if (t.status === 'read') stats.read++;
      else stats.sent++; 
    });
    return stats;
  };

  const currentStats = getStats();

  return (
    <div className="flex h-full max-h-[85vh] bg-transparent overflow-hidden rounded-[2.5rem] relative">
      
      {/* SIDEBAR: List Campaigns Grouped */}
      <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-white/20 bg-white/30 backdrop-blur-3xl shrink-0 relative z-10">
        
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/20 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20">
               <CalendarClock size={20} strokeWidth={2.5} />
             </div>
             <div>
               <h2 className="text-lg font-black text-slate-800 tracking-tight">Follow Up</h2>
               <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-black text-orange-500 tracking-widest">
                 <Clock size={10} className="animate-pulse"/>
                 {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
               </div>
             </div>
          </div>
          <button 
            onClick={() => setModalOpen(true)}
            className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            title="Buat Sequence Baru"
          >
            <Plus size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-hide">
          {groupedCampaigns.length === 0 && !loading && (
            <div className="text-center p-6 mt-10">
               <Target size={40} className="mx-auto text-slate-300 mb-3" />
               <p className="text-xs font-bold text-slate-500">Belum ada Campaign.<br/>Buat baru untuk mulai menjadwalkan.</p>
            </div>
          )}
          
          {groupedCampaigns.map((group) => (
            <div key={group.baseName} className="mb-8">
              {/* Folder/Group Header */}
              <div className="flex items-center gap-2 mb-4 pl-1">
                 {group.isSequence ? <Layers size={14} className="text-indigo-500" /> : <MessageSquare size={14} className="text-slate-400" />}
                 <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-widest truncate">{group.baseName}</h4>
                 {group.isSequence && <span className="text-[8px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black tracking-widest">SEQUENCE</span>}
              </div>
              
              {/* Group Items (Timeline) */}
              <div className="space-y-3 relative">
                {group.isSequence && (
                  <div className="absolute top-4 bottom-4 left-[21px] w-[2px] bg-indigo-100/70 z-0"></div>
                )}
                
                {group.campaigns.map((camp, cIdx) => {
                  const isSelected = selectedCampaign?.id === camp.id;
                  const stepLabel = group.isSequence && camp.name.includes(" - ") ? camp.name.split(" - ")[1] : camp.name;

                  return (
                    <div 
                      key={camp.id}
                      onClick={() => setSelectedCampaign(camp)}
                      className={`relative z-10 p-4 flex flex-col gap-2.5 rounded-[1.5rem] cursor-pointer transition-all duration-300 border ${
                        isSelected 
                          ? "bg-white/90 shadow-xl shadow-orange-500/10 border-white scale-[1.02] ml-2" 
                          : "bg-white/40 border-transparent hover:bg-white/70 ml-0"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                           {group.isSequence && (
                             <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black border-[3px] transition-colors ${isSelected ? 'bg-orange-500 border-white text-white shadow-sm' : 'bg-indigo-50 border-white text-indigo-500 shadow-sm'}`}>
                               {cIdx + 1}
                             </div>
                           )}
                           <h3 className="text-[13px] font-black text-slate-800 truncate leading-tight">{stepLabel}</h3>
                        </div>
                        <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest shadow-sm border shrink-0 ml-2 ${
                          camp.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                          camp.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {camp.status}
                        </span>
                      </div>
                      <div className={`flex items-center gap-4 text-[10px] font-bold transition-colors ${isSelected ? 'text-slate-600 pl-9' : 'text-slate-500 pl-9'}`}>
                        <div className="flex items-center gap-1.5"><Clock size={11} className="text-orange-500"/> H+{camp.delay_days} | {camp.target_time}</div>
                        <div className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-blue-500"/> {camp.trigger_condition}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN VIEW: Campaign Details & Targets */}
      {selectedCampaign ? (
        <div className="flex-1 flex flex-col relative bg-white/10 min-w-0 border-l border-white/20">
          
          {/* Header Details */}
          <div className="p-8 border-b border-white/20 bg-white/40 backdrop-blur-xl shrink-0 shadow-sm relative overflow-hidden">
             
             <div className="absolute top-4 right-6 flex items-center gap-2 text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                <Activity size={10} className="animate-pulse" /> Real-time Sync
             </div>

             <div className="flex justify-between items-center mb-6 mt-2">
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">{selectedCampaign.name}</h2>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
                    Template: <span className="text-indigo-600">{selectedCampaign.template_name || 'Tidak Diketahui'}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={triggerWorker} disabled={workerLoading} className="px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all" title="Paksa eksekusi antrean sekarang">
                    <RefreshCw size={14} className={workerLoading ? "animate-spin" : ""} /> Sinkron Cepat
                  </button>
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
                    <th className="py-4 px-6">Jadwal / Waktu Update</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-xs font-bold text-slate-400">
                        Belum ada target di campaign ini.<br/>Tambahkan melalui menu "Inbox" -&gt; "Bulk Action".
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
                            t.status === 'failed' || t.status === 'canceled' ? 'bg-rose-100 text-rose-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs font-bold text-slate-500">
                          {new Date(t.status === 'queued' ? t.scheduled_at : (t.sent_at || t.scheduled_at)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          {t.status !== 'queued' && <span className="ml-2 text-[9px] uppercase bg-slate-100 px-1 rounded text-slate-400">Aktual</span>}
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

      {/* FEATURE 1: MODAL VISUAL WORKFLOW SEQUENCE BUILDER */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl border border-white flex flex-col max-h-[95vh] overflow-hidden">
            
            <div className="flex items-center justify-between p-8 border-b border-slate-100 shrink-0 bg-white z-10">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Sequence Builder</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">Buat Rangkaian Follow Up Otomatis</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <XCircle size={24} strokeWidth={2} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 bg-slate-50/30 scrollbar-hide relative">
              
              {/* GLOBAL SETTINGS */}
              <div className="grid grid-cols-2 gap-4 mb-10 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Pilih Sesi Pengirim</label>
                    <select 
                      value={formBase.session_key} 
                      onChange={e => setFormBase({...formBase, session_key: e.target.value})}
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 appearance-none"
                    >
                      <option value="">-- Sesi WA --</option>
                      {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Nama Rangkaian (Sequence)</label>
                    <input 
                      value={formBase.base_name} 
                      onChange={e => setFormBase({...formBase, base_name: e.target.value})}
                      placeholder="Misal: Sambutan Pelanggan Baru" 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700"
                    />
                 </div>
              </div>

              {/* TIMELINE WORKFLOW STEPS */}
              <div className="relative pl-6 border-l-2 border-indigo-100 ml-4 space-y-8">
                {workflowSteps.map((step, index) => (
                  <div key={step.id} className="relative bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm animate-in slide-in-from-bottom-4">
                    {/* Circle Node on the Timeline */}
                    <div className="absolute -left-[39px] top-8 w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-black text-xs shadow-md border-4 border-white">
                      {index + 1}
                    </div>

                    <div className="flex justify-between items-center mb-4">
                       <h4 className="text-sm font-black text-indigo-800 uppercase tracking-widest">Langkah {index + 1}</h4>
                       {workflowSteps.length > 1 && (
                         <button onClick={() => removeWorkflowStep(step.id)} className="text-rose-400 hover:text-rose-600 p-1">
                           <Trash2 size={16} strokeWidth={2.5}/>
                         </button>
                       )}
                    </div>

                    <div className="space-y-4">
                      {/* Step: Template */}
                      <div>
                        <select 
                          value={step.template_id} 
                          onChange={e => updateStep(step.id, 'template_id', e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 text-sm appearance-none"
                        >
                          <option value="">-- Pilih Template Pesan --</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.message_type})</option>)}
                        </select>
                      </div>

                      {/* Step: Time & Trigger */}
                      <div className="flex items-center gap-3">
                         <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 overflow-hidden">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap mr-3">Tunggu</span>
                            <input type="number" min="0" value={step.delay_days} onChange={e => updateStep(step.id, 'delay_days', Number(e.target.value))} className="w-10 bg-transparent text-center font-black text-slate-800 outline-none text-sm border-b border-dashed border-slate-300 mr-2" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap mr-3">Hari, Jam</span>
                            <input type="time" value={step.target_time} onChange={e => updateStep(step.id, 'target_time', e.target.value)} className="w-20 bg-transparent font-black text-slate-800 outline-none text-sm" />
                         </div>

                         <div className="shrink-0">
                           <button 
                              onClick={() => updateStep(step.id, 'trigger_condition', step.trigger_condition === 'unreplied' ? 'always' : 'unreplied')}
                              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${step.trigger_condition === 'unreplied' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
                           >
                             {step.trigger_condition === 'unreplied' ? <><CheckCircle2 size={14}/> Stop Jika Dibalas</> : <><Play size={14}/> Kirim Apapun Terjadi</>}
                           </button>
                         </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* Add Step Button */}
              <div className="pl-6 ml-4 mt-8">
                 <button onClick={addWorkflowStep} className="flex items-center gap-2 px-6 py-3.5 rounded-[1.5rem] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-xs uppercase tracking-widest transition-all border border-indigo-100 shadow-sm border-dashed">
                   <CopyPlus size={16} strokeWidth={2.5}/> Tambah Rangkaian (Step) Baru
                 </button>
              </div>

            </div>

            <div className="p-8 border-t border-slate-100 bg-white shrink-0 flex justify-between items-center z-10">
              <div className="text-[10px] font-bold text-slate-400 leading-relaxed max-w-[200px]">
                Sistem akan membuat <b className="text-slate-600">{workflowSteps.length} Campaign</b> terpisah yang saling menyambung.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModalOpen(false)} className="px-8 py-4 rounded-2xl font-black text-slate-500 bg-white border border-slate-200 text-[11px] uppercase tracking-widest hover:bg-slate-50">Batal</button>
                <button onClick={handleSaveSequence} className="px-8 py-4 rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all">Simpan Workflow</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}