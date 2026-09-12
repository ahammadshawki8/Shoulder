import React, { useEffect, useState } from "react";
import { Store, subscribeStore } from "../data/store.js";
import { Check, CheckCircle, Scale } from "../components/Icons.jsx";

/**
 * The only screen that asks for anything.
 *
 * One decision at a time, and never two. Each option carries what it would
 * actually do to the split, priced by the fairness engine at the moment you
 * look at it, not written down in advance.
 */
export default function Inbox({ activeUser, onNavigate }) {
  const [picked, setPicked] = useState(0);
  const [showWhy, setShowWhy] = useState(false);
  const [justDecided, setJustDecided] = useState(null);
  const [, force] = useState(0);

  useEffect(() => subscribeStore(() => force((n) => n + 1)), []);

  const open = Store.getOpenEscalations();
  const card = open[0];

  if (!card) {
    return (
      <div className="page">
        <div className="settled">
          <CheckCircle size={30} />
          <h2>Nothing needs you</h2>
          <p>The month is covered and the load is where the family left it.</p>
          {justDecided && (
            <div className="toast inline" role="status">
              <Check size={15} />
              {justDecided}
            </div>
          )}
          <div className="settled-actions">
            <button className="btn-solid" onClick={() => onNavigate("schedule")}>
              Back to tasks
            </button>
            <button className="btn-quiet" onClick={() => onNavigate("agreements")}>
              See what you have agreed
            </button>
          </div>
        </div>
      </div>
    );
  }

  const option = card.options[picked];
  const now = Store.getFairness();
  const after = Store.burdensIfTaken(option);
  const changes = Math.round(after.maxDeviation * 100) !== now.spreadPct;

  const decide = () => {
    const chosen = Store.resolveEscalation(card.id, picked, activeUser);
    setJustDecided(chosen ? `Done: ${chosen.label}` : "Decided");
    setPicked(0);
    setShowWhy(false);
    setTimeout(() => setJustDecided(null), 4000);
  };

  return (
    <div className="page">
      {justDecided && (
        <div className="toast" role="status">
          <Check size={15} />
          {justDecided}
        </div>
      )}

      <header className="page-head">
        <div>
          <h1>Needs you</h1>
          <p>{open.length === 1 ? "One decision" : `${open.length} decisions, one at a time`}</p>
        </div>
      </header>

      <article className="decision">
        <h2 className="decision-headline">{card.headline}</h2>

        <div className="options" role="radiogroup" aria-label="What would you like to do">
          {card.options.map((opt, index) => {
            const price = Store.priceOption(opt);
            const better = price.delta < 0;
            return (
              <button
                key={index}
                className={`option ${picked === index ? "picked" : ""}`}
                onClick={() => setPicked(index)}
                role="radio"
                aria-checked={picked === index}
              >
                <span className="option-mark" />
                <span className="option-body">
                  <strong>{opt.label}</strong>
                  {/* The consequence belongs to the option you are considering.
                      All three at once is a wall of text nobody reads. */}
                  {picked === index && <em>{opt.consequence}</em>}
                </span>
                {better && (
                  <span className="option-gain">
                    {Math.round(price.before * 100)}% to {Math.round(price.after * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="impact">
          <span className="impact-label">
            <Scale size={14} /> {changes ? "If you choose this" : "Nothing moves"}
          </span>
          <div className="impact-bars">
            <ImpactBar title="Now" burdens={now.burdens} spread={now.spreadPct} />
            <ImpactBar
              title="After"
              burdens={after.burdens}
              spread={Math.round(after.maxDeviation * 100)}
              highlight={changes}
            />
          </div>
        </div>

        <div className="decision-actions">
          <button className="btn-solid" onClick={decide}>
            <Check size={16} /> Choose this
          </button>
          <button className="link-quiet" onClick={() => setShowWhy(!showWhy)}>
            {showWhy ? "hide the reasoning" : "why am I being asked?"}
          </button>
        </div>

        {showWhy && (
          <div className="reasoning">
            <p>{card.the_tension}</p>
            {card.what_i_tried?.length > 0 && (
              <ul>
                {card.what_i_tried.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
            {card.what_i_will_not_decide && (
              <p className="reasoning-refusal">{card.what_i_will_not_decide}</p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

function ImpactBar({ title, burdens, spread, highlight }) {
  return (
    <div className={`impact-bar ${highlight ? "is-better" : ""}`}>
      <span className="impact-title">{title}</span>
      <span className="impact-track">
        {burdens.map((b) => (
          <i
            key={b.principal_id}
            style={{
              width: `${b.percent_of_total}%`,
              background: Store.person(b.principal_id)?.color,
            }}
            title={`${b.name} ${Math.round(b.percent_of_total)} percent`}
          />
        ))}
      </span>
      <span className="impact-spread">{spread}% apart</span>
    </div>
  );
}
