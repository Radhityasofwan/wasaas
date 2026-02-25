import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Komponen disatukan ke dalam file ini tanpa import eksternal 
// agar dapat dikompilasi dengan baik di lingkungan pratinjau (Canvas).
const App = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800 font-sans p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] text-center border border-slate-100">
        <h1 className="text-3xl font-black text-blue-600 mb-4 tracking-tight">WA SaaS</h1>
        <p className="text-sm text-slate-500 font-medium leading-relaxed">
          Sistem routing telah berhasil diinisialisasi. Silakan integrasikan dengan file utama Anda untuk melihat antarmuka lengkap.
        </p>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);