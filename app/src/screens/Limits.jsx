import React, { useEffect, useState } from "react";
import {
  Store,
  TYPE_META,
  WEEKDAYS,
  subscribeStore,
  toPosition,
} from "../data/store.js";
import { Lock, Users } from "../components/Icons.jsx";

/**
 * What you told your agent, and what your family sees.
 *
 * The two panels are the whole promise, side by side. The left is yours: it
 * includes the reason, and the reason has never left this device. The right is
 * everything the others get, rebuilt live from the left by the same projection
 * the agents use. Change something on the left and watch what does, and does
 * not, appear on the right.
 */
export default function Limits({ activeUser }) {
  const [, force] = useState(0);
  useEffect(() => subscribeStore(() => force((n) => n + 1)), []);

  const principal = Store.getPrincipal(activeUser);
  if (!principal) return null;

  const position = toPosition(principal);
  const fixedDays = Store.fixedDaysFor(activeUser);
  const privates = principal.constraints.filter((c) => c.tier === "private");
  const capacityPct = Math.round(principal.capacity * 100);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>My limits</h1>
          <p>What you can take on, and what stays with you</p>
        </div>
        {Store.getMode() === "own" && (
          <button className="btn-quiet" onClick={() => Store.reopenSetup()}>
            Add or remove someone
          </button>
        )}
      </header>

      <div className="two-up">
        {/* ---------------- yours ---------------- */}
        <section className="panel panel-yours">
          <span className="panel-tag">
            <Lock size={13} /> Only your agent sees this
          </span>

          <label className="field">
            <span className="field-label">
              How much you can take on
              <b>{capacityPct}%</b>
            </span>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={capacityPct}
              onChange={(e) => Store.savePrincipal(activeUser, { capacity: Number(e.target.value) / 100 })}
            />
          </label>

          <div className="field">
            <span className="field-label">Days you cannot do</span>
            <div className="days">
              {WEEKDAYS.map((day) => {
                const fixed = fixedDays.has(day);
                const off = position.unavailable_weekdays.includes(day);
                return (
                  <button
                    key={day}
                    className={`day-chip ${off ? "off" : ""} ${fixed ? "fixed" : ""}`}
                    onClick={() => !fixed && Store.togglePersonalDay(activeUser, day)}
                    title={fixed ? "This comes from something else you told your agent" : ""}
                  >
                    {day}
                    {fixed && <Lock size={10} />}
                  </button>
                );
              })}
            </div>
          </div>

          {privates.length > 0 && (
            <div className="field">
              <span className="field-label">Why, in your words</span>
              {privates.map((c) => (
                <div key={c.id} className="private-box">
                  <span className="private-head">
                    <Lock size={12} /> {c.summary}
                  </span>
                  <textarea
                    value={c.reason || ""}
                    rows={3}
                    onChange={(e) => Store.savePrivateReason(activeUser, c.id, e.target.value)}
                  />
                  <span className="private-foot">
                    This never leaves your device. A check in code reads every message
                    before it is sent.
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------------- theirs ---------------- */}
        <section className="panel panel-theirs">
          <span className="panel-tag">
            <Users size={13} /> What your family sees
          </span>

          <ul className="seen">
            <li>
              <em>Can take on</em>
              <span>{capacityPct}% of a full share</span>
            </li>
            <li>
              <em>Not available</em>
              <span>
                {position.unavailable_weekdays.length
                  ? position.unavailable_weekdays.join(", ")
                  : "any day works"}
              </span>
            </li>
            {position.unavailable_weekdays_onsite.length > 0 && (
              <li>
                <em>Cannot travel</em>
                <span>{position.unavailable_weekdays_onsite.join(", ")}</span>
              </li>
            )}
            {position.refused_task_types.length > 0 && (
              <li>
                <em>Does not take</em>
                <span>
                  {position.refused_task_types.map((t) => TYPE_META[t]?.label || t).join(", ")}
                </span>
              </li>
            )}
            {position.max_tasks_per_period != null && (
              <li>
                <em>At most</em>
                <span>{position.max_tasks_per_period} tasks a month</span>
              </li>
            )}
          </ul>

          {privates.length > 0 && (
            <p className="seen-note">
              Your family sees the days and the kinds of work, never the reason. The
              words above are not in this list, and nothing here is built from them.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
