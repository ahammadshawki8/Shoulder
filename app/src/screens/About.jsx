import React from "react";
import { Lock, Scale, Shield } from "../components/Icons.jsx";

/** What Shoulder is for, how it works, and what it will never do. */
export default function About() {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>About Shoulder</h1>
          <p>Nobody should carry the care of a parent alone.</p>
        </div>
      </header>

      <section className="section">
        <div className="prose">
          <p className="prose-lede">
            In three out of four families, when a parent starts needing care, one adult child ends up doing
            almost all of it. Not because anyone decided that, but because the conversation that would
            share it out is the hardest one a family has.
          </p>
          <p>
            Most caregiving apps are shared to-do lists. They can show that one person is doing more. They
            cannot change it, because changing it means negotiating between people who each have limits
            they may not want to explain.
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
          <h2>How it works</h2>
        </div>
        <ol className="steps">
          <li>
            <div>
              <h3>Everyone adds themselves</h3>
              <p>
                Each person says how much they can take on, which days and kinds of work they cannot do, and
                why, if there is a reason they would rather not say out loud.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>Shoulder works out the split</h3>
              <p>
                Every task goes to the person with the most room once everyone's limits are respected,
                weighed by how long it takes, how heavy it is, and how far away they live.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>It asks only when it has to</h3>
              <p>
                If the limits leave no fair split, it does not choose. It shows the family the real options
                and exactly what each one would change.
              </p>
            </div>
          </li>
          <li>
            <div>
              <h3>Your answer becomes an agreement</h3>
              <p>What the family decides is followed from then on, and always says who decided it and when.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>What it will never do</h2>
        </div>
        <div className="promises">
          <div className="promise">
            <span className="glyph">
              <Lock size={16} />
            </span>
            <h3>Share your reasons</h3>
            <p>
              Your family sees which days and kinds of work you cannot do, never why. The server removes
              reasons before anything reaches them, and a check in code blocks any message that would give
              one away.
            </p>
          </div>
          <div className="promise">
            <span className="glyph">
              <Scale size={16} />
            </span>
            <h3>Guess at what is fair</h3>
            <p>
              Fairness is calculated the same way every time, measured against what each person said they can
              carry. No language model decides it.
            </p>
          </div>
          <div className="promise">
            <span className="glyph">
              <Shield size={16} />
            </span>
            <h3>Decide for the family</h3>
            <p>
              It handles the routine work. Spending money, dropping care, or asking someone to do more than they
              said they can is always the family's choice.
            </p>
          </div>
        </div>
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
