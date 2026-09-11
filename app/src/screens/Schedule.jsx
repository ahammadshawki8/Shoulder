import React, { useState, useMemo } from "react";
import {
  Store,
  PERSON_META,
  TYPE_META,
  DAY_NAMES,
  WEEKDAYS,
} from "../data/store.js";
import {
  Calendar,
  CheckCircle,
  Clock,
  User,
  Users,
  AlertCircle,
  Scale,
  ChevronRight,
  Stethoscope,
  Pill,
  Moon,
  Car,
  FileText,
  Heart,
  HomeIcon,
  Shield,
} from "../components/Icons.jsx";
import TaskDetailDrawer from "../components/TaskDetailDrawer.jsx";

const ICON_MAP = {
  Stethoscope,
  Pill,
  Moon,
  Car,
  FileText,
  Heart,
  HomeIcon,
};

export default function Schedule({ activeUser, onNavigate }) {
  const [filter, setFilter] = useState("mine"); // 'mine' or 'all'
  const [selectedDate, setSelectedDate] = useState(null); // null = all days in month
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showFairnessModal, setShowFairnessModal] = useState(false);

  const tasks = Store.getTasks();
  const assignments = Store.getAssignments();
  const covered = Store.getCoveredTasks();
  const completed = Store.getCompletedTasks();
  const openEscalations = Store.getOpenEscalations();
  const fairness = Store.getFairness();

  const userMeta = PERSON_META[activeUser] || PERSON_META.farah;

  // Compute metrics
  const myTotalTasks = useMemo(() => {
    return tasks.filter((t) => assignments[t.id] === activeUser && !covered[t.id]);
  }, [tasks, assignments, covered, activeUser]);

  const myCompletedCount = useMemo(() => {
    return myTotalTasks.filter((t) => completed.includes(t.id)).length;
  }, [myTotalTasks, completed]);

  const myUpcomingCount = myTotalTasks.length - myCompletedCount;

  // Family workload distribution
  const workloadCounts = useMemo(() => {
    const counts = { amina: 0, rian: 0, farah: 0, paid: 0 };
    for (const t of tasks) {
      if (covered[t.id]) counts.paid++;
      else {
        const who = assignments[t.id];
        if (who && counts[who] !== undefined) counts[who]++;
      }
    }
    return counts;
  }, [tasks, assignments, covered]);

  const totalTasksCount = tasks.length;
  const aminaPct = Math.round((workloadCounts.amina / totalTasksCount) * 100);
  const rianPct = Math.round((workloadCounts.rian / totalTasksCount) * 100);
  const farahPct = Math.round((workloadCounts.farah / totalTasksCount) * 100);
  const paidPct = Math.round((workloadCounts.paid / totalTasksCount) * 100);

  // Generate unique dates in the current month for the horizontal date strip
  const dateStripList = useMemo(() => {
    const datesMap = new Map();
    for (const t of tasks) {
      if (!datesMap.has(t.on_date)) {
        const d = new Date(`${t.on_date}T12:00:00`);
        datesMap.set(t.on_date, {
          iso: t.on_date,
          dayNumber: d.getDate(),
          weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
          taskCount: 0,
          hasMyTask: false,
        });
      }
      const entry = datesMap.get(t.on_date);
      entry.taskCount++;
      if (assignments[t.id] === activeUser && !covered[t.id]) {
        entry.hasMyTask = true;
      }
    }
    return Array.from(datesMap.values()).sort((a, b) => a.iso.localeCompare(b.iso));
  }, [tasks, assignments, activeUser, covered]);

  // Filter tasks
  const displayedTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (selectedDate && t.on_date !== selectedDate) return false;
        if (filter === "mine") {
          return assignments[t.id] === activeUser && !covered[t.id];
        }
        return true;
      })
      .sort((a, b) => a.on_date.localeCompare(b.on_date));
  }, [tasks, selectedDate, filter, assignments, activeUser, covered]);

  return (
    <div className="schedule-screen">
      {/* 1. COMPACT TOP OVERVIEW */}
      <section className="overview-compact-card">
        <div className="overview-hero-stat">
          <div className="hero-metric-label">YOUR CARE DUTIES</div>
          <div className="hero-metric-row">
            <span className="hero-dominant-number">{myTotalTasks.length}</span>
            <div className="hero-progress-group">
              <div className="hero-progress-bar-wrap">
                <div
                  className="hero-progress-bar-fill"
                  style={{
                    width: `${myTotalTasks.length ? Math.round((myCompletedCount / myTotalTasks.length) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="hero-progress-sub">
                <span>{myCompletedCount} completed</span>
                <span>·</span>
                <span>{myUpcomingCount} upcoming</span>
              </div>
            </div>
          </div>
        </div>

        {/* Attention / Contextual Badges */}
        <div className="overview-contextual-column">
          {openEscalations.length > 0 ? (
            <div
              className="attention-pill-action"
              onClick={() => onNavigate("inbox")}
              role="button"
              tabIndex={0}
            >
              <div className="attention-pulse-dot" />
              <div>
                <strong>{openEscalations.length} need you</strong>
                <div className="attention-subtext">Decision required</div>
              </div>
              <ChevronRight size={14} className="attention-arrow" />
            </div>
          ) : (
            <div className="all-caught-up-badge">
              <CheckCircle size={16} />
              <span>All decisions settled</span>
            </div>
          )}

          {/* Family Balance indicator */}
          <div
            className="balance-pill-compact"
            onClick={() => setShowFairnessModal(true)}
            role="button"
            tabIndex={0}
          >
            <Scale size={14} />
            <span>
              Load:{" "}
              <strong style={{ color: fairness.proportional ? "var(--badge-success)" : "var(--badge-alert)" }}>
                {fairness.status}
              </strong>
            </span>
            <span className="text-link-sub">See why</span>
          </div>
        </div>
      </section>

      {/* 2. FAMILY WORKLOAD (Visual Distribution, not a competition) */}
      <section className="workload-visual-bar-section">
        <div className="workload-header-row">
          <span className="section-quiet-label">Family Care Distribution</span>
          <span className="workload-legend">
            <span className="legend-item"><span className="dot" style={{ background: PERSON_META.amina.color }} /> Amina ({aminaPct}%)</span>
            <span className="legend-item"><span className="dot" style={{ background: PERSON_META.rian.color }} /> Rian ({rianPct}%)</span>
            <span className="legend-item"><span className="dot" style={{ background: PERSON_META.farah.color }} /> Farah ({farahPct}%)</span>
            {paidPct > 0 && <span className="legend-item"><span className="dot" style={{ background: "var(--badge-paid)" }} /> Paid ({paidPct}%)</span>}
          </span>
        </div>

        <div className="distribution-bar-track">
          <div className="bar-segment amina" style={{ width: `${aminaPct}%` }} title={`Amina: ${aminaPct}%`} />
          <div className="bar-segment rian" style={{ width: `${rianPct}%` }} title={`Rian: ${rianPct}%`} />
          <div className="bar-segment farah" style={{ width: `${farahPct}%` }} title={`Farah: ${farahPct}%`} />
          {paidPct > 0 && (
            <div className="bar-segment paid" style={{ width: `${paidPct}%` }} title={`Paid Help: ${paidPct}%`} />
          )}
        </div>
      </section>

      {/* 3. HORIZONTAL DATE STRIP */}
      <section className="date-strip-section">
        <div className="date-strip-header">
          <div className="date-month-title">October 2026</div>
          {selectedDate && (
            <button className="clear-date-btn" onClick={() => setSelectedDate(null)}>
              Show full month ({tasks.length})
            </button>
          )}
        </div>

        <div className="date-strip-scroll">
          <div
            className={`date-chip ${selectedDate === null ? "active" : ""}`}
            onClick={() => setSelectedDate(null)}
          >
            <span className="date-chip-day">All</span>
            <span className="date-chip-num">Oct</span>
          </div>

          {dateStripList.map((item) => {
            const isSelected = selectedDate === item.iso;
            return (
              <div
                key={item.iso}
                className={`date-chip ${isSelected ? "active" : ""} ${item.hasMyTask ? "has-mine" : ""}`}
                onClick={() => setSelectedDate(item.iso)}
              >
                <span className="date-chip-day">{item.weekday}</span>
                <span className="date-chip-num">{item.dayNumber}</span>
                <div className="date-chip-dots">
                  {item.hasMyTask && <span className="date-my-dot" />}
                  {item.taskCount > 1 && <span className="date-other-dot" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. MY TASKS VS ALL TASKS SEGMENTED CONTROL */}
      <div className="filter-segmented-bar">
        <div className="segmented-control">
          <button
            className={`segmented-btn ${filter === "mine" ? "active" : ""}`}
            onClick={() => setFilter("mine")}
          >
            <User size={14} /> My Tasks ({myTotalTasks.length})
          </button>
          <button
            className={`segmented-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            <Users size={14} /> Family Schedule ({tasks.length})
          </button>
        </div>

        <div className="tasks-active-indicator">
          {displayedTasks.length} {displayedTasks.length === 1 ? "task" : "tasks"}{" "}
          {selectedDate ? `for ${selectedDate}` : "this month"}
        </div>
      </div>

      {/* 5. VISUAL TASK ROWS (Scannable, compact, not documentation cards) */}
      <section className="task-rows-list">
        {displayedTasks.length === 0 ? (
          <div className="empty-tasks-quiet">
            <CheckCircle size={24} style={{ color: "var(--accent-primary)" }} />
            <p>No tasks scheduled {filter === "mine" ? "for you" : ""} for this date.</p>
          </div>
        ) : (
          displayedTasks.map((task) => {
            const isAssignedToMe = assignments[task.id] === activeUser;
            const isPaid = Boolean(covered[task.id]);
            const isDone = completed.includes(task.id);
            const assigneeId = assignments[task.id];
            const assignee = PERSON_META[assigneeId] || { shortName: "Family", color: "#888" };

            const meta = TYPE_META[task.task_type] || {
              label: "Care Duty",
              icon: "Heart",
              color: "var(--accent-primary)",
            };
            const IconComp = ICON_MAP[meta.icon] || Heart;

            const d = new Date(`${task.on_date}T12:00:00`);
            const dateBadge = `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;

            return (
              <div
                key={task.id}
                className={`task-row ${isDone ? "completed" : ""} ${isAssignedToMe && !isPaid ? "is-mine" : ""}`}
                onClick={() => setActiveTaskId(task.id)}
                role="button"
                tabIndex={0}
              >
                {/* Type Icon */}
                <div className="task-row-icon" style={{ color: meta.color, background: `${meta.color}15` }}>
                  <IconComp size={16} />
                </div>

                {/* Title & Metadata */}
                <div className="task-row-main">
                  <div className="task-row-title">{task.title}</div>
                  <div className="task-row-meta">
                    <span>{dateBadge}</span>
                    <span>·</span>
                    <span>{task.duration_hours}h</span>
                    <span>·</span>
                    <span>{task.location_type === "remote" ? "Phone" : "On-site"}</span>
                  </div>
                </div>

                {/* Assignee / Paid Badge */}
                <div className="task-row-owner">
                  {isPaid ? (
                    <span className="paid-care-pill">Paid Care</span>
                  ) : (
                    <span className="owner-avatar-chip" style={{ color: assignee.color, borderColor: assignee.border }}>
                      <span className="owner-dot" style={{ background: assignee.color }} />
                      <span>{isAssignedToMe ? "You" : assignee.shortName}</span>
                    </span>
                  )}
                </div>

                {/* Status indicator */}
                <div className="task-row-status" onClick={(e) => { e.stopPropagation(); Store.toggleTaskComplete(task.id); }}>
                  <span className={`status-checkbox ${isDone ? "checked" : ""}`}>
                    {isDone && <CheckCircle size={15} />}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Task Detail Drawer / Sheet (Progressive Disclosure) */}
      <TaskDetailDrawer
        taskId={activeTaskId}
        activeUser={activeUser}
        onClose={() => setActiveTaskId(null)}
      />

      {/* Simple Fairness Breakdown Modal */}
      {showFairnessModal && (
        <div className="drawer-overlay" onClick={() => setShowFairnessModal(false)}>
          <div className="drawer-panel" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 style={{ fontSize: 18 }}>Careload Balance Status</h3>
              <button className="drawer-close-btn" onClick={() => setShowFairnessModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              Shoulder's fairness engine ensures caregiving burden matches each sibling's declared availability.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {fairness.burdens.map((b) => {
                const meta = PERSON_META[b.principal_id];
                return (
                  <div key={b.principal_id} style={{ padding: "12px", background: "var(--bg-card-muted)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontWeight: 600 }}>
                      <span style={{ color: meta.color }}>{b.name}</span>
                      <span>{b.share}% burden</span>
                    </div>
                    <div style={{ height: 6, background: "var(--border-subtle)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${b.share}%`, height: "100%", background: meta.color }} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 4 }}>
                      Capacity: {b.capacity}% · Adjusted for travel distance & work limits
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button className="btn-primary" onClick={() => setShowFairnessModal(false)}>
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
