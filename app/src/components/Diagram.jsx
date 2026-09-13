import React, { useEffect, useRef, useState } from "react";
import { DIAGRAMS } from "../diagrams/sources.js";

/**
 * A diagram, drawn ahead of time in the app's colours for each theme.
 *
 * Drawing mermaid in the browser meant downloading more than 2 MB of scripts
 * before the first diagram appeared, and on a slow connection the boxes sat
 * empty for ten seconds. The SVGs are exported from `diagrams/sources.js` by
 * the dev-only export page, so this component only fetches a small file and
 * swaps it when the theme changes.
 */

const cache = new Map();

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function load(name, theme) {
  const key = `${name}-${theme}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`/diagrams/${key}.svg`).then((r) => {
        if (!r.ok) throw new Error(`${key}.svg: ${r.status}`);
        return r.text();
      })
    );
    // A failed fetch should be retried next time, not remembered.
    cache.get(key).catch(() => cache.delete(key));
  }
  return cache.get(key);
}

export default function Diagram({ name }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState(currentTheme);
  const [state, setState] = useState("loading");
  const { label } = DIAGRAMS[name];

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(name, theme)
      .then((svg) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        setState("drawn");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Diagram could not be loaded:", error);
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [name, theme]);

  return (
    <figure className="diagram">
      <div className={`diagram-canvas ${state === "loading" ? "is-loading" : ""}`} ref={ref} role="img" aria-label={label} />
      {state === "failed" && <p className="muted diagram-failed">This diagram could not be loaded. Reload the page to try again.</p>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}
