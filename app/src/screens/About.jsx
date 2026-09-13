import React from "react";
import { Lock, Scale, Shield } from "../components/Icons.jsx";
import Diagram from "../components/Diagram.jsx";

const MONTH = `flowchart LR
  A["Everyone adds what<br/>they can and cannot do"] --> B["Shoulder works out<br/>the fairest split"]
  B --> C{"Fair enough?"}
  C -->|Yes| D["The plan appears<br/>in Tasks"]
  C -->|No| E["One decision<br/>in Needs you"]
  E --> F["The answer becomes<br/>an agreement"]
  F -.->|next month| B`;

const PRIVACY = `flowchart LR
  L["Days and kinds of<br/>work you cannot do"] --> F[("Family record")]
  R["Your reasons and<br/>agent instructions"] --> T[("Kept apart,<br/>read only for you")]
  F --> O["What your family sees"]
  F --> Y["What you see"]
  T --> Y
  A["Your agent's messages"] --> H(["Privacy check in code"])
  H -->|"nothing that gives<br/>a reason away"| O`;

const BUILT = `flowchart LR
  UI["Family app<br/>in the browser"] -->|"httpOnly cookie"| API["Shoulder server<br/>sessions and one<br/>view per person"]
  API --> DB[("SQLite")]
  API --> ENG["Fairness engine<br/>no language model"]
  CON["Convener<br/>Strands graph"] --> ENG
  CON <-->|A2A| PA["One agent per person<br/>with privacy hook"]
  CON --> BR["Amazon Bedrock"]
  PA --> BR`;

/** What Shoulder is for, how it works, and what it will never do. */
export default function About() {
  return (
    <div className="page page-narrow about">
      <header className="page-head">
        <div>
          <h1>About Shoulder</h1>
          <p>Nobody should carry the care of a parent alone.</p>
        </div>
      </header>

      <section className="about-intro">
        <div className="prose">
          <p className="prose-lede">
            In three out of four families, when a parent starts needing care, one adult child ends up doing almost
            all of it. Not because anyone decided that, but because the conversation that would share it out is the
            hardest one a family has.
          </p>
          <p>
            Most caregiving apps are shared to-do lists. They can show that one person is doing more. They cannot
            change it, because changing it means negotiating between people who each have limits they may not want
            to explain.
          </p>
        </div>
        <div className="figures">
          <div className="figure">
            <strong>75%</strong>
            <span>of families where only one adult child becomes the caregiver</span>
          </div>
          <div className="figure">
            <strong>$1 trillion</strong>
            <span>the value of unpaid family care in the United States in 2024</span>
          </div>
          <div className="figure">
            <strong>65%</strong>
            <span>of that unpaid care is done by women</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>How a month gets shared</h2>
            <p>The same four steps every month. The family is asked only at one of them.</p>
          </div>
        </div>
        <ol className="steps">
          <li>
            <div>
              <h3>Everyone adds themselves</h3>
              <p>
                How much they can take on, which days and kinds of work they cannot do, and why, if there is a
                reason they would rather not say out loud.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>Shoulder works out the split</h3>
              <p>
                Each task goes to the person with the most room once limits are respected, weighed by how long
                and heavy it is and how far away they live.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>It asks only when it has to</h3>
              <p>If the limits leave no fair split, it shows the family the real options and what each would change.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>The answer becomes an agreement</h3>
              <p>What the family decides is followed from then on, and always says who decided it and when.</p>
            </div>
          </li>
        </ol>
        <Diagram source={MONTH} label="How a month gets shared, and where the family is asked." />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>What it will never do</h2>
            <p>Three promises, each kept in code rather than in a policy.</p>
          </div>
        </div>
        <div className="promises">
          <div className="promise">
            <span className="glyph">
              <Lock size={16} />
            </span>
            <h3>Share your reasons</h3>
            <p>
              Your family sees which days and kinds of work you cannot do, never why. Reasons live apart from the
              family record, and a check in code blocks any agent message that would give one away.
            </p>
          </div>
          <div className="promise">
            <span className="glyph">
              <Scale size={16} />
            </span>
            <h3>Guess at what is fair</h3>
            <p>
              Fairness is calculated the same way every time, measured against what each person said they can carry.
              No language model decides it.
            </p>
          </div>
          <div className="promise">
            <span className="glyph">
              <Shield size={16} />
            </span>
            <h3>Decide for the family</h3>
            <p>
              It handles the routine work. Spending money, dropping care, or asking someone to do more than they said
              they can is always the family's choice.
            </p>
          </div>
        </div>
        <Diagram source={PRIVACY} label="Where what you tell Shoulder goes, and what reaches your family." />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>How it is built</h2>
            <p>The family app and the agent negotiation share one fairness engine.</p>
          </div>
        </div>
        <Diagram source={BUILT} label="The family app, its server, and the Strands Agents negotiation." />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Sources</h2>
        </div>
        <ul className="sources">
          <li>Raab, Engelhardt and Leopold, Journal of Marriage and Family, 2014. US Health and Retirement Study, 641 families.</li>
          <li>AARP, Valuing the Invaluable, 2026 update. 59 million caregivers, 49.5 billion hours of care in 2024.</li>
          <li>National Partnership for Women and Families. The share of unpaid care done by women.</li>
          <li>Fair division research on allocating chores with private preferences, including IJCAI 2023 and AAAI 2024.</li>
        </ul>
      </section>
    </div>
  );
}
