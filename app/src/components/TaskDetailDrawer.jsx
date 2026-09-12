import React, { useState } from "react";
import {
  DAY_NAMES,
  PAID_CAREGIVER_META,
  Store,
  TYPE_META,
  dateOf,
  durationLabel,
  friendlyDate,
  personOf,
} from "../data/store.js";
import { TaskIcon } from "../screens/Schedule.jsx";
import { Check, CheckCircle, Trash2, X } from "./Icons.jsx";
import Face from "./Face.jsx";

/**
 * One task, opened.
 *
 * This is where the words live. The list stays a glance; anything longer than
 * a few words waits here until someone asks for it.
 */
export default function TaskDetailDrawer({ taskId, activeUser, onClose }) {
  const [note, setNote] = useState("");
  const [handingOver, setHandingOver] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [saved, setSaved] = useState(false);

  const task = Store.getTask(taskId);
  if (!task) return null;

  const covered = Store.getCoveredTasks()[task.id];
  const assignments = Store.getAssignments();
  const holder = covered ? PAID_CAREGIVER_META : personOf(assignments[task.id]);
  const isMine = !covered && assignments[task.id] === activeUser;
  const isDone = Store.getCompletedTasks().includes(task.id);
  const logged = Store.getTaskNotes(task.id);
  const meta = TYPE_META[task.type] || TYPE_META.visit;

  const when = dateOf(task.onDate);
  const fullDate = `${DAY_NAMES[task.weekday] || task.weekday}, ${when.getDate()} ${when.toLocaleDateString("en-US", { month: "long" })}`;

  const finish = () => {
    Store.toggleTaskComplete(task.id, note.trim());
    setNote("");
    onClose();
  };

  const keepNote = () => {
    if (!note.trim()) return;
    Store.saveTaskNote(task.id, note.trim());
    setNote("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handOver = (to) => {
    Store.reassignTask(task.id, to);
    setHandingOver(false);
  };

  return (
    <div className="sheet-backdrop to-the-side" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={task.title}>
        <div className="drawer-top">
          <span className="drawer-kind" style={{ color: meta.color }}>
            <TaskIcon type={task.type} />
            {meta.label}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <h2 className="drawer-title">{task.title}</h2>
        <p className="drawer-when">
          {friendlyDate(task.onDate)} · {fullDate}
          {task.time ? ` · ${task.time}` : ""} · {durationLabel(task.durationMin)}
        </p>

        {holder && (
          <div className="drawer-who">
            <Face person={holder} size={34} />
            <div>
              <strong>
                {isMine ? "You have this one" : `${holder.shortName} has this one`}
              </strong>
              <button className="link-quiet" onClick={() => setShowWhy(!showWhy)}>
                {showWhy ? "hide" : "why?"}
              </button>
            </div>
          </div>
        )}
        {showWhy && <p className="drawer-why">{Store.whyAssigned(task.id)}</p>}

        {task.notes && <p className="drawer-note">{task.notes}</p>}

        {logged && (
          <div className="drawer-logged">
            <span>{logged.text}</span>
            <em>
              {Store.person(logged.byUser)?.shortName || "Someone"}, {logged.recordedAt}
            </em>
          </div>
        )}

        <div className="drawer-actions">
          <button className={`btn-solid ${isDone ? "is-done" : ""}`} onClick={finish}>
            <CheckCircle size={17} />
            {isDone ? "Not done after all" : "Mark it done"}
          </button>

          <label className="drawer-input">
            <input
              type="text"
              value={note}
              placeholder="Add a note for the others"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && keepNote()}
            />
            {note.trim() && (
              <button className="btn-quiet" onClick={keepNote}>
                Save
              </button>
            )}
          </label>
          {saved && (
            <p className="drawer-saved">
              <Check size={13} /> Saved
            </p>
          )}

          <div className="drawer-more">
            <button className="link-quiet" onClick={() => setHandingOver(!handingOver)}>
              {handingOver ? "never mind" : "hand this to someone else"}
            </button>
            {task.isCustom && (
              <button className="link-danger" onClick={() => { Store.deleteTask(task.id); onClose(); }}>
                <Trash2 size={13} /> remove
              </button>
            )}
          </div>

          {handingOver && (
            <div className="handover">
              {[...Store.people().filter(Boolean), PAID_CAREGIVER_META].map((person) => (
                <button
                  key={person.id}
                  className="handover-pick"
                  disabled={person.id === holder?.id}
                  onClick={() => handOver(person.id)}
                >
                  <Face person={person} size={21} />
                  <span>{person.shortName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
