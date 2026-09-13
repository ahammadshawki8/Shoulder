import React, { useEffect, useState } from "react";
import { Car, FileText, Heart, HomeIcon, Lock, Moon, Pill, Stethoscope } from "./Icons.jsx";

/**
 * The idea in eight seconds, on a loop.
 *
 * A month of care starts on one person. Someone's limit arrives, with its
 * reason kept hidden. The tasks move, one at a time, to whoever has room, and
 * the bar underneath evens out. With reduced motion it shows the settled month.
 */

const PEOPLE = [
  { id: "you", label: "You", color: "#3B6E94" },
  { id: "sister", label: "Your sister", color: "#1B6B73" },
  { id: "brother", label: "Your brother", color: "#BF5D30" },
];

const TASKS = [
  { title: "Doctor visit", Icon: Stethoscope },
  { title: "Pharmacy run", Icon: Pill },
  { title: "Weekend visit", Icon: Heart },
  { title: "Overnight stay", Icon: Moon },
  { title: "Drive to clinic", Icon: Car },
  { title: "Bills and forms", Icon: FileText },
  { title: "Groceries", Icon: HomeIcon },
  { title: "Pill organiser", Icon: Pill },
];

// Where each task ends up. The sister can take less, and not overnight care.
const SETTLED = [0, 0, 1, 2, 2, 2, 1, 0];
const START = TASKS.map(() => 0);

// The order tasks move in, as [task, column].
const MOVES = [
  [3, 2],
  [2, 1],
  [4, 2],
  [6, 1],
  [5, 2],
];

const STEP_MS = 700;
const HOLD_MS = 3200;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroAnimation() {
  const reduced = prefersReducedMotion();
  const [placed, setPlaced] = useState(reduced ? SETTLED : START);
  const [limitShown, setLimitShown] = useState(reduced);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (reduced) return undefined;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    const run = () => {
      // Jump back while the cards are faded out, then fade them in again.
      setPlaced(START);
      setLimitShown(false);
      at(60, () => setResetting(false));
      at(900, () => setLimitShown(true));
      MOVES.forEach(([task, column], i) => {
        at(1900 + i * STEP_MS, () =>
          setPlaced((current) => current.map((c, index) => (index === task ? column : c)))
        );
      });
      const end = 1900 + MOVES.length * STEP_MS + HOLD_MS;
      at(end, () => setResetting(true));
      at(end + 500, run);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const counts = PEOPLE.map((_, column) => placed.filter((c) => c === column).length);
  const settled = placed.every((c, i) => c === SETTLED[i]);

  // Stack position of each task within its column, in task order.
  const slot = placed.map((column, index) => placed.slice(0, index).filter((c) => c === column).length);

  return (
    <figure className={`hero-anim ${resetting ? "is-resetting" : ""}`} aria-label="Illustration: a month of care moving from one person to a fair split">
      <div className="hero-anim-top">
        <span className={`hero-anim-status ${settled ? "is-even" : "is-uneven"}`}>
          {settled ? "Shared fairly" : counts[0] === TASKS.length ? "One person doing it all" : "Working out the split"}
        </span>
        <div className="hero-anim-bar" aria-hidden="true">
          {PEOPLE.map((p, i) => (
            <span key={p.id} style={{ flexGrow: Math.max(counts[i], 0.12), background: p.color }} />
          ))}
        </div>
      </div>

      <div className="hero-anim-stage" aria-hidden="true">
        {TASKS.map(({ title, Icon }, index) => (
          <div
            key={title}
            className="hero-task"
            style={{
              "--col": placed[index],
              "--row": slot[index],
              "--tint": PEOPLE[placed[index]].color,
            }}
          >
            <Icon size={14} />
            <span>{title}</span>
          </div>
        ))}

        <div className={`hero-limit ${limitShown ? "is-shown" : ""}`} style={{ "--stack": counts[1] }}>
          <Lock size={13} />
          <span>
            <strong>Not overnight</strong>
            <i className="hero-limit-reason" />
          </span>
        </div>

        {PEOPLE.map((p, i) => (
          <div key={p.id} className="hero-person" style={{ "--col": i }}>
            <svg viewBox="0 0 40 40" width="40" height="40">
              <circle cx="20" cy="13" r="7" fill={p.color} />
              <path d="M6 38c0-8.5 6.2-14 14-14s14 5.5 14 14z" fill={p.color} />
            </svg>
            <span>{p.label}</span>
            <small>
              {counts[i]} task{counts[i] === 1 ? "" : "s"}
            </small>
          </div>
        ))}
      </div>

      <figcaption className="hero-anim-caption">
        <Lock size={14} />
        Your sister's reason stays hers. The family only sees the limit.
      </figcaption>
    </figure>
  );
}
