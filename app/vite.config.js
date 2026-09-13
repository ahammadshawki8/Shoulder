import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on its own port (`python -m shoulder.api`). Forwarding /api here
// keeps the app and the API on one origin, so the httpOnly session cookie is
// sent without any cross-site cookie settings.
const api = { "/api": { target: "http://127.0.0.1:8001", changeOrigin: false } };

const DIAGRAM_DIR = fileURLToPath(new URL("./public/diagrams/", import.meta.url));

// Development only: lets diagrams.html write the exported SVGs into
// public/diagrams. Keys are checked, so it can only ever write those files.
const saveDiagrams = {
  name: "shoulder-save-diagrams",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__diagrams/save", (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const files = JSON.parse(body);
          await mkdir(DIAGRAM_DIR, { recursive: true });
          for (const [key, svg] of Object.entries(files)) {
            if (!/^[a-z]+-(light|dark)$/.test(key) || !String(svg).startsWith("<svg")) {
              throw new Error(`refused ${key}`);
            }
            await writeFile(`${DIAGRAM_DIR}${key}.svg`, svg, "utf8");
          }
          res.end("saved");
        } catch (error) {
          res.statusCode = 400;
          res.end(String(error));
        }
      });
    });
  },
};

export default defineConfig({
  plugins: [react(), saveDiagrams],
  server: { port: 5174, proxy: api },
  preview: { port: 4173, proxy: api },
});
