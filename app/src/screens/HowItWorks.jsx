import React, { useState } from "react";
import { CARE_RECIPIENT_META, Store } from "../data/store.js";

const STEPS = [
  {
    id: "tell",
    title: "Each of you tells your own agent what you can do",
    more:
      "Privately, including the parts you would not say at a family dinner. The reason stays on your device. Only the effect, like which days are out, ever reaches the others.",
  },
  {
    id: "split",
    title: "It works out a split that respects every limit",
    more:
      "The maths is fixed, not guessed: each person's load is weighed against what they said they can carry. A night awake counts for more than an hour of paperwork, and distance counts too.",
  },
  {
    id: "ask",
    title: "When it cannot make it fair, it asks you",
    more:
      "It never decides anything that belongs to the family: spending money, cutting care, or changing what somebody said they can manage. Those come to you as one card at a time.",
  },
  {
    id: "learn",
    title: "What you decide, it remembers",
    more:
      "Your answer becomes a standing agreement and is applied the next month without asking again, always saying who decided it and when. Month one it interrupts; by month two it mostly does not.",
  },
];

export default function HowItWorks({ onNavigate }) {
  const [open, setOpen] = useState(null);
  const fairness = Store.getFairness();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>How it works</h1>
          <p>Four things, and one promise</p>
        </div>
      </header>

      <section className="steps">
        {STEPS.map((step, index) => (
          <article key={step.id} className={`step ${open === step.id ? "open" : ""}`}>
            <button onClick={() => setOpen(open === step.id ? null : step.id)}>
              <span className="step-num">{index + 1}</span>
              <span className="step-title">{step.title}</span>
            </button>
            {open === step.id && <p className="step-more">{step.more}</p>}
          </article>
        ))}
      </section>

      <section className="promise">
        <p>
          It proposes, it does the safe work, and it hands the rest back. It never
          decides who cares for {CARE_RECIPIENT_META.relation}.
        </p>
        <span>
          Right now the load is {fairness.spreadPct}% apart, and the family agreed to keep
          it under {fairness.tolerancePct}%.
        </span>
      </section>
    </div>
  );
}
