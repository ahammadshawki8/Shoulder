import React, { useEffect, useState } from "react";
import { PAID_CAREGIVER_META, Store, TYPE_META, today } from "../data/store.js";
import Face from "./Face.jsx";
import { TaskIcon } from "../screens/Schedule.jsx";
import { Check, Sparkles, X } from "./Icons.jsx";

const TYPES = ["visit", "appointment", "medication", "transport", "household", "admin", "finance", "night"];
const LENGTHS = [30, 60, 90, 120, 180, 540];

/**
 * Add something that needs doing.
 *
 * Four choices, and the fourth is optional: who. Left alone, the same rule
 * that built the opening split picks the person whose load stays lowest once
 * everyone's limits are respected, and says so afterwards.
 */
export default function AddTaskModal({ isOpen, onClose, activeUser, onTaskAdded }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("visit");
  const [onDate, setOnDate] = useState(today());
  const [durationMin, setDurationMin] = useState(90);
  const [assignee, setAssignee] = useState("auto");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setType("visit");
      setOnDate(today());
      setDurationMin(90);
      setAssignee("auto");
      setResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const save = (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    const added = Store.addTask({
      title: title.trim(),
      type,
      on_date: onDate,
      duration_min: durationMin,
      requires_presence: type !== "admin" && type !== "finance",
      assignee,
    });
    setResult(added);
  };

  const finish = () => {
    onTaskAdded?.(result);
    onClose();
  };

  const who = result ? Store.person(result.assignedTo) || PAID_CAREGIVER_META : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a task">
        <div className="sheet-head">
          <h3>{result ? "Added" : "What needs doing?"}</h3>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="added">
            <div className="added-who">
              <Face person={who} size={42} />
              <div>
                <strong>{who?.shortName} will take it</strong>
                <p>{result.why}</p>
              </div>
            </div>
            <button className="btn-solid" onClick={finish}>
              <Check size={16} /> Good
            </button>
          </div>
        ) : (
          <form className="form" onSubmit={save}>
            <input
              className="form-title"
              value={title}
              autoFocus
              placeholder="Pharmacy run"
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="chips">
              {TYPES.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`chip ${type === option ? "on" : ""}`}
                  onClick={() => {
                    setType(option);
                    // A night is a night. Anything else keeps what was chosen.
                    if (option === "night") setDurationMin(540);
                    else if (durationMin === 540) setDurationMin(90);
                  }}
                >
                  <TaskIcon type={option} size={13} />
                  {TYPE_META[option].label}
                </button>
              ))}
            </div>

            <div className="form-row">
              <label>
                <span>When</span>
                <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} />
              </label>
              <label>
                <span>How long</span>
                <select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
                  {LENGTHS.map((m) => (
                    <option key={m} value={m}>
                      {m >= 540 ? "overnight" : m >= 60 ? `${m / 60} hr` : `${m} min`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="chips">
              <button
                type="button"
                className={`chip ${assignee === "auto" ? "on" : ""}`}
                onClick={() => setAssignee("auto")}
              >
                <Sparkles size={13} /> Whoever has room
              </button>
              {Store.people().filter(Boolean).map((person) => (
                <button
                  type="button"
                  key={person.id}
                  className={`chip ${assignee === person.id ? "on" : ""}`}
                  onClick={() => setAssignee(person.id)}
                >
                  <Face person={person} size={18} className="chip-face" />
                  {person.id === activeUser ? "Me" : person.shortName}
                </button>
              ))}
            </div>

            <button className="btn-solid" type="submit" disabled={!title.trim()}>
              Add it
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
