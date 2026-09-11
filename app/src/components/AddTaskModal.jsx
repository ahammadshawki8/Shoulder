import React, { useState } from "react";
import {
  Store,
  PERSON_META,
  PAID_CAREGIVER_META,
  TYPE_META,
  WEEKDAYS,
  DAY_NAMES,
} from "../data/store.js";
import {
  Calendar,
  Clock,
  User,
  Users,
  CheckCircle,
  Heart,
  Stethoscope,
  Pill,
  Moon,
  Car,
  FileText,
  HomeIcon,
  Shield,
} from "./Icons.jsx";

const PRESETS = [
  {
    title: "Mum's Cardiologist Follow-up",
    type: "appointment",
    duration: 2.0,
    time: "10:30 AM",
    notes: "Bring previous blood work results and current medication list.",
    is_onsite: true,
  },
  {
    title: "Weekly Fresh Groceries & Fruit",
    type: "household",
    duration: 1.5,
    time: "02:00 PM",
    notes: "Get ripe papayas, skimmed milk, and brown bread from Waitrose.",
    is_onsite: true,
  },
  {
    title: "Prescription Refill & Blood Pressure Check",
    type: "medication",
    duration: 1.0,
    time: "11:00 AM",
    notes: "Collect Amlodipine from Boots; record Mum's morning vitals.",
    is_onsite: true,
  },
  {
    title: "Sunday Garden Tea & Companionship",
    type: "visit",
    duration: 2.5,
    time: "03:30 PM",
    notes: "Enjoy afternoon cardamom tea in the garden. Read through family photos.",
    is_onsite: true,
  },
  {
    title: "Council Care Assessment & Utility Bills",
    type: "finance",
    duration: 1.5,
    time: "05:00 PM",
    notes: "Verify direct debit for heating allowance and council support form.",
    is_onsite: false,
  },
];

export default function AddTaskModal({ isOpen, onClose, defaultDate, activeUser, onTaskAdded }) {
  if (!isOpen) return null;

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("appointment");
  const [onDate, setOnDate] = useState(defaultDate || "2026-10-14");
  const [time, setTime] = useState("10:00 AM");
  const [duration, setDuration] = useState("1.5");
  const [isOnsite, setIsOnsite] = useState(true);
  const [assigneeMode, setAssigneeMode] = useState("auto"); // 'auto' or specific principal id
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const applyPreset = (preset) => {
    setTitle(preset.title);
    setTaskType(preset.type);
    setDuration(String(preset.duration));
    setTime(preset.time);
    setNotes(preset.notes);
    setIsOnsite(preset.is_onsite);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !onDate) return;

    setSubmitting(true);

    try {
      const result = Store.addTask({
        title: title.trim(),
        task_type: taskType,
        on_date: onDate,
        time,
        duration_hours: Number(duration),
        is_onsite: isOnsite,
        assignee: assigneeMode,
        notes: notes.trim(),
        created_by: activeUser,
      });

      if (onTaskAdded) {
        onTaskAdded(result);
      }

      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Preview fair allocation recommendation
  const previewSibling = () => {
    if (assigneeMode !== "auto") return null;
    const dateObj = new Date(`${onDate}T12:00:00`);
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });

    if (weekday === "Fri" || weekday === "Sat") {
      return "Amina (Farah is unavailable Fri–Sat for recovery)";
    }
    if (["Mon", "Tue", "Wed", "Thu"].includes(weekday) && isOnsite) {
      return "Farah or Amina (Rian is in Leeds for work Mon–Thu)";
    }
    return "Farah (to balance current 4 tasks vs Amina's 7)";
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top-bar">
          <div className="modal-header-text">
            <h3 className="modal-title">Schedule Care for Mum</h3>
            <p className="modal-subtitle">Add a duty to the family rota with automated fair division</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Quick Presets */}
        <div className="preset-strip-wrap">
          <span className="preset-label">Quick Suggestions:</span>
          <div className="preset-scroll-row">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="preset-chip"
                onClick={() => applyPreset(p)}
              >
                {p.title.split(" ")[0]} {p.title.split(" ")[1]}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="modal-form-body">
          {/* Title */}
          <div className="form-field-group">
            <label className="form-label" htmlFor="task-title">
              Task Title <span className="field-required">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              className="form-input-text"
              placeholder="e.g. Mum's Physiotherapy Session"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Category Selector */}
          <div className="form-field-group">
            <label className="form-label">Care Category</label>
            <div className="category-select-grid">
              {Object.entries(TYPE_META).map(([key, meta]) => {
                const isSelected = taskType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`category-pill-btn ${isSelected ? "selected" : ""}`}
                    onClick={() => setTaskType(key)}
                  >
                    <span className="category-pill-dot" style={{ background: meta.color }} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date, Time & Duration Row */}
          <div className="form-row-multi">
            <div className="form-field-group flex-1">
              <label className="form-label" htmlFor="task-date">Date</label>
              <input
                id="task-date"
                type="date"
                className="form-input-text"
                value={onDate}
                onChange={(e) => setOnDate(e.target.value)}
                required
              />
            </div>

            <div className="form-field-group flex-1">
              <label className="form-label" htmlFor="task-time">Start Time</label>
              <input
                id="task-time"
                type="text"
                className="form-input-text"
                placeholder="10:00 AM"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>

            <div className="form-field-group flex-1">
              <label className="form-label" htmlFor="task-duration">Duration (hrs)</label>
              <input
                id="task-duration"
                type="number"
                step="0.5"
                min="0.5"
                max="12"
                className="form-input-text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          {/* Location Toggle */}
          <div className="form-field-group">
            <label className="form-label">Location Type</label>
            <div className="segmented-control w-full">
              <button
                type="button"
                className={`segmented-btn flex-1 ${isOnsite ? "active" : ""}`}
                onClick={() => setIsOnsite(true)}
              >
                <HomeIcon size={14} /> At Mum's Home / Clinic (Onsite)
              </button>
              <button
                type="button"
                className={`segmented-btn flex-1 ${!isOnsite ? "active" : ""}`}
                onClick={() => setIsOnsite(false)}
              >
                <FileText size={14} /> Remote / Phone / Online
              </button>
            </div>
          </div>

          {/* Fair Assignment Strategy */}
          <div className="form-field-group">
            <label className="form-label">Who Should Cover This?</label>
            <div className="assignment-options-stack">
              {/* Option A: Automated Fair Division */}
              <label className={`assignment-card-choice ${assigneeMode === "auto" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="assigneeMode"
                  value="auto"
                  checked={assigneeMode === "auto"}
                  onChange={() => setAssigneeMode("auto")}
                />
                <div className="choice-content">
                  <div className="choice-title-row">
                    <span className="choice-title font-semibold">✨ Shoulder Fair Division (Recommended)</span>
                    <span className="choice-badge">Algorithm</span>
                  </div>
                  <p className="choice-desc">
                    Calculates sibling capacity, existing load, and stated constraints. Predicted:{" "}
                    <strong>{previewSibling()}</strong>
                  </p>
                </div>
              </label>

              {/* Option B: Direct Sibling Select */}
              <div className="direct-siblings-row">
                {Object.values(PERSON_META).map((p) => {
                  const isSelected = assigneeMode === p.id;
                  const isYou = p.id === activeUser;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`sibling-select-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setAssigneeMode(p.id)}
                    >
                      <img src={p.avatar} alt={p.name} className="sibling-choice-avatar" />
                      <div className="sibling-choice-info">
                        <div className="sibling-choice-name">
                          {p.shortName} {isYou && "(You)"}
                        </div>
                        <div className="sibling-choice-role">{p.role}</div>
                      </div>
                    </button>
                  );
                })}

                {/* Paid Helper Option */}
                <button
                  type="button"
                  className={`sibling-select-card ${assigneeMode === "paid" ? "selected" : ""}`}
                  onClick={() => setAssigneeMode("paid")}
                >
                  <img
                    src={PAID_CAREGIVER_META.avatar}
                    alt={PAID_CAREGIVER_META.name}
                    className="sibling-choice-avatar"
                  />
                  <div className="sibling-choice-info">
                    <div className="sibling-choice-name">Elena Vance</div>
                    <div className="sibling-choice-role">Paid Nurse Aide</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Notes / Special Instructions */}
          <div className="form-field-group">
            <label className="form-label" htmlFor="task-notes">Special Care Notes</label>
            <textarea
              id="task-notes"
              className="form-textarea"
              rows="2"
              placeholder="e.g. Ensure wheelchair is ready in hallway; bring warm cardigan."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Submit Actions */}
          <div className="modal-actions-bar">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !title.trim()}>
              {submitting ? "Scheduling..." : "Confirm & Add to Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
