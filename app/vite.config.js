import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on its own port (`python -m shoulder.api`). Forwarding /api here
// keeps the app and the API on one origin, so the httpOnly session cookie is
// sent without any cross-site cookie settings.
const api = { "/api": { target: "http://127.0.0.1:8001", changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: api },
  preview: { port: 4173, proxy: api },
});
