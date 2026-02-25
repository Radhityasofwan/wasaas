import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    plugins: [
      react(),
      // PWA hanya aktif di production supaya dev tidak kena cache SW
      isProd &&
        VitePWA({
          registerType: "autoUpdate",
          manifest: {
            name: "WA SaaS",
            short_name: "WA SaaS",
            start_url: "/",
            display: "standalone",
            background_color: "#0b141a",
            theme_color: "#0b141a",
            icons: [
              { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
              { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
            ]
          }
        })
    ].filter(Boolean) as any,
    server: {
      proxy: {
        // backend non-ui
        // FIX: Menggunakan Regex ^/api(/|\?|$) memastikan proxy HANYA menangkap
        // rute persis "/api", rute dengan subpath "/api/...", atau query "/api?..."
        // sehingga halaman UI "/api-keys" tidak akan lagi ikut terpotong.
        "^/api(/|\\?|$)": {
          target: "http://localhost:3001",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, "")
        },
        
        // UI endpoints
        // Disamakan juga menggunakan Regex agar aman dari potensi konflik rute UI di masa depan
        // (misal jika suatu saat Anda membuat halaman UI bernama "/ui-settings")
        "^/ui(/|\\?|$)": {
          target: "http://localhost:3001",
          changeOrigin: true
        }
      }
    }
  };
});