/**
 * Everything the app knows, in one of two worlds.
 *
 *   demo   the Rahman family, from `fixtures/`, which Python wrote from a real
 *          negotiation: a month of care, a split that will not come out even,
 *          and the two decisions it could not make on its own.
 *   own    an empty circle somebody sets up themselves. No fixtures at all.
 *          The split, and the decision when it cannot be made fair, are worked
 *          out here by `engine.js`, the verified mirror of the Python engine.
 *
 * Screens do not know which world they are in. They ask this module, and the
 * numbers come from the same engine either way.
 */

import circleData from "@fixtures/circle.json";
import outcomeData from "@fixtures/outcome.json";
import escalationsData from "@fixtures/escalations.json";
import familyData from "@fixtures/family.json";
import ledgerData from "@fixtures/ledger.json";

import {
  FAIRNESS_TOLERANCE,
  bestPaidHelp,
  deviationWithout,
  fairnessOf,
  headline,
  ineligibleBecause,
  normalizeTask,
  seedAllocation,
  suggestAssignee,
  toPosition,
} from "./engine.js";

export { toPosition, FAIRNESS_TOLERANCE };

// -- who is who -------------------------------------------------------------

const DEMO_PEOPLE = {
  amina: {
    id: "amina",
    name: "Amina Rahman",
    shortName: "Amina",
    role: "Nearby, 4 km",
    avatar: "/assets/amina_portrait.jpg",
    color: "#3B6E94",
  },
  rian: {
    id: "rian",
    name: "Rian Rahman",
    shortName: "Rian",
    role: "Leeds, 310 km",
    avatar: "/assets/rian_portrait.jpg",
    color: "#BF5D30",
  },
  farah: {
    id: "farah",
    name: "Farah Rahman",
    shortName: "Farah",
    role: "Across town, 12 km",
    avatar: "/assets/farah_portrait.jpg",
    color: "#1B6B73",
  },
};

// Kept for anything still importing it directly.
export const PERSON_META = DEMO_PEOPLE;

export const PAID_CAREGIVER_META = {
  id: "paid",
  name: "Elena Vance",
  shortName: "Elena",
  role: "Paid carer",
  avatar: "/assets/elena_caregiver.jpg",
  color: "#6366f1",
};

/** Colours for a circle somebody builds themselves. Distinct in both themes. */
const PALETTE = ["#3B6E94", "#BF5D30", "#1B6B73", "#7C5AA6", "#A6635A", "#41725A"];

const DEMO_RECIPIENT = {
  name: "Nasrin Rahman",
  relation: "Mum",
  avatar: "/assets/nasrin_mum.jpg",
  status: "At home, doing alright",
  condition: "Reduced mobility and diabetes",
};

export const CARE_RECIPIENT_META = DEMO_RECIPIENT;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export const TYPE_META = {
  appointment: { label: "Appointment", icon: "Stethoscope", color: "#2563eb" },
  medication: { label: "Medication", icon: "Pill", color: "#059669" },
  night: { label: "Overnight", icon: "Moon", color: "#7c3aed" },
  transport: { label: "Driving", icon: "Car", color: "#d97706" },
  admin: { label: "Paperwork", icon: "FileText", color: "#4b5563" },
  finance: { label: "Money", icon: "FileText", color: "#4b5563" },
  visit: { label: "Visit", icon: "Heart", color: "#e11d48" },
  household: { label: "At home", icon: "HomeIcon", color: "#0891b2" },
};

// -- storage ----------------------------------------------------------------

const MODE_KEY = "shoulder_mode";
const subscribers = new Set();

function notify() {
  subscribers.forEach((cb) => cb());
}

export function subscribeStore(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function currentMode() {
  try {
    return localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

/** Each world keeps its own drawer, so trying the demo never touches a real circle. */
function key(name) {
  return `shoulder_v2_${currentMode() || "demo"}_${name}`;
}

function getStorage(name, fallback) {
  try {
    const value = localStorage.getItem(key(name));
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function setStorage(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    /* a private window is not a reason to lose the screen */
  }
}

const EMPTY_WORLD = {
  recipient: { name: "", relation: "Mum", note: "" },
  people: [],
  tasks: [],
  assignments: {},
  covered: {},
  completed: [],
  precedents: [],
  ledger: [],
  reasons: {},
};

function world() {
  return getStorage("world", EMPTY_WORLD);
}

function saveWorld(next) {
  setStorage("world", next);
  notify();
}

function isOwn() {
  return currentMode() === "own";
}

// -- dates ------------------------------------------------------------------

/** The demo month has its own today. A real circle uses the real one. */
export function today() {
  if (isOwn()) return new Date().toISOString().slice(0, 10);
  return "2026-10-14";
}

export const TODAY = "2026-10-14";

export function dateOf(iso) {
  return new Date(`${iso}T12:00:00`);
}

export function friendlyDate(iso, from = null) {
  const base = from || today();
  const days = Math.round((dateOf(iso) - dateOf(base)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  const d = dateOf(iso);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  if (days > 1 && days < 7) return weekday;
  return `${weekday} ${d.getDate()}`;
}

export function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes >= 480) return "overnight";
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

// -- the store --------------------------------------------------------------

export const Store = {
  // -- which world ----------------------------------------------------------

  getMode: currentMode,

  /** Has somebody actually been named, or is that still to come? */
  hasRecipient() {
    return !isOwn() || Boolean(world().recipient.name);
  },

  /**
   * Is setup behind us?
   *
   * Explicitly, not inferred from having one person: adding the first person
   * used to end setup on the spot, so nobody could add a second.
   */
  isReady() {
    if (!isOwn()) return true;
    const w = world();
    return Boolean(w.ready) && w.people.length >= 1 && Boolean(w.recipient.name);
  },

  finishSetup() {
    const w = world();
    saveWorld({ ...w, ready: true });
    if (w.people[0]) this.setActiveUser(w.people[0].id);
  },

  /** Back to the setup screen to add or remove somebody. */
  reopenSetup() {
    saveWorld({ ...world(), ready: false });
  },

  /** Is there a circle waiting from last time? Readable from either world. */
  hasOwnCircle() {
    try {
      const raw = localStorage.getItem("shoulder_v2_own_world");
      if (!raw) return false;
      const w = JSON.parse(raw);
      return Boolean(w.recipient?.name) || (w.people || []).length > 0;
    } catch {
      return false;
    }
  },

  useDemo() {
    localStorage.setItem(MODE_KEY, "demo");
    notify();
  },

  startOwn() {
    localStorage.setItem(MODE_KEY, "own");
    if (!getStorage("world", null)) saveWorld({ ...EMPTY_WORLD });
    notify();
  },

  leaveMode() {
    localStorage.removeItem(MODE_KEY);
    notify();
  },

  /** Throw away a circle somebody built and start again. */
  clearOwn() {
    localStorage.setItem(MODE_KEY, "own");
    saveWorld({ ...EMPTY_WORLD, people: [], tasks: [] });
  },

  // -- people ---------------------------------------------------------------

  getRecipient() {
    if (!isOwn()) return DEMO_RECIPIENT;
    const w = world();
    return {
      name: w.recipient.name || "Your parent",
      relation: w.recipient.relation || "Mum",
      avatar: null,
      status: w.recipient.note || "At home",
      condition: w.recipient.note || "",
    };
  },

  setRecipient(recipient) {
    saveWorld({ ...world(), recipient: { ...world().recipient, ...recipient } });
  },

  /** The full record, private reasons and all. Only ever read on this device. */
  getPrincipals() {
    if (isOwn()) return world().people;
    const overrides = getStorage("principals_overrides", {});
    return circleData.principals.map((p) =>
      overrides[p.id] ? { ...p, ...overrides[p.id] } : p
    );
  },

  getPrincipal(id) {
    return this.getPrincipals().find((p) => p.id === id) || null;
  },

  /** How a person is shown: name, colour, and a face if there is one. */
  person(id) {
    if (id === "paid") return PAID_CAREGIVER_META;
    if (!isOwn()) return DEMO_PEOPLE[id] || null;
    const people = world().people;
    const index = people.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const p = people[index];
    return {
      id: p.id,
      name: p.name,
      shortName: p.name.split(/\s+/)[0],
      role: p.distance_km ? `${p.distance_km} km away` : "Nearby",
      avatar: null,
      initials: initialsOf(p.name),
      color: PALETTE[index % PALETTE.length],
    };
  },

  people() {
    return this.getPrincipals().map((p) => this.person(p.id));
  },

  addPerson({ name, capacity, distanceKm, daysOff = [], refuses = [], privateReason = "" }) {
    const w = world();
    const id = `p${Date.now().toString(36)}`;
    const constraints = [];
    if (daysOff.length || refuses.length) {
      constraints.push({
        id: `${id}-limits`,
        summary: [
          daysOff.length ? `Cannot do ${daysOff.join(", ")}` : "",
          refuses.length ? `does not take ${refuses.join(", ")} work` : "",
        ]
          .filter(Boolean)
          .join(", ")
          .concat("."),
        tier: privateReason ? "private" : "shareable",
        hardness: "hard",
        reason: privateReason || null,
        blocks_weekdays: daysOff,
        blocks_task_types: refuses,
        applies_to_remote: true,
        sensitive_terms: [],
      });
    } else if (privateReason) {
      constraints.push({
        id: `${id}-limits`,
        summary: "Something they would rather not explain.",
        tier: "private",
        hardness: "soft",
        reason: privateReason,
        blocks_weekdays: [],
        blocks_task_types: [],
        applies_to_remote: true,
        sensitive_terms: [],
      });
    }

    const person = {
      id,
      name: name.trim(),
      capacity: Math.max(0.05, Math.min(1, capacity)),
      distance_km: Number(distanceKm) || 0,
      constraints,
      aversions: {},
    };
    saveWorld({ ...w, people: [...w.people, person] });
    this.rebalance(`${person.name} joined the circle`);
    return person;
  },

  removePerson(id) {
    const w = world();
    saveWorld({
      ...w,
      people: w.people.filter((p) => p.id !== id),
      assignments: Object.fromEntries(
        Object.entries(w.assignments).filter(([, who]) => who !== id)
      ),
    });
    this.rebalance("Someone left the circle");
  },

  savePrincipal(id, updates) {
    if (isOwn()) {
      const w = world();
      saveWorld({
        ...w,
        people: w.people.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      });
      this.rebalance(`${this.person(id)?.shortName || "Someone"} changed what they can carry`);
      return;
    }
    const current = getStorage("principals_overrides", {});
    current[id] = { ...(current[id] || {}), ...updates };
    setStorage("principals_overrides", current);
    this.addLedgerEntry({
      headline: `${DEMO_PEOPLE[id]?.shortName || "Someone"} updated what they can carry`,
      justification: "A person's own limits are theirs to set. The split was worked out again.",
      who: id,
    });
    notify();
  },

  togglePersonalDay(principalId, day) {
    const principal = this.getPrincipal(principalId);
    if (!principal) return;
    const own = `${principalId}-personal`;
    const constraints = principal.constraints.map((c) => ({ ...c }));
    let mine = constraints.find((c) => c.id === own);
    if (!mine) {
      mine = {
        id: own,
        summary: "Days I cannot do.",
        tier: "shareable",
        hardness: "hard",
        blocks_weekdays: [],
        blocks_task_types: [],
        applies_to_remote: true,
      };
      constraints.push(mine);
    }
    const days = new Set(mine.blocks_weekdays || []);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    mine.blocks_weekdays = WEEKDAYS.filter((d) => days.has(d));
    mine.summary = mine.blocks_weekdays.length
      ? `Cannot do ${mine.blocks_weekdays.join(", ")}.`
      : "No days blocked.";
    this.savePrincipal(principalId, { constraints });
  },

  fixedDaysFor(principalId) {
    const principal = this.getPrincipal(principalId);
    const own = `${principalId}-personal`;
    const days = new Set();
    for (const c of principal?.constraints || []) {
      if (c.id === own) continue;
      for (const d of c.blocks_weekdays || []) days.add(d);
    }
    return days;
  },

  savePrivateReason(principalId, constraintId, reason) {
    const principal = this.getPrincipal(principalId);
    if (!principal) return;
    const constraints = principal.constraints.map((c) =>
      c.id === constraintId ? { ...c, reason } : { ...c }
    );
    this.savePrincipal(principalId, { constraints });
  },

  getActiveUser() {
    const saved = getStorage("active_user", null);
    const people = this.getPrincipals();
    if (saved && people.some((p) => p.id === saved)) return saved;
    // The demo opens as Farah: she is the one holding something back, so the
    // privacy boundary is visible from the first screen.
    if (!isOwn()) return "farah";
    return people[0]?.id || null;
  },

  setActiveUser(id) {
    setStorage("active_user", id);
    notify();
  },

  // -- tasks ----------------------------------------------------------------

  getTasks() {
    const raw = isOwn() ? world().tasks : [...circleData.tasks, ...getStorage("custom_tasks", [])];
    return raw
      .map(normalizeTask)
      .sort((a, b) => a.onDate.localeCompare(b.onDate) || a.id.localeCompare(b.id));
  },

  getTask(id) {
    return this.getTasks().find((t) => t.id === id) || null;
  },

  getAssignments() {
    if (isOwn()) return world().assignments;
    return {
      ...(outcomeData.final_allocation?.assignments || {}),
      ...getStorage("custom_assignments", {}),
    };
  },

  getCoveredTasks() {
    if (isOwn()) return world().covered;
    return { ...(outcomeData.covered || {}), ...getStorage("extra_covered_tasks", {}) };
  },

  getCompletedTasks() {
    if (isOwn()) return world().completed;
    const saved = getStorage("completed_task_ids", null);
    if (saved) return saved;
    return circleData.tasks.filter((t) => t.on_date < TODAY).map((t) => t.id);
  },

  holderOf(taskId) {
    if (this.getCoveredTasks()[taskId]) return PAID_CAREGIVER_META;
    return this.person(this.getAssignments()[taskId]);
  },

  getTaskNotes(taskId) {
    const notes = isOwn() ? world().notes || {} : getStorage("task_care_notes", {});
    return notes[taskId] || null;
  },

  saveTaskNote(taskId, note) {
    const entry = {
      text: note,
      recordedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      byUser: this.getActiveUser(),
    };
    if (isOwn()) {
      const w = world();
      saveWorld({ ...w, notes: { ...(w.notes || {}), [taskId]: entry } });
      return;
    }
    setStorage("task_care_notes", { ...getStorage("task_care_notes", {}), [taskId]: entry });
    notify();
  },

  toggleTaskComplete(taskId, note = "") {
    const done = this.getCompletedTasks();
    const wasDone = done.includes(taskId);
    const next = wasDone ? done.filter((id) => id !== taskId) : [...done, taskId];
    if (isOwn()) saveWorld({ ...world(), completed: next });
    else setStorage("completed_task_ids", next);

    if (!wasDone) {
      const task = this.getTask(taskId);
      const who = this.person(this.getActiveUser())?.shortName || "Someone";
      if (note) this.saveTaskNote(taskId, note);
      this.addLedgerEntry({
        headline: `${who} finished ${task?.title || "a task"}`,
        justification: note ? `Note: ${note}` : "Marked done in the app.",
        who: this.getActiveUser(),
      });
    }
    notify();
  },

  addTask(input) {
    const id = `T-added-${Date.now().toString(36)}`;
    const record = {
      id,
      title: input.title,
      type: input.type || "visit",
      on_date: input.on_date,
      duration_min: Number(input.duration_min) || 90,
      requires_presence: input.requires_presence !== false,
      time: input.time || null,
      notes: input.notes || "",
      is_custom: true,
      created_by: this.getActiveUser(),
    };
    const task = normalizeTask(record);

    let holder = input.assignee;
    let why = "";
    if (!holder || holder === "auto") {
      const suggestion = suggestAssignee(
        this.getPrincipals(),
        this.getTasks(),
        this.assignmentsInPlay(),
        task
      );
      holder = suggestion.principalId || "paid";
      why = suggestion.principalId
        ? `${suggestion.name} has the most room once everyone's limits are respected.`
        : "Nobody in the circle can take this one inside their stated limits.";
      if (suggestion.blocked.length) {
        why += ` ${suggestion.blocked.map((b) => b.why).join(". ")}.`;
      }
    } else {
      why = `Chosen by ${this.person(this.getActiveUser())?.shortName || "the family"}.`;
    }

    if (isOwn()) {
      const w = world();
      saveWorld({
        ...w,
        tasks: [...w.tasks, record],
        assignments: holder === "paid" ? w.assignments : { ...w.assignments, [id]: holder },
        covered: holder === "paid" ? { ...w.covered, [id]: "Paid help" } : w.covered,
        reasons: { ...w.reasons, [id]: why },
      });
    } else {
      setStorage("custom_tasks", [...getStorage("custom_tasks", []), record]);
      if (holder === "paid") {
        setStorage("extra_covered_tasks", {
          ...getStorage("extra_covered_tasks", {}),
          [id]: "Paid help",
        });
      } else {
        setStorage("custom_assignments", {
          ...getStorage("custom_assignments", {}),
          [id]: holder,
        });
      }
      setStorage("assignment_reasons", {
        ...getStorage("assignment_reasons", {}),
        [id]: why,
      });
    }

    this.addLedgerEntry({
      headline: `Added ${task.title}, and asked ${this.person(holder)?.shortName || "Elena"} to take it`,
      justification: why,
      who: holder,
    });
    notify();
    return { task, assignedTo: holder, why };
  },

  reassignTask(taskId, to, reason = "") {
    const task = this.getTask(taskId);
    if (!task) return;
    const why = reason || "Agreed between the family.";

    if (isOwn()) {
      const w = world();
      const covered = { ...w.covered };
      const assignments = { ...w.assignments };
      if (to === "paid") {
        covered[taskId] = "Paid help";
        delete assignments[taskId];
      } else {
        delete covered[taskId];
        assignments[taskId] = to;
      }
      saveWorld({ ...w, covered, assignments, reasons: { ...w.reasons, [taskId]: why } });
    } else if (to === "paid") {
      setStorage("extra_covered_tasks", {
        ...getStorage("extra_covered_tasks", {}),
        [taskId]: "Paid help",
      });
    } else {
      setStorage("custom_assignments", {
        ...getStorage("custom_assignments", {}),
        [taskId]: to,
      });
      const covered = getStorage("extra_covered_tasks", {});
      if (covered[taskId]) {
        delete covered[taskId];
        setStorage("extra_covered_tasks", covered);
      }
      setStorage("assignment_reasons", {
        ...getStorage("assignment_reasons", {}),
        [taskId]: why,
      });
    }

    this.addLedgerEntry({
      headline: `${task.title} moved to ${this.person(to)?.shortName || "Elena"}`,
      justification: why,
      who: to,
    });
    notify();
  },

  deleteTask(taskId) {
    if (isOwn()) {
      const w = world();
      const assignments = { ...w.assignments };
      const covered = { ...w.covered };
      delete assignments[taskId];
      delete covered[taskId];
      saveWorld({
        ...w,
        tasks: w.tasks.filter((t) => t.id !== taskId),
        assignments,
        covered,
        completed: w.completed.filter((id) => id !== taskId),
      });
    } else {
      setStorage("custom_tasks", getStorage("custom_tasks", []).filter((t) => t.id !== taskId));
      const assignments = getStorage("custom_assignments", {});
      delete assignments[taskId];
      setStorage("custom_assignments", assignments);
      setStorage(
        "completed_task_ids",
        this.getCompletedTasks().filter((id) => id !== taskId)
      );
    }
    notify();
  },

  whyAssigned(taskId) {
    const saved = isOwn() ? world().reasons[taskId] : getStorage("assignment_reasons", {})[taskId];
    if (saved) return saved;
    if (this.getCoveredTasks()[taskId]) return "The family decided paid help covers this one.";
    const holder = this.holderOf(taskId);
    const task = this.getTask(taskId);
    if (!holder || !task) return "";
    const blocked = this.getPrincipals()
      .map(toPosition)
      .filter((pos) => pos.principal_id !== holder.id)
      .map((pos) => ineligibleBecause(pos, task, 0))
      .filter(Boolean);
    const base = `${holder.shortName} had the most room for this once everyone's limits were respected.`;
    return blocked.length ? `${base} ${blocked.join(". ")}.` : base;
  },

  /** Deal the whole month out again from scratch, the way the first split was built. */
  rebalance(because = "The circle changed") {
    if (!isOwn()) return;
    const w = world();
    const tasks = w.tasks.map(normalizeTask).filter((t) => !w.covered[t.id]);
    const assignments = seedAllocation(w.people, tasks);
    saveWorld({ ...w, assignments });
    this.addLedgerEntry({
      headline: "Worked out the split again",
      justification: `${because}, so every task was dealt out again inside everyone's limits.`,
      who: null,
    });
  },

  // -- the split ------------------------------------------------------------

  assignmentsInPlay() {
    const covered = this.getCoveredTasks();
    return Object.fromEntries(
      Object.entries(this.getAssignments()).filter(([id]) => !covered[id])
    );
  },

  getFairness() {
    const tasks = this.getTasks();
    const covered = this.getCoveredTasks();
    const result = fairnessOf(
      this.getPrincipals(),
      tasks.filter((t) => !covered[t.id]),
      this.assignmentsInPlay()
    );
    return {
      ...result,
      status: result.proportional ? "Even" : "Uneven",
      spreadPct: Math.round(result.maxDeviation * 100),
      tolerancePct: Math.round(FAIRNESS_TOLERANCE * 100),
      paidCount: Object.keys(covered).length,
    };
  },

  /** Tasks nobody can legally take, which is a question for the family. */
  unassignedTasks() {
    const assignments = this.getAssignments();
    const covered = this.getCoveredTasks();
    return this.getTasks().filter((t) => !assignments[t.id] && !covered[t.id]);
  },

  priceOption(option) {
    const before = this.getFairness().maxDeviation;
    const effect = option?.effect;
    if (!effect || !["paid_help", "remove_tasks"].includes(effect.kind) || !effect.task_ids?.length) {
      return { before, after: before, delta: 0 };
    }
    const covered = this.getCoveredTasks();
    const tasks = this.getTasks().filter((t) => !covered[t.id]);
    const after = deviationWithout(
      this.getPrincipals(),
      tasks,
      this.assignmentsInPlay(),
      effect.task_ids
    );
    return { before, after, delta: Math.round((after - before) * 1000) / 1000 };
  },

  burdensIfTaken(option) {
    const effect = option?.effect;
    const covered = { ...this.getCoveredTasks() };
    if (effect && ["paid_help", "remove_tasks"].includes(effect.kind)) {
      for (const id of effect.task_ids || []) covered[id] = "Paid help";
    }
    const tasks = this.getTasks().filter((t) => !covered[t.id]);
    const assignments = Object.fromEntries(
      Object.entries(this.getAssignments()).filter(([id]) => !covered[id])
    );
    return fairnessOf(this.getPrincipals(), tasks, assignments);
  },

  // -- decisions ------------------------------------------------------------

  /**
   * The question, if there is one.
   *
   * In your own circle the card is worked out from how things stand right now,
   * never stored. A stored card goes stale the moment somebody adds a task:
   * it kept saying "Sam is carrying the entire load" after the load had moved.
   * So it is derived, and what the family decided is what silences it.
   */
  getOpenEscalations() {
    if (!isOwn()) {
      const resolved = getStorage("resolved_escalation_ids", []);
      return escalationsData.filter((card) => !resolved.includes(card.id));
    }

    const w = world();
    if (!w.people.length || !w.tasks.length) return [];
    const fairness = this.getFairness();
    const uncovered = this.unassignedTasks();
    if (fairness.proportional && !uncovered.length) return [];

    // "Keep it as it is" holds until the split gets worse than what was accepted.
    if (
      !uncovered.length &&
      w.acceptedSpread != null &&
      fairness.maxDeviation <= w.acceptedSpread + 1e-9
    ) {
      return [];
    }
    // "Talk it through" holds until the plan itself changes.
    if (w.mutedFor && w.mutedFor === this.planSignature()) return [];

    return [this.buildCard(fairness, uncovered)];
  },

  /** What the plan looks like right now, so a deferral can expire when it moves. */
  planSignature() {
    return JSON.stringify({
      a: Object.entries(this.getAssignments()).sort(),
      c: Object.keys(this.getCoveredTasks()).sort(),
      t: this.getTasks().map((t) => t.id),
    });
  },

  buildCard(fairness, uncovered) {
    const w = world();
    const covered = this.getCoveredTasks();
    const tasks = this.getTasks().filter((t) => !covered[t.id]);
    const help = bestPaidHelp(w.people, tasks, this.assignmentsInPlay());

    const options = [
      {
        label: "Keep the split as it is",
        consequence: uncovered.length
          ? `Every stated limit is respected, and ${uncovered.length} task${uncovered.length === 1 ? "" : "s"} nobody can take stay uncovered.`
          : "Every stated limit is respected and the care is covered, with the load uneven.",
        effect: { kind: "accept_split", task_ids: [] },
      },
    ];
    if (help) {
      const named = help.ids
        .map((id) => this.getTask(id)?.title)
        .filter(Boolean)
        .join(" and ");
      options.push({
        label: `Bring in paid help for ${named}`,
        consequence: "Those come off the family's plate, and the rest evens out.",
        effect: { kind: "paid_help", task_ids: help.ids },
      });
    }
    if (uncovered.length) {
      options.push({
        label: `Take ${uncovered.length === 1 ? "it" : "them"} off the plan`,
        consequence: `${uncovered.map((t) => t.title).join(", ")} would not happen at all.`,
        effect: { kind: "remove_tasks", task_ids: uncovered.map((t) => t.id) },
      });
    }
    options.push({
      label: "Talk it through together first",
      consequence: "Nothing changes until you have spoken.",
      effect: { kind: "none", task_ids: [] },
    });

    return {
      id: uncovered.length ? "own-shortfall" : "own-fairness",
      kind: uncovered.length ? "capacity_shortfall" : "fairness_breach",
      headline: uncovered.length
        ? `${uncovered.length} task${uncovered.length === 1 ? "" : "s"} nobody in the circle can take.`
        : fairness.headline,
      the_tension: uncovered.length
        ? "Everyone's stated limits rule these out. Something has to give, and it is not mine to choose."
        : "I dealt every task out to whoever had the most room, and this is as even as it goes inside everyone's limits.",
      what_i_tried: [
        "Dealt every task out to whoever had the most room.",
        "Kept every limit anyone told their own agent.",
      ],
      what_i_will_not_decide:
        "Whether to spend money, drop care, or ask somebody to stretch past what they said they can do. Those are yours.",
      options,
    };
  },

  resolveEscalation(cardId, optionIndex, decidedBy) {
    const card = this.getOpenEscalations().find((c) => c.id === cardId)
      || escalationsData.find((c) => c.id === cardId);
    if (!card) return null;
    const option = card.options[optionIndex];
    if (!option) return null;
    const effect = option.effect || { kind: "none" };
    const who = this.person(decidedBy)?.shortName || "The family";
    const when = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    if (isOwn()) {
      const w = world();
      const covered = { ...w.covered };
      const assignments = { ...w.assignments };
      const next = { ...w };

      if (effect.kind === "paid_help" || effect.kind === "remove_tasks") {
        for (const id of effect.task_ids || []) {
          covered[id] = effect.kind === "paid_help" ? "Paid help" : "Taken off the plan";
          delete assignments[id];
        }
      }
      if (effect.kind === "accept_split") {
        // The spread they looked at and said yes to. Asked again only if it widens.
        next.acceptedSpread = Math.ceil(this.getFairness().maxDeviation * 100) / 100;
      }
      if (effect.kind === "none") {
        next.mutedFor = this.planSignature();
      }

      next.covered = covered;
      next.assignments = assignments;
      if (effect.kind !== "none") {
        next.precedents = [
          {
            id: `prec-${Date.now().toString(36)}`,
            text: option.label,
            provenance: `${who} decided this on ${when}`,
            active: true,
          },
          ...w.precedents,
        ];
      }
      saveWorld(next);
    } else {
      const resolved = [...getStorage("resolved_escalation_ids", []), cardId];
      if (effect.kind === "paid_help" || effect.kind === "remove_tasks") {
        const covered = getStorage("extra_covered_tasks", {});
        for (const id of effect.task_ids || []) {
          covered[id] = effect.kind === "paid_help" ? "Paid help" : "Taken off the plan";
        }
        setStorage("extra_covered_tasks", covered);
        for (const other of escalationsData) {
          if (other.id === cardId || resolved.includes(other.id)) continue;
          const same = other.options.some(
            (o) =>
              o.effect?.kind === effect.kind &&
              JSON.stringify([...(o.effect.task_ids || [])].sort()) ===
                JSON.stringify([...(effect.task_ids || [])].sort())
          );
          if (same) resolved.push(other.id);
        }
      }
      setStorage("resolved_escalation_ids", resolved);
      if (effect.kind !== "none") {
        setStorage("user_precedents", [
          { id: `prec-${Date.now().toString(36)}`, text: option.label, provenance: `${who} decided this on ${when}`, active: true },
          ...getStorage("user_precedents", []),
        ]);
      }
    }

    this.addLedgerEntry({
      headline: `The family chose: ${option.label}`,
      justification: option.consequence,
      who: decidedBy,
    });
    notify();
    return option;
  },

  getPrecedents() {
    if (isOwn()) return world().precedents;
    const fromFixtures = (familyData.precedents || []).map((p) => ({
      id: p.id,
      text: p.text,
      provenance: p.provenance || `${p.decided_by} decided this`,
      active: p.active !== false,
    }));
    const fromHere = getStorage("user_precedents", []).map((p) => ({
      id: p.id,
      text: p.text || p.rule,
      provenance: p.provenance,
      active: p.active !== false,
    }));
    return [...fromHere, ...fromFixtures];
  },

  // -- the trail ------------------------------------------------------------

  getLedger() {
    const mine = (isOwn() ? world().ledger : getStorage("custom_ledger_entries", [])).map((e) => ({
      id: e.id,
      when: e.time,
      summary: e.headline,
      justification: e.justification,
      who: e.who,
      kind: e.kind || "took_action",
    }));
    if (isOwn()) return mine;
    const fromFixtures = (ledgerData || []).map((e) => ({
      id: e.id,
      when: new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      summary: e.summary,
      justification: e.justification,
      who: (e.actor || "").replace("agent:", ""),
      kind: e.kind,
    }));
    return [...mine, ...fromFixtures];
  },

  addLedgerEntry({ headline: line, justification, who = null, kind = "took_action" }) {
    const entry = {
      id: `led-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      headline: line,
      justification,
      who,
      kind,
    };
    if (isOwn()) {
      const w = world();
      saveWorld({ ...w, ledger: [entry, ...w.ledger] });
      return;
    }
    setStorage("custom_ledger_entries", [entry, ...getStorage("custom_ledger_entries", [])]);
  },

  resetAll() {
    if (isOwn()) {
      this.clearOwn();
      return;
    }
    for (const name of [
      "active_user", "principals_overrides", "resolved_escalation_ids",
      "extra_covered_tasks", "user_precedents", "completed_task_ids",
      "custom_tasks", "custom_assignments", "task_care_notes",
      "custom_ledger_entries", "assignment_reasons",
    ]) {
      localStorage.removeItem(key(name));
    }
    notify();
  },
};

/** Kept as a function so screens can stay unaware of which world they are in. */
export function personOf(id) {
  return Store.person(id);
}
