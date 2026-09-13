import React, { useState } from "react";
import { PAID, Store, TYPE_META, durationLabel, friendlyDate, longDate } from "../data/store.js";
import { Check, CheckCircle, Trash2, X } from "./Icons.jsx";
import Face from "./Face.jsx";
import { Drawer, ErrorLine, TaskGlyph, useStore } from "./ui.jsx";

/** One task, opened. The list stays a glance; the detail lives here. */
export default function TaskDrawer({ taskId, onClose }) {
  useStore();
  const [note, setNote] = useState("");
  const [handingOver, setHandingOver] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const task = Store.task(taskId);
  if (!task) return null;

  const meId = Store.meId();
  const holder = Store.holder(task.id);
  const done = Store.isDone(task.id);
  const logged = Store.note(task.id);
  const loggedBy = logged ? Store.person(logged.by) : null;
  const eligible = new Set(Store.eligible(task.id));

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const markDone = async () => {
    if (await run(() => Store.toggleComplete(task.id, done ? "" : note.trim()))) {
      setNote("");
      if (!done) onClose();
    }
  };

  const keepNote = async () => {
    if (!note.trim()) return;
    if (await run(() => Store.setNote(task.id, note.trim()))) {
      setNote("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handOver = async (to) => {
    if (await run(() => Store.assignTask(task.id, to))) setHandingOver(false);
  };

  const remove = async () => {
    if (await run(() => Store.deleteTask(task.id))) onClose();
  };

  return (
    <Drawer label={task.title} onClose={onClose}>
      <div className="overlay-head">
        <div>
          <span className="task-who" style={{ marginBottom: "0.6rem" }}>
            <TaskGlyph type={task.type} size={15} />
            {TYPE_META[task.type]?.label}
          </span>
          <h2 style={{ fontSize: "var(--t-xl)" }}>{task.title}</h2>
          <p className="drawer-meta">
            {friendlyDate(task.onDate)}, {longDate(task.onDate)}. {task.time ? `${task.time}. ` : ""}
            {durationLabel(task.durationMin)}.
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="drawer-block">
        <div className="drawer-holder">
          {holder ? <Face person={holder} size={36} /> : <span className="glyph" />}
          <div>
            <strong>
              {holder ? (holder.isMe ? "You are doing this" : `${holder.shortName} is doing this`) : "Nobody can take this yet"}
            </strong>
            {Store.why(task.id) && (
              <button type="button" className="link" onClick={() => setShowWhy(!showWhy)}>
                {showWhy ? "Hide why" : "Why?"}
              </button>
            )}
          </div>
        </div>
        {showWhy && <p className="muted" style={{ marginTop: "0.75rem", fontSize: "var(--t-sm)" }}>{Store.why(task.id)}</p>}
      </div>

      {(task.notes || logged) && (
        <div className="drawer-block stack">
          {task.notes && <p>{task.notes}</p>}
          {logged && (
            <div className="notice">
              <p style={{ color: "var(--ink)" }}>{logged.text}</p>
              <p style={{ marginTop: "0.25rem" }}>
                {loggedBy ? (loggedBy.isMe ? "You" : loggedBy.shortName) : "Someone"},{" "}
                {new Date(logged.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="drawer-block stack">
        <div className="field">
          <label className="field-label" htmlFor="task-note">
            {done ? "Note for the family" : "Leave a note for the family"}
          </label>
          <textarea
            id="task-note"
            className="textarea"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !note.trim()} onClick={keepNote}>
              Save note
            </button>
            {saved && <span className="saved">Saved</span>}
          </div>
        </div>

        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={markDone}>
          {done ? <CheckCircle size={17} /> : <Check size={17} />}
          {done ? "Mark as not done" : note.trim() ? "Mark done and save note" : "Mark done"}
        </button>

        <ErrorLine error={error} />
      </div>

      {!done && (
        <div className="drawer-block">
          <button type="button" className="link" onClick={() => setHandingOver(!handingOver)}>
            {handingOver ? "Keep it with the current person" : "Give this to someone else"}
          </button>
          {handingOver && (
            <div className="handover">
              {Store.people().map((person) => {
                const isHolder = holder?.id === person.id;
                const allowed = eligible.has(person.id);
                return (
                  <button
                    type="button"
                    key={person.id}
                    className="handover-pick"
                    disabled={busy || isHolder || !allowed}
                    onClick={() => handOver(person.id)}
                  >
                    <Face person={person} size={24} />
                    {person.id === meId ? "Me" : person.shortName}
                    {isHolder ? <small>Has it now</small> : !allowed && <small>Not available for this</small>}
                  </button>
                );
              })}
              <button
                type="button"
                className="handover-pick"
                disabled={busy || holder?.id === PAID.id}
                onClick={() => handOver(PAID.id)}
              >
                <Face person={PAID} size={24} />
                Paid help
                {holder?.id === PAID.id && <small>Has it now</small>}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="drawer-block">
        {confirmRemove ? (
          <div className="stack">
            <p>Remove {task.title} from the plan for everyone?</p>
            <div className="row-actions">
              <button type="button" className="btn btn-danger-solid btn-sm" disabled={busy} onClick={remove}>
                Remove task
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmRemove(true)}>
            <Trash2 size={14} /> Remove task
          </button>
        )}
      </div>
    </Drawer>
  );
}
