/**
 * What the app currently knows, and the only way to change it.
 *
 * This is a cache of one server response: the family, as the logged-in person
 * is allowed to see it. Nothing is worked out here. Who does what, how even the
 * split is, what each choice on a card would do, and who is allowed to take a
 * task all arrive already decided by the engine on the server, so the browser
 * can never show a number the family would not actually get.
 *
 * Nothing about the family is kept in the browser between visits.
 */

import { api } from "./api.js";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

export const TYPE_META = {
  visit: { label: "Visit", icon: "Heart" },
  appointment: { label: "Appointment", icon: "Stethoscope" },
  medication: { label: "Medication", icon: "Pill" },
  transport: { label: "Driving", icon: "Car" },
  household: { label: "At home", icon: "HomeIcon" },
  admin: { label: "Paperwork", icon: "FileText" },
  finance: { label: "Money", icon: "FileText" },
  night: { label: "Overnight", icon: "Moon" },
};
export const TASK_TYPES = Object.keys(TYPE_META);
export const REFUSABLE = ["night", "transport", "appointment", "household"];
export const RELATIONS = ["Mum", "Dad", "Nan", "Grandad", "Someone else"];
export const DISTANCES = [
  { value: 2, label: "Round the corner" },
  { value: 10, label: "Same town" },
  { value: 40, label: "An hour away" },
  { value: 300, label: "Far away" },
];

// What the server records in `covered` for a task nobody in the family holds.
const PAID_HELP = "Paid help";
const OFF_PLAN = "Taken off the plan";

export const PAID = {
  id: "paid",
  name: "Paid help",
  shortName: "Paid help",
  initials: "P",
  color: "var(--paid)",
  avatar: null,
};

// -- state -------------------------------------------------------------------

let view = null;
let status = "booting"; // booting | signed-out | ready
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function signedOut() {
  view = null;
  status = "signed-out";
  // Whoever logs in next starts on Tasks, not on the last person's settings.
  if (window.location.hash && window.location.hash !== "#/tasks") {
    window.location.hash = "#/tasks";
  }
  emit();
}

function setView(next) {
  view = next;
  status = "ready";
  emit();
  return next;
}

async function change(request) {
  try {
    return setView(await request);
  } catch (error) {
    if (error.status === 401) signedOut();
    throw error;
  }
}

// -- dates -------------------------------------------------------------------

export function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateOf(iso) {
  return new Date(`${iso}T12:00:00`);
}

export function weekdayOf(iso) {
  return WEEKDAYS[(dateOf(iso).getDay() + 6) % 7];
}

export function friendlyDate(iso) {
  const base = Store.today();
  const days = Math.round((dateOf(iso) - dateOf(base)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  const d = dateOf(iso);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  if (days > 1 && days < 7) return weekday;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function longDate(iso) {
  return dateOf(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function durationLabel(minutes) {
  if (minutes >= 480) return "Overnight";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// -- the store ---------------------------------------------------------------

export const Store = {
  status: () => status,

  async boot() {
    try {
      const session = await api.session();
      if (!session.authenticated) {
        signedOut();
        return;
      }
      setView(await api.family());
    } catch {
      signedOut();
    }
  },

  async refresh() {
    try {
      setView(await api.family());
    } catch (error) {
      if (error.status === 401) signedOut();
    }
  },

  // -- getting in ------------------------------------------------------------

  lookupFamily: (code) => api.lookupFamily(code),
  createFamily: (recipient, me) => api.createFamily(recipient, me),
  joinFamily: (code, profile) => api.joinFamily(code, profile),

  async login(familyCode, memberId) {
    await api.login(familyCode, memberId);
    await this.boot();
  },

  async logout() {
    try {
      await api.logout();
    } finally {
      signedOut();
    }
  },

  async leave() {
    await api.leave();
    signedOut();
  },

  // -- reading ---------------------------------------------------------------

  familyCode: () => view.family_code,
  meId: () => view.me,
  today: () => view?.today || isoToday(),
  recipient: () => view.recipient,
  members: () => view.members,
  member: (id) => view.members.find((m) => m.id === id) || null,
  me() {
    return this.member(view.me);
  },

  person(id) {
    if (id === "paid") return PAID;
    const m = view && this.member(id);
    if (!m) return null;
    return {
      id: m.id,
      name: m.name,
      shortName: m.name.split(/\s+/)[0],
      avatar: m.avatar,
      initials: initialsOf(m.name),
      color: m.color,
      isMe: m.is_me,
    };
  },

  people() {
    return view.members.map((m) => this.person(m.id));
  },

  tasks() {
    // A task the family decided to take off the plan is no longer part of it.
    return view.tasks
      .filter((t) => view.covered[t.id] !== OFF_PLAN)
      .map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        onDate: t.on_date,
        weekday: weekdayOf(t.on_date),
        durationMin: t.duration_min,
        requiresPresence: t.requires_presence,
        time: t.time || null,
        notes: t.notes || "",
        isCustom: Boolean(t.is_custom),
      }))
      .sort((a, b) => a.onDate.localeCompare(b.onDate) || a.title.localeCompare(b.title));
  },

  task(id) {
    return this.tasks().find((t) => t.id === id) || null;
  },

  assignments: () => view.assignments,
  covered: () => view.covered,
  completed: () => view.completed,
  isDone: (taskId) => view.completed.includes(taskId),
  note: (taskId) => view.task_notes[taskId] || null,
  why: (taskId) => view.why[taskId] || "",
  eligible: (taskId) => view.eligible[taskId] || [],

  holder(taskId) {
    if (view.covered[taskId] === PAID_HELP) return PAID;
    if (view.covered[taskId]) return null;
    return this.person(view.assignments[taskId]);
  },

  fairness: () => view.fairness,

  /** What the family's agents are doing: idle, scheduled, queued or running. */
  agents: () => view?.agents || { mode: "scripted", state: "idle", last: null },
  /** The handover waiting on a receiving agent for this task, if there is one. */
  pendingHandover: (taskId) => view?.pending_handovers?.[taskId] || null,
  /** True while anything the agents were asked to do is still under way. */
  agentsBusy() {
    if (!view) return false;
    return view.agents?.state !== "idle" || Object.keys(view.pending_handovers || {}).length > 0;
  },
  escalations: () => view.escalations,
  pendingChanges: () => view.pending_changes,
  precedents: () => view.precedents.filter((p) => p.active !== false),
  ledger: () => view.ledger,

  /** Decisions waiting on this person: cards, and changes they have not answered. */
  needsMeCount() {
    if (!view) return 0;
    return view.escalations.length + view.pending_changes.filter((c) => c.needs_my_answer).length;
  },

  /** What the rest of the family can see about this person. */
  shared(memberId) {
    const m = this.member(memberId);
    const days = new Set();
    const refuses = new Set();
    for (const c of m?.constraints || []) {
      (c.blocks_weekdays || []).forEach((d) => days.add(d));
      (c.blocks_task_types || []).forEach((t) => refuses.add(t));
    }
    return {
      capacity: m?.capacity ?? 0,
      distanceKm: m?.distance_km ?? 0,
      days: WEEKDAYS.filter((d) => days.has(d)),
      refuses: [...refuses],
    };
  },

  /** This person's own agent: their instructions, and the brief built from them. */
  myAgent: () => view.my_agent || { instructions: "", brief: "" },

  // -- changing --------------------------------------------------------------

  updateMe: (fields) => change(api.updateMe(fields)),
  updateLimits: (daysOff, refuses) => change(api.updateLimits(daysOff, refuses)),
  updateAgent: (instructions) => change(api.updateAgent(instructions)),
  setReason: (constraintId, reason) => change(api.setReason(constraintId, reason)),
  privacyCatches: () => api.privacyCatches(),

  proposeRecipient: (fields) => change(api.proposeRecipient(fields)),
  answerChange: (changeId, approve) => change(api.answerChange(changeId, approve)),

  /** Adds a task and reports who took it and why, as the server decided. */
  async addTask(input) {
    const before = new Set(view.tasks.map((t) => t.id));
    await change(api.addTask(input));
    const added = view.tasks.find((t) => !before.has(t.id));
    if (!added) return null;
    return {
      taskId: added.id,
      holder: this.holder(added.id),
      why: this.why(added.id),
    };
  },

  deleteTask: (taskId) => change(api.deleteTask(taskId)),
  assignTask: (taskId, to) => change(api.assignTask(taskId, to)),
  toggleComplete: (taskId, note = "") => change(api.toggleComplete(taskId, note)),
  setNote: (taskId, text) => change(api.setNote(taskId, text)),
  negotiate: () => change(api.negotiate()),

  async resolve(cardId, optionIndex) {
    const card = view.escalations.find((c) => c.id === cardId);
    const label = card?.options[optionIndex]?.label;
    await change(api.resolve(cardId, optionIndex));
    return label;
  },
};
