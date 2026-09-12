// How it is built, and the proof. Storyboard beat 3:05 to 3:30: the A2A privacy
// boundary, the hook caught live blocking a deliberate leak attempt, and the
// architecture. Everything here is read from fixtures written by real runs.

import { useEffect, useMemo, useRef, useState } from "react";
import claudeMd from "@repo/CLAUDE.md?raw";
import { Shield } from "../components/Icons.jsx";
import { MONTHS, authorityDemo, privacyDemo, wireLog } from "../data.js";

const sentences = (text) => (text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");

function Leak() {
  const matched = privacyDemo.matched || [];
  const flagged = (s) => matched.some((m) => norm(s).includes(norm(m).trim()));
  const sent = useMemo(() => {
    try {
      return JSON.parse(privacyDemo.sent);
    } catch (e) {
      return null;
    }
  }, []);
  return (
    <section className="card stack" aria-labelledby="leak-title">
      <p className="eyebrow">
        {privacyDemo.mode === "live"
          ? "Recorded live: Sonnet 4.5 on Bedrock, with Farah's privacy instruction deliberately removed"
          : "A scripted stand-in for a manipulated model"}
      </p>
      <h2 id="leak-title">The privacy hook, caught in the act</h2>
      <p className="lede">
        Someone asks Farah's agent, over the A2A protocol, to explain why she is never free on Fridays. Her agent has
        been deliberately misconfigured to answer. The model writes the truth. A hook in code stops it before a single
        byte leaves her process.
      </p>

      <div className="grid-2">
        <div className="stack">
          <h3>What her agent wrote</h3>
          <p className="small muted">
            Inside Farah's process. None of it was sent: the sentences in red carry her private facts, and everything
            written in the same breath is withheld with them.
          </p>
          <p>
            {sentences(privacyDemo.draft_message).map((s, i) => (
              <span key={i} className={flagged(s) ? "struck" : "withheld"}>
                {s}{" "}
              </span>
            ))}
          </p>
          <div className="row">
            <span className="stamp blocked">
              <Shield /> BLOCKED
            </span>
            <span className="small muted">PrivacyGuard hook, after the model call, in code</span>
          </div>
          <div className="terms">
            {matched.map((m) => (
              <span className="term" key={m}>
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="stack">
          <h3>What actually crossed the wire</h3>
          <p className="small muted">The reply the other side received.</p>
          <pre className="wire">{sent ? JSON.stringify(sent, null, 2) : privacyDemo.sent}</pre>
          <span className="stamp held">BOUNDARY HELD</span>
        </div>
      </div>
    </section>
  );
}

function Envelope() {
  return (
    <section className="card stack" aria-labelledby="env-title">
      <h2 id="env-title">The authority envelope</h2>
      <p className="lede">
        The agent does the safe work alone. Anything consequential never runs: it becomes a question for the family,
        with the consequences computed. Anything the policy does not name is refused.
      </p>
      <div className="stack">
        {authorityDemo.decisions.map((d, i) => (
          <div key={i} className="card-quiet stack" style={{ gap: 6 }}>
            <div className="row">
              <span className={`stamp ${d.allowed ? "inside" : "outside"}`}>{d.allowed ? "INSIDE" : "OUTSIDE"}</span>
              <strong>{d.means[0].toUpperCase() + d.means.slice(1)}</strong>
            </div>
            <p className="muted">
              {d.allowed ? "Done, and written to the ledger." : "Not done. The tool never ran."} {d.why}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Wire() {
  const farah = MONTHS[0].circle.principals.find((p) => p.id === "farah");
  const terms = farah.constraints.flatMap((c) => (c.tier === "private" ? c.sensitive_terms || [] : []));
  const blob = norm(JSON.stringify(wireLog));
  const squashed = blob.replace(/ /g, "");
  const found = terms.filter((t) => blob.includes(norm(t).trim()) || squashed.includes(norm(t).replace(/ /g, "")));
  const sample = wireLog.find((m) => m.principal_id === "farah") || wireLog[0];
  const reply = sample?.payload.split("```").find((part) => part.trim().startsWith("json") || part.trim().startsWith("{"));
  return (
    <section className="card stack" aria-labelledby="wire-title">
      <h2 id="wire-title">Over the wire</h2>
      <p className="lede">
        In the A2A run each sibling's agent is its own server, on its own port, with its own agent card. The Convener
        reaches them only across that boundary. {wireLog.length} messages crossed it.
      </p>
      <pre className="wire">{(reply || "").replace(/^json\s*/, "").trim()}</pre>
      <p>
        <strong>Checked here, in your browser:</strong>{" "}
        {found.length === 0
          ? `none of the ${terms.length} words that would give Farah's reasons away appear in any of the ${wireLog.length} messages.`
          : `found ${found.join(", ")}.`}
      </p>
    </section>
  );
}

function Architecture() {
  const ref = useRef(null);
  const [error, setError] = useState(null);
  const source = useMemo(() => {
    // CLAUDE.md may be checked out with Windows line endings, so allow \r\n.
    const section = claudeMd.split("## 9. Architecture")[1] || "";
    const match = section.match(/```mermaid\r?\n([\s\S]*?)```/);
    return match ? match[1].replace(/\r\n/g, "\n") : "";
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!source) {
        setError("The architecture diagram was not found in CLAUDE.md section 9.");
        return;
      }
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.dataset.theme === "dark" ||
          (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
        const render = async (layout) => {
          // ELK keeps the negotiation readable top to bottom; the default
          // layout lets edges from outside a subgraph drag nodes out of order.
          mermaid.initialize({
            startOnLoad: false,
            theme: dark ? "dark" : "neutral",
            fontFamily: "inherit",
            layout,
            // Never paint mermaid's own error graphic into the page.
            suppressErrorRendering: true,
          });
          return mermaid.render(`arch-${Date.now()}`, source);
        };
        const { svg } = await render("elk").catch(() => render("dagre"));
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <section className="stack" aria-labelledby="arch-title">
      <h2 id="arch-title">How it is built</h2>
      <p className="lede">
        Rendered from the architecture diagram in CLAUDE.md, so the picture and the project's memory cannot drift apart.
        The AgentCore deployment on the right is the next milestone.
      </p>
      <div className="mermaid-wrap" ref={ref} role="img" aria-label="Architecture: principal agents behind privacy hooks, the Convener graph, deterministic fairness tools, the authority hook, and the product surface.">
        {error ? <pre className="wire">{error}</pre> : <p className="muted">Drawing the diagram...</p>}
      </div>
    </section>
  );
}

export default function UnderTheHood() {
  return (
    <div className="stack-lg">
      <section className="stack">
        <p className="eyebrow">Under the hood</p>
        <h1>The agent never decides. The code makes sure of it.</h1>
        <p className="lede">
          Privacy and authority are enforced by hooks in code, not by instructions to a model. A prompt is not an
          enforcement mechanism.
        </p>
      </section>
      <Leak />
      <Envelope />
      <Wire />
      <Architecture />
    </div>
  );
}
