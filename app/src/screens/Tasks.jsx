import React, { useMemo, useState } from "react";
import { PAID, Store, WEEKDAYS, dateOf, durationLabel, friendlyDate } from "../data/store.js";
import { Bell, Calendar, Check, ChevronRight, List, Plus } from "../components/Icons.jsx";
import Face from "../components/Face.jsx";
import TaskDrawer from "../components/TaskDrawer.jsx";
import { FairnessBar, TaskGlyph, spreadLabel, useStore, useToast } from "../components/ui.jsx";

export default function Tasks({ onNavigate, onAdd }) {
  useStore();
  const [scope, setScope] = useState("mine");
  const [layout, setLayout] = useState("list");
  const [openTask, setOpenTask] = useState(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const [toast, say] = useToast();

  const meId = Store.meId();
  const today = Store.today();
  const tasks = Store.tasks();
  const assignments = Store.assignments();
  const covered = Store.covered();
  const fairness = Store.fairness();
  const waiting = Store.needsMeCount();
  const precedents = Store.precedents();

  const mine = tasks.filter((t) => !covered[t.id] && assignments[t.id] === meId);
  const myOpen = mine.filter((t) => !Store.isDone(t.id));
  const familyOpen = tasks.filter((t) => !covered[t.id] && !Store.isDone(t.id));
  const familyDone = tasks.filter((t) => Store.isDone(t.id)).length;
  const unassigned = fairness.unassigned?.length || 0;
  const shown = scope === "mine" ? mine : tasks;
  const upNext = myOpen.find((t) => t.onDate >= today) || null;
  const anythingShared = fairness.burdens.some((b) => b.task_count > 0);

  const [earlier, ahead] = useMemo(() => {
    const group = (list) => {
      const days = new Map();
      for (const task of list) {
        if (!days.has(task.onDate)) days.set(task.onDate, []);
        days.get(task.onDate).push(task);
      }
      return [...days.entries()];
    };
    return [group(shown.filter((t) => t.onDate < today)), group(shown.filter((t) => t.onDate >= today))];
  }, [shown, today]);
  const earlierCount = earlier.reduce((n, [, items]) => n + items.length, 0);

  const toggle = async (event, task) => {
    event.stopPropagation();
    const wasDone = Store.isDone(task.id);
    try {
      await Store.toggleComplete(task.id);
      say(wasDone ? `${task.title} is back on the list` : `${task.title} marked done`);
    } catch (err) {
      say(err.message);
    }
  };

  return (
    <div className="page">
      {toast}

      <header className="page-head">
        <div>
          <h1>Tasks</h1>
          <p>
            {myOpen.length === 0
              ? `Nothing left for you this month. ${familyOpen.length} open across the family.`
              : `${myOpen.length} left for you this month, ${familyOpen.length} across the family.`}
          </p>
        </div>
      </header>

      <section className="fair" aria-labelledby="fair-title">
        <div className="fair-status">
          <div>
            <p className="fair-kicker">How the care of {Store.recipient().name} is shared</p>
            <h2 id="fair-title">{anythingShared ? fairness.headline : "Nothing is shared out yet"}</h2>
          </div>
          {anythingShared && (
            <span className={`fair-spread ${fairness.proportional ? "is-even" : "is-uneven"}`}>{spreadLabel(fairness)}</span>
          )}
        </div>
        <FairnessBar burdens={fairness.burdens} />
        <ul className="fair-legend">
          {fairness.burdens.map((b) => {
            const person = Store.person(b.principal_id);
            return (
              <li key={b.principal_id}>
                <i className="fair-dot" style={{ background: person?.color }} />
                <Face person={person} size={32} />
                <div>
                  <strong>
                    {person?.shortName}
                    {person?.isMe ? " (you)" : ""}
                  </strong>
                  <span>
                    {Math.round(b.percent_of_total)}% of the load, {b.task_count} task{b.task_count === 1 ? "" : "s"}
                  </span>
                </div>
              </li>
            );
          })}
          {fairness.paid_count > 0 && (
            <li>
              <i className="fair-dot" style={{ background: "var(--paid)" }} />
              <div>
                <strong>Paid help</strong>
                <span>
                  {fairness.paid_count} task{fairness.paid_count === 1 ? "" : "s"}, not counted as anyone's load
                </span>
              </div>
            </li>
          )}
        </ul>
      </section>

      <div className="tasks-layout">
        <div className="tasks-main">
          <div className="list-toolbar">
            <div className="segmented" role="group" aria-label="Whose tasks">
              <button type="button" aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>
                Mine
              </button>
              <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
                Everyone
              </button>
            </div>
            <div className="segmented" role="group" aria-label="Layout">
              <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>
                <List size={15} /> List
              </button>
              <button type="button" aria-pressed={layout === "calendar"} onClick={() => setLayout("calendar")}>
                <Calendar size={15} /> Calendar
              </button>
            </div>
          </div>

          {layout === "calendar" ? (
            <MonthCalendar tasks={shown} onOpen={setOpenTask} />
          ) : (
            <>
              {earlierCount > 0 && (
                <button type="button" className="link toggle-earlier" onClick={() => setShowEarlier(!showEarlier)}>
                  {showEarlier ? "Hide" : "Show"} {earlierCount} earlier this month
                </button>
              )}
              {showEarlier &&
                earlier.map(([day, items]) => (
                  <DayGroup key={day} day={day} items={items} scope={scope} onOpen={setOpenTask} onToggle={toggle} />
                ))}
              {ahead.length === 0 ? (
                <div className="empty">
                  <h2>{tasks.length ? "Nothing coming up" : "No tasks yet"}</h2>
                  <p>
                    {tasks.length
                      ? scope === "mine"
                        ? "Nothing ahead is yours. Switch to Everyone to see the whole family's plan."
                        : "Everything this month is behind you."
                      : "Add what needs doing, and Shoulder works out who has room for it."}
                  </p>
                  <div className="empty-actions">
                    <button type="button" className="btn btn-primary" onClick={onAdd}>
                      <Plus size={16} /> Add a task
                    </button>
                  </div>
                </div>
              ) : (
                ahead.map(([day, items]) => (
                  <DayGroup key={day} day={day} items={items} scope={scope} onOpen={setOpenTask} onToggle={toggle} />
                ))
              )}
            </>
          )}
        </div>

        <aside className="tasks-side" aria-label="This month at a glance">
          {upNext ? (
            <button type="button" className="glance-item" onClick={() => setOpenTask(upNext.id)}>
              <TaskGlyph type={upNext.type} />
              <span className="glance-text">
                <small>Your next task, {friendlyDate(upNext.onDate).toLowerCase()}</small>
                <strong>{upNext.title}</strong>
              </span>
              <ChevronRight size={18} />
            </button>
          ) : (
            <button type="button" className="glance-item" onClick={onAdd}>
              <span className="glyph">
                <Plus size={16} />
              </span>
              <span className="glance-text">
                <small>Nothing coming up for you</small>
                <strong>Add a task</strong>
              </span>
              <ChevronRight size={18} />
            </button>
          )}

          <button type="button" className={`glance-item ${waiting ? "is-alert" : ""}`} onClick={() => onNavigate("inbox")}>
            <span className="glyph">
              <Bell size={16} />
            </span>
            <span className="glance-text">
              <small>{waiting ? "Waiting on you" : "Decisions"}</small>
              <strong>{waiting ? `${waiting} decision${waiting === 1 ? "" : "s"} to make` : "Nothing needs you"}</strong>
            </span>
            <ChevronRight size={18} />
          </button>

          <section className="side-card" aria-labelledby="month-title">
            <h3 id="month-title">This month</h3>
            <dl className="side-stats">
              <div>
                <dt>Your tasks done</dt>
                <dd>
                  {mine.length - myOpen.length} of {mine.length}
                </dd>
              </div>
              <div>
                <dt>Family tasks done</dt>
                <dd>
                  {familyDone} of {tasks.length}
                </dd>
              </div>
              <div>
                <dt>Covered by paid help</dt>
                <dd>{fairness.paid_count}</dd>
              </div>
              <div>
                <dt>Nobody can take yet</dt>
                <dd className={unassigned ? "is-warn" : undefined}>{unassigned}</dd>
              </div>
            </dl>
          </section>

          <section className="side-card" aria-labelledby="agreed-title">
            <div className="side-card-head">
              <h3 id="agreed-title">Agreed</h3>
              {precedents.length > 0 && (
                <a href="#/agreed" className="link">
                  See all
                </a>
              )}
            </div>
            {precedents.length ? (
              <ul className="side-list">
                {precedents.slice(0, 2).map((p) => (
                  <li key={p.id}>
                    <p>{p.text}</p>
                    <small>{p.provenance}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="side-empty">Nothing yet. When the family answers a decision, Shoulder follows it from then on.</p>
            )}
          </section>
        </aside>
      </div>

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function DayGroup({ day, items, scope, onOpen, onToggle }) {
  return (
    <section className="day-group" aria-label={friendlyDate(day)}>
      <h3 className="day-title">{friendlyDate(day)}</h3>
      {items.map((task) => {
        const done = Store.isDone(task.id);
        const holder = Store.holder(task.id);
        return (
          <div
            key={task.id}
            className={`task-row ${done ? "is-done" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(task.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(task.id);
              }
            }}
          >
            <button
              type="button"
              className="tick"
              aria-pressed={done}
              aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
              onClick={(e) => onToggle(e, task)}
            >
              {done && <Check size={13} />}
            </button>
            <TaskGlyph type={task.type} />
            <span className="task-main">
              <span className="task-title">{task.title}</span>
              <span className="task-meta">
                {task.time ? `${task.time}, ` : ""}
                {durationLabel(task.durationMin)}
              </span>
            </span>
            {scope === "all" && (
              <span className="task-who">
                {holder ? (
                  <>
                    <Face person={holder} size={22} />
                    {holder.isMe ? "You" : holder.shortName}
                  </>
                ) : (
                  <span className="quiet">Nobody yet</span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MonthCalendar({ tasks, onOpen }) {
  const today = Store.today();
  const anchor = tasks.length ? dateOf(tasks.find((t) => t.onDate >= today)?.onDate || tasks[0].onDate) : dateOf(today);
  const month = anchor.getMonth();
  const first = new Date(anchor.getFullYear(), month, 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(anchor.getFullYear(), month + 1, 0, 12);

  const weeks = [];
  for (let d = new Date(start); d <= last || weeks.length === 0; ) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }

  const byDate = {};
  for (const t of tasks) (byDate[t.onDate] ||= []).push(t);

  return (
    <section className="calendar" aria-label={first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}>
      <div className="calendar-head">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div key={i} className="calendar-week">
          {week.map((date) => {
            const key = iso(date);
            return (
              <div
                key={key}
                className={`calendar-cell ${date.getMonth() !== month ? "is-outside" : ""} ${key === today ? "is-today" : ""}`}
              >
                <span className="calendar-date">{date.getDate()}</span>
                {(byDate[key] || []).map((task) => {
                  const holder = Store.holder(task.id) || PAID;
                  return (
                    <button
                      type="button"
                      key={task.id}
                      className={`calendar-task ${Store.isDone(task.id) ? "is-done" : ""}`}
                      style={{ borderLeftColor: Store.holder(task.id) ? holder.color : "var(--line-strong)" }}
                      onClick={() => onOpen(task.id)}
                      title={`${task.title}, ${Store.holder(task.id)?.shortName || "nobody yet"}`}
                    >
                      {task.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
