import React, { useState } from "react";
import privacyDemo from "@fixtures/privacy_demo.json";
import { Store, toPosition } from "../data/store.js";
import { Lock, Shield, Users } from "../components/Icons.jsx";

/**
 * The agent that speaks for you, and the moment it kept its mouth shut.
 *
 * The caught message below is real: fixtures/privacy_demo.json is written by
 * `python -m shoulder.demos.leak`, where a model is deliberately made to reveal
 * Farah's reason and a hook in code stops the reply before it leaves her
 * process. The draft is what it wrote. The sent line is what crossed the wire.
 */
export default function AgentVault({ activeUser }) {
  const [showDraft, setShowDraft] = useState(false);
  const principal = Store.getPrincipal(activeUser);
  if (!principal) return null;

  const position = toPosition(principal);
  const privates = principal.constraints.filter((c) => c.tier === "private");
  const caught =
    Store.getMode() === "demo" && privacyDemo.principal_id === activeUser && privacyDemo.blocked;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Your agent</h1>
          <p>It argues your corner, and keeps what you told it</p>
        </div>
      </header>

      <div className="two-up">
        <section className="panel panel-yours">
          <span className="panel-tag">
            <Lock size={13} /> Held for you
          </span>
          {privates.length ? (
            <ul className="held">
              {privates.map((c) => (
                <li key={c.id}>
                  <strong>{c.summary}</strong>
                  <span>{c.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tile-quiet">You have not told it anything private.</p>
          )}
        </section>

        <section className="panel panel-theirs">
          <span className="panel-tag">
            <Users size={13} /> Said on your behalf
          </span>
          <ul className="held">
            <li>
              <strong>{Math.round(position.capacity * 100)}% of a full share</strong>
              <span>what you said you can take on</span>
            </li>
            {position.unavailable_weekdays.length > 0 && (
              <li>
                <strong>Not {position.unavailable_weekdays.join(", ")}</strong>
                <span>the days, never the reason</span>
              </li>
            )}
            {position.refused_task_types.length > 0 && (
              <li>
                <strong>No {position.refused_task_types.join(", ")} work</strong>
                <span>the kind of work, never the reason</span>
              </li>
            )}
          </ul>
        </section>
      </div>

      {caught && (
        <section className="caught">
          <span className="panel-tag caught-tag">
            <Shield size={13} /> It stopped a message
          </span>
          <p className="caught-ask">{privacyDemo.attempt.split("\n\n")[1] || privacyDemo.attempt}</p>

          <div className="caught-pair">
            <div className="caught-side">
              <em>What it was about to say</em>
              {showDraft ? (
                <p className="caught-draft">{privacyDemo.draft_message}</p>
              ) : (
                <button className="btn-quiet" onClick={() => setShowDraft(true)}>
                  Show me what was blocked
                </button>
              )}
            </div>
            <div className="caught-side">
              <em>What the family got</em>
              <p className="caught-sent">{privacyDemo.sent_message}</p>
            </div>
          </div>

          <p className="caught-foot">
            Stopped on the words {privacyDemo.matched.map((w) => `"${w}"`).join(", ")}. Your
            family only learns that a check ran.
          </p>
        </section>
      )}
    </div>
  );
}
