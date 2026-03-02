import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  CalendarClock, Plus, Users, Clock, Target, Play, Pause, Trash2,
  CheckCircle2, XCircle, MessageSquare, RefreshCw, Activity, CopyPlus, Layers, ArrowLeft
} from "lucide-react";

import { useConfirm } from "../App";

/** HELPER INTERNAL */
const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

// Polyfill sederhana untuk generate UUID yang aman di HTTP/Non-Secure Context
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch (e) { throw new Error(`Server Error (HTTP ${res.status}).`); }

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
  last_error?: string;
};

type WorkflowStep = {
  id: string;
  template_id: string;
  delay_days: number;
  target_time: string;
  trigger_condition: 'always' | 'unreplied';
};

export default function AutoFollowUp() {
  const confirm = useConfirm();

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());

  const [manualLeadsModalOpen, setManualLeadsModalOpen] = useState(false);
  const [manualLeadsText, setManualLeadsText] = useState("");
  const [manualLeadsLoading, setManualLeadsLoading] = useState(false);

  async function handleAddManualLeads() {
    if (!selectedCampaign) return;
    const rawNumbers = manualLeadsText.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
    if (!rawNumbers.length) return alert("Masukkan minimal 1 nomor");

    setManualLeadsLoading(true);
    try {
      const res = await apiFetch<{ added: number }>("followup/leads/manual", {
        method: "POST",
        body: JSON.stringify({
          campaign_id: selectedCampaign.id,
          phone_numbers: rawNumbers
        })
      });
      alert(`Berhasil menambahkan ${res.added} leads baru.`);
      setManualLeadsModalOpen(false);
      setManualLeadsText("");
      loadTargets(selectedCampaign.id);
      loadData(false);
    } catch (e: any) {
      alert("Gagal tambah leads: " + e.message);
    } finally {
      setManualLeadsLoading(false);
    }
  }

  const selectedCampRef = useRef(selectedCampaign);
  useEffect(() => { selectedCampRef.current = selectedCampaign; }, [selectedCampaign]);

  const [formBase, setFormBase] = useState({ session_key: "", base_name: "" });
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([
    { id: generateId(), template_id: "", delay_days: 1, target_time: "10:00", trigger_condition: "unreplied" }
  ]);

  const groupedCampaigns = useMemo(() => {
    const groups: Record<string, CampaignRow[]> = {};
    campaigns.forEach(camp => {
      const baseName = camp.name.includes(" - Step ") ? camp.name.split(" - Step ")[0] : camp.name;
      if (!groups[baseName]) groups[baseName] = [];
      groups[baseName].push(camp);
    });

    return Object.entries(groups).map(([baseName, camps]) => ({
      baseName,
      isSequence: camps.length > 1 || camps[0].name.includes(" - Step "),
      campaigns: camps.sort((a, b) => a.delay_days - b.delay_days)
    }));
  }, [campaigns]);

  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadData(showLoading = false) {
    try {
      if (showLoading) setLoading(true);
      const [campRes, tplRes, sessRes] = await Promise.all([
        apiFetch<{ data: CampaignRow[] }>("followup/campaigns").catch(() => ({ data: [] })),
        apiFetch<{ data: any[] }>("templates").catch(() => ({ data: [] })),
        apiFetch<{ sessions: any[] }>("ui/sessions").catch(() => ({ sessions: [] }))
      ]);
      setCampaigns(campRes.data || []);

      // Filter template untuk follow up atau general saja
      const validTpls = (tplRes.data || []).filter(t => t.category !== 'broadcast');
      setTemplates(validTpls);

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
      const res = await apiFetch<{ data: TargetRow[] }>(`followup/campaigns/${campaignId}/targets`);
      setTargets(res.data || []);
    } catch (e) { }
  }

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
    if (selectedCampaign) loadTargets(selectedCampaign.id);
  }, [selectedCampaign]);

  async function handleSaveSequence() {
    if (!formBase.base_name.trim() || !formBase.session_key) {
      return alert("Nama Sequence dan Sesi wajib diisi!");
    }

    const invalidStep = workflowSteps.find(s => !s.template_id);
    if (invalidStep) return alert("Pastikan semua langkah (Step) telah memilih Template Pesan!");

    try {
      const promises = workflowSteps.map((step, index) => {
        const stepName = workflowSteps.length > 1 ? `${formBase.base_name} - Step ${index + 1}` : formBase.base_name;
        return apiFetch("followup/campaigns", {
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
      setFormBase(f => ({ ...f, base_name: "" }));
      setWorkflowSteps([{ id: generateId(), template_id: "", delay_days: 1, target_time: "10:00", trigger_condition: "unreplied" }]);
      loadData(true);
      alert(`Berhasil membuat ${workflowSteps.length} rangkaian Follow Up!`);
    } catch (e: any) {
      alert("Gagal menyimpan rangkaian: " + e.message);
    }
  }

  const addWorkflowStep = () => {
    const lastStep = workflowSteps[workflowSteps.length - 1];
    setWorkflowSteps([...workflowSteps, {
      id: generateId(),
      template_id: "",
      delay_days: lastStep.delay_days + 1,
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
      await apiFetch(`followup/campaigns/${camp.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus })
      });
      loadData(false);
      if (selectedCampaign?.id === camp.id) {
        setSelectedCampaign({ ...camp, status: newStatus });
      }
    } catch (e: any) { alert("Gagal update status: " + e.message); }
  }

  async function handleDelete(id: number) {
    const isConfirmed = await confirm({
      title: "Hapus Campaign",
      message: "Hapus campaign ini beserta semua antrean target di dalamnya secara permanen?",
      confirmText: "Hapus Permanen",
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      await apiFetch(`followup/campaigns/${id}`, { method: "DELETE" });
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
      loadData(true);
    } catch (e: any) { alert("Gagal hapus: " + e.message); }
  }

  async function triggerWorker() {
    try {
      setWorkerLoading(true);
      await apiFetch("followup/trigger-worker", { method: "POST" });
      setTimeout(() => {
        loadData(false);
        if (selectedCampaign) loadTargets(selectedCampaign.id);
        setWorkerLoading(false);
      }, 1500);
    } catch (e: any) {
      alert("Gagal memicu worker: " + e.message);
      setWorkerLoading(false);
    }
  }

  const getStats = () => {
    const stats = { queued: 0, sent: 0, read: 0, replied: 0, failed: 0, canceled: 0 };
    targets.forEach(t => {
      if (t.status === 'queued') stats.queued++;
      else if (t.status === 'failed') stats.failed++;
      else if (t.status === 'canceled') stats.canceled++;
      else if (t.status === 'replied') stats.replied++;
      else if (t.status === 'read') stats.read++;
      else stats.sent++;
    });
    return stats;
  };

  const currentStats = getStats();

  return (
    <div className="flex h-full bg-white overflow-hidden rounded-2xl border border-slate-100 shadow-sm relative">

      {/* SIDEBAR: List Campaigns Grouped */}
      <div className={`w-full md:w-[350px] lg:w-[400px] flex flex-col border-r border-slate-100 bg-[#f8fafd] shrink-0 h-full ${selectedCampaign ? 'hidden md:flex' : 'flex'}`}>

        <div className="h-20 px-6 flex items-center justify-between border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center">
              <CalendarClock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">Follow Up</h2>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#0b57d0] tracking-widest mt-0.5">
                <Clock size={10} className="animate-pulse" />
                {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="w-10 h-10 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shadow-sm hover:bg-[#001d35] active:scale-95 transition-all"
            title="Buat Sequence Baru"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 scrollbar-hide">
          {groupedCampaigns.length === 0 && !loading && (
            <div className="text-center p-6 mt-10">
              <Target size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">Belum ada Rangkaian Follow Up.<br />Buat baru untuk mulai menjadwalkan.</p>
            </div>
          )}

          {groupedCampaigns.map((group) => (
            <div key={group.baseName} className="mb-6">
              {/* Folder/Group Header */}
              <div className="flex items-center gap-2 mb-3 pl-2">
                {group.isSequence ? <Layers size={14} className="text-[#0b57d0]" /> : <MessageSquare size={14} className="text-slate-400" />}
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider truncate">{group.baseName}</h4>
                {group.isSequence && <span className="text-[9px] bg-[#c2e7ff] text-[#001d35] px-1.5 py-0.5 rounded font-bold tracking-widest">SEQ</span>}
              </div>

              {/* Group Items (Timeline) */}
              <div className="space-y-2 relative">
                {group.isSequence && (
                  <div className="absolute top-4 bottom-4 left-[23px] w-0.5 bg-slate-200 z-0"></div>
                )}

                {group.campaigns.map((camp, cIdx) => {
                  const isSelected = selectedCampaign?.id === camp.id;
                  const stepLabel = group.isSequence && camp.name.includes(" - ") ? camp.name.split(" - ")[1] : camp.name;

                  return (
                    <div
                      key={camp.id}
                      onClick={() => setSelectedCampaign(camp)}
                      className={`relative z-10 p-3.5 flex flex-col gap-2 rounded-2xl cursor-pointer transition-colors border ${isSelected
                        ? "bg-[#c2e7ff] border-transparent ml-2"
                        : "bg-white border-slate-100 hover:bg-[#f0f4f9] ml-0"
                        }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          {group.isSequence && (
                            <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${isSelected ? 'bg-[#0b57d0] border-[#0b57d0] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                              {cIdx + 1}
                            </div>
                          )}
                          <h3 className={`text-[14px] font-bold truncate leading-tight ${isSelected ? 'text-[#001d35]' : 'text-slate-800'}`}>{stepLabel}</h3>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0 ml-2 ${camp.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          camp.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                          {camp.status}
                        </span>
                      </div>
                      <div className={`flex items-center gap-3 text-[10px] font-medium transition-colors ${isSelected ? 'text-[#001d35] opacity-80 pl-9' : 'text-slate-500 pl-9'}`}>
                        <div className="flex items-center gap-1"><Clock size={12} className={camp.status === 'active' ? 'text-[#0b57d0]' : 'text-slate-400'} /> H+{camp.delay_days} | {camp.target_time}</div>
                        <div className="flex items-center gap-1"><CheckCircle2 size={12} className={camp.status === 'active' ? 'text-emerald-600' : 'text-slate-400'} /> {camp.trigger_condition === 'always' ? 'Selalu' : 'Kecuali Dibalas'}</div>
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
        <div className={`flex-1 flex flex-col relative bg-white min-w-0 border-l border-slate-100 ${selectedCampaign ? 'flex' : 'hidden md:flex'}`}>

          {/* HEADER CHAT/DETAIL */}
          <div className="p-4 md:p-6 border-b border-slate-100 bg-white shrink-0 relative">
            <div className="hidden lg:flex absolute top-4 right-6 items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <Activity size={12} className="animate-pulse" /> Real-time Sync
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <button onClick={() => setSelectedCampaign(null)} className="md:hidden mt-0.5 p-1.5 -ml-1.5 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                  <ArrowLeft size={22} />
                </button>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight leading-tight">{selectedCampaign.name}</h2>
                  <p className="text-[11px] font-medium text-slate-500 mt-1.5 flex items-center gap-1.5">
                    Template: <span className="text-[#0b57d0] font-bold bg-[#f0f4f9] px-2 py-0.5 rounded">{selectedCampaign.template_name || 'Tidak Diketahui'}</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={triggerWorker} disabled={workerLoading} className="px-4 py-2 rounded-full bg-[#f0f4f9] text-[#0b57d0] hover:bg-[#e9eef6] flex items-center gap-2 font-bold text-xs transition-colors">
                  <RefreshCw size={14} className={workerLoading ? "animate-spin" : ""} /> Sinkron
                </button>
                <button onClick={() => toggleStatus(selectedCampaign)} className={`px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 transition-colors ${selectedCampaign.status === 'active' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                  {selectedCampaign.status === 'active' ? <><Pause size={14} /> Jeda</> : <><Play size={14} /> Aktifkan</>}
                </button>
                <button onClick={() => handleDelete(selectedCampaign.id)} className="w-9 h-9 rounded-full bg-white text-slate-400 flex items-center justify-center border border-slate-200 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-5">
              <div className="bg-[#f0f4f9] p-3 rounded-xl flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-800">{targets.length}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Total Target</span>
              </div>
              <div className="bg-orange-50 p-3 rounded-xl flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-orange-600">{currentStats.queued}</span>
                <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wider mt-0.5">Antrean</span>
              </div>
              <div className="bg-blue-50 p-3 rounded-xl flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-blue-600">{currentStats.sent}</span>
                <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mt-0.5">Terkirim</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-emerald-600">{currentStats.replied}</span>
                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mt-0.5">Dibalas</span>
              </div>
              <div className="bg-rose-50 p-3 rounded-xl flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-rose-600">{currentStats.failed}</span>
                <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wider mt-0.5">Gagal</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-500">{currentStats.canceled}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Batal</span>
              </div>
            </div>
          </div>

          {/* Target List */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 scrollbar-hide">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Users size={16} className="text-[#0b57d0]" /> Daftar Target Prospek
              </h4>
              <button
                onClick={() => setManualLeadsModalOpen(true)}
                className="px-3 py-1.5 bg-[#0b57d0] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-[#001d35] transition-colors shadow-sm"
              >
                <Plus size={14} /> Add Leads
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              {/* Tampilan Desktop (Table) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#f8fafd] text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-3 px-5">Nomor Tujuan</th>
                      <th className="py-3 px-5">Status</th>
                      <th className="py-3 px-5">Jadwal / Waktu Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {targets.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-10 text-center text-sm font-medium text-slate-400">
                          Belum ada target prospek.<br />Tambahkan prospek baru melalui menu Inbox.
                        </td>
                      </tr>
                    ) : (
                      targets.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-5 font-mono font-medium text-slate-800 text-sm">{t.to_number}</td>
                          <td className="py-3 px-5">
                            <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider border ${t.status === 'replied' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              t.status === 'queued' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                t.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  t.status === 'canceled' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                                    'bg-blue-50 text-blue-600 border-blue-100'
                              }`}>
                              {t.status}
                            </span>
                            {t.last_error && <p className="text-[10px] text-rose-500 mt-1 max-w-[200px] truncate" title={t.last_error}>{t.last_error}</p>}
                          </td>
                          <td className="py-3 px-5 text-xs text-slate-500">
                            {new Date(t.status === 'queued' ? t.scheduled_at : (t.sent_at || t.scheduled_at)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                            {t.status !== 'queued' && <span className="ml-2 text-[9px] uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold border border-slate-200">Aktual</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tampilan Mobile (List) */}
              <div className="sm:hidden divide-y divide-slate-100">
                {targets.length === 0 ? (
                  <div className="py-8 text-center text-sm font-medium text-slate-400">
                    Belum ada target prospek.
                  </div>
                ) : (
                  targets.map(t => (
                    <div key={t.id} className="p-4 bg-white flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-slate-800 text-sm">{t.to_number}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${t.status === 'replied' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          t.status === 'queued' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                            t.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                              t.status === 'canceled' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                                'bg-blue-50 text-blue-600 border-blue-100'
                          }`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-[11px] text-slate-500">
                          {new Date(t.status === 'queued' ? t.scheduled_at : (t.sent_at || t.scheduled_at)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        {t.status !== 'queued' && <span className="text-[8px] uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold border border-slate-200">Aktual</span>}
                      </div>
                      {t.last_error && <p className="text-[10px] text-rose-500 leading-tight">{t.last_error}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-white relative border-l border-slate-100">
          <div className="w-24 h-24 rounded-full bg-[#f0f4f9] mb-6 flex items-center justify-center text-[#0b57d0]">
            <CalendarClock size={48} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-slate-500 text-center leading-relaxed max-w-sm">
            Pilih Workflow di sebelah kiri untuk melihat daftar antrean target dan riwayat pengiriman.
          </p>
        </div>
      )}

      {/* MODAL VISUAL WORKFLOW SEQUENCE BUILDER */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95">

            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0 bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Sequence Builder</h3>
                <p className="text-xs text-slate-500 mt-1">Buat Rangkaian Follow Up Otomatis</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <XCircle size={20} strokeWidth={2} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-[#f8fafd] scrollbar-hide">

              {/* GLOBAL SETTINGS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Sesi Pengirim</label>
                  <select
                    value={formBase.session_key}
                    onChange={e => setFormBase({ ...formBase, session_key: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 appearance-none focus:ring-2 focus:ring-[#c2e7ff] transition-all cursor-pointer"
                  >
                    <option value="">-- WA Pengirim --</option>
                    {sessions.map(s => <option key={s.session_key} value={s.session_key}>{s.session_key} ({s.status})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Nama Workflow</label>
                  <input
                    value={formBase.base_name}
                    onChange={e => setFormBase({ ...formBase, base_name: e.target.value })}
                    placeholder="Misal: Sambutan Klien Baru"
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                  />
                </div>
              </div>

              {/* TIMELINE WORKFLOW STEPS */}
              <div className="relative pl-6 md:pl-8 border-l-2 border-slate-200 ml-3 md:ml-4 space-y-6">
                {workflowSteps.map((step, index) => (
                  <div key={step.id} className="relative bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm animate-in slide-in-from-bottom-2">

                    {/* Circle Node on the Timeline */}
                    <div className="absolute -left-[35px] md:-left-[43px] top-6 w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#0b57d0] text-white flex items-center justify-center font-bold text-xs shadow-sm border-4 border-[#f8fafd]">
                      {index + 1}
                    </div>

                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-bold text-[#0b57d0]">Langkah Eksekusi {index + 1}</h4>
                      {workflowSteps.length > 1 && (
                        <button onClick={() => removeWorkflowStep(step.id)} className="text-rose-400 hover:text-rose-600 bg-rose-50 p-1.5 rounded-lg transition-colors" title="Hapus Langkah Ini">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Step: Template */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Kirim Template Ini</label>
                        <select
                          value={step.template_id}
                          onChange={e => updateStep(step.id, 'template_id', e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                        >
                          <option value="">-- Pilih Template Pesan --</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.message_type})</option>)}
                        </select>
                      </div>

                      {/* Step: Time & Trigger */}
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="w-full sm:w-auto flex-1 flex items-center bg-[#f0f4f9] rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-[#c2e7ff] transition-all">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-3 flex items-center gap-1"><Clock size={12} className="text-[#0b57d0]" /> Tunggu</span>
                          <div className="flex items-center">
                            <input type="number" min="0" value={step.delay_days} onChange={e => updateStep(step.id, 'delay_days', Number(e.target.value))} className="w-10 bg-transparent text-center font-bold text-lg text-slate-800 outline-none border-b-2 border-slate-300 focus:border-[#0b57d0] mr-2" />
                            <span className="text-[10px] font-medium text-slate-500 mr-3">Hari, Jam</span>
                            <input type="time" value={step.target_time} onChange={e => updateStep(step.id, 'target_time', e.target.value)} className="bg-transparent font-bold text-base text-slate-800 outline-none cursor-pointer" />
                          </div>
                        </div>

                        <div className="w-full sm:w-auto shrink-0">
                          <button
                            onClick={() => updateStep(step.id, 'trigger_condition', step.trigger_condition === 'unreplied' ? 'always' : 'unreplied')}
                            className={`w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${step.trigger_condition === 'unreplied' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                          >
                            {step.trigger_condition === 'unreplied' ? <><CheckCircle2 size={14} /> Batal Jika Dibalas</> : <><Play size={14} /> Terus Kirim (Paksa)</>}
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* Add Step Button */}
              <div className="pl-6 md:pl-8 ml-3 md:ml-4 mt-6">
                <button onClick={addWorkflowStep} className="flex items-center justify-center w-full gap-2 px-4 py-4 rounded-2xl bg-white hover:bg-[#f0f4f9] text-[#0b57d0] font-bold text-xs uppercase tracking-wider transition-all border-2 border-dashed border-[#c2e7ff] hover:border-solid">
                  <CopyPlus size={16} /> Tambah Langkah Berikutnya
                </button>
              </div>

            </div>

            <div className="p-5 md:p-6 border-t border-slate-100 bg-white shrink-0 flex flex-col-reverse sm:flex-row justify-between items-center gap-4 z-10">
              <div className="text-[11px] font-medium text-slate-500 text-center sm:text-left">
                Sistem akan membuat <b className="text-[#0b57d0]">{workflowSteps.length} Campaign</b> yang berkesinambungan.
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={() => setModalOpen(false)} className="flex-1 sm:flex-none px-6 py-3 rounded-full font-bold text-slate-600 bg-white border border-slate-200 text-sm hover:bg-slate-50 transition-colors">Batal</button>
                <button onClick={handleSaveSequence} className="flex-1 sm:flex-none px-6 py-3 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] text-sm shadow-sm transition-all active:scale-95">Simpan Workflow</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MANUAL LEADS */}
      {manualLeadsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl flex flex-col p-6 animate-in zoom-in-95">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Input Manual Leads</h3>
            <p className="text-xs text-slate-500 mb-4">Masukkan nomor WhatsApp (pisahkan baris/koma).</p>
            <textarea
              value={manualLeadsText}
              onChange={(e) => setManualLeadsText(e.target.value)}
              placeholder="08123xxx&#10;0856xxx"
              className="w-full h-32 px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-700 focus:ring-2 focus:ring-[#c2e7ff] transition-all resize-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setManualLeadsModalOpen(false); setManualLeadsText(""); }} className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">Batal</button>
              <button onClick={handleAddManualLeads} disabled={manualLeadsLoading} className="px-4 py-2 text-sm font-bold text-white bg-[#0b57d0] rounded-full hover:bg-[#001d35] flex items-center gap-2 transition-colors">{manualLeadsLoading ? "Menyimpan..." : "Add Leads"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}