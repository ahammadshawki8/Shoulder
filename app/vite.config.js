import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on its own port (`python -m shoulder.api`). Forwarding /api here
// keeps the app and the API on one origin, so the httpOnly session cookie is
// sent without any cross-site cookie settings.
const api = { "/api": { target: "http://127.0.0.1:8001", changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: api },
  // Pre-bundle mermaid when the dev server starts. Discovered later, on the
  // first visit to About, Vite re-optimises and reloads mid-render, and the
  // diagrams come up blank until the next reload.
  optimizeDeps: { include: ["mermaid"] },
  // Mermaid and its layout engines are loaded lazily, on About only.
  build: { chunkSizeWarningLimit: 1600 },
  preview: { port: 4173, proxy: api },
});
