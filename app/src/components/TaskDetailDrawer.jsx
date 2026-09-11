import React from "react";
import { Store, PERSON_META, TYPE_META, DAY_NAMES } from "../data/store.js";
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

  const tasks = Store.getTasks();
  const assignments = Store.getAssignments();
  const covered = Store.getCoveredTasks();
  const completed = Store.getCompletedTasks();

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const isCompleted = completed.includes(task.id);
  const isPaid = Boolean(covered[task.id]);
  const assigneeId = assignments[task.id];
  const assignee = PERSON_META[assigneeId] || { shortName: "Family", color: "#666" };
  const isMine = assigneeId === activeUser;

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
    Store.toggleTaskComplete(task.id);
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
                {task.duration_hours} hr{task.duration_hours > 1 ? "s" : ""} · {task.effort_weight ? `${task.effort_weight}x effort` : "Routine"}
              </div>
            </div>
          </div>

          <div className="drawer-meta-item">
            <div className="meta-icon"><User size={18} /></div>
            <div>
              <div className="meta-label">Assigned To</div>
              <div className="meta-value" style={{ color: isPaid ? "var(--badge-paid)" : assignee.color, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="dot" style={{ background: isPaid ? "var(--badge-paid)" : assignee.color }}></span>
                {isPaid ? "Covered by Paid Caregiver" : isMine ? `${assignee.shortName} (You)` : assignee.name}
              </div>
            </div>
          </div>
        </div>

        {/* Care Context Box */}
        <div className="drawer-section">
          <div className="drawer-section-title">Care Coordination</div>
          <p className="drawer-text">
            {isPaid
              ? "This task is covered by professional in-home help as agreed by the family to keep the workload balanced."
              : `Handled directly by ${assignee.shortName}. Coordinated automatically to match ${assignee.shortName}'s declared availability.`}
          </p>
        </div>

        {/* Actions */}
        <div className="drawer-actions">
          <button
            className={`btn-primary ${isCompleted ? "btn-completed" : ""}`}
            style={{ width: "100%", justifyContent: "center", padding: "14px" }}
            onClick={handleToggleComplete}
          >
            <CheckCircle size={18} />
            {isCompleted ? "Mark as Upcoming (Undo)" : "Mark as Completed"}
          </button>
        </div>
      </div>
    </div>
  );
}
