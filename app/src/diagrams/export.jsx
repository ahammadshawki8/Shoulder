import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/source-sans-3";
import "../styles.css";
import { DIAGRAMS } from "./sources.js";

/**
 * Development only: draws every diagram in sources.js in both themes and
 * saves them to public/diagrams through the dev server (see vite.config.js).
 */

const THEMES = ["light", "dark"];

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function drawAll() {
  const mermaid = (await import("mermaid")).default;
  await document.fonts.ready;
  const out = {};
  for (const theme of THEMES) {
    document.documentElement.dataset.theme = theme;
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "strict",
      fontFamily: "Source Sans 3 Variable, Source Sans 3, system-ui, sans-serif",
      flowchart: { curve: "basis", padding: 14, nodeSpacing: 36, rankSpacing: 44, htmlLabels: true },
      themeVariables: {
        darkMode: theme === "dark",
        fontSize: "14px",
        background: token("--ground"),
        primaryColor: token("--surface"),
        primaryTextColor: token("--ink"),
        primaryBorderColor: token("--line-strong"),
        secondaryColor: token("--accent-soft"),
        tertiaryColor: token("--sunken"),
        lineColor: token("--ink-3"),
        textColor: token("--ink"),
        clusterBkg: token("--sunken"),
        clusterBorder: token("--line"),
        edgeLabelBackground: token("--ground"),
      },
    });
    for (const [name, { source }] of Object.entries(DIAGRAMS)) {
      const { svg } = await mermaid.render(`shoulder-${name}-${theme}`, source);
      out[`${name}-${theme}`] = svg;
    }
  }
  document.documentElement.dataset.theme = "light";
  return out;
}

function ExportPage() {
  const [svgs, setSvgs] = useState(null);
  const [status, setStatus] = useState("Drawing");

  useEffect(() => {
    drawAll()
      .then((out) => {
        setSvgs(out);
        setStatus("Drawn. Save to write public/diagrams.");
        window.__diagrams = out;
      })
      .catch((e) => setStatus(`Failed: ${e}`));
  }, []);

  const save = async () => {
    const r = await fetch("/__diagrams/save", { method: "POST", body: JSON.stringify(svgs) });
    setStatus(r.ok ? `Saved ${Object.keys(svgs).length} files to public/diagrams.` : `Save failed: ${r.status}`);
  };

  return (
    <main style={{ padding: "2rem", display: "grid", gap: "1.5rem" }}>
      <h1>Diagram export</h1>
      <p>{status}</p>
      <button type="button" className="btn btn-primary" disabled={!svgs} onClick={save} style={{ justifySelf: "start" }}>
        Save all
      </button>
      {svgs &&
        Object.entries(svgs).map(([key, svg]) => (
          <section key={key} data-theme={key.endsWith("dark") ? "dark" : "light"} style={{ background: "var(--surface)", padding: "1rem" }}>
            <h2 style={{ color: "var(--ink)" }}>{key}</h2>
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </section>
        ))}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<ExportPage />);
