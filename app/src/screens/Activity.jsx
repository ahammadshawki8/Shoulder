import React, { useState } from "react";
import { Store } from "../data/store.js";
import { Clock, CheckCircle, Shield, Calendar, Pill, AlertCircle, ArrowRight } from "../components/Icons.jsx";

export default function Activity() {
  const ledger = Store.getLedger();
  const [filter, setFilter] = useState("all");

  // Format real ledger entries into visual timeline events
  const events = ledger
    .filter((e) => !["measured_fairness", "kept_better_split"].includes(e.kind))
    .slice(0, 15);

  const getIcon = (kind) => {
    switch (kind) {
      case "applied_precedent":
        return <CheckCircle size={15} style={{ color: "var(--badge-success)" }} />;
      case "withheld_private_detail":
      case "blocked_action":
        return <Shield size={15} style={{ color: "var(--accent-primary)" }} />;
      case "reversed_move":
        return <Clock size={15} style={{ color: "var(--accent-secondary)" }} />;
      default:
        return <Calendar size={15} style={{ color: "var(--text-soft)" }} />;
    }
  };

  return (
    <div className="transparency-screen">
      <div className="screen-header-simple">
        <h2 className="screen-simple-title">Activity & Audit Timeline</h2>
        <span className="screen-simple-tag">Automated Coordination</span>
      </div>

      <p className="screen-caption-quiet">
        A real-time audit record of every routine action taken by the agents in the background. Nothing happens without an explicit reason recorded here.
      </p>

      <div className="activity-timeline-wrap">
        {events.map((item, index) => {
          return (
            <div key={item.id || index} className="activity-timeline-row">
              <div className="activity-time-col">
                <span className="activity-time-stamp">
                  Round {item.round_number == null ? "Auto" : item.round_number}
                </span>
              </div>

              <div className="activity-icon-spine">
                <div className="activity-icon-bubble">
                  {getIcon(item.kind)}
                </div>
                {index < events.length - 1 && <div className="activity-spine-line" />}
              </div>

              <div className="activity-details-col">
                <div className="activity-headline">{item.summary}</div>
                {item.justification && (
                  <div className="activity-justification">
                    <strong>Rule:</strong> {item.justification}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
