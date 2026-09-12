import React, { useEffect, useState } from "react";
import { PAID_CAREGIVER_META, Store, subscribeStore } from "../data/store.js";
import Face from "./Face.jsx";
import { X } from "./Icons.jsx";

/**
 * How the load sits, as one bar.
 *
 * The bar is the glance. The numbers behind it are one click away, because
 * "Amina is carrying 46 percent more" is the thing a family needs to know, and
 * "adjusted share 70.48 against a mean of 62.67" is the thing that makes them
 * close the app.
 *
 * Widths are the weighted share of the load, not a count of tasks. Counting
 * tasks says Farah carries the most; the engine says she carries the least,
 * because a night awake is not an hour of paperwork.
 */
export default function BalanceRail({ activeUser }) {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  useEffect(() => subscribeStore(() => force((n) => n + 1)), []);

  const fairness = Store.getFairness();
  const paid = fairness.paidCount;
  const carrying = fairness.burdens.filter((b) => b.weighted_burden > 0);

  if (!carrying.length) {
    return (
      <div className="balance balance-empty">
        <span className="balance-state">Nothing to split yet</span>
        <span className="balance-hint">Add what needs doing and it works out who does it.</span>
      </div>
    );
  }

  return (
    <>
      <button className="balance" onClick={() => setOpen(true)}>
        <span className="balance-top">
          <span className={`balance-state ${fairness.proportional ? "is-even" : "is-uneven"}`}>
            {fairness.proportional ? "Load is even" : "Load is uneven"}
          </span>
          <span className="balance-why">why</span>
        </span>

        <span className="balance-bar">
          {fairness.burdens.map((b) => (
            <i
              key={b.principal_id}
              style={{
                width: `${b.percent_of_total}%`,
                background: Store.person(b.principal_id)?.color,
              }}
              title={`${b.name} ${b.percent_of_total} percent`}
            />
          ))}
        </span>

        <span className="balance-faces">
          {fairness.burdens.map((b) => (
            <span key={b.principal_id} className="balance-face">
              <Face person={Store.person(b.principal_id)} size={19} />
              <em style={{ color: Store.person(b.principal_id)?.color }}>
                {Math.round(b.percent_of_total)}%
              </em>
            </span>
          ))}
          {paid > 0 && (
            <span className="balance-face">
              <Face person={PAID_CAREGIVER_META} size={19} />
              <em style={{ color: PAID_CAREGIVER_META.color }}>{paid}</em>
            </span>
          )}
        </span>
      </button>

      {open && (
        <BalanceSheet fairness={fairness} activeUser={activeUser} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function BalanceSheet({ fairness, activeUser, onClose }) {
  const most = Math.max(...fairness.burdens.map((b) => b.adjusted_share), 1);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="How the load is split"
      >
        <div className="sheet-head">
          <h3>{fairness.headline}</h3>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="split-rows">
          {fairness.burdens.map((b) => {
            const person = Store.person(b.principal_id);
            return (
              <div key={b.principal_id} className="split-row">
                <Face person={person} size={38} />
                <div className="split-body">
                  <div className="split-name">
                    {person?.shortName}
                    {b.principal_id === activeUser && <span className="tag-you">you</span>}
                    <span className="split-share">{Math.round(b.percent_of_total)}% of the load</span>
                  </div>
                  <div className="split-track">
                    <i
                      style={{
                        width: `${(b.adjusted_share / most) * 100}%`,
                        background: person?.color,
                      }}
                    />
                  </div>
                  <div className="split-foot">
                    {b.task_count} tasks, and said they can take on {Math.round(b.capacity * 100)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="sheet-note">
          Bars show the load against what each person said they can carry, so they are
          comparable. Right now the gap between the heaviest and the lightest is{" "}
          <strong>{fairness.spreadPct}%</strong>, and anything under {fairness.tolerancePct}% counts
          as even.
        </p>
      </div>
    </div>
  );
}
