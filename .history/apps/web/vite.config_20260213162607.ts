import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    plugins: [
      react(),
      // IMPORTANT: disable PWA in dev to avoid blank page due to stale SW cache
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
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, "")
        },
        "/ui": {
          target: "http://localhost:3001",
          changeOrigin: true
        }
      }
    }
  };
});
