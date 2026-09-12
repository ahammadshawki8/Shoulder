/**
 * Everything the app knows, and the only place it changes.
 *
 * The rota, the people and the decisions come from `fixtures/`, which Python
 * wrote from a real negotiation. What a family does here (marking a task done,
 * adding one, handing one over, answering a card) is layered on top in
 * localStorage, and every number shown on top of that is recomputed by
 * `engine.js`, the mirror of the fairness engine. Nothing here invents a
 * figure.
 */

import circleData from "@fixtures/circle.json";
import outcomeData from "@fixtures/outcome.json";
import escalationsData from "@fixtures/escalations.json";
import familyData from "@fixtures/family.json";
import ledgerData from "@fixtures/ledger.json";

import {
  FAIRNESS_TOLERANCE,
  deviationWithout,
  fairnessOf,
  ineligibleBecause,
  normalizeTask,
  suggestAssignee,
  toPosition,
} from "./engine.js";

export { toPosition, FAIRNESS_TOLERANCE };

export const PERSON_ORDER = ["amina", "rian", "farah"];

export const PERSON_META = {
  amina: {
    id: "amina",
    name: "Amina Rahman",
    shortName: "Amina",
    role: "Nearby, 4 km",
    avatar: "/assets/amina_portrait.jpg",
    color: "#3B6E94",
    bg: "rgba(59, 110, 148, 0.12)",
    border: "rgba(59, 110, 148, 0.3)",
  },
  rian: {
    id: "rian",
    name: "Rian Rahman",
    shortName: "Rian",
    role: "Leeds, 310 km",
    avatar: "/assets/rian_portrait.jpg",
    color: "#BF5D30",
    bg: "rgba(191, 93, 48, 0.12)",
    border: "rgba(191, 93, 48, 0.3)",
  },
  farah: {
    id: "farah",
    name: "Farah Rahman",
    shortName: "Farah",
    role: "Across town, 12 km",
    avatar: "/assets/farah_portrait.jpg",
    color: "#1B6B73",
    bg: "rgba(27, 107, 115, 0.12)",
    border: "rgba(27, 107, 115, 0.3)",
  },
};

export const CARE_RECIPIENT_META = {
  name: "Nasrin Rahman",
  relation: "Mum",
  age: 74,
  avatar: "/assets/nasrin_mum.jpg",
  heroImage: "/assets/mum_care_hero.jpg",
  status: "At home, doing alright",
  condition: "Reduced mobility and diabetes",
  notes: "Likes her tea in the garden. Reading glasses live on the bedside dresser.",
};

export const PAID_CAREGIVER_META = {
  id: "paid",
  name: "Elena Vance",
  shortName: "Elena",
  role: "Paid carer",
  avatar: "/assets/elena_caregiver.jpg",
  color: "#6366f1",
  bg: "rgba(99, 102, 241, 0.12)",
  border: "rgba(99, 102, 241, 0.3)",
};

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

// Short labels. The icon carries the rest.
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

export function personOf(id) {
  return PERSON_META[id] || (id === "paid" ? PAID_CAREGIVER_META : null);
}

// -- storage ----------------------------------------------------------------

const STORAGE_PREFIX = "shoulder_v2_";

function getStorage(key, fallback) {
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* a private window is not a reason to lose the screen */
  }
}

const subscribers = new Set();
function notify() {
  subscribers.forEach((cb) => cb());
}

export function subscribeStore(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// -- dates ------------------------------------------------------------------

/** The month the fixtures cover. "Today" is a day inside it, so the app has a now. */
export const TODAY = "2026-10-14";

export function dateOf(iso) {
  return new Date(`${iso}T12:00:00`);
}

/** "Today", "Tomorrow", "Sat 17" : how a person says a date out loud. */
export function friendlyDate(iso, today = TODAY) {
  const days = Math.round((dateOf(iso) - dateOf(today)) / 86400000);
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

// -- the store --------------------------------------------------------------

export const Store = {
  getActiveUser() {
    return getStorage("active_user", "farah");
  },

  setActiveUser(id) {
    setStorage("active_user", id);
    notify();
  },

  getCircle() {
    return circleData;
  },

  getPrincipals() {
    const overrides = getStorage("principals_overrides", {});
    return circleData.principals.map((p) =>
      overrides[p.id] ? { ...p, ...overrides[p.id] } : p
    );
  },

  getPrincipal(id) {
    return this.getPrincipals().find((p) => p.id === id);
  },

  savePrincipal(id, updates) {
    const current = getStorage("principals_overrides", {});
    current[id] = { ...(current[id] || {}), ...updates };
    setStorage("principals_overrides", current);
    this.addLedgerEntry({
      headline: `${PERSON_META[id]?.shortName || "Someone"} updated what they can carry`,
      justification: "A person's own limits are theirs to set. The split was worked out again.",
      who: id,
    });
    notify();
  },

  /**
   * A day this person cannot do, in their own words.
   *
   * Kept in a constraint of their own, so it can be taken back. A day blocked
   * by something else they told their agent stays blocked: this is for adding
   * your own, not for overruling what you already said.
   */
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

    setStorage("principals_overrides", {
      ...getStorage("principals_overrides", {}),
      [principalId]: {
        ...(getStorage("principals_overrides", {})[principalId] || {}),
        constraints,
      },
    });
    notify();
  },

  /** Days blocked by something other than their own day list. */
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

  /** The private reason behind a limit. Saved on this device, never sent. */
  savePrivateReason(principalId, constraintId, reason) {
    const principal = this.getPrincipal(principalId);
    if (!principal) return;
    const constraints = principal.constraints.map((c) =>
      c.id === constraintId ? { ...c, reason } : { ...c }
    );
    setStorage("principals_overrides", {
      ...getStorage("principals_overrides", {}),
      [principalId]: {
        ...(getStorage("principals_overrides", {})[principalId] || {}),
        constraints,
      },
    });
    notify();
  },

  // -- tasks ----------------------------------------------------------------

  getTasks() {
    const custom = getStorage("custom_tasks", []);
    return [...circleData.tasks, ...custom]
      .map(normalizeTask)
      .sort((a, b) => a.onDate.localeCompare(b.onDate) || a.id.localeCompare(b.id));
  },

  getTask(id) {
    return this.getTasks().find((t) => t.id === id) || null;
  },

  getAssignments() {
    return { ...(outcomeData.final_allocation?.assignments || {}), ...getStorage("custom_assignments", {}) };
  },

  /** Tasks nobody in the family carries, because paid help covers them. */
  getCoveredTasks() {
    return { ...(outcomeData.covered || {}), ...getStorage("extra_covered_tasks", {}) };
  },

  /** Anything before today is behind us; the rest is still to come. */
  getCompletedTasks() {
    const saved = getStorage("completed_task_ids", null);
    if (saved) return saved;
    return circleData.tasks.filter((t) => t.on_date < TODAY).map((t) => t.id);
  },

  /** Who holds a task: a sibling, or Elena when paid help covers it. */
  holderOf(taskId) {
    if (this.getCoveredTasks()[taskId]) return PAID_CAREGIVER_META;
    return personOf(this.getAssignments()[taskId]);
  },

  getTaskNotes(taskId) {
    return getStorage("task_care_notes", {})[taskId] || null;
  },

  saveTaskNote(taskId, note) {
    const notes = getStorage("task_care_notes", {});
    notes[taskId] = {
      text: note,
      recordedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      byUser: this.getActiveUser(),
    };
    setStorage("task_care_notes", notes);
    notify();
  },

  toggleTaskComplete(taskId, note = "") {
    const done = this.getCompletedTasks();
    const wasDone = done.includes(taskId);
    setStorage(
      "completed_task_ids",
      wasDone ? done.filter((id) => id !== taskId) : [...done, taskId]
    );

    if (!wasDone) {
      const task = this.getTask(taskId);
      const who = PERSON_META[this.getActiveUser()]?.shortName || "Someone";
      if (note) this.saveTaskNote(taskId, note);
      this.addLedgerEntry({
        headline: `${who} finished ${task?.title || "a task"}`,
        justification: note ? `Note: ${note}` : "Marked done in the app.",
        who: this.getActiveUser(),
      });
    }
    notify();
  },

  /**
   * Add a task. With no name attached, the same rule that built the opening
   * split picks who: the eligible person whose adjusted load stays lowest.
   */
  addTask(input) {
    const id = `T-added-${Date.now()}`;
    const task = normalizeTask({
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
    });

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
        : "Nobody in the family can take this one inside their stated limits.";
      if (suggestion.blocked.length) {
        why += ` ${suggestion.blocked.map((b) => b.why).join(". ")}.`;
      }
    } else {
      why = `Chosen by ${PERSON_META[this.getActiveUser()]?.shortName || "the family"}.`;
    }

    setStorage("custom_tasks", [...getStorage("custom_tasks", []), { ...input, id, is_custom: true, created_by: this.getActiveUser() }]);

    if (holder === "paid") {
      const covered = getStorage("extra_covered_tasks", {});
      covered[id] = "Paid help";
      setStorage("extra_covered_tasks", covered);
    } else {
      const assignments = getStorage("custom_assignments", {});
      assignments[id] = holder;
      setStorage("custom_assignments", assignments);
    }
    setStorage("assignment_reasons", { ...getStorage("assignment_reasons", {}), [id]: why });

    this.addLedgerEntry({
      headline: `Added ${task.title}, and asked ${personOf(holder)?.shortName || "Elena"} to take it`,
      justification: why,
      who: holder,
    });
    notify();
    return { task, assignedTo: holder, why };
  },

  reassignTask(taskId, to, reason = "") {
    const task = this.getTask(taskId);
    if (!task) return;

    if (to === "paid") {
      setStorage("extra_covered_tasks", { ...getStorage("extra_covered_tasks", {}), [taskId]: "Paid help" });
    } else {
      setStorage("custom_assignments", { ...getStorage("custom_assignments", {}), [taskId]: to });
      const covered = getStorage("extra_covered_tasks", {});
      if (covered[taskId]) {
        delete covered[taskId];
        setStorage("extra_covered_tasks", covered);
      }
    }

    const why = reason || "Agreed between the family.";
    setStorage("assignment_reasons", { ...getStorage("assignment_reasons", {}), [taskId]: why });
    this.addLedgerEntry({
      headline: `${task.title} moved to ${personOf(to)?.shortName || "Elena"}`,
      justification: why,
      who: to,
    });
    notify();
  },

  deleteTask(taskId) {
    setStorage("custom_tasks", getStorage("custom_tasks", []).filter((t) => t.id !== taskId));
    const assignments = getStorage("custom_assignments", {});
    delete assignments[taskId];
    setStorage("custom_assignments", assignments);
    setStorage("completed_task_ids", this.getCompletedTasks().filter((id) => id !== taskId));
    notify();
  },

  /** Why this person holds this task. */
  whyAssigned(taskId) {
    const saved = getStorage("assignment_reasons", {})[taskId];
    if (saved) return saved;
    if (this.getCoveredTasks()[taskId]) {
      return "The family decided paid help covers this one.";
    }
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

  // -- the split ------------------------------------------------------------

  /** Assignments that count towards someone's load: paid help is nobody's. */
  assignmentsInPlay() {
    const covered = this.getCoveredTasks();
    return Object.fromEntries(
      Object.entries(this.getAssignments()).filter(([id]) => !covered[id])
    );
  },

  /** The whole verdict, recomputed from what the family has actually done. */
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

  /** What an escalation option would do to the spread, priced by the engine. */
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

  /** The split as it would look if this option were taken. */
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

  getOpenEscalations() {
    const resolved = getStorage("resolved_escalation_ids", []);
    return escalationsData.filter((card) => !resolved.includes(card.id));
  },

  getResolvedEscalations() {
    const resolved = getStorage("resolved_escalation_ids", []);
    return escalationsData.filter((card) => resolved.includes(card.id));
  },

  resolveEscalation(cardId, optionIndex, decidedBy) {
    const card = escalationsData.find((c) => c.id === cardId);
    if (!card) return null;
    const option = card.options[optionIndex];
    if (!option) return null;

    const resolved = [...getStorage("resolved_escalation_ids", []), cardId];
    const effect = option.effect || { kind: "none" };

    if (effect.kind === "paid_help" || effect.kind === "remove_tasks") {
      const covered = getStorage("extra_covered_tasks", {});
      for (const id of effect.task_ids || []) {
        covered[id] = effect.kind === "paid_help" ? "Paid help" : "Taken off the plan";
      }
      setStorage("extra_covered_tasks", covered);

      // One decision answers the same question everywhere: any other open card
      // offering the same thing is answered too, so nobody is asked twice.
      for (const other of escalationsData) {
        if (other.id === cardId || resolved.includes(other.id)) continue;
        const match = other.options.some(
          (o) =>
            o.effect?.kind === effect.kind &&
            JSON.stringify([...(o.effect.task_ids || [])].sort()) ===
              JSON.stringify([...(effect.task_ids || [])].sort())
        );
        if (match) resolved.push(other.id);
      }
    }

    setStorage("resolved_escalation_ids", resolved);

    if (effect.kind !== "none") {
      const who = PERSON_META[decidedBy]?.shortName || "The family";
      const when = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      setStorage("user_precedents", [
        {
          id: `prec-${Date.now()}`,
          rule: option.label,
          provenance: `${who} decided this on ${when}`,
          active: true,
        },
        ...getStorage("user_precedents", []),
      ]);
    }

    this.addLedgerEntry({
      headline: `The family chose: ${option.label}`,
      justification: option.consequence,
      who: decidedBy,
    });
    notify();
    return option;
  },

  /** Standing decisions, from the family's history and from this session. */
  getPrecedents() {
    const fromFixtures = (familyData.precedents || []).map((p) => ({
      id: p.id,
      text: p.text,
      provenance: p.provenance || `${p.decided_by} decided this`,
      active: p.active !== false,
      period: p.period_decided,
    }));
    const fromHere = getStorage("user_precedents", []).map((p) => ({
      id: p.id,
      text: p.text || p.rule,
      provenance: p.provenance,
      active: p.active !== false,
      period: null,
    }));
    return [...fromHere, ...fromFixtures];
  },

  // -- the trail ------------------------------------------------------------

  /**
   * Everything done without asking, oldest question first: what it did, and
   * why it was allowed to do it alone. Python's ledger and this session's
   * entries are different shapes, so both are flattened here.
   */
  getLedger() {
    const fromHere = getStorage("custom_ledger_entries", []).map((e) => ({
      id: e.id,
      when: e.time,
      summary: e.headline,
      justification: e.justification,
      who: e.who,
      kind: "took_action",
    }));
    const fromFixtures = (ledgerData || []).map((e) => ({
      id: e.id,
      when: new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      summary: e.summary,
      justification: e.justification,
      who: (e.actor || "").replace("agent:", ""),
      kind: e.kind,
      round: e.round_number,
    }));
    return [...fromHere, ...fromFixtures];
  },

  addLedgerEntry({ headline, justification, who = "farah" }) {
    const entry = {
      id: `led-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      headline,
      justification,
      who,
      allowed_by: "Inside what the family lets me do alone.",
    };
    setStorage("custom_ledger_entries", [entry, ...getStorage("custom_ledger_entries", [])]);
  },

  resetAll() {
    for (const key of [
      "active_user", "principals_overrides", "resolved_escalation_ids",
      "extra_covered_tasks", "user_precedents", "completed_task_ids",
      "custom_tasks", "custom_assignments", "task_care_notes",
      "custom_ledger_entries", "assignment_reasons",
    ]) {
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
    notify();
  },
};
