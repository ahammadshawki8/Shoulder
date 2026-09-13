import React, { useEffect, useRef, useState } from "react";

/**
 * A mermaid diagram drawn in the app's own colours.
 *
 * Mermaid is loaded only when a diagram is on screen, and redrawn when the
 * theme changes, reading the palette from the same CSS tokens as everything
 * else so a diagram can never be the one dark block on a light page.
 *
 * Mermaid keeps global state (its config, and a scratch element per render),
 * so two diagrams drawing at the same moment can break each other. Every
 * render goes through one queue, one at a time.
 */

let loading = null;
let queue = Promise.resolve();
let count = 0;

function loadMermaid() {
  loading ||= import("mermaid").then((m) => m.default);
  return loading;
}

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function currentTheme() {
  return document.documentElement.dataset.theme || "light";
}

function draw(source, theme) {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "strict",
      suppressErrorRendering: true,
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
    count += 1;
    const { svg } = await mermaid.render(`shoulder-diagram-${count}`, source);
    return svg;
  });
  // A failed render must not jam the queue for the diagrams after it.
  queue = job.catch(() => {});
  return job;
}

export default function Diagram({ source, label }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState(currentTheme);
  const [state, setState] = useState("drawing");

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const attempt = (tries) =>
      draw(source, theme)
        .then((svg) => {
          if (cancelled || !ref.current) return;
          ref.current.innerHTML = svg;
          setState("drawn");
        })
        .catch((error) => {
          if (cancelled) return;
          if (tries > 0) return attempt(tries - 1);
          console.error("Diagram could not be drawn:", error);
          setState("failed");
        });
    attempt(1);
    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  return (
    <figure className="diagram">
      <div className={`diagram-canvas ${state === "drawing" ? "is-drawing" : ""}`} ref={ref} role="img" aria-label={label} />
      {state === "failed" && <p className="muted diagram-failed">This diagram could not be drawn. Reload the page to try again.</p>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}
