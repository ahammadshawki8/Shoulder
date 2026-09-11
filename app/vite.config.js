import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    fs: {
      allow: [".."],
    },
  },
  resolve: {
    alias: {
      "@fixtures": path.resolve(__dirname, "../fixtures"),
    },
  },
});
