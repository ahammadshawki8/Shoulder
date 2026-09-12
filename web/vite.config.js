import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// The UI reads JSON straight from ../fixtures, which the Python side writes from
// real runs. No backend and no AWS credentials are needed to run it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@fixtures": fileURLToPath(new URL("../fixtures", import.meta.url)),
      "@repo": repoRoot,
    },
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
  },
  // Mermaid's diagram renderers are large, but they are loaded only when the
  // architecture section opens (a dynamic import), never on first paint.
  build: { chunkSizeWarningLimit: 2000 },
});
