import React, { useCallback, useEffect, useRef, useState } from "react";
import { Store, TYPE_META, subscribe } from "../data/store.js";
import {
  Car,
  Check,
  FileText,
  Heart,
  HomeIcon,
  Moon,
  Pill,
  Stethoscope,
  Sun,
  X,
} from "./Icons.jsx";

const GLYPHS = { Car, FileText, Heart, HomeIcon, Moon, Pill, Stethoscope };

export function TaskGlyph({ type, size = 16 }) {
  const Glyph = GLYPHS[TYPE_META[type]?.icon] || Heart;
  return (
    <span className="glyph" aria-hidden="true">
      <Glyph size={size} />
    </span>
  );
}

export function BrandMark() {
  return (
    // Two people side by side, the nearer one taking part of the other's
    // weight. An earlier mark (two dots over a downward arc) read as a frown.
    <svg className="brand-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="18.5" cy="8" r="3.4" fill="currentColor" opacity="0.45" />
      <path d="M11.5 25c0-5 3-8.2 7-8.2s7 3.2 7 8.2z" fill="currentColor" opacity="0.45" />
      <circle cx="10" cy="9.5" r="3.6" fill="currentColor" />
      <path d="M2.5 25.5c0-5.4 3.2-8.8 7.5-8.8s7.5 3.4 7.5 8.8z" fill="currentColor" />
    </svg>
  );
}

/** The name and mark. Given `href` or `onClick` it becomes the way home. */
export function Brand({ href, onClick, label = "Shoulder, go to Tasks" }) {
  const inner = (
    <>
      <BrandMark />
      Shoulder
    </>
  );
  if (href) {
    return (
      <a className="brand" href={href} aria-label={label}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="brand" onClick={onClick} aria-label={label}>
        {inner}
      </button>
    );
  }
  return <span className="brand">{inner}</span>;
}

// -- theme ---------------------------------------------------------------------
// A device preference, not family data, and needed before anyone logs in, so
// it is the one thing kept in the browser.

const THEME_KEY = "shoulder_theme";

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be unavailable; fall through */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function ThemeToggle({ theme, onToggle }) {
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="icon-btn" onClick={onToggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

// -- store subscription ---------------------------------------------------------

export function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
}

// -- toast ----------------------------------------------------------------------

export function useToast() {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);
  const say = useCallback((text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = message ? (
    <div className="toast" role="status">
      <Check size={15} />
      {message}
    </div>
  ) : null;
  return [node, say];
}

// -- overlays --------------------------------------------------------------------

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function Modal({ title, onClose, children }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="overlay-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ label, onClose, children }) {
  useEscape(onClose);
  return (
    <div className="overlay is-side" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}

export function ErrorLine({ error }) {
  if (!error) return null;
  return (
    <p className="alert" role="alert">
      {error}
    </p>
  );
}

// -- the fairness bar --------------------------------------------------------------

/** One segment per person, sized by their share of the family's load. */
export function FairnessBar({ burdens, height }) {
  const total = burdens.reduce((sum, b) => sum + b.percent_of_total, 0);
  if (!burdens.length || total <= 0) {
    return (
      <div className="fair-bar" style={height ? { height } : undefined}>
        <span className="fair-bar-empty">No tasks shared yet</span>
      </div>
    );
  }
  return (
    <div className="fair-bar" style={height ? { height } : undefined} role="img" aria-label={burdens.map((b) => `${b.name} ${Math.round(b.percent_of_total)} percent`).join(", ")}>
      {burdens.map((b) => (
        <span
          key={b.principal_id}
          className="fair-bar-part"
          style={{ flexBasis: `${b.percent_of_total}%`, background: Store.person(b.principal_id)?.color }}
        />
      ))}
    </div>
  );
}

export function spreadLabel(fairness) {
  if (!fairness.burdens.some((b) => b.task_count > 0)) return "Nothing to share yet";
  return fairness.proportional
    ? `Even, within ${fairness.tolerance_pct}%`
    : `${fairness.spread_pct}% apart, over the ${fairness.tolerance_pct}% the family allows`;
}
