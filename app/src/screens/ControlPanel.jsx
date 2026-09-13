import React, { useEffect, useState } from "react";
import { DISTANCES, RELATIONS, Store, TYPE_META, WEEKDAYS } from "../data/store.js";
import { Check, Copy, Lock } from "../components/Icons.jsx";
import Face from "../components/Face.jsx";
import { ErrorLine, Modal, ThemeToggle, useStore, useToast } from "../components/ui.jsx";

const TABS = [
  { id: "you", label: "You" },
  { id: "family", label: "Family" },
  { id: "activity", label: "Activity" },
];

export default function ControlPanel({ theme, onToggleTheme }) {
  useStore();
  const [tab, setTab] = useState("you");
  const [toast, say] = useToast();

  return (
    <div className="page">
      {toast}
      <header className="page-head">
        <div>
          <h1>Control Panel</h1>
          <p>Your limits, your family, and everything Shoulder did without asking.</p>
        </div>
        <div className="page-head-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Control Panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "you" && <YouTab say={say} />}
        {tab === "family" && <FamilyTab say={say} />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </div>
  );
}

// -- you ------------------------------------------------------------------------------

function CopyValue({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <div className="code-head">
        <span className="code-label">{label}</span>
      </div>
      <div className="code-row">
        <span className="code-value" style={{ fontSize: "var(--t-lg)" }}>
          {value}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked; the value is visible */
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function YouTab({ say }) {
  const meId = Store.meId();
  const me = Store.me();
  const person = Store.person(meId);
  const shared = Store.shared(meId);
  const fixed = Store.fixedDays(meId);
  const privateLimits = me.constraints.filter((c) => c.tier === "private");

  const [name, setName] = useState(me.name);
  const [capacity, setCapacity] = useState(Math.round(me.capacity * 100));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setName(me.name);
    setCapacity(Math.round(me.capacity * 100));
  }, [me.name, me.capacity]);

  const save = async (fields, message) => {
    setBusy(true);
    setError("");
    try {
      await Store.updateMe(fields);
      if (message) say(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("That photo is too large. Please use one under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => save({ avatar: reader.result }, "Photo updated");
    reader.readAsDataURL(file);
  };

  const distanceValue = DISTANCES.some((d) => d.value === me.distance_km) ? me.distance_km : "custom";

  return (
    <>
      <section className="settings-grid">
        <header>
          <h2>Your codes</h2>
          <p>You need both to log in on another device. Share only the family code.</p>
        </header>
        <div className="stack">
          <CopyValue label="Family code" value={Store.familyCode()} />
          <CopyValue label="Member ID" value={meId} />
        </div>
      </section>

      <section className="settings-grid">
        <header>
          <h2>Profile</h2>
          <p>Changing how much you can take on or how far away you are deals the open work out again.</p>
        </header>
        <div className="form">
          <div className="photo-row">
            <Face person={person} size={56} />
            <label className="btn btn-secondary btn-sm">
              Change photo
              <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} />
            </label>
            {me.avatar && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save({ clear_avatar: true }, "Photo removed")}>
                Remove
              </button>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="me-name">
              Your name
            </label>
            <input
              id="me-name"
              className="input"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== me.name && save({ name: name.trim() }, "Name saved")}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="me-capacity">
              How much of the care you can take on
            </label>
            <div className="range-row">
              <input
                id="me-capacity"
                className="range"
                type="range"
                min="20"
                max="100"
                step="5"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                onMouseUp={() => capacity / 100 !== me.capacity && save({ capacity: capacity / 100 }, "Capacity saved, split worked out again")}
                onTouchEnd={() => capacity / 100 !== me.capacity && save({ capacity: capacity / 100 }, "Capacity saved, split worked out again")}
                onKeyUp={() => capacity / 100 !== me.capacity && save({ capacity: capacity / 100 }, "Capacity saved, split worked out again")}
              />
              <span className="range-value">{capacity}%</span>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="me-distance">
              How far you live from them
            </label>
            <select
              id="me-distance"
              className="select"
              value={distanceValue}
              disabled={busy}
              onChange={(e) => save({ distance_km: Number(e.target.value) }, "Distance saved, split worked out again")}
            >
              {distanceValue === "custom" && <option value="custom">{me.distance_km} km</option>}
              {DISTANCES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <ErrorLine error={error} />
        </div>
      </section>

      <section className="settings-grid">
        <header>
          <h2>Days you cannot do</h2>
          <p>Greyed days came from a limit you set when you joined and stay fixed.</p>
        </header>
        <DayToggles meId={meId} fixed={fixed} say={say} />
      </section>

      <section className="settings-grid">
        <header>
          <h2>Private reasons</h2>
          <p>Never shown to your family. The limit still counts; only you see why.</p>
        </header>
        <div className="stack">
          {me.constraints.length === 0 && <p className="muted">You have not set any limits.</p>}
          {me.constraints
            .filter((c) => c.id !== `${meId}-personal`)
            .map((c) => (
              <ReasonEditor key={c.id} constraint={c} say={say} />
            ))}
        </div>
      </section>

      <section className="settings-grid">
        <header>
          <h2>What your family sees</h2>
          <p>This is everything anyone else can see about your limits.</p>
        </header>
        <div>
          <dl className="shared-list">
            <dt>Can take on</dt>
            <dd>{Math.round(shared.capacity * 100)}%</dd>
            <dt>Lives</dt>
            <dd>{DISTANCES.find((d) => d.value === shared.distanceKm)?.label || `${shared.distanceKm} km away`}</dd>
            <dt>Cannot do</dt>
            <dd>{shared.days.length ? shared.days.join(", ") : "Any day is fine"}</dd>
            <dt>Does not take</dt>
            <dd>{shared.refuses.length ? shared.refuses.map((t) => TYPE_META[t]?.label || t).join(", ") : "Any kind of work"}</dd>
            <dt>Private reasons</dt>
            <dd>{privateLimits.some((c) => c.reason) ? "Held back from everyone" : "None"}</dd>
          </dl>
          <PrivacyCatch />
        </div>
      </section>

      <section className="settings-grid">
        <header>
          <h2>Leave</h2>
          <p>Log out on this device, or leave the family for good.</p>
        </header>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => Store.logout()}>
            Log out
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setLeaving(true)}>
            Leave family
          </button>
          <a href="#/about" className="link">
            About Shoulder
          </a>
        </div>
      </section>

      {leaving && <LeaveModal onClose={() => setLeaving(false)} />}
    </>
  );
}

function DayToggles({ meId, fixed, say }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blocked = new Set(Store.shared(meId).days);

  const toggle = async (day) => {
    setBusy(true);
    setError("");
    try {
      await Store.toggleDay(day);
      say("Days saved, split worked out again");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="days">
        {WEEKDAYS.map((day) => (
          <button
            type="button"
            key={day}
            className="day"
            aria-pressed={blocked.has(day)}
            disabled={busy || fixed.has(day)}
            title={fixed.has(day) ? "Set when you joined" : undefined}
            onClick={() => toggle(day)}
          >
            {day}
          </button>
        ))}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

function ReasonEditor({ constraint, say }) {
  const [reason, setReason] = useState(constraint.reason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = reason.trim() !== (constraint.reason || "").trim();

  useEffect(() => setReason(constraint.reason || ""), [constraint.reason]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await Store.setReason(constraint.id, reason.trim());
      say("Private reason saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="private">
      <label className="field-label private-label" htmlFor={`reason-${constraint.id}`}>
        <Lock size={14} />
        {constraint.summary}
      </label>
      <textarea
        id={`reason-${constraint.id}`}
        className="textarea"
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="row-actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !dirty} onClick={save}>
          Save reason
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

function PrivacyCatch() {
  const [catches, setCatches] = useState([]);
  const [showDraft, setShowDraft] = useState(false);

  useEffect(() => {
    let live = true;
    Store.privacyCatches()
      .then((r) => live && setCatches(r.catches || []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const latest = catches[0];
  if (!latest) return null;

  return (
    <div className="catch">
      <div>
        <h3>The privacy check stopped a message</h3>
        <p className="muted" style={{ fontSize: "var(--t-sm)", marginTop: "0.25rem" }}>
          Your agent wrote something that gave your reason away. A check in code caught it before it reached anyone, on the words{" "}
          {latest.matched.map((w) => `"${w}"`).join(", ")}.
        </p>
      </div>
      <div className="catch-pair">
        <div>
          <small>What your agent wrote</small>
          {showDraft ? (
            <p className="catch-draft">{latest.draft}</p>
          ) : (
            <button type="button" className="link" onClick={() => setShowDraft(true)}>
              Show it (only you can see this)
            </button>
          )}
        </div>
        <div>
          <small>What your family received</small>
          <p>{latest.sent}</p>
        </div>
      </div>
    </div>
  );
}

function LeaveModal({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const others = Store.members().length - 1;

  return (
    <Modal title="Leave this family?" onClose={onClose}>
      <div className="stack">
        <p className="muted">
          {others > 0
            ? "Your open tasks are dealt out to the rest of the family, and your member ID stops working. This cannot be undone."
            : "You are the only person in this family, so leaving deletes it for good. This cannot be undone."}
        </p>
        <ErrorLine error={error} />
        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Stay
          </button>
          <button
            type="button"
            className="btn btn-danger-solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await Store.leave();
              } catch (err) {
                setError(err.message);
                setBusy(false);
              }
            }}
          >
            {others > 0 ? "Leave family" : "Leave and delete family"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// -- family ---------------------------------------------------------------------------

function FamilyTab({ say }) {
  const recipient = Store.recipient();
  const meId = Store.meId();
  const others = Store.members().filter((m) => m.id !== meId).length;
  const mine = Store.pendingChanges().filter((c) => c.initiated_by === meId);

  const [form, setForm] = useState({ name: recipient.name, relation: recipient.relation, note: recipient.note || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({ name: recipient.name, relation: recipient.relation, note: recipient.note || "" });
  }, [recipient.name, recipient.relation, recipient.note]);

  const dirty =
    form.name.trim() !== recipient.name ||
    form.relation !== recipient.relation ||
    form.note.trim() !== (recipient.note || "");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await Store.proposeRecipient({ name: form.name.trim(), relation: form.relation, note: form.note.trim() });
      say(others ? "Sent to the family to agree" : "Details saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="settings-grid">
        <header>
          <h2>The person you care for</h2>
          <p>{others ? "A change here only happens once everyone in the family agrees." : "You are the only member, so changes apply straight away."}</p>
        </header>
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="recipient-name-edit">
              Their name
            </label>
            <input
              id="recipient-name-edit"
              className="input"
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                  aria-pressed={form.relation === relation}
                  onClick={() => setForm({ ...form, relation })}
                >
                  {relation}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label className="field-label" htmlFor="recipient-note-edit">
              Anything the family should keep in mind
            </label>
            <input
              id="recipient-note-edit"
              className="input"
              value={form.note}
              maxLength={200}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <ErrorLine error={error} />
          {mine.length > 0 && <p className="notice">You have a change waiting for the family to agree to it.</p>}
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !dirty || !form.name.trim()}>
              {others ? "Ask the family" : "Save details"}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-grid">
        <header>
          <h2>Members</h2>
          <p>Share the family code so others can join. Everyone adds themselves.</p>
        </header>
        <ul className="plain-list">
          {Store.members().map((m) => {
            const person = Store.person(m.id);
            const s = Store.shared(m.id);
            const limits = [
              `${Math.round(s.capacity * 100)}% capacity`,
              s.days.length ? `not ${s.days.join(", ")}` : null,
              s.refuses.length ? `no ${s.refuses.map((t) => TYPE_META[t]?.label.toLowerCase() || t).join(", ")}` : null,
            ].filter(Boolean);
            return (
              <li key={m.id} className="member-row">
                <Face person={person} size={36} />
                <div>
                  <strong>
                    {m.name}
                    {m.is_me ? " (you)" : ""}
                  </strong>
                  <span>{limits.join(", ")}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

// -- activity -------------------------------------------------------------------------

function ActivityTab() {
  const entries = Store.ledger();
  const [open, setOpen] = useState(null);

  if (!entries.length) {
    return (
      <div className="empty">
        <h2>Nothing yet</h2>
        <p>Everything Shoulder does without asking the family is recorded here, with the reason it was allowed to.</p>
      </div>
    );
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: "1.25rem" }}>
        Everything that happened, newest first. Open an entry to see why.
      </p>
      <ul className="plain-list">
        {entries.map((e) => {
          const person = e.who ? Store.person(e.who) : null;
          const expanded = open === e.id;
          return (
            <li key={e.id}>
              <button
                type="button"
                className="ledger-item"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : e.id)}
                disabled={!e.justification}
                style={!e.justification ? { cursor: "default" } : undefined}
              >
                <span className="ledger-summary">{e.summary}</span>
                <span className="ledger-when">
                  {person ? `${person.isMe ? "You" : person.shortName}, ` : ""}
                  {new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {expanded && e.justification && <span className="ledger-why">{e.justification}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
