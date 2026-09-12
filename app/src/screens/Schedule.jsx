import React, { useEffect, useMemo, useState } from "react";
import {
  PAID_CAREGIVER_META,
  PERSON_META,
  Store,
  TODAY,
  TYPE_META,
  durationLabel,
  friendlyDate,
  personOf,
  subscribeStore,
} from "../data/store.js";
import {
  Car,
  Check,
  CheckCircle,
  ChevronRight,
  FileText,
  Heart,
  HomeIcon,
  Moon,
  Pill,
  Plus,
  Stethoscope,
} from "../components/Icons.jsx";
import TaskDetailDrawer from "../components/TaskDetailDrawer.jsx";

const ICONS = { Stethoscope, Pill, Moon, Car, FileText, Heart, HomeIcon };

export function TaskIcon({ type, size = 16 }) {
  const meta = TYPE_META[type] || TYPE_META.visit;
  const Glyph = ICONS[meta.icon] || Heart;
  return (
    <span className="task-icon" style={{ color: meta.color, background: `${meta.color}14` }}>
      <Glyph size={size} />
    </span>
  );
}

export default function Schedule({ activeUser, onAdd, onNavigate }) {
  const [scope, setScope] = useState("mine");
  const [openTask, setOpenTask] = useState(null);
  const [toast, setToast] = useState(null);
  const [, force] = useState(0);

  useEffect(() => subscribeStore(() => force((n) => n + 1)), []);

  const tasks = Store.getTasks();
  const covered = Store.getCoveredTasks();
  const assignments = Store.getAssignments();
  const done = Store.getCompletedTasks();
  const cards = Store.getOpenEscalations();
  const me = PERSON_META[activeUser] || PERSON_META.farah;

  const mine = useMemo(
    () => tasks.filter((t) => assignments[t.id] === activeUser && !covered[t.id]),
    [tasks, assignments, covered, activeUser]
  );
  const myDone = mine.filter((t) => done.includes(t.id)).length;

  const shown = scope === "mine" ? mine : tasks;
  const upNext = useMemo(
    () =>
      mine
        .filter((t) => !done.includes(t.id) && t.onDate >= TODAY)
        .sort((a, b) => a.onDate.localeCompare(b.onDate))[0] || null,
    [mine, done]
  );

  // The month opens on what is coming. What is behind us is a line, not a list.
  const [past, ahead] = useMemo(() => {
    const sorted = [...shown].sort((a, b) => a.onDate.localeCompare(b.onDate));
    const group = (list) => {
      const groups = new Map();
      for (const task of list) {
        if (!groups.has(task.onDate)) groups.set(task.onDate, []);
        groups.get(task.onDate).push(task);
      }
      return [...groups.entries()];
    };
    return [
      group(sorted.filter((t) => t.onDate < TODAY)),
      group(sorted.filter((t) => t.onDate >= TODAY)),
    ];
  }, [shown]);
  const [showPast, setShowPast] = useState(false);
  const pastCount = past.reduce((n, [, items]) => n + items.length, 0);

  const say = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  const complete = (event, task) => {
    event.stopPropagation();
    const wasDone = done.includes(task.id);
    Store.toggleTaskComplete(task.id);
    say(wasDone ? "Put back on the list" : `${task.title} is done`);
  };

  return (
    <div className="page">
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}

      <header className="page-head">
        <div>
          <h1>Hello {me.shortName}</h1>
          <p>{mine.length - myDone > 0 ? `${mine.length - myDone} left this month` : "Nothing left this month"}</p>
        </div>
        <div className="scope">
          <button className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>
            Mine
          </button>
          <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            Everyone
          </button>
        </div>
      </header>

      {/* ---- bento ---- */}
      <section className="bento">
        <article className="tile tile-next">
          <span className="tile-label">Up next</span>
          {upNext ? (
            <button className="next-task" onClick={() => setOpenTask(upNext.id)}>
              <TaskIcon type={upNext.type} size={20} />
              <span className="next-body">
                <strong>{upNext.title}</strong>
                <em>
                  {friendlyDate(upNext.onDate)}
                  {upNext.time ? `, ${upNext.time}` : ""} · {durationLabel(upNext.durationMin)}
                </em>
              </span>
              <ChevronRight size={18} />
            </button>
          ) : (
            <p className="tile-quiet">Nothing waiting on you. Enjoy the quiet.</p>
          )}
        </article>

        <article className="tile tile-progress">
          <span className="tile-label">This month</span>
          <div className="ring" style={{ "--pct": mine.length ? myDone / mine.length : 0 }}>
            <span>
              {myDone}
              <em>/{mine.length}</em>
            </span>
          </div>
          <p className="tile-quiet">done by you</p>
        </article>

        <article className={`tile ${cards.length ? "tile-alert" : "tile-calm"}`}>
          <span className="tile-label">{cards.length ? "Needs you" : "Settled"}</span>
          {cards.length ? (
            <>
              <p className="tile-headline">{cards[0].headline}</p>
              <button className="btn-solid" onClick={() => onNavigate("inbox")}>
                Take a look
              </button>
            </>
          ) : (
            <p className="tile-quiet">
              <CheckCircle size={16} /> Nothing needs a decision.
            </p>
          )}
        </article>
      </section>

      {/* ---- the list ---- */}
      <section className="list">
        {pastCount > 0 && (
          <div className="earlier">
            <button onClick={() => setShowPast(!showPast)}>
              {showPast ? "Hide" : "Show"} {pastCount} earlier this month
            </button>
          </div>
        )}
        {showPast && past.map(([day, items]) => renderDay(day, items))}

        {ahead.length === 0 ? (
          <div className="empty">
            <CheckCircle size={26} />
            <p>Nothing here yet.</p>
            <button className="btn-quiet" onClick={onAdd}>
              <Plus size={14} /> Add a task
            </button>
          </div>
        ) : (
          ahead.map(([day, items]) => renderDay(day, items))
        )}
      </section>

      {openTask && (
        <TaskDetailDrawer taskId={openTask} activeUser={activeUser} onClose={() => setOpenTask(null)} />
      )}
    </div>
  );

  function renderDay(day, items) {
    return (
      <div key={day} className="day">
        <div className="day-label">
          <span>{friendlyDate(day)}</span>
          <i />
        </div>
        {items.map((task) => {
                const isDone = done.includes(task.id);
                const holder = covered[task.id]
                  ? PAID_CAREGIVER_META
                  : personOf(assignments[task.id]);
                const isMine = !covered[task.id] && assignments[task.id] === activeUser;
                return (
                  <div
                    key={task.id}
                    className={`row ${isDone ? "done" : ""} ${isMine ? "mine" : ""}`}
                    onClick={() => setOpenTask(task.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setOpenTask(task.id)}
                  >
                    <button
                      className={`tick ${isDone ? "on" : ""}`}
                      onClick={(e) => complete(e, task)}
                      aria-label={isDone ? `Undo ${task.title}` : `Mark ${task.title} done`}
                      aria-pressed={isDone}
                    >
                      {isDone && <Check size={13} />}
                    </button>

                    <TaskIcon type={task.type} />

                    <div className="row-body">
                      <span className="row-title">{task.title}</span>
                      <span className="row-sub">
                        {task.time ? `${task.time} · ` : ""}
                        {durationLabel(task.durationMin)}
                      </span>
                    </div>

                    {/* In "Mine" every row says You, which is noise. */}
                    {holder && scope === "all" && (
                      <span className="row-who" title={holder.name}>
                        <img src={holder.avatar} alt="" />
                        <em style={{ color: holder.color }}>{isMine ? "You" : holder.shortName}</em>
                      </span>
                    )}
                  </div>
                );
              })}
      </div>
    );
  }
}
