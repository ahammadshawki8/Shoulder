import React, { useState } from "react";
import {
  Store,
  PERSON_META,
  PAID_CAREGIVER_META,
  CARE_RECIPIENT_META,
  TYPE_META,
  DAY_NAMES,
} from "../data/store.js";
import {
  X,
  CheckCircle,
  Calendar,
  Clock,
  User,
  Heart,
  Car,
  Pill,
  Moon,
  HomeIcon,
  FileText,
  Stethoscope,
  Shield,
  Trash2,
} from "./Icons.jsx";

const ICON_COMPONENTS = {
  Stethoscope,
  Pill,
  Moon,
  Car,
  FileText,
  Heart,
  HomeIcon,
};

export default function TaskDetailDrawer({ taskId, activeUser, onClose }) {
  if (!taskId) return null;

  const [noteInput, setNoteInput] = useState("");
  const [showReassign, setShowReassign] = useState(false);
  const [reassignReason, setReassignReason] = useState("");
  const [justSavedNote, setJustSavedNote] = useState(false);

  const tasks = Store.getTasks();
  const assignments = Store.getAssignments();
  const covered = Store.getCoveredTasks();
  const completed = Store.getCompletedTasks();
  const savedNote = Store.getTaskNotes(taskId);

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const isCompleted = completed.includes(task.id);
  const isPaid = Boolean(covered[task.id]);
  const assigneeId = assignments[task.id];
  const assignee = isPaid
    ? PAID_CAREGIVER_META
    : PERSON_META[assigneeId] || { shortName: "Family", color: "#666", avatar: "/assets/farah_portrait.jpg" };
  const isMine = assigneeId === activeUser && !isPaid;

  const meta = TYPE_META[task.task_type] || {
    label: "Care Task",
    icon: "Heart",
    color: "var(--accent-primary)",
  };
  const IconComp = ICON_COMPONENTS[meta.icon] || Heart;

  const d = new Date(`${task.on_date}T12:00:00`);
  const dayOfWeek = DAY_NAMES[d.toLocaleDateString("en-US", { weekday: "short" })];
  const formattedDate = `${dayOfWeek}, ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "long" })}`;

  const handleToggleComplete = () => {
    Store.toggleTaskComplete(task.id, noteInput.trim());
    if (noteInput.trim()) {
      setNoteInput("");
      setJustSavedNote(true);
      setTimeout(() => setJustSavedNote(false), 2500);
    }
  };

  const handleSaveNoteOnly = (e) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    Store.saveTaskNote(task.id, noteInput.trim());
    setNoteInput("");
    setJustSavedNote(true);
    setTimeout(() => setJustSavedNote(false), 2500);
  };

  const handleReassign = (targetId) => {
    Store.reassignTask(task.id, targetId, reassignReason || "Reallocated by sibling agreement");
    setShowReassign(false);
    setReassignReason("");
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to remove this scheduled care task?")) {
      Store.deleteTask(task.id);
      onClose();
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-type-badge" style={{ color: meta.color }}>
            <IconComp size={16} />
            <span>{meta.label}</span>
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close details">
            <X size={20} />
          </button>
        </div>

        {/* Title */}
        <h2 className="drawer-title">{task.title}</h2>

        {/* Primary Metadata */}
        <div className="drawer-meta-grid">
          <div className="drawer-meta-item">
            <div className="meta-icon"><Calendar size={18} /></div>
            <div>
              <div className="meta-label">Scheduled Date</div>
              <div className="meta-value">{formattedDate}</div>
            </div>
          </div>

          <div className="drawer-meta-item">
            <div className="meta-icon"><Clock size={18} /></div>
            <div>
              <div className="meta-label">Time & Effort</div>
              <div className="meta-value">
                {task.time || "10:00 AM"} · {task.duration_hours} hr{task.duration_hours > 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Assigned Person with Portrait */}
          <div className="drawer-meta-item full-width-meta">
            <img src={assignee.avatar} alt={assignee.shortName} className="drawer-assignee-avatar" />
            <div className="flex-1">
              <div className="meta-label">Caregiver Assigned</div>
              <div className="meta-value" style={{ color: assignee.color }}>
                {isPaid ? "Elena Vance (Paid Care Aide)" : isMine ? `${assignee.shortName} (You)` : assignee.name}
              </div>
              <div className="meta-subtext">
                {isPaid
                  ? "Funded jointly by family precedent"
                  : `${assignee.role || "Sibling coordination"}`}
              </div>
            </div>
          </div>
        </div>

        {/* Task Notes / Instructions */}
        {task.notes && (
          <div className="drawer-section">
            <div className="drawer-section-title">Preparation & Notes</div>
            <p className="drawer-text highlight-note">{task.notes}</p>
          </div>
        )}

        {/* Logged Care Notes */}
        {savedNote && (
          <div className="drawer-section logged-note-box">
            <div className="drawer-section-title">Latest Caregiver Check-In Note</div>
            <p className="drawer-text italic">"{savedNote.text}"</p>
            <div className="drawer-note-meta">
              Logged by {PERSON_META[savedNote.byUser]?.shortName || "Family"} at {savedNote.recordedAt}
            </div>
          </div>
        )}

        {/* Add Check-in Note Input */}
        <div className="drawer-section">
          <div className="drawer-section-title">Care Log & Check-In</div>
          <p className="drawer-subtext">Add observation notes (e.g. Mum's blood pressure, mood, food intake):</p>
          <div className="drawer-input-row">
            <input
              type="text"
              className="form-input-text"
              placeholder="e.g. Mum drank ginger tea, vitals 120/80, cheerful mood"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
            {noteInput.trim() && (
              <button className="btn-secondary text-xs" onClick={handleSaveNoteOnly}>
                Save Log
              </button>
            )}
          </div>
          {justSavedNote && (
            <div className="text-xs text-emerald-600 font-semibold mt-1">✓ Note saved to care ledger</div>
          )}
        </div>

        {/* Reassignment Section */}
        <div className="drawer-section">
          <div className="flex justify-between items-center">
            <span className="drawer-section-title">Need to Reassign?</span>
            <button
              className="text-xs text-accent-primary font-semibold hover:underline"
              onClick={() => setShowReassign(!showReassign)}
            >
              {showReassign ? "Hide" : "Hand off to sibling..."}
            </button>
          </div>

          {showReassign && (
            <div className="reassign-drawer-box mt-2">
              <p className="text-xs text-secondary mb-2">
                Select who can cover this. Shoulder will log the adjustment in the family ledger:
              </p>
              <div className="reassign-grid">
                {Object.values(PERSON_META).map((p) => (
                  <button
                    key={p.id}
                    className="reassign-choice-btn"
                    disabled={p.id === assigneeId}
                    onClick={() => handleReassign(p.id)}
                  >
                    <img src={p.avatar} alt={p.name} className="reassign-btn-avatar" />
                    <span>{p.shortName}</span>
                  </button>
                ))}
                <button
                  className="reassign-choice-btn"
                  disabled={isPaid}
                  onClick={() => handleReassign("paid")}
                >
                  <img src={PAID_CAREGIVER_META.avatar} alt="Elena" className="reassign-btn-avatar" />
                  <span>Elena (Paid)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="drawer-actions">
          <button
            className={`btn-primary ${isCompleted ? "btn-completed" : ""}`}
            style={{ width: "100%", justifyContent: "center", padding: "14px" }}
            onClick={handleToggleComplete}
          >
            <CheckCircle size={18} />
            {isCompleted ? "Mark as Upcoming (Undo)" : "Mark as Completed for Mum"}
          </button>

          {task.is_custom && (
            <button className="btn-danger-quiet" onClick={handleDelete} title="Remove this scheduled task">
              <Trash2 size={15} /> Remove Task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
