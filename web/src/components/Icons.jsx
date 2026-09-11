// Inline icons, drawn to sit beside text. Decorative unless given a label.

const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export function Lock({ label, ...props }) {
  return (
    <svg {...base} {...props} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function People({ label, ...props }) {
  return (
    <svg {...base} {...props} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2c2.8.2 5 2.6 5 5.8" />
    </svg>
  );
}

export function Sun(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function Moon(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function Play(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Check(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Shield(props) {
  return (
    <svg {...base} {...props} aria-hidden="true">
      <path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" />
    </svg>
  );
}
