import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    plugins: [
      react(),
      isProd &&
        VitePWA({
          strategies: "injectManifest",
          srcDir: "src",
          filename: "sw.ts",
          registerType: "autoUpdate",
          manifest: {
            id: "/",
            name: "Wasaas",
            short_name: "Wasaas",
            description: "Wasaas - WhatsApp CRM, Inbox, Broadcast, Follow Up",
            start_url: "/",
            scope: "/",
            display: "standalone",
            orientation: "portrait",
            background_color: "#f6f8fc",
            theme_color: "#0b57d0",
            icons: [
              { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
              { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
            ]
          },
          injectManifest: {
            globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          },
        })
    ].filter(Boolean) as any,
    server: {
      port: 5173,
      strictPort: false,
      hmr: {
        protocol: "ws",
        host: "localhost",
      },
      proxy: {
        "^/api(/|\\?|$)": {
          target: "http://localhost:3001",
          changeOrigin: true
        },
        "^/ui(/|\\?|$)": {
          target: "http://localhost:3001",
          changeOrigin: true
        }
      }
    }
  };
});
