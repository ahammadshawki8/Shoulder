// This month: the negotiation, and the rota it produced.
// Storyboard beat 1:20 to 2:10: agents propose and counter, the fairness bars
// move each round, and it lands on a rota that routed around Farah's
// constraint without anyone learning why.

import { useEffect, useMemo, useRef, useState } from "react";
import FairnessBar from "../components/FairnessBar.jsx";
import { Lock, Play } from "../components/Icons.jsx";
import {
  FAIRNESS_TOLERANCE,
  PERSON_ORDER,
  WEEKDAYS,
  dayName,
  headline,
  pct,
  personVar,
  recipientName,
  toPosition,
} from "../data.js";

const VERDICT = { accept: "it works", counter: "some of it needs to move", veto: "it breaks a hard limit" };
const STEP_MS = 2800;

function steps(outcome) {
  return [...outcome.rounds.map((r) => ({ kind: "round", round: r })), { kind: "result" }];
}

function scaleFor(outcome) {
  const all = outcome.rounds.flatMap((r) => [...r.report.burdens, ...(r.tried?.burdens || [])]);
  const top = Math.max(...all.map((b) => b.adjusted_share), outcome.final_report?.mean_adjusted_share * 1.3 || 1);
  return Math.ceil((top * 1.12) / 10) * 10;
}

function Critiques({ critiques, circle }) {
  const byId = Object.fromEntries(circle.principals.map((p) => [p.id, p]));
  const ordered = [...critiques].sort((a, b) => PERSON_ORDER.indexOf(a.principal_id) - PERSON_ORDER.indexOf(b.principal_id));
  return (
    <div>
      {ordered.map((c) => {
        const person = byId[c.principal_id];
        const holdsPrivate = person?.constraints.some((k) => k.tier === "private");
        return (
          <div className="verdict-line" key={c.principal_id}>
            <span className="person-chip">
              <span className="dot" style={{ background: personVar(c.principal_id) }} />
              {person?.name}'s agent
            </span>
            <span>
              {VERDICT[c.verdict]}
              {c.message && <span className="muted">. "{c.message}"</span>}
              {holdsPrivate && (
                <span className="small muted" style={{ display: "block" }}>
                  <Lock width={13} height={13} /> Answered with what only it knows. None of it was sent.
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Narrative({ step, index, month, applied }) {
  const { outcome } = month;
  if (step.kind === "result") {
    const report = outcome.final_report;
    if (outcome.settled) {
      return (
        <div className="stack">
          <span className="pill good">Settled</span>
          <p>
            Every share is within the fair range for what each person said they can carry. The rota is published. Nobody
            was asked anything.
          </p>
        </div>
      );
    }
    return (
      <div className="stack">
        <span className="pill attention">Needs the family</span>
        <p>
          The rounds ran out with a spread of {pct(report.max_deviation)}, against a limit of {pct(FAIRNESS_TOLERANCE)}.
          Every stated limit held, and everyone's agent accepted their share. What is left is not the agent's to decide.
        </p>
      </div>
    );
  }

  const r = step.round;
  return (
    <div className="stack">
      {index === 0 && applied.length > 0 && (
        <div className="card-quiet stack" style={{ gap: 6 }}>
          <span className="eyebrow">Before anyone negotiated</span>
          {applied.map((e) => (
            <p key={e.id}>
              {e.summary} <span className="provenance">{e.justification}</span>
            </p>
          ))}
        </div>
      )}
      {r.round_number === 1 ? (
        <p>The Convener drew up an opening split of every task from what each person said they can do.</p>
      ) : r.moves.length ? (
        <p>
          The Convener suggested {r.moves.length} move{r.moves.length > 1 ? "s" : ""}: {r.moves.join("; ")}.
        </p>
      ) : (
        <p>The Convener looked for a move that would help and found none worth making.</p>
      )}
      {r.tried && !r.kept && (
        <p>
          The fairness engine measured it: the spread would be {pct(r.tried.max_deviation)}.{" "}
          <strong>Not kept.</strong> The working rota only ever gets fairer.
        </p>
      )}
      {r.tried && r.kept && r.round_number > 1 && <p>The fairness engine measured it, and it was kept.</p>}
      <div>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Each agent was asked about its own share
        </p>
        <Critiques critiques={r.critiques} circle={month.circle} />
      </div>
    </div>
  );
}

function calendarWeeks(tasks) {
  const dates = tasks.map((t) => new Date(`${t.on_date}T12:00:00`));
  const first = new Date(Math.min(...dates));
  const last = new Date(Math.max(...dates));
  const monthStart = new Date(first.getFullYear(), first.getMonth(), 1, 12);
  const start = new Date(monthStart);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const weeks = [];
  for (let d = new Date(start); d <= last; ) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, month: monthStart.getMonth() };
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Rota({ month }) {
  const { circle, outcome } = month;
  const names = Object.fromEntries(circle.principals.map((p) => [p.id, p.name]));
  const assignments = outcome.final_allocation?.assignments || {};
  const byDate = {};
  for (const t of circle.tasks) (byDate[t.on_date] ||= []).push(t);
  const { weeks, month: m } = calendarWeeks(circle.tasks);

  return (
    <section className="stack" aria-labelledby="rota-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="rota-title">The rota</h2>
        <div className="legend">
          {PERSON_ORDER.map((id) => (
            <span key={id} className="person-chip">
              <span className="dot" style={{ background: personVar(id) }} />
              {names[id]}
            </span>
          ))}
          {Object.keys(outcome.covered || {}).length > 0 && <span>Dashed: paid help, as the family decided</span>}
        </div>
      </div>
      <div className="week" aria-hidden="true" style={{ marginBottom: -4 }}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="small muted" style={{ paddingLeft: 8 }}>
            {d}
          </span>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div className="week" key={i} role="list" aria-label={`Week of ${week[0].toDateString()}`}>
          {week.map((d) => {
            const tasks = byDate[iso(d)] || [];
            const inMonth = d.getMonth() === m;
            return (
              <div className="day" role="listitem" key={iso(d)} style={{ opacity: inMonth ? 1 : 0.45 }}>
                <div className="day-head">
                  <span>{dayName(WEEKDAYS[(d.getDay() + 6) % 7]).slice(0, 3)} {d.getDate()}</span>
                </div>
                {tasks.map((t) => {
                  const who = assignments[t.id];
                  const paid = outcome.covered?.[t.id];
                  return (
                    <div
                      key={t.id}
                      className={`task ${paid ? "paid" : ""}`}
                      style={paid ? undefined : { borderLeftColor: personVar(who) }}
                    >
                      <span className="who">{paid ? "Paid help" : names[who] || "Unassigned"}</span>
                      {t.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
      <p className="small muted">
        Every stated limit held. {circle.principals.map((p) => limitsSentence(p)).filter(Boolean).join(" ")} Nobody was
        told why.
      </p>
    </section>
  );
}

function limitsSentence(p) {
  const pos = toPosition(p);
  const bits = [];
  if (pos.unavailable.length) bits.push(`nothing on ${pos.unavailable.map(dayName).join(" or ")}`);
  if (pos.refused.includes("night")) bits.push("no nights");
  return bits.length ? `${p.name}: ${bits.join(", ")}.` : "";
}

export default function Month({ month, go, initialStep = 0 }) {
  const { outcome, circle } = month;
  const list = useMemo(() => steps(outcome), [outcome]);
  const scaleMax = useMemo(() => scaleFor(outcome), [outcome]);
  const clamp = (i) => Math.max(0, Math.min(list.length - 1, i));
  const [index, setIndex] = useState(() => clamp(initialStep));
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const applied = month.ledger.filter((e) => e.kind === "applied_precedent" && e.round_number == null);

  useEffect(() => {
    setIndex(clamp(initialStep));
    setPlaying(false);
  }, [month.period, initialStep]);

  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setTimeout(() => {
      if (index < list.length - 1) setIndex(index + 1);
      else setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(timer.current);
  }, [playing, index, list.length]);

  const step = list[index];
  const report = step.kind === "result" ? outcome.final_report : step.round.report;
  const tried = step.kind === "round" && step.round.tried && !step.round.kept ? step.round.tried : null;
  const open = month.escalations.length;

  return (
    <div className="stack-lg">
      <section className="stack">
        <p className="eyebrow">
          {month.label} 2026 · Care for {recipientName(circle)}, {circle.tasks.length} tasks
        </p>
        <h1>{headline(outcome.final_report)}</h1>
        <p className="lede">
          Three agents negotiated this month, each speaking only for its own person. The fairness numbers are computed,
          never guessed.{" "}
          {outcome.settled ? "It settled on its own." : `It could not close the gap fairly, so ${open === 1 ? "one question goes" : `${open} questions go`} to the family.`}
        </p>
      </section>

      <section className="card stack" aria-labelledby="negotiation-title">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="negotiation-title">The negotiation</h2>
          <div className="row">
            <div className="rounds" role="group" aria-label="Rounds">
              {list.map((s, i) => (
                <button
                  key={i}
                  className="round-step"
                  aria-pressed={i === index}
                  onClick={() => {
                    setPlaying(false);
                    setIndex(i);
                  }}
                >
                  {s.kind === "result" ? "Result" : s.round.round_number === 1 ? "Opening" : `Round ${s.round.round_number}`}
                  {s.kind === "round" && !s.round.kept && <span className="x" role="img" aria-label="not kept" />}
                </button>
              ))}
            </div>
            <button
              className="button"
              onClick={() => {
                if (index >= list.length - 1) setIndex(0);
                setPlaying(true);
              }}
              disabled={playing}
            >
              <Play /> {playing ? "Playing" : "Play"}
            </button>
          </div>
        </div>

        <p className="statement" style={{ fontSize: "1.35rem", maxWidth: "none" }} aria-live="polite">
          {tried ? `Tried: ${headline(tried)}` : headline(report)}
        </p>

        <FairnessBar
          report={report}
          tried={tried}
          scaleMax={scaleMax}
          caption="Load for capacity: each person's weighted hours of care divided by the capacity they declared."
        />

        <div aria-live="polite">
          <Narrative step={step} index={index} month={month} applied={applied} />
        </div>

        {step.kind === "result" && open > 0 && (
          <div>
            <button className="button" onClick={() => go("inbox")}>
              See what needs you ({open})
            </button>
          </div>
        )}
      </section>

      <Rota month={month} />
    </div>
  );
}
