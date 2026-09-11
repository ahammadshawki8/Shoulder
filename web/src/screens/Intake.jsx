// Private intake: the trust moment. Storyboard beat 0:45 to 1:20.
//
// Left: everything a person tells their own agent, including what they have
// never told their family. Right: what the family actually sees, recomputed
// live with the same projection the Python side uses (Principal.to_position).
// Mark something private and its words vanish from the right while its effect
// stays. Type a reason and the right does not change at all.

import { useEffect, useMemo, useRef, useState } from "react";
import { PERSON_ORDER, TYPE_WORDS, dayName, personVar, toPosition } from "../data.js";
import { Lock, People } from "../components/Icons.jsx";

function effectLine(c) {
  const bits = [];
  if (c.blocks_weekdays?.length) {
    const days = c.blocks_weekdays.map(dayName).join(" and ");
    bits.push(c.applies_to_remote === false ? `No travel on ${days}` : `Not available ${days}`);
  }
  if (c.blocks_task_types?.length) bits.push(`No ${c.blocks_task_types.map((t) => TYPE_WORDS[t] || t).join(", ")}`);
  if (c.max_tasks_per_period != null) bits.push(`At most ${c.max_tasks_per_period} tasks a month`);
  return bits.join(". ") || "A preference, not a limit";
}

function Avatar({ person }) {
  return (
    <span className="avatar" style={{ background: personVar(person.id) }} aria-hidden="true">
      {person.name[0]}
    </span>
  );
}

function FamilyView({ person }) {
  const pos = toPosition(person);
  const list = (xs, fn = (x) => x) => (xs.length ? xs.map(fn).join(", ") : "Nothing stated");
  const hasPrivate = person.constraints.some((c) => c.tier === "private");
  return (
    <section className="family-view stack" aria-live="polite">
      <div className="row">
        <People />
        <h3>What {person.name}'s family sees</h3>
      </div>
      <dl>
        <dt>Can carry</dt>
        <dd>{Math.round(pos.capacity * 100)} percent of a full share</dd>
        <dt>Lives</dt>
        <dd>{Math.round(pos.distance_km)} km away</dd>
        <dt>Not available</dt>
        <dd>{list(pos.unavailable, dayName)}</dd>
        {pos.onsite.length > 0 && (
          <>
            <dt>Cannot travel on</dt>
            <dd>{list(pos.onsite, dayName)} (paperwork still fine)</dd>
          </>
        )}
        <dt>Does not take</dt>
        <dd>{list(pos.refused, (t) => TYPE_WORDS[t] || t)}</dd>
        {pos.cap != null && (
          <>
            <dt>Monthly limit</dt>
            <dd>{pos.cap} tasks</dd>
          </>
        )}
        <dt>In their words</dt>
        <dd>{pos.notes.length ? pos.notes.map((n) => <div key={n}>{n}</div>) : "Nothing"}</dd>
      </dl>
      {hasPrivate && (
        <p className="small muted">
          The family sees the shape of {person.name}'s limits. Never the reason. Not the wording, not a hint.
        </p>
      )}
    </section>
  );
}

function Constraint({ c, onChange, typing }) {
  const isPrivate = c.tier === "private";
  return (
    <article className={`constraint ${isPrivate ? "is-private" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{c.summary}</strong>
        <div className="tier-toggle" role="group" aria-label={`Who can see "${c.summary}"`}>
          <button className="shared" aria-pressed={!isPrivate} onClick={() => onChange({ ...c, tier: "shareable" })}>
            <People width={15} height={15} /> Family
          </button>
          <button className="private" aria-pressed={isPrivate} onClick={() => onChange({ ...c, tier: "private" })}>
            <Lock width={15} height={15} /> Only my agent
          </button>
        </div>
      </div>
      <p className="small muted">{effectLine(c)}</p>
      {isPrivate && (
        <>
          <label className="small" htmlFor={`reason-${c.id}`}>
            Why, in your own words
          </label>
          <textarea
            id={`reason-${c.id}`}
            className="reason"
            value={c.reason || ""}
            onChange={(e) => onChange({ ...c, reason: e.target.value })}
            placeholder="Nobody else will ever read this."
          />
          <span className={`never-leaves ${typing ? "pulse" : ""}`}>
            <Lock /> Never leaves this device
          </span>
          {c.sensitive_terms?.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted">Words your agent will never let through, in any message:</span>
              <div className="terms">
                {c.sensitive_terms.map((t) => (
                  // Terms match as word beginnings, so "diagnos" also stops
                  // "diagnosis". The ellipsis says so.
                  <span className="term" key={t}>
                    {t}…
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function Intake({ month }) {
  const people = useMemo(
    () => PERSON_ORDER.map((id) => month.circle.principals.find((p) => p.id === id)).filter(Boolean),
    [month],
  );
  const [edits, setEdits] = useState({});
  const [whoId, setWhoId] = useState("farah");
  const [typing, setTyping] = useState(null);
  const timer = useRef(null);

  useEffect(() => setEdits({}), [month.period]);
  useEffect(() => () => clearInterval(timer.current), []);

  const person = edits[whoId] || people.find((p) => p.id === whoId);
  const update = (next) => setEdits((e) => ({ ...e, [whoId]: next }));
  const setConstraint = (c) => update({ ...person, constraints: person.constraints.map((x) => (x.id === c.id ? c : x)) });

  // The storyboard moment: Farah types something she has never told her family.
  const replay = () => {
    const original = people.find((p) => p.id === "farah");
    const target = original.constraints.find((c) => c.tier === "private" && c.reason);
    if (!target) return;
    setWhoId("farah");
    clearInterval(timer.current);
    let i = 0;
    setTyping(target.id);
    timer.current = setInterval(() => {
      i += 1;
      setEdits((e) => {
        const base = e.farah || original;
        return {
          ...e,
          farah: {
            ...base,
            constraints: base.constraints.map((c) => (c.id === target.id ? { ...c, tier: "private", reason: target.reason.slice(0, i) } : c)),
          },
        };
      });
      if (i >= target.reason.length) {
        clearInterval(timer.current);
        setTimeout(() => setTyping(null), 1800);
      }
    }, 38);
  };

  return (
    <div className="stack-lg">
      <section className="stack">
        <p className="eyebrow">Private intake</p>
        <h1>What you tell your agent stays with your agent.</h1>
        <p className="lede">
          Each person answers alone: what they can do, what they cannot, and why. The why is theirs. Their agent
          negotiates with it, and nothing it says ever carries it.
        </p>
      </section>

      <section className="stack">
        <div className="people" role="group" aria-label="Whose device">
          {people.map((p) => (
            <button key={p.id} className="person-tab" aria-pressed={p.id === whoId} onClick={() => setWhoId(p.id)}>
              <Avatar person={p} />
              {p.name}
            </button>
          ))}
        </div>
        <p className="small muted">
          In the product each person only ever sees their own. Switching here shows each device in turn.
        </p>
      </section>

      <div className="grid-2">
        <section className="stack" aria-label={`${person.name}'s answers`}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <Lock />
              <div>
                <h3>{person.name}'s answers</h3>
                <p className="small muted">Given to {person.name}'s own agent, on {person.name}'s device.</p>
              </div>
            </div>
            {person.id === "farah" && (
              <button className="button secondary" onClick={replay} disabled={!!typing}>
                Replay the moment
              </button>
            )}
          </div>

          <div className="card-quiet stack" style={{ gap: 8 }}>
            <label htmlFor="capacity">
              <strong>How much can you carry right now?</strong>{" "}
              <span className="muted">{Math.round(person.capacity * 100)} percent of a full share</span>
            </label>
            <input
              id="capacity"
              className="capacity"
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={person.capacity}
              onChange={(e) => update({ ...person, capacity: Number(e.target.value) })}
            />
            <p className="small muted">Only you can change this. The agent will never do it for you.</p>
          </div>

          {person.constraints.map((c) => (
            <Constraint key={c.id} c={c} onChange={setConstraint} typing={typing === c.id} />
          ))}
          {person.constraints.length === 0 && <p className="muted">Nothing stated yet.</p>}
        </section>

        <div className="stack family-column">
          <div className="boundary">the edge of {person.name}'s device</div>
          <FamilyView person={person} />
        </div>
      </div>
    </div>
  );
}
