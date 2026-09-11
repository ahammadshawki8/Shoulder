// The agent ledger: everything it did without asking, and why it could.
// Show the reasoning, hide the machinery: plain sentences, no JSON, no agent
// internals. Only the family's scope is here; what a person's own agent held
// back on their behalf stays on their device and never reaches this file.

import { useMemo, useState } from "react";

const GROUPS = {
  all: { label: "Everything", kinds: null },
  applied: { label: "Decisions it applied", kinds: ["applied_precedent", "noted_change"] },
  asked: { label: "What each agent said", kinds: ["asked_for_view"] },
  checks: {
    label: "Checks and refusals",
    kinds: ["measured_fairness", "reversed_move", "kept_better_split", "blocked_action", "withheld_private_detail", "raised_escalation"],
  },
};

const tone = (kind) =>
  kind === "applied_precedent" || kind === "noted_change"
    ? "precedent"
    : kind === "withheld_private_detail" || kind === "blocked_action"
      ? "guard"
      : "";

export default function Ledger({ month }) {
  const [filter, setFilter] = useState("all");
  const entries = useMemo(() => {
    const kinds = GROUPS[filter].kinds;
    return month.ledger.filter((e) => !kinds || kinds.includes(e.kind));
  }, [month, filter]);

  const groups = useMemo(() => {
    const out = [];
    for (const e of entries) {
      const key = e.round_number == null ? "before" : `r${e.round_number}`;
      let g = out.find((x) => x.key === key);
      if (!g) out.push((g = { key, round: e.round_number, items: [] }));
      g.items.push(e);
    }
    return out;
  }, [entries]);

  const asked = month.escalations.length;

  return (
    <div className="stack-lg">
      <section className="stack">
        <p className="eyebrow">The ledger · {month.label}</p>
        <h1>
          {month.ledger.length} things it did on its own. {asked === 0 ? "None needed you." : `${asked} it handed to you.`}
        </h1>
        <p className="lede">
          Every action taken without asking, in the order it happened, with the reason it was allowed. It is here so
          it can be trusted, not so it has to be read.
        </p>
        <div className="filters" role="group" aria-label="Show">
          {Object.entries(GROUPS).map(([id, g]) => (
            <button key={id} className="filter" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {g.label}
            </button>
          ))}
        </div>
      </section>

      {groups.length === 0 && <p className="muted">Nothing of this kind this month.</p>}

      {groups.map((g) => (
        <section key={g.key} className="card ledger-group">
          <h3>{g.round == null ? "Before and after the rounds" : g.round === 1 ? "The opening split" : `Round ${g.round}`}</h3>
          <div>
            {g.items.map((e) => (
              <div key={e.id} className={`entry ${tone(e.kind)}`}>
                <span className="mark" aria-hidden="true" />
                <p>{e.summary}</p>
                {e.justification && <p className="why">{e.justification}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
