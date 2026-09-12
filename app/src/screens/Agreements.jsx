import React from "react";
import { Store } from "../data/store.js";
import { Shield } from "../components/Icons.jsx";

/**
 * What the family has already settled.
 *
 * Each one came from a decision somebody made on a card. It is applied from
 * then on without asking again, and it says who decided it and when, so a
 * quiet month can always be traced back to a person.
 */
export default function Agreements({ onNavigate }) {
  const precedents = Store.getPrecedents().filter((p) => p.active);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Agreed</h1>
          <p>
            {precedents.length
              ? "Decisions it now applies on its own"
              : "Nothing agreed yet"}
          </p>
        </div>
      </header>

      {precedents.length === 0 ? (
        <div className="empty">
          <Shield size={26} />
          <p>When you answer a card, the answer lives here.</p>
          <button className="btn-quiet" onClick={() => onNavigate("inbox")}>
            See what needs you
          </button>
        </div>
      ) : (
        <section className="agreed">
          {precedents.map((p) => (
            <article key={p.id} className="agreed-item">
              <span className="agreed-glyph">
                <Shield size={15} />
              </span>
              <div>
                <p className="agreed-rule">{p.text}</p>
                <span className="agreed-from">{p.provenance}</span>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
