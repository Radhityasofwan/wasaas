import React, { useEffect, useState, useRef, useMemo } from "react";
import { 
  Plus, 
  Layers, 
  Type, 
  Image as ImageIcon, 
  FileText, 
  MapPin, 
  Trash2,
  X,
  Wand2, 
  UserCircle,
  Sun,
  RefreshCw
} from "lucide-react";

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
  
  if (!res.ok) {
    const errPayload = data?.error;
    const errMsg = typeof errPayload === 'object' ? JSON.stringify(errPayload) : errPayload;
    throw new Error(errMsg || "API Error");
  }
  
  return data as T;
}

type TemplateRow = {
  id: number;
  name: string;
  message_type: 'text' | 'image' | 'document' | 'location';
  text_body: string | null;
  media_url: string | null;
  created_at: string;
};

export default function Templates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    message_type: "text",
    text_body: "",
    media_url: "",
  });

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);

  // FIX: URUTAN PARSER DIBALIK (Variabel Dulu -> Spintax Kemudian)
  const parsedPreview = useMemo(() => {
    let txt = formData.text_body || "";
    if (!txt.trim()) return "";

    // 1. Live Variable Parser (DULUAN)
    txt = txt.replace(/\{\{nama\}\}/ig, "Budi (Contoh)");
    txt = txt.replace(/\{\{nomor\}\}/ig, "6281288844813");
    
    const h = new Date().getHours();
    let salam = "Malam";
    if (h >= 3 && h < 11) salam = "Pagi";
    else if (h >= 11 && h < 15) salam = "Siang";
    else if (h >= 15 && h < 18) salam = "Sore";
    
    txt = txt.replace(/\{\{salam\}\}/ig, salam);

    // 2. Live Spintax Parser (KEMUDIAN)
    txt = txt.replace(/\{([^{}]+)\}/g, (match, contents) => {
      const options = contents.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
    
    return txt;
  }, [formData.text_body, previewTrigger]);

  async function loadTemplates() {
    try {
      setLoading(true);
      const res = await apiFetch<{ ok: true; data: TemplateRow[] }>("/templates");
      setTemplates(res.data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTemplates(); }, []);

  async function handleSave() {
    if (!formData.name.trim() || (!formData.text_body?.trim() && formData.message_type === 'text')) {
      return alert("Nama dan isi pesan wajib diisi!");
    }
    
    const payload: Record<string, any> = {
      name: formData.name,
      message_type: formData.message_type,
    };
    
    if (formData.text_body.trim()) payload.text_body = formData.text_body;
    if (formData.media_url.trim()) payload.media_url = formData.media_url;
    
    try {
      await apiFetch("/templates", { method: "POST", body: JSON.stringify(payload) });
      setModalOpen(false);
      setFormData({ name: "", message_type: "text", text_body: "", media_url: "" });
      loadTemplates();
      alert("Template berhasil disimpan!");
    } catch (e: any) { alert("Gagal menyimpan: " + e.message); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Yakin ingin menghapus template ini?")) return;
    try {
      await apiFetch(`/templates/${id}`, { method: "DELETE" });
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
      <div className="flex items-center justify-between p-8 bg-white/40 backdrop-blur-3xl border-b border-white/20 shrink-0 z-10">
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
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={18} strokeWidth={3} /> Buat Template
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 scrollbar-hide relative z-0">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white/20 rounded-[2.5rem] border border-white/40 border-dashed">
            <Layers size={48} className="text-slate-300 mb-4" strokeWidth={1.5} />
            <p className="text-slate-500 font-bold">Belum ada template yang dibuat.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(tpl => (
              <div key={tpl.id} className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 group relative">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-slate-100">
                      {getTypeIcon(tpl.message_type)}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-black text-slate-800">{tpl.name}</h3>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                        {tpl.message_type}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(tpl.id)}
                    className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                  </button>
                </div>
                
                <div className="bg-white/50 p-4 rounded-2xl border border-white/50 text-sm text-slate-600 font-medium line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {tpl.text_body || (tpl.message_type !== 'text' ? `[Media URL: ${tpl.media_url}]` : '-')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl border border-white flex flex-col max-h-[90vh]">
            
            <div className="flex items-center justify-between p-8 border-b border-slate-100 shrink-0">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Buat Template Baru</h3>
              <button onClick={() => setModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 scrollbar-hide">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Nama Template</label>
                <input 
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Contoh: Promo Akhir Tahun" 
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Tipe Pesan</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {['text', 'image', 'document', 'location'].map(type => (
                    <button 
                      key={type} onClick={() => setFormData({...formData, message_type: type})}
                      className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider flex justify-center items-center gap-2 border-2 transition-all ${
                        formData.message_type === type ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {getTypeIcon(type)} {type}
                    </button>
                  ))}
                </div>
              </div>

              {formData.message_type !== 'text' && (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">URL Media / Titik Lokasi</label>
                  <input 
                    value={formData.media_url} onChange={e => setFormData({...formData, media_url: e.target.value})}
                    placeholder={formData.message_type === 'location' ? "Lat, Lng (Misal: -6.200,106.816)" : "https://domain.com/file.jpg"} 
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    {formData.message_type === 'text' ? 'Isi Pesan' : 'Caption (Opsional)'}
                  </label>
                </div>
                
                <textarea 
                  ref={textAreaRef} rows={4}
                  value={formData.text_body} 
                  onChange={e => setFormData({...formData, text_body: e.target.value})}
                  placeholder="Ketik isi pesan... Gunakan sapaan untuk pelanggan." 
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 resize-none leading-relaxed"
                />

                <div className="mt-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Wand2 size={12} /> Personalisasi & Anti-Banned
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

                <div className="mt-4 border border-slate-200 rounded-[1.5rem] bg-slate-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-100/50 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">👀 Pratinjau Pengiriman</span>
                    <button type="button" onClick={() => setPreviewTrigger(p => p + 1)} className="text-[9px] font-bold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md flex items-center gap-1 hover:text-blue-600 hover:border-blue-200 transition-colors shadow-sm cursor-pointer">
                      <RefreshCw size={10} /> Acak Spintax
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="bg-white rounded-tr-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-sm p-4 text-[14px] font-medium text-slate-700 shadow-sm border border-slate-100 whitespace-pre-wrap leading-relaxed max-w-[85%]">
                      {parsedPreview || <span className="text-slate-400 italic">Ketik sesuatu untuk melihat hasil akhir pesan Anda...</span>}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50 rounded-b-[3rem] shrink-0 flex justify-end gap-3 z-10">
              <button onClick={() => setModalOpen(false)} className="px-8 py-4 rounded-2xl font-black text-slate-500 bg-white border border-slate-200 text-[11px] uppercase tracking-widest hover:bg-slate-50">Batal</button>
              <button onClick={handleSave} className="px-8 py-4 rounded-2xl font-black text-white bg-indigo-600 hover:bg-indigo-700 text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-600/30 transition-all">Simpan Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}