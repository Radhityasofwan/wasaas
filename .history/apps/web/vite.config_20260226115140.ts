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
        // FIX: HAPUS fungsi 'rewrite'. Backend Express Anda MENGHARAPKAN prefix '/api'.
        // Jika rewrite dibiarkan, Vite akan memotong '/api', dan backend akan merespons 404.
        "^/api(/|\\?|$)": {
          target: "http://localhost:3001",
          changeOrigin: true
        },
        
        // UI endpoints
        "^/ui(/|\\?|$)": {
          target: "http://localhost:3001",
          changeOrigin: true
        }
      }
    }
  };
});