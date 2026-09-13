import React, { useState } from "react";
import { RELATIONS, Store } from "../data/store.js";
import ProfileFields, { EMPTY_PROFILE, toProfile } from "../components/ProfileFields.jsx";
import { Brand, ErrorLine, ThemeToggle } from "../components/ui.jsx";
import { Check, ChevronRight, Copy, Key, Plus } from "../components/Icons.jsx";
import HeroAnimation from "../components/HeroAnimation.jsx";

/**
 * Getting into a family.
 *
 *   landing        two choices
 *   create 1 of 2  who you are caring for
 *   create 2 of 2  about you
 *   join           family code, and member ID if you have one
 *   join profile   about you, for someone new to the family
 *   codes          the family code and member ID, shown once they exist
 */
export default function Auth({ theme, onToggleTheme }) {
  const [step, setStep] = useState("landing");
  const [codes, setCodes] = useState(null);
  const [joining, setJoining] = useState(null); // { code, recipientName }

  const go = (next) => {
    setStep(next);
    window.scrollTo(0, 0);
  };

  let body;
  if (step === "landing") body = <Landing onJoin={() => go("join")} onCreate={() => go("create")} />;
  if (step === "create")
    body = (
      <Create
        onBack={() => go("landing")}
        onCreated={(result) => {
          setCodes({ ...result, isNewFamily: true });
          go("codes");
        }}
      />
    );
  if (step === "join")
    body = (
      <Join
        onBack={() => go("landing")}
        onNewMember={(found) => {
          setJoining(found);
          go("join-profile");
        }}
      />
    );
  if (step === "join-profile")
    body = (
      <JoinProfile
        family={joining}
        onBack={() => go("join")}
        onJoined={(result) => {
          setCodes({ ...result, isNewFamily: false });
          go("codes");
        }}
      />
    );
  if (step === "codes") body = <Codes codes={codes} />;

  return (
    <div className={`auth ${step === "landing" ? "is-landing" : ""}`}>
      <div className="auth-top">
        <Brand onClick={() => go("landing")} label="Shoulder, back to the start" />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <main className="auth-body">{body}</main>
    </div>
  );
}

// -- landing ----------------------------------------------------------------------

function Landing({ onJoin, onCreate }) {
  return (
    <div className="landing">
      <div className="landing-copy">
        <h1>Nobody should carry the care of a parent alone.</h1>
        <p className="landing-lede">
          Each of you tells Shoulder what you can and cannot do. It works out a fair split of the month,
          keeps your reasons to itself, and only asks the family when it has to.
        </p>

        <div className="choices">
          <button type="button" className="choice" onClick={onJoin}>
            <span className="choice-icon" aria-hidden="true">
              <Key size={20} />
            </span>
            <span className="choice-text">
              <strong>Join an existing family</strong>
              <span>You have a family code from a sibling, or you are logging back in.</span>
            </span>
            <ChevronRight size={20} />
          </button>
          <button type="button" className="choice is-primary" onClick={onCreate}>
            <span className="choice-icon" aria-hidden="true">
              <Plus size={20} />
            </span>
            <span className="choice-text">
              <strong>Create your own family</strong>
              <span>Set up a family for the person you care for, and get a code to share.</span>
            </span>
            <ChevronRight size={20} />
          </button>
        </div>

      </div>

      <HeroAnimation />

      <ul className="landing-facts">
        <li>
          <strong>3 in 4</strong>
          <span>families where one adult child ends up doing the caring</span>
        </li>
        <li>
          <strong>Measured, not guessed</strong>
          <span>the split is calculated against what each person can carry</span>
        </li>
        <li>
          <strong>Your reasons stay yours</strong>
          <span>your family sees which days you cannot do, never why</span>
        </li>
      </ul>
    </div>
  );
}

// -- create -------------------------------------------------------------------------

function Create({ onBack, onCreated }) {
  const [page, setPage] = useState(1);
  const [recipient, setRecipient] = useState({ name: "", relation: "Mum", note: "" });
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (page === 1) {
    return (
      <>
        <header className="auth-head">
          <p className="auth-step">Step 1 of 2</p>
          <h1>Who are you caring for?</h1>
          <p>Your siblings will see this when they join.</p>
        </header>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (recipient.name.trim()) setPage(2);
          }}
        >
          <div className="field">
            <label className="field-label" htmlFor="recipient-name">
              Their name
            </label>
            <input
              id="recipient-name"
              className="input"
              value={recipient.name}
              maxLength={80}
              autoFocus
              onChange={(e) => setRecipient({ ...recipient, name: e.target.value })}
            />
          </div>

          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label" style={{ marginBottom: "0.45rem" }}>
              They are your
            </legend>
            <div className="chips">
              {RELATIONS.map((relation) => (
                <button
                  type="button"
                  key={relation}
                  className="chip"
                  aria-pressed={recipient.relation === relation}
                  onClick={() => setRecipient({ ...recipient, relation })}
                >
                  {relation}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label className="field-label" htmlFor="recipient-note">
              Anything the family should keep in mind
            </label>
            <input
              id="recipient-note"
              className="input"
              value={recipient.note}
              maxLength={200}
              onChange={(e) => setRecipient({ ...recipient, note: e.target.value })}
            />
            <span className="field-hint">Optional. For example, reduced mobility.</span>
          </div>

          <div className="auth-actions">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Back
            </button>
            <button type="submit" className="btn btn-primary" disabled={!recipient.name.trim()}>
              Continue
            </button>
          </div>
        </form>
      </>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!profile.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await Store.createFamily(
        { name: recipient.name.trim(), relation: recipient.relation, note: recipient.note.trim() },
        toProfile(profile)
      );
      onCreated(result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <header className="auth-head">
        <p className="auth-step">Step 2 of 2</p>
        <h1>About you</h1>
        <p>Only you can add yourself. Your siblings add themselves when they join.</p>
      </header>
      <form className="form" onSubmit={submit}>
        <ProfileFields values={profile} onChange={setProfile} />
        <ErrorLine error={error} />
        <div className="auth-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPage(1)} disabled={busy}>
            Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !profile.name.trim()}>
            {busy ? "Creating family" : "Create family"}
          </button>
        </div>
      </form>
    </>
  );
}

// -- join -----------------------------------------------------------------------------

function Join({ onBack, onNewMember }) {
  const [code, setCode] = useState("");
  const [memberId, setMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const family = code.trim();
    if (!family) return;
    setBusy(true);
    setError("");
    try {
      if (memberId.trim()) {
        await Store.login(family, memberId.trim());
        return;
      }
      const found = await Store.lookupFamily(family);
      onNewMember({ code: found.family_code, recipientName: found.recipient_name });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <header className="auth-head">
        <h1>Join your family</h1>
        <p>Enter the family code a sibling shared with you.</p>
      </header>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="join-code">
            Family code
          </label>
          <input
            id="join-code"
            className="input input-code"
            value={code}
            maxLength={24}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="join-member">
            Member ID
          </label>
          <input
            id="join-member"
            className="input input-code"
            value={memberId}
            maxLength={40}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            onChange={(e) => setMemberId(e.target.value)}
          />
          <span className="field-hint">
            If you are joining for the first time, leave this empty. You will get one next.
          </span>
        </div>

        <ErrorLine error={error} />

        <div className="auth-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
            {busy ? "Checking" : memberId.trim() ? "Log in" : "Continue"}
          </button>
        </div>
      </form>

      <p className="auth-foot">
        Looking around? Use family code <strong>rahman</strong> and member ID <strong>farah</strong>.
      </p>
    </>
  );
}

function JoinProfile({ family, onBack, onJoined }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!profile.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      onJoined(await Store.joinFamily(family.code, toProfile(profile)));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <header className="auth-head">
        <h1>About you</h1>
        <p>You are joining the family caring for {family.recipientName}.</p>
      </header>
      <form className="form" onSubmit={submit}>
        <ProfileFields values={profile} onChange={setProfile} />
        <ErrorLine error={error} />
        <div className="auth-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !profile.name.trim()}>
            {busy ? "Joining family" : "Join family"}
          </button>
        </div>
      </form>
    </>
  );
}

// -- codes ----------------------------------------------------------------------------

function CodeBlock({ label, note, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard can be blocked; the code is still on screen to copy by hand */
    }
  };
  return (
    <div className="code">
      <div className="code-head">
        <span className="code-label">{label}</span>
        <span className="code-note">{note}</span>
      </div>
      <div className="code-row">
        <span className="code-value">{value}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Codes({ codes }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="auth-head">
        <h1>Keep these two codes</h1>
        <p>
          You need both to log in again.{" "}
          {codes.isNewFamily
            ? "Share the family code with your siblings so they can join. Keep your member ID to yourself."
            : "Keep your member ID to yourself."}
        </p>
      </header>

      <div className="codes">
        <CodeBlock label="Family code" note="Share with your siblings" value={codes.family_code} />
        <CodeBlock label="Member ID" note="Only for you" value={codes.member_id} />
      </div>

      <p className="notice">You can find both again in Control Panel while you are logged in.</p>

      <div className="auth-actions" style={{ marginTop: "1.5rem" }}>
        <span />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await Store.boot();
          }}
        >
          {codes.isNewFamily ? "Go to your family" : "Go to the family"}
        </button>
      </div>
    </>
  );
}
