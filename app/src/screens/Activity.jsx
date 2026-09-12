import React, { useState } from "react";
import { PERSON_META, Store, personOf } from "../data/store.js";
import { Shield, Check, Scale, Calendar, Lock } from "../components/Icons.jsx";

const GLYPH = {
  withheld_private_detail: Lock,
  blocked_action: Shield,
  raised_escalation: Shield,
  measured_fairness: Scale,
  applied_precedent: Check,
  took_action: Check,
};

/**
 * What it did while nobody was looking.
 *
 * One line each. The reason it was allowed to act alone is a click away, which
 * is the honest order: a family wants to know what happened first.
 */
export default function Activity() {
  const [openId, setOpenId] = useState(null);
  const entries = Store.getLedger();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>What it did</h1>
          <p>Everything it handled without asking, and why it was allowed to</p>
        </div>
      </header>

      <section className="trail">
        {entries.map((entry) => {
          const Glyph = GLYPH[entry.kind] || Calendar;
          const person = personOf(entry.who);
          const open = openId === entry.id;
          return (
            <div key={entry.id} className={`trail-item ${open ? "open" : ""}`}>
              <button className="trail-line" onClick={() => setOpenId(open ? null : entry.id)}>
                <span className="trail-glyph">
                  <Glyph size={14} />
                </span>
                <span className="trail-text">{entry.summary}</span>
                {person && <img src={person.avatar} alt="" className="trail-face" />}
                <span className="trail-time">{entry.when}</span>
              </button>
              {open && entry.justification && <p className="trail-why">{entry.justification}</p>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
