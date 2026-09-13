import React, { useState } from "react";
import { PAID, Store, TASK_TYPES, TYPE_META } from "../data/store.js";
import Face from "./Face.jsx";
import { ErrorLine, Modal } from "./ui.jsx";

const LENGTHS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
  { value: 90, label: "1 hr 30 min" },
  { value: 120, label: "2 hr" },
  { value: 180, label: "3 hr" },
  { value: 540, label: "Overnight" },
];

/**
 * Add something that needs doing. Left to "whoever has room", the server uses
 * the same rule as the opening split and says who it chose and why.
 */
export default function AddTaskModal({ onClose, onAdded }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("visit");
  const [onDate, setOnDate] = useState(Store.today());
  const [durationMin, setDurationMin] = useState(90);
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const meId = Store.meId();

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await Store.addTask({
          title: title.trim(),
          type,
          on_date: onDate,
          duration_min: durationMin,
          time: time || null,
          requires_presence: type !== "admin" && type !== "finance",
          assignee,
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const holder = result.holder;
    return (
      <Modal title="Task added" onClose={onClose}>
        <div className="stack">
          <div className="drawer-holder">
            {holder ? <Face person={holder} size={40} /> : <span className="glyph" />}
            <div>
              <strong>
                {holder
                  ? holder.id === PAID.id
                    ? "Paid help will cover it"
                    : holder.isMe
                      ? "You will do it"
                      : `${holder.shortName} will do it`
                  : "Nobody can take it yet"}
              </strong>
              {result.why && <p className="muted" style={{ fontSize: "var(--t-sm)" }}>{result.why}</p>}
            </div>
          </div>
          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onAdded?.();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a task" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="task-title">
            What needs doing
          </label>
          <input
            id="task-title"
            className="input"
            value={title}
            maxLength={120}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: "0.45rem" }}>
            Kind of task
          </legend>
          <div className="chips">
            {TASK_TYPES.map((option) => (
              <button
                type="button"
                key={option}
                className="chip"
                aria-pressed={type === option}
                onClick={() => {
                  setType(option);
                  if (option === "night") setDurationMin(540);
                  else if (durationMin === 540) setDurationMin(90);
                }}
              >
                {TYPE_META[option].label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="task-date">
              Date
            </label>
            <input id="task-date" className="input" type="date" value={onDate} required onChange={(e) => setOnDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="task-time">
              Time
            </label>
            <input id="task-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="task-length">
            How long it takes
          </label>
          <select id="task-length" className="select" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
            {LENGTHS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: "0.45rem" }}>
            Who does it
          </legend>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={assignee === "auto"} onClick={() => setAssignee("auto")}>
              Whoever has room
            </button>
            {Store.people().map((person) => (
              <button
                type="button"
                key={person.id}
                className="chip"
                aria-pressed={assignee === person.id}
                onClick={() => setAssignee(person.id)}
              >
                {person.id === meId ? "Me" : person.shortName}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={assignee === PAID.id} onClick={() => setAssignee(PAID.id)}>
              Paid help
            </button>
          </div>
        </fieldset>

        <ErrorLine error={error} />

        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? "Adding task" : "Add task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
