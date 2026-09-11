// The problem, and why it persists. Storyboard beats 0:00 to 0:45.
// Every figure is from CLAUDE.md section 4, with its source underneath.

const STATS = [
  { value: "59 million", label: "people in the US care for someone, unpaid" },
  { value: "49.5 billion", label: "hours of care they gave in 2024" },
  { value: "$1.01 trillion", label: "the value of that care, more than all Medicaid spending combined ($932 billion)" },
  { value: "65 percent", label: "of unpaid care work is done by women" },
];

export default function Why({ go }) {
  return (
    <div className="stack-lg">
      <section className="stack">
        <p className="eyebrow">The problem</p>
        <div className="hero-stat" aria-hidden="true">75%</div>
        <p className="statement">
          In 75 percent of families, when a parent needs care, exactly one adult child ends up doing all of it.
        </p>
        <p className="lede">
          Not by agreement. By default. Usually whoever lives closest, and usually a daughter. The conversation that
          would share the load is the hardest one a family ever has, so it never happens.
        </p>
      </section>

      <section className="grid-2" aria-label="The scale of it">
        {STATS.map((s) => (
          <div className="card-quiet" key={s.value}>
            <div className="stat-value">{s.value}</div>
            <p className="muted">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="stack">
        <p className="eyebrow">Why it persists</p>
        <blockquote className="quote" style={{ margin: 0 }}>
          There is a clinical trial of a program that teaches people how to talk to their own brother about mum. That
          is how hard this conversation is. We did not build the training. We built the negotiation.
        </blockquote>
      </section>

      <section className="card stack">
        <h2>This is not a calendar. It is a negotiation about who does the work.</h2>
        <p className="lede">
          Each sibling has a private agent that knows what they can do, what they cannot, and why. The agents
          negotiate the month between them. The fairness is computed, never guessed. The reasons never leave. And
          the agent never makes the human decision: when it cannot close something fairly, it asks, once, with the
          options and what each would cost.
        </p>
        <div className="row">
          <button className="button" onClick={() => go("intake")}>
            Meet the Rahman family
          </button>
          <button className="button secondary" onClick={() => go("month")}>
            Watch this month's negotiation
          </button>
        </div>
      </section>

      <p className="sources">
        Sources: Raab, Engelhardt and Leopold, Journal of Marriage and Family (2014), US Health and Retirement Study,
        2,452 parent and child relationships. AARP, Valuing the Invaluable (2026 update). National Partnership for
        Women and Families. NegotiAge, a caregiver negotiation training program, MOST trial, Journal of the American
        Geriatrics Society (2024).
      </p>
    </div>
  );
}
