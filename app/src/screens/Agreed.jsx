import React from "react";
import { Store } from "../data/store.js";
import { useStore } from "../components/ui.jsx";

/**
 * What the family has already decided. Each one came from a card somebody
 * answered, and says who decided it and when, so a quiet month can always be
 * traced back to a person.
 */
export default function Agreed({ onNavigate }) {
  useStore();
  const precedents = Store.precedents();

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1>Agreed</h1>
          <p>
            {precedents.length
              ? "Decisions the family made, which Shoulder now follows without asking again."
              : "Decisions the family makes will be listed here."}
          </p>
        </div>
      </header>

      {precedents.length === 0 ? (
        <div className="empty">
          <h2>Nothing agreed yet</h2>
          <p>When someone answers a decision in Needs you, the answer becomes a standing agreement and appears here.</p>
          <div className="empty-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onNavigate("inbox")}>
              Go to Needs you
            </button>
          </div>
        </div>
      ) : (
        <ul className="plain-list">
          {precedents.map((p) => (
            <li key={p.id}>
              <p className="agreed-rule">{p.text}</p>
              <p className="agreed-from">{p.provenance}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
