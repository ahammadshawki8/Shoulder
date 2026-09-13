import React from "react";
import { Lock, Scale, Shield } from "../components/Icons.jsx";
import Diagram from "../components/Diagram.jsx";

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
              <h3>Their agents negotiate the split</h3>
              <p>
                Whenever the plan changes, each person's agent weighs its share against what only that person has
                told it. A coordinating agent proposes moves, and a fairness engine measures every one.
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
        <Diagram name="month" />
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
        <Diagram name="privacy" />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>How it is built</h2>
            <p>Every agent is a Strands agent on Amazon Bedrock. Limits and fairness are enforced in code around them.</p>
          </div>
        </div>
        <Diagram name="built" />
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
