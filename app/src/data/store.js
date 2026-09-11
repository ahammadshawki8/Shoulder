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
    role: "Nearby · 4 km",
    age: 47,
    bio: "Elder sister · Primary local coordinator · Balancing full-time work and teen family",
    avatar: "/assets/amina_portrait.jpg",
    color: "#3B6E94",
    bg: "rgba(59, 110, 148, 0.12)",
    border: "rgba(59, 110, 148, 0.3)",
    defaultCapacity: 85,
    greeting: "Welcome back, Amina. Your on-ground care duties are balanced with Rian and Elena.",
    shortGreeting: "7 tasks this month · Primary on-ground support",
    phone: "+44 7700 900456",
  },
  rian: {
    id: "rian",
    name: "Rian Rahman",
    shortName: "Rian",
    role: "Distant · 310 km (Leeds)",
    age: 44,
    bio: "Brother · Financial & legal steward · Managing pharmacy refills & remote bills",
    avatar: "/assets/rian_portrait.jpg",
    color: "#BF5D30",
    bg: "rgba(191, 93, 48, 0.12)",
    border: "rgba(191, 93, 48, 0.3)",
    defaultCapacity: 60,
    greeting: "Welcome back, Rian. You are coordinating remotely from Leeds. Mum's bills & orders are up to date.",
    shortGreeting: "5 tasks this month · Remote legal, bills & weekend visits",
    phone: "+44 7700 900789",
  },
  farah: {
    id: "farah",
    name: "Farah Rahman",
    shortName: "Farah",
    role: "Local · 12 km",
    age: 38,
    bio: "Younger sister · Daytime visits & nutrition · Friday & Saturday rest schedule",
    avatar: "/assets/farah_portrait.jpg",
    color: "#1B6B73",
    bg: "rgba(27, 107, 115, 0.12)",
    border: "rgba(27, 107, 115, 0.3)",
    defaultCapacity: 70,
    greeting: "Welcome back, Farah. You have 1 visit scheduled today for Mum. Amina checked in this morning.",
    shortGreeting: "4 tasks this month · Grocery, doctor visits & daytime companionship",
    phone: "+44 7700 900234",
  },
};

export const CARE_RECIPIENT_META = {
  name: "Nasrin Rahman",
  relation: "Mum",
  age: 74,
  avatar: "/assets/nasrin_mum.jpg",
  heroImage: "/assets/mum_care_hero.jpg",
  status: "Peaceful & recovering at home",
  condition: "Mild mobility impairment post-op, hypertension, cardiac checks",
  address: "14 Elm Gardens, High Wycombe, HP11 1RB",
  gpDoctor: "Dr. Harrison · St. Jude's Medical Centre",
  emergencyPhone: "+44 7700 900123",
  notes: "Prefers warm cardamom tea in the garden. Keeps her reading glasses on the bedside dresser.",
};

export const PAID_CAREGIVER_META = {
  id: "paid",
  name: "Elena Vance (Registered Aide)",
  shortName: "Elena (Nurse Aide)",
  role: "Care Agency Aide · Overnight & Clinical",
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
    const customTasks = getStorage("custom_tasks", []);
    return [...circleData.tasks, ...customTasks];
  },

  getAssignments() {
    const base = outcomeData.final_allocation?.assignments || {};
    const custom = getStorage("custom_assignments", {});
    return { ...base, ...custom };
  },

  getCoveredTasks() {
    const defaultCovered = outcomeData.covered || {};
    const extraCovered = getStorage("extra_covered_tasks", {});
    return { ...defaultCovered, ...extraCovered };
  },

  getCompletedTasks() {
    return getStorage("completed_task_ids", ["T01", "T02", "T03"]);
  },

  getTaskNotes(taskId) {
    const notesMap = getStorage("task_care_notes", {});
    return notesMap[taskId] || null;
  },

  saveTaskNote(taskId, note) {
    const notesMap = getStorage("task_care_notes", {});
    notesMap[taskId] = {
      text: note,
      recordedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      byUser: this.getActiveUser(),
    };
    setStorage("task_care_notes", notesMap);
    notify();
  },

  toggleTaskComplete(taskId, optionalNote = "") {
    const current = this.getCompletedTasks();
    const isCurrentlyDone = current.includes(taskId);
    const updated = isCurrentlyDone
      ? current.filter((id) => id !== taskId)
      : [...current, taskId];
    setStorage("completed_task_ids", updated);

    const task = this.getTasks().find((t) => t.id === taskId);
    const activeId = this.getActiveUser();
    const user = PERSON_META[activeId] || { shortName: "Family" };

    if (!isCurrentlyDone) {
      if (optionalNote) {
        this.saveTaskNote(taskId, optionalNote);
      }
      this.addLedgerEntry({
        headline: `${user.shortName} marked "${task?.title || "Task"}" complete`,
        justification: optionalNote ? `Care note: "${optionalNote}"` : "Completed on schedule for Mum.",
        who: activeId,
      });
    }

    notify();
  },

  addTask(taskData) {
    const newId = `T-user-${Date.now()}`;
    const dateObj = new Date(`${taskData.on_date}T12:00:00`);
    const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });

    const newTask = {
      id: newId,
      title: taskData.title,
      task_type: taskData.task_type || "visit",
      on_date: taskData.on_date,
      time: taskData.time || "10:00 AM",
      duration_hours: Number(taskData.duration_hours) || 1.5,
      is_onsite: taskData.is_onsite !== false,
      notes: taskData.notes || "",
      is_custom: true,
      created_by: this.getActiveUser(),
      created_at: new Date().toISOString(),
    };

    // Determine Assignment
    let assignedWho = taskData.assignee;
    let rationale = "";

    if (assignedWho === "auto" || !assignedWho) {
      // Smart Fair Allocation Engine Simulation
      // Calculate current task counts for eligible siblings
      const assignments = this.getAssignments();
      const covered = this.getCoveredTasks();
      const tasks = this.getTasks();

      const loads = { amina: 0, rian: 0, farah: 0 };
      for (const t of tasks) {
        if (!covered[t.id] && assignments[t.id]) {
          loads[assignments[t.id]] = (loads[assignments[t.id]] || 0) + 1;
        }
      }

      // Check constraints for weekday
      const isFriSat = weekday === "Fri" || weekday === "Sat";
      const isMonThu = ["Mon", "Tue", "Wed", "Thu"].includes(weekday);

      const candidates = [];

      // Farah: cannot do Fri/Sat or overnight
      if (!isFriSat && taskData.task_type !== "night") {
        candidates.push({ id: "farah", ratio: loads.farah / 0.7 });
      }

      // Amina: available almost all days (high capacity 0.85)
      candidates.push({ id: "amina", ratio: loads.amina / 0.85 });

      // Rian: distant, works Mon-Thu so cannot do onsite Mon-Thu
      if (!isMonThu || !newTask.is_onsite) {
        candidates.push({ id: "rian", ratio: loads.rian / 0.6 });
      }

      // Sort by smallest workload-to-capacity ratio
      candidates.sort((a, b) => a.ratio - b.ratio);

      if (candidates.length > 0) {
        assignedWho = candidates[0].id;
        const candidateMeta = PERSON_META[assignedWho];
        rationale = `Fair division selected ${candidateMeta.shortName} (current load: ${loads[assignedWho]}, capacity: ${candidateMeta.defaultCapacity}%).`;
      } else {
        assignedWho = "paid";
        rationale = "Stated sibling constraints prevent family coverage; allocated to paid care aide Elena.";
      }
    } else {
      const assignedMeta = PERSON_META[assignedWho] || PAID_CAREGIVER_META;
      rationale = `Directly assigned by family to ${assignedMeta.shortName}.`;
    }

    // Save task
    const customTasks = getStorage("custom_tasks", []);
    setStorage("custom_tasks", [...customTasks, newTask]);

    if (assignedWho === "paid") {
      const extraCovered = getStorage("extra_covered_tasks", {});
      extraCovered[newId] = "Scheduled for Paid Care Aide Elena";
      setStorage("extra_covered_tasks", extraCovered);
    } else {
      const customAssignments = getStorage("custom_assignments", {});
      customAssignments[newId] = assignedWho;
      setStorage("custom_assignments", customAssignments);
    }

    // Add entry to ledger
    this.addLedgerEntry({
      headline: `Scheduled: ${newTask.title}`,
      justification: rationale,
      who: assignedWho,
    });

    notify();
    return { task: newTask, assignedTo: assignedWho, rationale };
  },

  reassignTask(taskId, newAssigneeId, reason = "") {
    const task = this.getTasks().find((t) => t.id === taskId);
    if (!task) return;

    if (newAssigneeId === "paid") {
      const extraCovered = getStorage("extra_covered_tasks", {});
      extraCovered[taskId] = "Reallocated to Paid Care Aide Elena";
      setStorage("extra_covered_tasks", extraCovered);
    } else {
      const customAssignments = getStorage("custom_assignments", {});
      customAssignments[taskId] = newAssigneeId;
      setStorage("custom_assignments", customAssignments);

      // Remove from covered if it was covered
      const extraCovered = getStorage("extra_covered_tasks", {});
      if (extraCovered[taskId]) {
        delete extraCovered[taskId];
        setStorage("extra_covered_tasks", extraCovered);
      }
    }

    const assignedMeta = PERSON_META[newAssigneeId] || PAID_CAREGIVER_META;
    this.addLedgerEntry({
      headline: `Reassigned "${task.title}" to ${assignedMeta.shortName}`,
      justification: reason || `Adjusted rota by family agreement.`,
      who: newAssigneeId,
    });

    notify();
  },

  deleteTask(taskId) {
    const customTasks = getStorage("custom_tasks", []).filter((t) => t.id !== taskId);
    setStorage("custom_tasks", customTasks);

    const customAssignments = getStorage("custom_assignments", {});
    delete customAssignments[taskId];
    setStorage("custom_assignments", customAssignments);

    const completed = this.getCompletedTasks().filter((id) => id !== taskId);
    setStorage("completed_task_ids", completed);

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
    const customEntries = getStorage("custom_ledger_entries", []);
    return {
      entries: [...customEntries, ...(ledgerData.entries || [])],
    };
  },

  addLedgerEntry({ headline, justification, who = "farah" }) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newEntry = {
      time: timeStr,
      headline,
      justification,
      allowed_by: "Family decision & Shoulder fair division engine",
      who,
      id: `led-${Date.now()}`,
    };
    const custom = getStorage("custom_ledger_entries", []);
    setStorage("custom_ledger_entries", [newEntry, ...custom]);
  },

  isPlanBalanced() {
    const open = this.getOpenEscalations();
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

    this.addLedgerEntry({
      headline: `Decision made: ${chosenOption.label}`,
      justification: `Agreed by ${userMeta.shortName}. Precedent established for recurring monthly care schedule.`,
      who: activeUserId,
    });

    notify();
  },

  resetAll() {
    localStorage.removeItem(STORAGE_PREFIX + "active_user");
    localStorage.removeItem(STORAGE_PREFIX + "principals_overrides");
    localStorage.removeItem(STORAGE_PREFIX + "resolved_escalation_ids");
    localStorage.removeItem(STORAGE_PREFIX + "extra_covered_tasks");
    localStorage.removeItem(STORAGE_PREFIX + "user_precedents");
    localStorage.removeItem(STORAGE_PREFIX + "completed_task_ids");
    localStorage.removeItem(STORAGE_PREFIX + "custom_tasks");
    localStorage.removeItem(STORAGE_PREFIX + "custom_assignments");
    localStorage.removeItem(STORAGE_PREFIX + "task_care_notes");
    localStorage.removeItem(STORAGE_PREFIX + "custom_ledger_entries");
    notify();
  },
};
