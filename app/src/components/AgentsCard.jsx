import React, { useEffect, useState } from "react";
import { Store } from "../data/store.js";
import { BrandMark, ErrorLine } from "./ui.jsx";

/**
 * What the family's agents are doing, and a way to ask them to negotiate.
 *
 * They negotiate by themselves a short while after the plan changes. This card
 * says when, shows progress while they talk, and sums up what they last did.
 */

function minutesUntil(iso) {
  return Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
}

export function agentsLine(agents) {
  if (agents.state === "running") return agents.round ? `Negotiating now, round ${agents.round}` : "Negotiating now";
  if (agents.state === "queued") return "About to start negotiating";
  if (agents.state === "scheduled") {
    const minutes = minutesUntil(agents.scheduled_at);
    return minutes > 0 ? `Negotiating in about ${minutes} minute${minutes === 1 ? "" : "s"}` : "About to start negotiating";
  }
  return null;
}

export default function AgentsCard({ compact = false }) {
  const agents = Store.agents();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, tick] = useState(0);

  // Keep "in about N minutes" honest while the card is open.
  useEffect(() => {
    if (agents.state !== "scheduled") return undefined;
    const timer = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, [agents.state]);

  const working = agents.state === "running" || agents.state === "queued";
  const line = agentsLine(agents);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await Store.negotiate();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`side-card agents-card ${working ? "is-working" : ""} ${compact ? "is-compact" : ""}`} aria-live="polite">
      <div className="agents-head">
        <span className="msg-shoulder" aria-hidden="true">
          <BrandMark />
        </span>
        <div>
          <h3>Your family's agents</h3>
          <small>{agents.mode === "live" ? "Claude on Amazon Bedrock" : "Scripted agents, no model calls"}</small>
        </div>
      </div>

      {line ? (
        <p className="agents-status">
          {working && <i className="agent-pulse" aria-hidden="true" />}
          {line}
          {agents.reason && <span className="agents-reason"> ({agents.reason})</span>}
        </p>
      ) : (
        <p className="agents-status is-quiet">
          {/* The split they left is shown live in the fairness bar; the number here would go stale. */}
          {agents.last?.summary?.replace(/\s*The split is now \d+% apart\.$/, "") ||
            "They negotiate the plan whenever it changes, and ask the family only when they must."}
        </p>
      )}

      <ErrorLine error={error} />

      <div className="agents-actions">
        {working ? (
          !compact && (
            <a className="link" href="#/control/activity">
              Watch them in Agent activity
            </a>
          )
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={start}>
            {agents.state === "scheduled" ? "Start now" : "Negotiate now"}
          </button>
        )}
      </div>
    </section>
  );
}

