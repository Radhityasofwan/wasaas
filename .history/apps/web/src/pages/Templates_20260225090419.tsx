import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  Plus, Layers, Type, Image as ImageIcon, FileText, 
  MapPin, Trash2, X, Wand2, UserCircle, Sun, RefreshCw, 
  Edit3, UploadCloud, Link as LinkIcon, BarChart3, MessageSquare, Megaphone, CheckCircle2
} from "lucide-react";

const getApiKey = () => (typeof window !== "undefined" ? localStorage.getItem("WA_KEY") || "" : "");

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  
  // Jangan set Content-Type secara manual jika menggunakan FormData (Upload File)
  if (!headers.get("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  
  const url = path.startsWith("http") ? path : `/${path.startsWith("/") ? path.slice(1) : path}`;
  const res = await fetch(url, { ...init, headers });
  
  const text = await res.text();
  let data;
  try { 
    data = text ? JSON.parse(text) : {}; 
  } 
  catch (e) { 
    console.error("Non-JSON response:", text);
    throw new Error(`Server Error (HTTP ${res.status})`); 
  }
  
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data as T;
}

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
    setMediaSource('url'); // Set default to URL for editing to show existing link
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
      alert(`Template berhasil ${editingId ? 'diperbarui' : 'disimpan'}!`);
    } catch (e: any) { 
      alert("Gagal menyimpan: " + e.message); 
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Yakin ingin menghapus template ini? Data kampanye yang menggunakannya mungkin akan terpengaruh.")) return;
    try {
      await apiFetch(`templates/${id}`, { method: "DELETE" });
      loadTemplates();
    } catch (e: any) { alert("Gagal menghapus: " + e.message); }
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
      case 'document': return <FileText size={18} className="text-blue-500" />;
      case 'location': return <MapPin size={18} className="text-amber-500" />;
      default: return <Type size={18} className="text-indigo-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden rounded-[2.5rem] relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between p-8 bg-white/40 backdrop-blur-3xl border-b border-white/20 shrink-0 z-10 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 rotate-3">
            <Layers size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Template Pesan</h1>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mt-1">
              Kelola pesan reusable untuk Broadcast & Follow Up
            </p>
          </div>
        </div>
        
        <button 
          onClick={openCreate}
          className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={18} strokeWidth={3} /> Buat Template
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="px-8 pt-6 pb-2 shrink-0 z-10 flex gap-2 overflow-x-auto scrollbar-hide">
         {[
           { id: 'all', label: 'Semua', icon: <Layers size={14} /> },
           { id: 'broadcast', label: 'Broadcast', icon: <Megaphone size={14} /> },
           { id: 'follow_up', label: 'Auto Follow Up', icon: <MessageSquare size={14} /> },
           { id: 'general', label: 'Umum', icon: <Type size={14} /> }
         ].map(tab => (
           <button 
             key={tab.id}
             onClick={() => setFilterCategory(tab.id as any)}
             className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
               filterCategory === tab.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-white/60 text-slate-500 hover:bg-white border border-white'
             }`}
           >
             {tab.icon} {tab.label}
           </button>
         ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8 scrollbar-hide relative z-0">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white/20 rounded-[2.5rem] border border-white/40 border-dashed">
            <Layers size={48} className="text-slate-300 mb-4" strokeWidth={1.5} />
            <p className="text-slate-500 font-bold">Belum ada template di kategori ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredTemplates.map(tpl => (
              <div key={tpl.id} className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 group relative flex flex-col h-full">
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                      {getTypeIcon(tpl.message_type)}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-black text-slate-800 line-clamp-1">{tpl.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded-md">
                          {tpl.category.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openEdit(tpl)}
                      className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={14} strokeWidth={2.5} />
                    </button>
                    <button 
                      onClick={() => handleDelete(tpl.id)}
                      className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"
                      title="Hapus"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
                
                <div className="bg-white/50 p-4 rounded-2xl border border-white/50 text-sm text-slate-600 font-medium line-clamp-3 leading-relaxed whitespace-pre-wrap flex-1">
                  {tpl.text_body || (tpl.message_type !== 'text' ? `[Media Attach: ${tpl.media_url ? 'URL Terlampir' : 'File Terlampir'}]` : '-')}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                   <BarChart3 size={12} className="text-emerald-500" /> 
                   Telah digunakan: <span className="text-emerald-600">{tpl.usage_count || 0} Kali</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl border border-white flex flex-col max-h-[90vh] animate-in zoom-in-95">
            
            <div className="flex items-center justify-between p-8 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{editingId ? 'Edit Template' : 'Buat Template Baru'}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Simpan format pesan Anda</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-rose-100 hover:text-rose-500 transition-colors">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-8 scrollbar-hide">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Nama Template</label>
                  <input 
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Promo Akhir Tahun..." 
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 focus:bg-white focus:border-indigo-300 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Kategori (Penggunaan)</label>
                  <select 
                    value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 cursor-pointer focus:bg-white"
                  >
                    <option value="general">Umum / Lainnya</option>
                    <option value="broadcast">Blast / Broadcast</option>
                    <option value="follow_up">Auto Follow Up</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Tipe Pesan</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['text', 'image', 'document', 'location'].map(type => (
                    <button 
                      key={type} onClick={() => setFormData({...formData, message_type: type})}
                      className={`py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider flex justify-center items-center gap-2 border-2 transition-all ${
                        formData.message_type === type ? 'bg-indigo-50 border-indigo-500 text-indigo-600 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {getTypeIcon(type)} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* MEDIA INPUT SECTION (URL OR UPLOAD) */}
              {formData.message_type !== 'text' && formData.message_type !== 'location' && (
                <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-200 space-y-4">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                      <input type="radio" checked={mediaSource === 'url'} onChange={() => setMediaSource('url')} className="w-4 h-4 text-indigo-600" />
                      <LinkIcon size={14} /> Gunakan Link URL
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                      <input type="radio" checked={mediaSource === 'upload'} onChange={() => setMediaSource('upload')} className="w-4 h-4 text-indigo-600" />
                      <UploadCloud size={14} /> Upload File Asli
                    </label>
                  </div>

                  {mediaSource === 'url' ? (
                    <input 
                      value={formData.media_url} onChange={e => setFormData({...formData, media_url: e.target.value})}
                      placeholder="https://domain.com/file.jpg" 
                      className="w-full px-5 py-4 rounded-xl bg-white border border-slate-200 outline-none font-bold text-slate-700"
                    />
                  ) : (
                    <div className="relative border-2 border-dashed border-indigo-200 rounded-xl p-6 text-center hover:bg-indigo-50/50 transition-colors bg-white">
                      <input 
                        type="file" 
                        onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept={formData.message_type === 'image' ? 'image/*' : '*/*'}
                      />
                      {mediaFile ? (
                        <div className="text-indigo-600 font-bold text-sm flex flex-col items-center">
                          <CheckCircle2 size={24} className="mb-2" />
                          {mediaFile.name} ({(mediaFile.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                      ) : (
                        <div className="text-slate-500 font-medium text-xs">
                          <UploadCloud size={24} className="mx-auto mb-2 text-indigo-400" />
                          Klik atau Drag & Drop file di sini (Maks 10MB)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* LOCATION INPUT */}
              {formData.message_type === 'location' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Titik Koordinat (Latitude, Longitude)</label>
                  <input 
                    value={formData.media_url} onChange={e => setFormData({...formData, media_url: e.target.value})}
                    placeholder="-6.200000, 106.816666" 
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">
                  {formData.message_type === 'text' ? 'Isi Pesan' : 'Caption / Deskripsi Singkat'}
                </label>
                
                <textarea 
                  ref={textAreaRef} rows={5}
                  value={formData.text_body} 
                  onChange={e => setFormData({...formData, text_body: e.target.value})}
                  placeholder="Ketik isi pesan... Gunakan sapaan untuk pelanggan." 
                  className="w-full px-6 py-5 rounded-3xl bg-slate-50 border border-slate-200 outline-none font-medium text-slate-700 resize-none leading-relaxed focus:bg-white focus:border-indigo-300 transition-colors"
                />

                <div className="mt-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Wand2 size={14} /> Personalisasi & Anti-Banned
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => insertTag('{{nama}}')} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold shadow-sm hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-1.5">
                      <UserCircle size={14} /> Insert {"{{nama}}"}
                    </button>
                    <button onClick={() => insertTag('{{nomor}}')} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold shadow-sm hover:bg-indigo-600 hover:text-white transition-colors">
                      Insert {"{{nomor}}"}
                    </button>
                    <button onClick={() => insertTag('Selamat {{salam}}')} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold shadow-sm hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-1.5">
                      <Sun size={14} /> Insert {"{{salam}}"}
                    </button>
                    <button onClick={() => insertTag('{Halo|Hai|Permisi}')} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold shadow-sm hover:bg-indigo-600 hover:text-white transition-colors">
                      Spintax: {"{A|B|C}"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 border border-slate-200 rounded-[1.5rem] bg-slate-50 overflow-hidden shadow-inner">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-100/80 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">👀 Pratinjau Pesan</span>
                    <button type="button" onClick={() => setPreviewTrigger(p => p + 1)} className="text-[9px] font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm cursor-pointer active:scale-95">
                      <RefreshCw size={12} /> Acak Spintax
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="bg-white rounded-tr-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-sm p-4 text-[14px] font-medium text-slate-700 shadow-sm border border-slate-100 whitespace-pre-wrap leading-relaxed max-w-[85%]">
                      {parsedPreview || <span className="text-slate-400 italic">Ketik sesuatu untuk melihat hasil akhir...</span>}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50 rounded-b-[3rem] shrink-0 flex justify-end gap-3 z-10">
              <button onClick={() => setModalOpen(false)} className="px-8 py-4 rounded-2xl font-black text-slate-500 bg-white border border-slate-200 text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={handleSave} className="px-8 py-4 rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95">
                {editingId ? 'Simpan Perubahan' : 'Buat Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}