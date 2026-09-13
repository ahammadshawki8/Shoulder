import React, { useMemo, useState } from "react";
import { Store } from "../data/store.js";
import Face from "./Face.jsx";
import { BrandMark } from "./ui.jsx";
import AgentsCard from "./AgentsCard.jsx";

/**
 * Everything the agents did, as a conversation.
 *
 * The negotiation writes one ledger entry per step: an opening split or a set
 * of suggested moves, the limit check putting moves back, whether the new split
 * was kept, each person's agent answering, and the engine measuring the result.
 * Entries from the same round are shown together, with a graph of how that
 * round went from proposal to verdict. Anything the family did in the app is
 * shown as a plain message between rounds.
 */

const ROUND_KINDS = new Set([
  "seeded_rota",
  "applied_precedent",
  "noted_change",
  "proposed_moves",
  "reversed_move",
  "kept_better_split",
  "asked_for_view",
  "measured_fairness",
  "published_rota",
  "withheld_private_detail",
]);
const DECISION_KINDS = new Set(["blocked_action", "raised_escalation"]);

const VERDICT = {
  accept: { word: "Works", tone: "ok" },
  counter: { word: "Wants changes", tone: "warn" },
  veto: { word: "Breaks a limit", tone: "danger" },
};

const ACTIONS = {
  arrange_paid_help: "Book paid help",
  drop_task: "Drop a task",
  change_capacity: "Change what someone can carry",
};

function groupKey(entry) {
  // Rounds restart in every negotiation, so a round belongs to its run.
  if (entry.round && ROUND_KINDS.has(entry.kind)) return `round-${entry.run || "seed"}-${entry.round}`;
  if (DECISION_KINDS.has(entry.kind)) return "decision";
  return null;
}

/** Oldest first, with consecutive entries of one round or one decision together. */
export function buildTimeline(ledger) {
  const groups = [];
  for (const entry of [...ledger].reverse()) {
    const key = groupKey(entry);
    const last = groups[groups.length - 1];
    if (key && last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, entries: [entry], id: entry.id });
    }
  }
  return groups;
}

function when(at) {
  const d = new Date(at);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

// -- the window ----------------------------------------------------------------------

export default function AgentActivity() {
  const ledger = Store.ledger();
  const groups = useMemo(() => buildTimeline(ledger), [ledger]);
  const rounds = groups.filter((g) => g.key?.startsWith("round-")).length;
  const members = Store.members();

  return (
    <section className="console" aria-label="Steps taken by Shoulder and each person's agent">
      <header className="console-head">
        <div className="console-people" aria-hidden="true">
          <span className="msg-shoulder">
            <BrandMark />
          </span>
          {members.map((m) => (
            <Face key={m.id} person={Store.person(m.id)} size={30} />
          ))}
        </div>
        <div>
          <h2>
            Shoulder and {members.length} personal agent{members.length === 1 ? "" : "s"}
          </h2>
          <p>
            {ledger.length
              ? `${ledger.length} steps taken without asking${rounds ? `, across ${rounds} negotiation round${rounds === 1 ? "" : "s"}` : ""}. Oldest first.`
              : "Nothing yet."}
          </p>
        </div>
      </header>

      <div className="console-agents">
        <AgentsCard compact />
      </div>

      <div className="console-body">
        {groups.length === 0 && (
          <p className="console-empty">
            When the agents negotiate, or anyone changes the plan, every step is written here with the rule that
            allowed it.
          </p>
        )}
        {groups.map((group) =>
          group.key?.startsWith("round-") ? (
            <Round key={group.id} group={group} />
          ) : group.key === "decision" ? (
            <Decision key={group.id} group={group} />
          ) : (
            <Message key={group.id} entry={group.entries[0]} />
          )
        )}
      </div>
    </section>
  );
}

// -- messages ----------------------------------------------------------------------------

function speaker(entry) {
  if (!entry.who || entry.who === "convener") {
    return { name: "Shoulder", agent: true, person: null };
  }
  const person = Store.person(entry.who);
  const short = person ? (person.isMe ? "Your" : `${person.shortName}'s`) : "An";
  if (entry.kind === "asked_for_view") {
    return { name: `${short} agent`, agent: true, person };
  }
  return { name: person ? (person.isMe ? "You" : person.shortName) : "Someone", agent: false, person };
}

function Message({ entry, compact = false }) {
  const [open, setOpen] = useState(false);
  const who = speaker(entry);
  const verdict = entry.kind === "asked_for_view" ? VERDICT[entry.details?.verdict] : null;

  return (
    <div className={`msg ${who.agent ? "is-agent" : "is-person"} ${compact ? "is-compact" : ""}`}>
      <span className="msg-avatar" aria-hidden="true">
        {who.person ? (
          <Face person={who.person} size={30} />
        ) : (
          <span className="msg-shoulder">
            <BrandMark />
          </span>
        )}
        {who.agent && who.person && <i className="msg-agent-badge" />}
      </span>
      <div className="msg-bubble">
        <div className="msg-meta">
          <strong>{who.name}</strong>
          {verdict && <span className={`msg-verdict is-${verdict.tone}`}>{verdict.word}</span>}
          <time dateTime={entry.at}>{when(entry.at)}</time>
        </div>
        <p>{entry.summary}</p>
        {entry.justification && (
          <>
            <button type="button" className="msg-why" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Hide why" : "Why it was allowed"}
            </button>
            {open && <p className="msg-rule">{entry.justification}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// -- a negotiation round ----------------------------------------------------------------

function summariseRound(entries) {
  const opening = entries.find((e) => e.kind === "seeded_rota");
  const proposed = entries.find((e) => e.kind === "proposed_moves");
  const reversed = entries.filter((e) => e.kind === "reversed_move");
  const rejected = entries.find((e) => e.kind === "kept_better_split");
  const answers = entries.filter((e) => e.kind === "asked_for_view");
  const measured = entries.find((e) => e.kind === "measured_fairness");
  const moves = proposed?.details?.moves?.length ?? Number(proposed?.summary.match(/Suggested (\d+)/)?.[1] || 0);
  return { opening, proposed, reversed, rejected, answers, measured, moves };
}

function Round({ group }) {
  const [showGraph, setShowGraph] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const round = group.entries[0].round;
  const r = summariseRound(group.entries);
  const spread = r.measured?.details?.max_deviation;
  const fair = r.measured?.details?.proportional;

  return (
    <div className="round">
      <div className="round-head">
        <div>
          <strong>Round {round}</strong>
          <span>
            {group.entries.length} steps
            {spread !== undefined ? `, ended ${pct(spread)} apart` : ""}
          </span>
        </div>
        <div className="round-actions">
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={showGraph} onClick={() => setShowGraph(!showGraph)}>
            {showGraph ? "Hide decision graph" : "Decision graph"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>
            {showSteps ? "Hide steps" : "Show steps"}
          </button>
        </div>
      </div>

      {showGraph && <RoundGraph r={r} fair={fair} spread={spread} />}

      {!showGraph && !showSteps && <RoundStrip r={r} spread={spread} fair={fair} />}

      {showSteps && (
        <div className="round-steps">
          {group.entries.map((entry) => (
            <Message key={entry.id} entry={entry} compact />
          ))}
        </div>
      )}
    </div>
  );
}

/** One line per round when collapsed: who answered, and where it ended. */
function RoundStrip({ r, spread, fair }) {
  return (
    <div className="round-strip">
      {r.answers.map((a) => {
        const person = Store.person(a.who);
        const v = VERDICT[a.details?.verdict] || VERDICT.accept;
        return (
          <span key={a.id} className="round-strip-agent" title={`${person?.shortName}'s agent: ${v.word}`}>
            <Face person={person} size={22} />
            <i className={`dot is-${v.tone}`} />
          </span>
        );
      })}
      {spread !== undefined && (
        <span className={`round-strip-result ${fair ? "is-ok" : "is-warn"}`}>
          {fair ? "Fair" : "Not fair yet"}, {pct(spread)} apart
        </span>
      )}
    </div>
  );
}

function Node({ label, value, tone, children }) {
  return (
    <div className={`gnode ${tone ? `is-${tone}` : ""}`}>
      <small>{label}</small>
      {value && <strong>{value}</strong>}
      {children}
    </div>
  );
}

function RoundGraph({ r, fair, spread }) {
  const tried = r.moves - r.reversed.length;
  return (
    <div className="graph" role="img" aria-label="How this round went from proposal to verdict">
      <div className="graph-stage">
        {r.opening ? (
          <Node
            label={/current plan/.test(r.opening.summary) ? "Shoulder started from" : "Shoulder drew up"}
            value={/current plan/.test(r.opening.summary) ? "The family's plan" : "An opening split"}
          />
        ) : (
          <Node label="Shoulder suggested" value={`${r.moves} move${r.moves === 1 ? "" : "s"}`} />
        )}
      </div>

      {r.proposed && (
        <>
          <span className="graph-arrow" aria-hidden="true" />
          <div className="graph-stage">
            <Node
              label="Limit check, in code"
              value={r.reversed.length ? `${r.reversed.length} put back` : "All within limits"}
              tone={r.reversed.length ? "warn" : "ok"}
            />
          </div>
          <span className="graph-arrow" aria-hidden="true" />
          <div className="graph-stage">
            <Node
              label={`Tried ${Math.max(tried, 0)}`}
              value={r.rejected ? "Less even, kept the earlier split" : "Fairer, kept"}
              tone={r.rejected ? "warn" : "ok"}
            />
          </div>
        </>
      )}

      <span className="graph-arrow" aria-hidden="true" />
      <div className="graph-stage graph-fan">
        <small className="graph-fan-label">Each person's agent answered</small>
        {r.answers.map((a) => {
          const person = Store.person(a.who);
          const v = VERDICT[a.details?.verdict] || VERDICT.accept;
          return (
            <div key={a.id} className={`gagent is-${v.tone}`}>
              <Face person={person} size={22} />
              <span>{person ? (person.isMe ? "Your agent" : `${person.shortName}'s agent`) : "An agent"}</span>
              <b>{v.word}</b>
            </div>
          );
        })}
      </div>

      {spread !== undefined && (
        <>
          <span className="graph-arrow" aria-hidden="true" />
          <div className="graph-stage">
            <Node label="Engine measured" value={`${pct(spread)} apart`} tone={fair ? "ok" : "warn"}>
              <em>{fair ? "Within what the family allows" : "Over what the family allows"}</em>
            </Node>
          </div>
        </>
      )}
    </div>
  );
}

// -- a decision handed to the family ----------------------------------------------------

function Decision({ group }) {
  const [showGraph, setShowGraph] = useState(true);
  const blocked = group.entries.filter((e) => e.kind === "blocked_action");
  const raised = group.entries.filter((e) => e.kind === "raised_escalation");

  return (
    <div className="round is-decision">
      <div className="round-head">
        <div>
          <strong>Handed to the family</strong>
          <span>
            {raised.length} decision{raised.length === 1 ? "" : "s"} it would not make alone
          </span>
        </div>
        <div className="round-actions">
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={showGraph} onClick={() => setShowGraph(!showGraph)}>
            {showGraph ? "Hide decision graph" : "Decision graph"}
          </button>
        </div>
      </div>

      {showGraph && (
        <div className="graph" role="img" aria-label="How Shoulder stopped and asked the family">
          <div className="graph-stage">
            <Node label="Shoulder wanted to" value={blocked.length ? ACTIONS[blocked[0].details?.tool] || "Act on its own" : "Close the gap"} />
          </div>
          <span className="graph-arrow" aria-hidden="true" />
          <div className="graph-stage">
            <Node
              label="Authority check, in code"
              value={blocked.length ? "Not its decision" : "No fair split inside the limits"}
              tone="warn"
            />
          </div>
          <span className="graph-arrow" aria-hidden="true" />
          <div className="graph-stage">
            <Node label="Asked the family" value={`${raised.length} card${raised.length === 1 ? "" : "s"} in Needs you`} tone="accent" />
          </div>
        </div>
      )}

      <div className="round-steps">
        {group.entries.map((entry) => (
          <Message key={entry.id} entry={entry} compact />
        ))}
      </div>
    </div>
  );
}
