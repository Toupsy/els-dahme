import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

/**
 * VITE_DEMO=true baut die öffentliche Vorschau. Der Unterschied liegt nur im
 * Modul hinter `@mode`: Demo-Adapter statt Server-Sync und Login. Der
 * Login-Code landet dadurch gar nicht erst im Demo-Bundle.
 */
const demo = process.env.VITE_DEMO === "true";

export default defineConfig({
  resolve: {
    alias: {
      "@mode": fileURLToPath(new URL(demo ? "./src/mode/demo.tsx" : "./src/mode/live.tsx", import.meta.url)),
    },
  },
  define: {
    "import.meta.env.VITE_DEMO": JSON.stringify(demo ? "true" : "false"),
  },
  build: { outDir: demo ? "dist-preview" : "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: demo ? "ELS Dahme (Demo)" : "ELS Dahme",
        short_name: "ELS Dahme",
        lang: "de",
        start_url: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#0f2741",
        theme_color: "#0f2741",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
        runtimeCaching: [
          {
            // Kartenkacheln: einmal geladen, offline verfügbar.
            urlPattern: ({ url }) => url.hostname === "tile.openstreetmap.org",
            handler: "CacheFirst",
            options: {
              cacheName: "els-kacheln",
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:3000", "/health": "http://localhost:3000" } },
});
