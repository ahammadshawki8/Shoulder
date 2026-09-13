import React, { useState } from "react";
import { Store } from "../data/store.js";
import Face from "../components/Face.jsx";
import { ErrorLine, FairnessBar, useStore, useToast } from "../components/ui.jsx";

/**
 * The only place Shoulder asks anything of anyone.
 *
 * Every number on a card, including what each option would do, comes from the
 * server making that choice on a copy of the plan. What you see before you
 * choose is what you get after.
 */
export default function Inbox({ onNavigate }) {
  useStore();
  const [toast, say] = useToast();
  const cards = Store.escalations();
  const changes = Store.pendingChanges();
  const toAnswer = changes.filter((c) => c.needs_my_answer);
  const waitingOnOthers = changes.filter((c) => !c.needs_my_answer);

  if (!cards.length && !changes.length) {
    return (
      <div className="page">
        {toast}
        <div className="empty">
          <h2>Nothing needs you</h2>
          <p>The month is covered and the load is where the family left it. Shoulder will ask here if that changes.</p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("tasks")}>
              Go to tasks
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onNavigate("agreed")}>
              See what you have agreed
            </button>
          </div>
        </div>
      </div>
    );
  }

  const total = cards.length + toAnswer.length;

  return (
    <div className="page">
      {toast}
      <header className="page-head">
        <div>
          <h1>Needs you</h1>
          <p>
            {total === 0
              ? "Nothing for you to answer. Waiting on the rest of the family."
              : total === 1
                ? "One decision for the family."
                : `${total} decisions for the family, one at a time.`}
          </p>
        </div>
      </header>

      <div className="stack">
        {toAnswer.map((change) => (
          <ChangeCard key={change.id} change={change} onDone={say} />
        ))}

        {cards[0] && <DecisionCard key={cards[0].id} card={cards[0]} remaining={cards.length - 1} onDone={say} />}

        {waitingOnOthers.map((change) => (
          <div key={change.id} className="card">
            <p>
              You suggested new details for {change.changes.recipient?.name || "them"}. Waiting for{" "}
              {change.required.filter((id) => !(id in change.answers)).map((id) => Store.person(id)?.shortName).join(", ")} to agree.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionCard({ card, remaining, onDone }) {
  const [picked, setPicked] = useState(null);
  const [showWhy, setShowWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = Store.fairness();

  const choose = async () => {
    setBusy(true);
    setError("");
    try {
      const label = await Store.resolve(card.id, picked);
      onDone(`Decided: ${label}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const preview = picked === null ? null : card.previews?.[picked];

  return (
    <article className="decision" aria-labelledby={`card-${card.id}`}>
      <h2 id={`card-${card.id}`} className="decision-headline">
        {card.headline}
      </h2>
      <p className="decision-lede">
        Shoulder could not settle this inside everyone's limits, so the choice is the family's.
        {remaining > 0 ? ` ${remaining} more after this one.` : ""}
      </p>

      <div className="options" role="radiogroup" aria-label="Choose what to do">
        {card.options.map((option, index) => {
          const after = card.previews?.[index];
          const better = after && after.spread_pct < now.spread_pct;
          return (
            <button
              type="button"
              key={index}
              className="option"
              role="radio"
              aria-checked={picked === index}
              onClick={() => setPicked(index)}
            >
              <span className="option-mark" aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.consequence}</small>
              </span>
              {after && (
                <span className={`option-effect ${better ? "is-better" : ""}`}>
                  {better ? `${now.spread_pct}% to ${after.spread_pct}% apart` : "No change to the split"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="compare" aria-live="polite">
        <CompareRow title="Now" burdens={now.burdens} spread={now.spread_pct} even={now.proportional} />
        <CompareRow
          title={preview ? "After this" : "Pick an option"}
          burdens={preview ? preview.burdens : now.burdens}
          spread={preview ? preview.spread_pct : null}
          even={preview?.proportional}
          dim={!preview}
        />
      </div>

      <ErrorLine error={error} />

      <div className="decision-actions">
        <button type="button" className="btn btn-primary" disabled={picked === null || busy} onClick={choose}>
          {busy ? "Saving decision" : "Choose this"}
        </button>
        <button type="button" className="link" onClick={() => setShowWhy(!showWhy)} aria-expanded={showWhy}>
          {showWhy ? "Hide the reasoning" : "Why am I being asked?"}
        </button>
      </div>

      {showWhy && (
        <div className="reasoning">
          {card.the_tension && <p>{card.the_tension}</p>}
          {card.what_i_tried?.length > 0 && (
            <ul>
              {card.what_i_tried.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {card.what_i_will_not_decide && <p className="reasoning-refusal">{card.what_i_will_not_decide}</p>}
        </div>
      )}
    </article>
  );
}

function CompareRow({ title, burdens, spread, even, dim }) {
  return (
    <div className="compare-row" style={dim ? { opacity: 0.45 } : undefined}>
      <span>{title}</span>
      <FairnessBar burdens={burdens} height={12} />
      <span className={`compare-spread ${even ? "is-even" : ""}`}>{spread === null ? "" : `${spread}% apart`}</span>
    </div>
  );
}

function ChangeCard({ change, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const from = Store.person(change.initiated_by);
  const current = Store.recipient();
  const next = change.changes.recipient || {};
  const rows = [
    ["Name", current.name, next.name],
    ["Relation", current.relation, next.relation],
    ["Note", current.note, next.note],
  ].filter(([, before, after]) => (before || "") !== (after || ""));

  const answer = async (approve) => {
    setBusy(true);
    setError("");
    try {
      await Store.answerChange(change.id, approve);
      onDone(approve ? "You agreed to the change" : "You did not agree to the change");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <article className="card">
      <div className="member-row">
        <Face person={from} size={32} />
        <div>
          <strong>{from?.shortName || "Someone"} wants to change {current.name}'s details</strong>
          <span>It only happens if everyone agrees.</span>
        </div>
      </div>
      <dl className="change-diff">
        {rows.length ? (
          rows.map(([label, before, after]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="quiet">{before || "None"}</span> becomes <strong>{after || "None"}</strong>
              </dd>
            </div>
          ))
        ) : (
          <div>
            <dt>Photo</dt>
            <dd>A new photo</dd>
          </div>
        )}
      </dl>
      <ErrorLine error={error} />
      <div className="row-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => answer(true)}>
          Agree
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => answer(false)}>
          Do not agree
        </button>
      </div>
    </article>
  );
}
