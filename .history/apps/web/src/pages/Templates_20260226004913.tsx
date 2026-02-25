import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  Plus, Layers, Type, Image as ImageIcon, FileText, 
  MapPin, Trash2, X, Wand2, UserCircle, Sun, RefreshCw, 
  Edit3, UploadCloud, Link as LinkIcon, BarChart3, MessageSquare, Megaphone, CheckCircle2
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
  
  const url = path.startsWith("http") ? path : `/api/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try { 
    data = text ? JSON.parse(text) : {}; 
  } 
  catch (e) { 
    console.error("Terjadi error Non-JSON, server membalas dengan format HTML/Teks:", text.slice(0, 150) + "...");
    throw new Error(`Server Backend merespons dengan format yang salah (HTTP ${res.status}). Pastikan proxy /api berjalan normal.`); 
  }
  
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

// ===== TYPES =====
type TemplateRow = {
  id: number;
  name: string;
  message_type: 'text' | 'image' | 'document' | 'location';
  text_body: string | null;
  media_url: string | null;
  category: 'broadcast' | 'follow_up' | 'general';
  usage_count: number;
  created_at: string;
};

export default function Templates() {
  const confirm = useConfirm();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'broadcast' | 'follow_up' | 'general'>('all');
  
  // State Edit
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    message_type: "text",
    text_body: "",
    media_url: "",
    category: "general"
  });
  
  // Media State
  const [mediaSource, setMediaSource] = useState<'url' | 'upload'>('url');
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);

  const parsedPreview = useMemo(() => {
    let txt = formData.text_body || "";
    if (!txt.trim()) return "";

    txt = txt.replace(/\{\{nama\}\}/ig, "Budi (Contoh)");
    txt = txt.replace(/\{\{nomor\}\}/ig, "6281288844813");
    
    const h = new Date().getHours();
    let salam = "Malam";
    if (h >= 3 && h < 11) salam = "Pagi";
    else if (h >= 11 && h < 15) salam = "Siang";
    else if (h >= 15 && h < 18) salam = "Sore";
    txt = txt.replace(/\{\{salam\}\}/ig, salam);

    txt = txt.replace(/\{([^{}]+)\}/g, (match, contents) => {
      const options = contents.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
    
    return txt;
  }, [formData.text_body, previewTrigger]);

  const filteredTemplates = useMemo(() => {
    if (filterCategory === 'all') return templates;
    return templates.filter(t => t.category === filterCategory);
  }, [templates, filterCategory]);

  async function loadTemplates() {
    try {
      setLoading(true);
      const res = await apiFetch<{ ok: true; data: TemplateRow[] }>("templates");
      setTemplates(res.data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTemplates(); }, []);

  function openCreate() {
    setEditingId(null);
    setFormData({ name: "", message_type: "text", text_body: "", media_url: "", category: "general" });
    setMediaSource('url');
    setMediaFile(null);
    setModalOpen(true);
  }

  function openEdit(tpl: TemplateRow) {
    setEditingId(tpl.id);
    setFormData({
      name: tpl.name,
      message_type: tpl.message_type,
      text_body: tpl.text_body || "",
      media_url: tpl.media_url || "",
      category: tpl.category || "general"
    });
    setMediaSource('url'); 
    setMediaFile(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formData.name.trim() || (!formData.text_body?.trim() && formData.message_type === 'text')) {
      return alert("Nama dan isi pesan wajib diisi!");
    }
    
    const isMultipart = mediaSource === 'upload' && mediaFile !== null && formData.message_type !== 'text';
    let body: any;

    if (isMultipart) {
      body = new FormData();
      body.append("name", formData.name);
      body.append("message_type", formData.message_type);
      body.append("text_body", formData.text_body);
      body.append("category", formData.category);
      body.append("file", mediaFile);
    } else {
      body = JSON.stringify({
        name: formData.name,
        message_type: formData.message_type,
        text_body: formData.text_body,
        media_url: mediaSource === 'url' ? formData.media_url : "",
        category: formData.category
      });
    }
    
    try {
      const method = editingId ? "PUT" : "POST";
      const endpoint = editingId ? `templates/${editingId}` : "templates";
      
      await apiFetch(endpoint, { method, body });
      
      setModalOpen(false);
      loadTemplates();
      // Optional: replace alert with toast notification if implemented globally
      alert(`Template berhasil ${editingId ? 'diperbarui' : 'disimpan'}!`);
    } catch (e: any) { 
      alert("Gagal menyimpan: " + e.message); 
    }
  }

  async function handleDelete(id: number) {
    const isConfirmed = await confirm({
      title: "Hapus Template",
      message: "Yakin ingin menghapus template ini? Data kampanye yang menggunakannya mungkin akan terpengaruh.",
      confirmText: "Hapus",
      isDanger: true
    });

    if (!isConfirmed) return;

    try {
      await apiFetch(`templates/${id}`, { method: "DELETE" });
      loadTemplates();
    } catch (e: any) { 
      alert("Gagal menghapus: " + e.message); 
    }
  }

  const insertTag = (tag: string) => {
    const textarea = textAreaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = formData.text_body;
      const newText = currentText.substring(0, start) + tag + currentText.substring(end);
      
      setFormData({ ...formData, text_body: newText });
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
        setPreviewTrigger(p => p + 1);
      }, 0);
    } else {
      setFormData({ ...formData, text_body: formData.text_body + tag });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon size={18} className="text-emerald-500" />;
      case 'document': return <FileText size={18} className="text-[#0b57d0]" />;
      case 'location': return <MapPin size={18} className="text-amber-500" />;
      default: return <Type size={18} className="text-indigo-500" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Layers className="text-[#0b57d0]" size={28} />
            Template Pesan
          </h1>
          <p className="text-sm text-slate-500 mt-1 md:mt-2">
            Kelola pesan template *reusable* untuk Broadcast dan Follow Up.
          </p>
        </div>
        
        <button 
          onClick={openCreate}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0b57d0] text-white font-bold text-sm hover:bg-[#001d35] active:scale-95 transition-all shadow-sm w-full md:w-auto"
        >
          <Plus size={18} strokeWidth={2.5} /> Buat Template Baru
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
         {[
           { id: 'all', label: 'Semua', icon: <Layers size={14} /> },
           { id: 'broadcast', label: 'Broadcast', icon: <Megaphone size={14} /> },
           { id: 'follow_up', label: 'Auto Follow Up', icon: <MessageSquare size={14} /> },
           { id: 'general', label: 'Umum', icon: <Type size={14} /> }
         ].map(tab => (
           <button 
             key={tab.id}
             onClick={() => setFilterCategory(tab.id as any)}
             className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
               filterCategory === tab.id ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-transparent text-slate-500 hover:bg-[#f0f4f9] hover:text-slate-800'
             }`}
           >
             {tab.icon} {tab.label}
           </button>
         ))}
      </div>

      {/* TEMPLATE GRID */}
      <div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <div className="animate-spin w-8 h-8 border-4 border-[#0b57d0] border-t-transparent rounded-full"></div>
            <span className="text-xs font-bold uppercase tracking-widest">Memuat Template...</span>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 border-dashed">
            <div className="w-16 h-16 rounded-full bg-[#f0f4f9] flex items-center justify-center text-slate-400 mb-4">
              <Layers size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Belum Ada Template</h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              Anda belum memiliki template di kategori ini. Buat template baru untuk mempercepat pengiriman pesan.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {filteredTemplates.map(tpl => (
              <div key={tpl.id} className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all group flex flex-col h-full">
                
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#f0f4f9] flex items-center justify-center shrink-0">
                      {getTypeIcon(tpl.message_type)}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-800 line-clamp-1">{tpl.name}</h3>
                      <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#0b57d0] bg-[#e9eef6] px-2 py-0.5 rounded">
                        {tpl.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openEdit(tpl)}
                      className="w-8 h-8 rounded-full bg-[#f0f4f9] text-[#0b57d0] flex items-center justify-center hover:bg-[#c2e7ff] transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(tpl.id)}
                      className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="bg-[#f8fafd] p-3.5 rounded-2xl text-sm text-slate-700 font-medium line-clamp-3 leading-relaxed whitespace-pre-wrap flex-1 border border-slate-50">
                  {tpl.text_body || (tpl.message_type !== 'text' ? `[Lampiran: ${tpl.media_url ? 'URL Eksternal' : 'File Upload'}]` : '-')}
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-slate-500">
                   <div className="flex items-center gap-1.5">
                     <BarChart3 size={14} className="text-emerald-500" /> 
                     <span>Digunakan <strong className="text-emerald-600">{tpl.usage_count || 0}x</strong></span>
                   </div>
                   <span>{new Date(tpl.created_at).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric'})}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 md:p-6 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{editingId ? 'Edit Template' : 'Buat Template Baru'}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Konfigurasi pesan standar sistem</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 md:p-6 overflow-y-auto space-y-6 scrollbar-hide">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Nama Template</label>
                  <input 
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Contoh: Promo Ramadhan" 
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-800 focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Kategori / Label</label>
                  <select 
                    value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-800 cursor-pointer focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                  >
                    <option value="general">Umum / Lainnya</option>
                    <option value="broadcast">Blast / Broadcast</option>
                    <option value="follow_up">Auto Follow Up</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Tipe Pesan</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['text', 'image', 'document', 'location'].map(type => (
                    <button 
                      key={type} onClick={() => setFormData({...formData, message_type: type as any})}
                      className={`py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider flex justify-center items-center gap-2 transition-all ${
                        formData.message_type === type ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {getTypeIcon(type)} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* MEDIA INPUT SECTION (URL OR UPLOAD) */}
              {formData.message_type !== 'text' && formData.message_type !== 'location' && (
                <div className="bg-[#f8fafd] p-4 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                      <input type="radio" checked={mediaSource === 'url'} onChange={() => setMediaSource('url')} className="w-4 h-4 text-[#0b57d0]" />
                      <LinkIcon size={16} className="text-slate-400" /> URL Eksternal
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                      <input type="radio" checked={mediaSource === 'upload'} onChange={() => setMediaSource('upload')} className="w-4 h-4 text-[#0b57d0]" />
                      <UploadCloud size={16} className="text-slate-400" /> Upload File
                    </label>
                  </div>

                  {mediaSource === 'url' ? (
                    <input 
                      value={formData.media_url} onChange={e => setFormData({...formData, media_url: e.target.value})}
                      placeholder="https://domain.com/file.jpg" 
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 outline-none font-medium text-slate-700 focus:border-[#0b57d0]"
                    />
                  ) : (
                    <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-[#e9eef6] transition-colors bg-white cursor-pointer">
                      <input 
                        type="file" 
                        onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept={formData.message_type === 'image' ? 'image/*' : '*/*'}
                      />
                      {mediaFile ? (
                        <div className="text-[#0b57d0] font-bold text-sm flex flex-col items-center">
                          <CheckCircle2 size={24} className="mb-2 text-emerald-500" />
                          {mediaFile.name} <span className="text-xs text-slate-500 mt-1">({(mediaFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      ) : (
                        <div className="text-slate-500 font-medium text-sm flex flex-col items-center">
                          <UploadCloud size={28} className="mb-2 text-slate-400" />
                          Pilih file atau drop ke sini (Maks 10MB)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* LOCATION INPUT */}
              {formData.message_type === 'location' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Titik Koordinat (Latitude, Longitude)</label>
                  <input 
                    value={formData.media_url} onChange={e => setFormData({...formData, media_url: e.target.value})}
                    placeholder="-6.200000, 106.816666" 
                    className="w-full px-4 py-3 rounded-xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-800 focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                  />
                </div>
              )}

              {/* TEKS PESAN / CAPTION */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {formData.message_type === 'text' ? 'Isi Pesan' : 'Caption Lampiran (Opsional)'}
                </label>
                
                <textarea 
                  ref={textAreaRef} rows={5}
                  value={formData.text_body} 
                  onChange={e => setFormData({...formData, text_body: e.target.value})}
                  placeholder="Ketik isi pesan..." 
                  className="w-full px-5 py-4 rounded-2xl bg-[#f0f4f9] border-none outline-none font-medium text-slate-800 resize-none leading-relaxed focus:ring-2 focus:ring-[#c2e7ff] transition-all"
                />

                {/* Variabel Pintar */}
                <div className="mt-3 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => insertTag('{{nama}}')} className="px-3 py-1.5 bg-[#f0f4f9] text-[#0b57d0] hover:bg-[#e9eef6] rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1">
                      <UserCircle size={14} /> {"{{nama}}"}
                    </button>
                    <button type="button" onClick={() => insertTag('{{nomor}}')} className="px-3 py-1.5 bg-[#f0f4f9] text-[#0b57d0] hover:bg-[#e9eef6] rounded-lg text-[11px] font-bold transition-colors">
                      {"{{nomor}}"}
                    </button>
                    <button type="button" onClick={() => insertTag('Selamat {{salam}}')} className="px-3 py-1.5 bg-[#f0f4f9] text-[#0b57d0] hover:bg-[#e9eef6] rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1">
                      <Sun size={14} /> {"{{salam}}"}
                    </button>
                    <button type="button" onClick={() => insertTag('{Halo|Hai|Permisi}')} className="px-3 py-1.5 bg-[#f0f4f9] text-[#0b57d0] hover:bg-[#e9eef6] rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1">
                      <Wand2 size={14} /> Spintax {"{A|B}"}
                    </button>
                  </div>
                </div>

                {/* Preview Parser */}
                <div className="mt-4 border border-slate-100 rounded-xl bg-white overflow-hidden shadow-sm">
                  <div className="px-4 py-2 border-b border-slate-50 bg-[#f8fafd] flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">👀 Pratinjau Pesan</span>
                    <button type="button" onClick={() => setPreviewTrigger(p => p + 1)} className="text-[10px] font-bold text-slate-500 hover:text-[#0b57d0] transition-colors cursor-pointer flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                      <RefreshCw size={12} /> Acak
                    </button>
                  </div>
                  <div className="p-4 bg-[#f0f4f9]">
                    <div className="bg-white rounded-tr-xl rounded-tl-xl rounded-br-xl rounded-bl-sm p-3 text-sm font-medium text-slate-700 shadow-sm whitespace-pre-wrap leading-relaxed max-w-[90%] border border-slate-50">
                      {parsedPreview || <span className="text-slate-400 italic">Ketik sesuatu untuk melihat hasil akhir...</span>}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 md:p-6 border-t border-slate-100 bg-white shrink-0 flex justify-end gap-3 z-10">
              <button onClick={() => setModalOpen(false)} className="px-6 py-2.5 rounded-full font-bold text-slate-600 hover:bg-[#f0f4f9] transition-colors text-sm">Batal</button>
              <button onClick={handleSave} className="px-6 py-2.5 rounded-full font-bold text-white bg-[#0b57d0] hover:bg-[#001d35] shadow-sm transition-all active:scale-95 text-sm">
                {editingId ? 'Simpan Perubahan' : 'Buat Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}