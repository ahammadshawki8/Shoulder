// The escalation inbox. The only thing that ever asks a human for anything.
// Storyboard beats 2:10 to 3:05: one card, options with their fairness
// consequences, what it refuses to decide, a human taps one. Then next month,
// the same decision applied without asking, and the count drops.
//
// One decision per screen, always. An empty inbox is success, and says so.

import { useState } from "react";
import { Check } from "../components/Icons.jsx";
import { MONTHS, family, monthLabel, precedentText, sameEffect, spreadChange } from "../data.js";

function Decision({ card, month, position, total, onDecide }) {
  const [choice, setChoice] = useState(null);
  const before = month.outcome.final_report?.max_deviation ?? 0;
  return (
    <article className="decision stack" aria-labelledby={`card-${card.id}`}>
      <p className="eyebrow">
        {position} of {total} · {card.kind === "authority_exceeded" ? "Not mine to do alone" : "I could not close this fairly"}
      </p>
      <h2 id={`card-${card.id}`}>{card.headline}</h2>

      {card.the_tension && <p className="lede">{card.the_tension}</p>}

      {card.what_i_tried?.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>
            What I tried first
          </summary>
          <ul className="muted">
            {card.what_i_tried.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="options" role="radiogroup" aria-label="Your options">
        {card.options.map((o, i) => (
          <button key={i} className="option" role="radio" aria-checked={choice === i} aria-pressed={choice === i} onClick={() => setChoice(i)}>
            <span className="label">{o.label}</span>
            <span className="muted">{o.consequence}</span>
            {spreadChange(o.fairness_delta, before) && <span className="delta">{spreadChange(o.fairness_delta, before)}</span>}
          </button>
        ))}
      </div>

      {card.what_i_will_not_decide && <p className="will-not">{card.what_i_will_not_decide}</p>}

      <div className="row">
        <button className="button" disabled={choice === null} onClick={() => onDecide(choice)}>
          Decide
        </button>
        <span className="small muted">Only a person can do this. The agent never will.</span>
      </div>
    </article>
  );
}

function Recorded({ note, onNext, last }) {
  return (
    <section className="decision card stack" aria-live="polite">
      <span className="stamp inside">
        <Check /> Recorded
      </span>
      <h2>{note.label}</h2>
      {note.rule ? (
        <p className="lede">
          From next month, without asking: <span className="provenance">{note.rule}</span>
        </p>
      ) : (
        <p className="lede">This is not a standing rule, so nothing will be applied automatically.</p>
      )}
      {note.also > 0 && <p className="muted">The same decision also answers {note.also === 1 ? "another card" : `${note.also} other cards`}, so you will not be asked twice.</p>}
      <div>
        <button className="button" onClick={onNext}>
          {last ? "Done" : "Next decision"}
        </button>
      </div>
    </section>
  );
}

function Learned({ month }) {
  const history = family.history || [];
  const index = history.findIndex((h) => h.period === month.period);
  const previous = index > 0 ? history[index - 1] : null;
  const current = history[index];
  const applied = month.ledger.filter((e) => e.kind === "applied_precedent");
  if (!previous || !current) return null;
  return (
    <div className="learned stack">
      <div className="count-drop" aria-label={`Decisions asked: ${previous.escalations} in ${monthLabel(previous.period)}, ${current.escalations} in ${monthLabel(current.period)}`}>
        <div>
          <div className="num from">{previous.escalations}</div>
          <div className="small muted">{monthLabel(previous.period)}</div>
        </div>
        <div className="muted" aria-hidden="true">to</div>
        <div>
          <div className="num">{current.escalations}</div>
          <div className="small muted">{monthLabel(current.period)}</div>
        </div>
      </div>
      {applied.length > 0 && (
        <div className="card-quiet stack">
          <p className="eyebrow">What I did with what you decided</p>
          {applied.map((e) => (
            <div key={e.id} className="stack" style={{ gap: 4 }}>
              <p>{e.summary}</p>
              <p className="provenance">{e.justification}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Inbox({ month, go, decisions, decide, resetDecisions }) {
  const [note, setNote] = useState(null);
  const cards = month.escalations;
  const open = cards.filter((c) => !(c.id in decisions));
  const card = open[0];
  const next = MONTHS[MONTHS.findIndex((m) => m.period === month.period) + 1];

  const onDecide = (index) => {
    const effect = card.options[index].effect;
    const also = open.filter((c) => c.id !== card.id && c.options.some((o) => sameEffect(o.effect, effect))).map((c) => c.id);
    setNote({
      label: card.options[index].label,
      rule: precedentText(effect, month.circle, month.outcome.final_report?.max_deviation),
      also: also.length,
      last: open.length - 1 - also.length <= 0,
    });
    decide(card.id, index, also);
  };

  if (note) return <Recorded note={note} last={note.last} onNext={() => setNote(null)} />;

  if (!card) {
    const decidedHere = cards.length > 0;
    return (
      <section className="empty" aria-live="polite">
        <h2>Nothing needs you {decidedHere ? "right now" : "this month"}.</h2>
        <p className="lede" style={{ margin: "14px auto 0" }}>
          {decidedHere
            ? `That is everything for ${month.label}. The agents will carry what you decided into next month.`
            : `The agents settled ${month.label} on their own. Everything they did is in the ledger, with the reason they could do it alone.`}
        </p>
        <Learned month={month} />
        <div className="row" style={{ justifyContent: "center", marginTop: 28 }}>
          {decidedHere && next && (
            <button className="button" onClick={() => go("inbox", next.period)}>
              See {next.label}
            </button>
          )}
          <button className="button secondary" onClick={() => go("ledger")}>
            Read the ledger
          </button>
          {decidedHere && (
            <button className="button secondary" onClick={resetDecisions}>
              Ask me again
            </button>
          )}
        </div>
      </section>
    );
  }

  return <Decision key={card.id} card={card} month={month} position={cards.length - open.length + 1} total={cards.length} onDecide={onDecide} />;
}
