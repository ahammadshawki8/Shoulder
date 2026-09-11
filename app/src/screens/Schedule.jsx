import React, { useState, useMemo, useEffect } from "react";
import {
  Store,
  PERSON_META,
  CARE_RECIPIENT_META,
  PAID_CAREGIVER_META,
  TYPE_META,
  DAY_NAMES,
  WEEKDAYS,
  subscribeStore,
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
  Plus,
  Check,
} from "../components/Icons.jsx";
import TaskDetailDrawer from "../components/TaskDetailDrawer.jsx";
import AddTaskModal from "../components/AddTaskModal.jsx";

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
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Subscribe to store updates for instant reactivity
  const [storeVersion, setStoreVersion] = useState(0);
  useEffect(() => {
    return subscribeStore(() => {
      setStoreVersion((v) => v + 1);
    });
  }, []);

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

  const totalTasksCount = tasks.length || 1;
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

  const handleTaskCheckClick = (e, taskId) => {
    e.stopPropagation();
    Store.toggleTaskComplete(taskId);
    const isNowDone = !completed.includes(taskId);
    setToastMessage(isNowDone ? "Marked as completed for Mum" : "Marked as upcoming");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleTaskAdded = (result) => {
    const who = PERSON_META[result.assignedTo]?.shortName || "Elena (Nurse Aide)";
    setToastMessage(`✓ Added "${result.task.title}". Allocated to ${who}`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="schedule-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="schedule-toast-alert" role="alert">
          <Check size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. WARM CARE RECIPIENT HERO CARD (MUM) */}
      <section className="mum-care-hero-card">
        <div className="mum-hero-inner">
          <div className="mum-photo-wrap">
            <img
              src={CARE_RECIPIENT_META.avatar}
              alt={CARE_RECIPIENT_META.name}
              className="mum-hero-avatar"
            />
            <span className="mum-status-online-dot" title="Daily care plan active" />
          </div>

          <div className="mum-hero-details">
            <div className="mum-badge-row">
              <span className="mum-tag-eldercare">Care Recipient</span>
              <span className="mum-tag-status">● {CARE_RECIPIENT_META.status}</span>
            </div>
            <h1 className="mum-hero-name">
              Caring for {CARE_RECIPIENT_META.name} <span className="mum-age-text">({CARE_RECIPIENT_META.age} yrs)</span>
            </h1>
            <p className="mum-hero-sub">
              {CARE_RECIPIENT_META.address} · {CARE_RECIPIENT_META.condition}
            </p>
          </div>

          <div className="mum-hero-actions">
            <button
              className="btn-add-task-hero"
              onClick={() => setShowAddTaskModal(true)}
              aria-label="Schedule a new care task"
            >
              <Plus size={16} />
              <span>+ Add Care Task</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. PERSONALIZED SIBLING GREETING & OVERVIEW */}
      <section className="overview-compact-card">
        <div className="sibling-greeting-wrap">
          <img src={userMeta.avatar} alt={userMeta.name} className="sibling-header-avatar" />
          <div>
            <div className="sibling-greeting-title">
              Hi {userMeta.shortName} <span className="persona-you-badge">You</span>
            </div>
            <p className="sibling-greeting-sub">{userMeta.greeting}</p>
          </div>
        </div>

        <div className="overview-metrics-strip">
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
                <strong>{myCompletedCount} completed</strong> · {myUpcomingCount} upcoming
              </div>
            </div>
          </div>

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
        </div>
      </section>

      {/* 3. FAMILY WORKLOAD WITH HUMANOID SIBLING AVATARS */}
      <section className="workload-visual-bar-section">
        <div className="workload-header-row">
          <span className="section-quiet-label">Family Care Distribution</span>
          <div className="workload-legend">
            <div className="legend-sibling-item">
              <img src={PERSON_META.amina.avatar} alt="Amina" className="legend-avatar" />
              <span>Amina ({aminaPct}%)</span>
            </div>
            <div className="legend-sibling-item">
              <img src={PERSON_META.rian.avatar} alt="Rian" className="legend-avatar" />
              <span>Rian ({rianPct}%)</span>
            </div>
            <div className="legend-sibling-item">
              <img src={PERSON_META.farah.avatar} alt="Farah" className="legend-avatar" />
              <span>Farah ({farahPct}%)</span>
            </div>
            {paidPct > 0 && (
              <div className="legend-sibling-item">
                <img src={PAID_CAREGIVER_META.avatar} alt="Elena" className="legend-avatar" />
                <span>Paid ({paidPct}%)</span>
              </div>
            )}
          </div>
        </div>

        <div className="distribution-bar-track">
          <div
            className="distribution-bar-segment"
            style={{ width: `${aminaPct}%`, background: PERSON_META.amina.color }}
            title={`Amina: ${workloadCounts.amina} tasks (${aminaPct}%)`}
          />
          <div
            className="distribution-bar-segment"
            style={{ width: `${rianPct}%`, background: PERSON_META.rian.color }}
            title={`Rian: ${workloadCounts.rian} tasks (${rianPct}%)`}
          />
          <div
            className="distribution-bar-segment"
            style={{ width: `${farahPct}%`, background: PERSON_META.farah.color }}
            title={`Farah: ${workloadCounts.farah} tasks (${farahPct}%)`}
          />
          {paidPct > 0 && (
            <div
              className="distribution-bar-segment"
              style={{ width: `${paidPct}%`, background: "var(--badge-paid)" }}
              title={`Paid Care Aide: ${workloadCounts.paid} tasks (${paidPct}%)`}
            />
          )}
        </div>
      </section>

      {/* 4. DATE STRIP SCROLL */}
      <section className="date-strip-section">
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

      {/* 5. FILTER BAR (MY TASKS VS FAMILY SCHEDULE) */}
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

      {/* 6. INTERACTIVE TASK ROWS */}
      <section className="task-rows-list">
        {displayedTasks.length === 0 ? (
          <div className="empty-tasks-quiet">
            <CheckCircle size={28} style={{ color: "var(--accent-primary)" }} />
            <p className="font-semibold text-base mb-1">No tasks scheduled {filter === "mine" ? "for you" : ""} for this date.</p>
            <button className="btn-secondary text-xs mt-2" onClick={() => setShowAddTaskModal(true)}>
              + Add a Task for This Date
            </button>
          </div>
        ) : (
          displayedTasks.map((task) => {
            const isAssignedToMe = assignments[task.id] === activeUser;
            const isPaid = Boolean(covered[task.id]);
            const isDone = completed.includes(task.id);
            const assigneeId = assignments[task.id];
            const assignee = isPaid
              ? PAID_CAREGIVER_META
              : PERSON_META[assigneeId] || { shortName: "Family", color: "#888", avatar: "/assets/farah_portrait.jpg" };

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
                className={`task-row-card ${isDone ? "completed" : ""} ${isAssignedToMe ? "is-mine" : ""}`}
                onClick={() => setActiveTaskId(task.id)}
                role="button"
                tabIndex={0}
              >
                {/* Direct interactive check-circle */}
                <div
                  className={`task-check-circle ${isDone ? "checked" : ""}`}
                  onClick={(e) => handleTaskCheckClick(e, task.id)}
                  title={isDone ? "Click to uncheck" : "Click to mark complete"}
                  role="checkbox"
                  aria-checked={isDone}
                >
                  {isDone && <Check size={14} />}
                </div>

                {/* Date column */}
                <div className="task-row-date">
                  <span className="task-date-str">{dateBadge}</span>
                  <span className="task-day-sub">
                    {DAY_NAMES[d.toLocaleDateString("en-US", { weekday: "short" })]?.slice(0, 3)}
                  </span>
                </div>

                {/* Category Icon */}
                <div className="task-row-icon" style={{ color: meta.color, background: `${meta.color}15` }}>
                  <IconComp size={17} />
                </div>

                {/* Task Details */}
                <div className="task-row-body">
                  <div className="task-row-headline-row">
                    <span className="task-row-title">{task.title}</span>
                    {task.is_custom && <span className="task-pill-custom">Added</span>}
                  </div>
                  <div className="task-row-meta">
                    <span className="task-type-tag" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="meta-separator">·</span>
                    <span className="task-time-tag">
                      {task.time || "10:00 AM"} ({task.duration_hours}h)
                    </span>
                    {task.notes && (
                      <>
                        <span className="meta-separator">·</span>
                        <span className="task-snippet-note">{task.notes}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Assignee Avatar Badge */}
                <div className="task-row-assignee">
                  <img src={assignee.avatar} alt={assignee.shortName} className="row-assignee-avatar" />
                  <div className="row-assignee-text">
                    <span className="row-assignee-name" style={{ color: isPaid ? "var(--badge-paid)" : assignee.color }}>
                      {isPaid ? "Elena (Paid)" : isAssignedToMe ? `${assignee.shortName} (You)` : assignee.shortName}
                    </span>
                    <span className="row-assignee-sub">
                      {isPaid ? "Care Aide" : isAssignedToMe ? "Your duty" : "Sibling"}
                    </span>
                  </div>
                </div>

                <div className="task-row-chevron">
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Task Detail Drawer */}
      {activeTaskId && (
        <TaskDetailDrawer
          taskId={activeTaskId}
          activeUser={activeUser}
          onClose={() => setActiveTaskId(null)}
        />
      )}

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        defaultDate={selectedDate || "2026-10-14"}
        activeUser={activeUser}
        onTaskAdded={handleTaskAdded}
      />

      {/* Fairness Explainer Modal */}
      {showFairnessModal && (
        <div className="modal-backdrop" onClick={() => setShowFairnessModal(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top-bar">
              <h3 className="modal-title">Why Is Careload Divided This Way?</h3>
              <button className="modal-close-btn" onClick={() => setShowFairnessModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-form-body">
              <p className="text-secondary text-sm mb-4">
                Shoulder uses grounded fair division algorithms (envy-freeness up to one chore). It divides care
                proportionally to what each sibling declared they can carry, honoring private constraints without
                exposing confidential reasons.
              </p>
              <div className="fairness-burdens-list">
                {fairness.burdens.map((b) => (
                  <div key={b.principal_id} className="fairness-row-item">
                    <div className="flex items-center gap-2">
                      <img src={PERSON_META[b.principal_id]?.avatar} alt={b.name} className="w-8 h-8 rounded-full" />
                      <div>
                        <strong>{b.name}</strong>
                        <div className="text-xs text-soft">Declared Capacity: {b.capacity}%</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <strong className="text-sm">{b.share}% of care</strong>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-subtle flex justify-end">
                <button className="btn-primary" onClick={() => setShowFairnessModal(false)}>
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
