// The fairness bar: the hero component.
//
// One bar per person, capacity-adjusted: weighted hours of care divided by the
// capacity they declared, so "fair" means proportional to what each person said
// they can carry, not an even split. The shaded band is the fair range, the
// circle's mean plus or minus the tolerance. A bar outside it is carrying too
// much or too little for their capacity.
//
// Solid bars are the working rota. A round can try a split and have the
// fairness engine reject it; that attempt is the faint bar, so the negotiation
// is visible honestly: what was tried, and what survived. Widths are on one
// scale across every round, so movement between rounds is real movement.

import { useMemo, useState } from "react";
import { FAIRNESS_TOLERANCE, PERSON_ORDER, personVar } from "../data.js";

// Always the signed figure, so the bars and the headline read as one story:
// the fair level is the circle's mean, and "within range" alone hid that a
// person inside the band can still be carrying more than someone outside it.
function relative(share, mean) {
  if (!mean) return "no load yet";
  const dev = (share - mean) / mean;
  const size = Math.round(Math.abs(dev) * 100);
  if (size === 0) return "at the fair level";
  const side = `${size} percent ${dev > 0 ? "above" : "below"} fair`;
  return Math.abs(dev) <= FAIRNESS_TOLERANCE ? side : `${side}, outside the range`;
}

const sortBurdens = (burdens) =>
  [...burdens].sort((a, b) => PERSON_ORDER.indexOf(a.principal_id) - PERSON_ORDER.indexOf(b.principal_id));

export default function FairnessBar({ report, tried = null, scaleMax, caption }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const working = useMemo(() => sortBurdens(report.burdens), [report]);
  const triedBy = useMemo(() => Object.fromEntries((tried?.burdens || []).map((b) => [b.principal_id, b])), [tried]);

  const mean = report.mean_adjusted_share;
  const x = (v) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const bandLeft = mean * (1 - FAIRNESS_TOLERANCE);
  const bandRight = mean * (1 + FAIRNESS_TOLERANCE);

  return (
    <figure className="fair-chart" style={{ margin: 0 }} aria-label={caption}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="legend" aria-hidden="true">
          <span>
            <i /> Working rota
          </span>
          {tried && (
            <span>
              <i className="ghost" /> Tried this round
            </span>
          )}
          <span>
            <i className="band" /> Fair range for everyone's capacity
          </span>
        </div>
        <button className="filter" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>
          {asTable ? "Show as bars" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Tasks</th>
                <th className="num">Hours</th>
                <th className="num">Capacity</th>
                <th className="num">Load for capacity</th>
                {tried && <th className="num">Tried</th>}
                <th>Against the fair level</th>
              </tr>
            </thead>
            <tbody>
              {working.map((b) => (
                <tr key={b.principal_id}>
                  <td>
                    <span className="person-chip">
                      <span className="dot" style={{ background: personVar(b.principal_id) }} />
                      {b.name}
                    </span>
                  </td>
                  <td className="num">{b.task_count}</td>
                  <td className="num">{b.raw_hours.toFixed(1)}</td>
                  <td className="num">{b.capacity}</td>
                  <td className="num">{b.adjusted_share.toFixed(1)}</td>
                  {tried && <td className="num">{triedBy[b.principal_id]?.adjusted_share.toFixed(1) ?? ""}</td>}
                  <td>{relative(b.adjusted_share, mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="fair-axis" aria-hidden="true">
            <span />
            <div className="band-caption">
              <span style={{ left: x(mean) }}>fair level</span>
            </div>
          </div>
          {working.map((b) => {
            const t = triedBy[b.principal_id];
            const showGhost = t && Math.abs(t.adjusted_share - b.adjusted_share) > 0.05;
            const describe =
              `${b.name}: ${b.task_count} tasks, ${b.raw_hours.toFixed(1)} hours, capacity ${b.capacity}. ` +
              `Load for capacity ${b.adjusted_share.toFixed(1)}, ${relative(b.adjusted_share, mean)}.` +
              (showGhost ? ` This round tried ${t.adjusted_share.toFixed(1)}, and it was not kept.` : "");
            return (
              <div className="fair-row" key={b.principal_id}>
                <div className="fair-name">
                  <span className="dot" style={{ background: personVar(b.principal_id) }} />
                  {b.name}
                </div>
                <div className="fair-track">
                  <div className="fair-band" style={{ left: x(bandLeft), width: `calc(${x(bandRight)} - ${x(bandLeft)})` }} />
                  <div className="fair-mean" style={{ left: x(mean) }} />
                  <div
                    className={`fair-ghost ${showGhost ? "" : "is-hidden"}`}
                    style={{ width: x(t ? t.adjusted_share : b.adjusted_share), background: personVar(b.principal_id) }}
                  />
                  <div className="fair-bar" style={{ width: x(b.adjusted_share), background: personVar(b.principal_id) }} />
                  <div className="fair-label" style={{ left: x(b.adjusted_share) }}>
                    <strong>{b.adjusted_share.toFixed(0)}</strong>
                    <span className="rel">{relative(b.adjusted_share, mean)}</span>
                  </div>
                  <button
                    className="fair-hit"
                    aria-label={describe}
                    onMouseEnter={() => setHover({ id: b.principal_id, text: describe })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ id: b.principal_id, text: describe })}
                    onBlur={() => setHover(null)}
                  />
                  {hover?.id === b.principal_id && (
                    <div className="tooltip" role="tooltip" style={{ left: x(b.adjusted_share), top: "46px" }}>
                      {hover.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
      {caption && <figcaption className="small muted">{caption}</figcaption>}
    </figure>
  );
}
