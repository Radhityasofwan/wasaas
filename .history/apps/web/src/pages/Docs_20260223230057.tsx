export default function Docs() {
  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter italic">API Dokumentasi</h1>
        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Panduan Integrasi Developer & x-api-key</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
         <div className="bg-white/40 backdrop-blur-3xl border border-white rounded-[3rem] p-12 shadow-sm space-y-10">
            <section className="space-y-4">
               <h2 className="text-2xl font-black text-slate-800 tracking-tight">Otentikasi</h2>
               <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Semua request API memerlukan header <code className="bg-slate-100 px-2 py-1 rounded text-rose-500 font-bold">x-api-key</code>. Anda dapat mengelola kunci akses Anda di menu API Keys.
               </p>
            </section>

            <div className="h-[1px] w-full bg-white/40" />

            <section className="space-y-6">
               <h2 className="text-2xl font-black text-slate-800 tracking-tight">Kirim Pesan Teks</h2>
               <div className="space-y-3">
                  <div className="flex gap-4">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase rounded-lg border border-emerald-200">POST</span>
                    <code className="text-sm font-mono text-slate-600">/api/messages/send</code>
                  </div>
                  <pre className="bg-slate-900 rounded-[2rem] p-8 text-blue-300 font-mono text-xs leading-relaxed overflow-x-auto shadow-inner border border-slate-800">
{`{
  "sessionKey": "device-01",
  "to": "628123456789",
  "text": "Halo! Ini pesan otomatis dari API."
}`}
                  </pre>
               </div>
            </section>

            <div className="h-[1px] w-full bg-white/40" />

            <section className="space-y-4">
               <h2 className="text-2xl font-black text-slate-800 tracking-tight">Webhook Verification</h2>
               <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Setiap payload webhook akan menyertakan header <code className="bg-slate-100 px-2 py-1 rounded text-blue-500 font-bold">X-Webhook-Signature</code>. Gunakan <span className="font-bold">Webhook Secret</span> Anda untuk memverifikasi keaslian data menggunakan HMAC-SHA256.
               </p>
            </section>
         </div>

         <div className="px-12 py-10 bg-blue-600 rounded-[3rem] text-white space-y-6 shadow-2xl shadow-blue-600/20 transform hover:scale-[1.01] transition-transform duration-500">
            <h3 className="text-xl font-black tracking-tight italic">Butuh bantuan integrasi?</h3>
            <p className="text-sm font-bold opacity-80 leading-relaxed">Tim pengembang kami siap membantu Anda menghubungkan sistem bisnis Anda dengan infrastruktur WhatsApp kami. Hubungi support teknis di terminal atau melalui portal pengembang.</p>
            <button className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all">Buka Tiket Bantuan</button>
         </div>
      </div>
    </div>
  );
}