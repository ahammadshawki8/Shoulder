import React, { useEffect, useRef, useState } from "react";

/**
 * A mermaid diagram drawn in the app's own colours.
 *
 * Mermaid is loaded only when a diagram is on screen, and redrawn when the
 * theme changes, reading the palette from the same CSS tokens as everything
 * else so a diagram can never be the one dark block on a light page.
 */

let count = 0;

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function currentTheme() {
  return document.documentElement.dataset.theme || "light";
}

export default function Diagram({ source, label }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState(currentTheme);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          suppressErrorRendering: true,
          fontFamily: token("--font"),
          flowchart: { curve: "basis", padding: 14, nodeSpacing: 36, rankSpacing: 44 },
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
        const { svg } = await mermaid.render(`diagram-${count}`, source);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  return (
    <figure className="diagram">
      <div className="diagram-canvas" ref={ref} role="img" aria-label={label} />
      {failed && <p className="muted">This diagram could not be drawn.</p>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}
