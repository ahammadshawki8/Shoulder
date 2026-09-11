import circleData from "@fixtures/circle.json";
import outcomeData from "@fixtures/outcome.json";
import escalationsData from "@fixtures/escalations.json";
import familyData from "@fixtures/family.json";
import ledgerData from "@fixtures/ledger.json";
import fairnessReport from "@fixtures/fairness_report.json";

export const PERSON_ORDER = ["amina", "rian", "farah"];

export const PERSON_META = {
  amina: {
    id: "amina",
    name: "Amina Rahman",
    shortName: "Amina",
    role: "Nearby · 12 km",
    color: "#3B6E94",
    bg: "rgba(59, 110, 148, 0.12)",
    border: "rgba(59, 110, 148, 0.3)",
  },
  rian: {
    id: "rian",
    name: "Rian Rahman",
    shortName: "Rian",
    role: "Distant · 140 km (financial)",
    color: "#BF5D30",
    bg: "rgba(191, 93, 48, 0.12)",
    border: "rgba(191, 93, 48, 0.3)",
  },
  farah: {
    id: "farah",
    name: "Farah Rahman",
    shortName: "Farah",
    role: "Local · 8 km",
    color: "#1B6B73",
    bg: "rgba(27, 107, 115, 0.12)",
    border: "rgba(27, 107, 115, 0.3)",
  },
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

export const TYPE_META = {
  appointment: { label: "Doctor Appointment", icon: "Stethoscope", color: "#2563eb" },
  medication: { label: "Prescription & Meds", icon: "Pill", color: "#059669" },
  night: { label: "Overnight Care", icon: "Moon", color: "#7c3aed" },
  transport: { label: "Driving & Transport", icon: "Car", color: "#d97706" },
  admin: { label: "Paperwork & Bills", icon: "FileText", color: "#4b5563" },
  finance: { label: "Financial Planning", icon: "FileText", color: "#4b5563" },
  visit: { label: "Family Visit", icon: "Heart", color: "#e11d48" },
  household: { label: "Groceries & House", icon: "HomeIcon", color: "#0891b2" },
};

// Projection of a principal into the family's public position
export function toPosition(principal) {
  const unavailable = new Set();
  const onsite = new Set();
  const refused = new Set();
  const caps = [];
  const notes = [];
  let remoteOnly = false;

  for (const c of principal.constraints || []) {
    for (const d of c.blocks_weekdays || []) {
      if (c.applies_to_remote === false) onsite.add(d);
      else unavailable.add(d);
    }
    for (const t of c.blocks_task_types || []) refused.add(t);
    if (c.max_tasks_per_period != null) caps.push(c.max_tasks_per_period);
    if (c.requires_remote) remoteOnly = true;
    if (c.tier !== "private") notes.push(c.summary);
  }

  const order = (s) => [...s].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));

  return {
    name: principal.name,
    capacity: principal.capacity,
    distance_km: principal.distance_km,
    unavailable: order(unavailable),
    onsite: order([...onsite].filter((d) => !unavailable.has(d))),
    refused: [...refused].sort(),
    cap: caps.length ? Math.min(...caps) : null,
    remoteOnly,
    notes,
  };
}

// Storage helpers
const STORAGE_PREFIX = "shoulder_v2_";

function getStorage(key, defaultVal) {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val ? JSON.parse(val) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function setStorage(key, val) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
  } catch (e) {}
}

// Global subscribers for reactive state
const subscribers = new Set();
function notify() {
  subscribers.forEach((cb) => cb());
}

export function subscribeStore(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// Store API
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
    const custom = getStorage("principals_overrides", {});
    return circleData.principals.map((p) => {
      if (custom[p.id]) {
        return { ...p, ...custom[p.id] };
      }
      return p;
    });
  },

  getPrincipal(id) {
    return this.getPrincipals().find((p) => p.id === id);
  },

  savePrincipal(id, updates) {
    const current = getStorage("principals_overrides", {});
    current[id] = { ...(current[id] || {}), ...updates };
    setStorage("principals_overrides", current);
    notify();
  },

  getTasks() {
    return circleData.tasks;
  },

  getAssignments() {
    return outcomeData.final_allocation?.assignments || {};
  },

  getCoveredTasks() {
    const defaultCovered = outcomeData.covered || {};
    const extraCovered = getStorage("extra_covered_tasks", {});
    return { ...defaultCovered, ...extraCovered };
  },

  getCompletedTasks() {
    return getStorage("completed_task_ids", ["T01", "T02", "T03"]);
  },

  toggleTaskComplete(taskId) {
    const current = this.getCompletedTasks();
    const updated = current.includes(taskId)
      ? current.filter((id) => id !== taskId)
      : [...current, taskId];
    setStorage("completed_task_ids", updated);
    notify();
  },

  getOpenEscalations() {
    const resolvedIds = getStorage("resolved_escalation_ids", []);
    return escalationsData.filter((card) => !resolvedIds.includes(card.id));
  },

  getPrecedents() {
    const initial = familyData.precedents || [];
    const added = getStorage("user_precedents", []);
    return [...added, ...initial];
  },

  getLedger() {
    return ledgerData;
  },

  isPlanBalanced() {
    const open = this.getOpenEscalations();
    // If open escalations resolved or none, plan is balanced!
    return open.length === 0;
  },

  getFairness() {
    const isBalanced = this.isPlanBalanced();
    if (isBalanced) {
      return {
        status: "Balanced",
        deviation: "4% spread",
        proportional: true,
        burdens: [
          { principal_id: "amina", name: "Amina", share: 34, capacity: 85 },
          { principal_id: "rian", name: "Rian", share: 33, capacity: 60 },
          { principal_id: "farah", name: "Farah", share: 33, capacity: 70 },
        ],
      };
    }
    return {
      status: "Attention Needed",
      deviation: "23% spread",
      proportional: false,
      burdens: [
        { principal_id: "amina", name: "Amina", share: 44, capacity: 85 },
        { principal_id: "rian", name: "Rian", share: 31, capacity: 60 },
        { principal_id: "farah", name: "Farah", share: 25, capacity: 70 },
      ],
    };
  },

  resolveEscalation(cardId, optionIndex, activeUserId) {
    const card = escalationsData.find((c) => c.id === cardId);
    if (!card) return;

    const chosenOption = card.options[optionIndex];
    const resolvedIds = getStorage("resolved_escalation_ids", []);
    const newResolved = [...resolvedIds, cardId];

    // If paid help was chosen, mark those tasks as covered
    if (chosenOption.effect?.kind === "paid_help") {
      const extraCovered = getStorage("extra_covered_tasks", {});
      for (const tid of chosenOption.effect.task_ids || []) {
        extraCovered[tid] = "Arranged paid help";
      }
      setStorage("extra_covered_tasks", extraCovered);

      // Also mark duplicate cards as resolved
      const dup = escalationsData.find((c) => c.id !== cardId && c.kind === "authority_exceeded");
      if (dup && !newResolved.includes(dup.id)) {
        newResolved.push(dup.id);
      }
    }

    setStorage("resolved_escalation_ids", newResolved);

    // Record a new precedent
    const userMeta = PERSON_META[activeUserId] || { shortName: "Family" };
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const newPrecedent = {
      id: `prec-user-${Date.now()}`,
      rule: chosenOption.label,
      provenance: `Decided by ${userMeta.shortName} on ${dateStr}. Applied automatically to future months.`,
      active: true,
    };

    const userPrecedents = getStorage("user_precedents", []);
    setStorage("user_precedents", [newPrecedent, ...userPrecedents]);

    notify();
  },

  resetAll() {
    localStorage.removeItem(STORAGE_PREFIX + "active_user");
    localStorage.removeItem(STORAGE_PREFIX + "principals_overrides");
    localStorage.removeItem(STORAGE_PREFIX + "resolved_escalation_ids");
    localStorage.removeItem(STORAGE_PREFIX + "extra_covered_tasks");
    localStorage.removeItem(STORAGE_PREFIX + "user_precedents");
    localStorage.removeItem(STORAGE_PREFIX + "completed_task_ids");
    notify();
  },
};
