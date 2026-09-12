/**
 * The fairness engine, mirrored in the browser.
 *
 * Every number this app shows a family comes from here, and here is a faithful
 * port of `shoulder/tools/fairness.py` and `shoulder/config.py`. Same weights,
 * same travel rule, same capacity-adjusted proportionality, same eligibility.
 * `npm run verify:engine` checks it against fixtures/fairness_report.json, which
 * Python wrote, so the two cannot drift quietly.
 *
 * Why mirror instead of guess: the product's promise is that the split is
 * computed, not estimated. A UI that shows numbers of its own invention breaks
 * that promise even when it looks right. Before this existed, the schedule
 * divided the load by counting tasks, which said Farah carried the most (15 of
 * 26) when the engine says she carries the least (25 percent), because a night
 * awake is not an hour of paperwork.
 */

// -- shoulder/config.py -----------------------------------------------------

export const EFFORT_WEIGHTS = {
  appointment: 1.3,
  medication: 1.0,
  night: 2.0,
  transport: 1.1,
  admin: 0.8,
  finance: 0.7,
  visit: 0.9,
  household: 1.0,
};

export const REMOTE_CAPABLE = new Set(["admin", "finance"]);
export const TRAVEL_MINUTES_PER_KM = 1.2;
export const TRAVEL_CAP_MINUTES = 180.0;
export const FAIRNESS_TOLERANCE = 0.15;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LONG_DAY = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

// -- tasks ------------------------------------------------------------------

/**
 * One task shape for the whole app.
 *
 * Accepts what Python writes (`type`, `duration_min`, `requires_presence`) and
 * what earlier versions of this app saved to localStorage (`task_type`,
 * `duration_hours`, `is_onsite`), so a family that already added tasks does not
 * lose them.
 */
export function normalizeTask(raw) {
  const durationMin =
    raw.duration_min != null
      ? Number(raw.duration_min)
      : Math.round(Number(raw.duration_hours || 1) * 60);
  const onDate = raw.on_date;
  const weekday =
    raw.weekday ||
    new Date(`${onDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  return {
    id: raw.id,
    title: raw.title,
    type: raw.type || raw.task_type || "visit",
    onDate,
    weekday,
    durationMin,
    requiresPresence: raw.requires_presence ?? raw.is_onsite ?? true,
    // Only tasks a person typed a time for have one. The rest show a duration:
    // inventing "10:00 AM" for every appointment is a small lie the family
    // would plan around.
    time: raw.time || null,
    notes: raw.notes || null,
    isCustom: Boolean(raw.is_custom),
    createdBy: raw.created_by || null,
  };
}

export function needsTravel(task) {
  return task.requiresPresence && !REMOTE_CAPABLE.has(task.type);
}

/** Felt load of one task in weighted hours, for someone at a given distance. */
export function taskLoad(task, distanceKm) {
  const weight = EFFORT_WEIGHTS[task.type] ?? 1.0;
  let minutes = task.durationMin * weight;
  if (needsTravel(task)) {
    minutes += Math.min(2 * distanceKm * TRAVEL_MINUTES_PER_KM, TRAVEL_CAP_MINUTES);
  }
  return minutes / 60.0;
}

/** What this task costs this particular person, including their aversions. */
export function personalDisutility(task, position) {
  return taskLoad(task, position.distance_km) * (position.aversions?.[task.type] ?? 1.0);
}

// -- positions --------------------------------------------------------------

/**
 * A principal projected down to what the circle may see.
 *
 * Port of `Principal.to_position`. Private constraints still shape the
 * position: their days are blocked, their reason is dropped on the floor.
 */
export function toPosition(principal) {
  const unavailable = new Set();
  const onsite = new Set();
  const refused = new Set();
  const caps = [];
  const notes = [];
  let remoteOnly = false;

  for (const c of principal.constraints || []) {
    for (const day of c.blocks_weekdays || []) {
      if (c.applies_to_remote === false) onsite.add(day);
      else unavailable.add(day);
    }
    for (const t of c.blocks_task_types || []) refused.add(t);
    if (c.max_tasks_per_period != null) caps.push(c.max_tasks_per_period);
    if (c.requires_remote) remoteOnly = true;
    if (c.tier !== "private") notes.push(c.summary);
  }

  const inWeekOrder = (set) =>
    [...set].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));

  return {
    principal_id: principal.id,
    name: principal.name,
    capacity: principal.capacity,
    distance_km: principal.distance_km,
    unavailable_weekdays: inWeekOrder(unavailable),
    unavailable_weekdays_onsite: inWeekOrder([...onsite].filter((d) => !unavailable.has(d))),
    refused_task_types: [...refused].sort(),
    max_tasks_per_period: caps.length ? Math.min(...caps) : null,
    remote_only: remoteOnly,
    shareable_notes: notes,
    aversions: { ...(principal.aversions || {}) },
  };
}

/** Port of `_eligible` in shoulder/agents/convener.py. A rule, not a judgement. */
export function isEligible(position, task, held = 0) {
  if (position.unavailable_weekdays.includes(task.weekday)) return false;
  if (position.unavailable_weekdays_onsite.includes(task.weekday) && needsTravel(task)) {
    return false;
  }
  if (position.refused_task_types.includes(task.type)) return false;
  if (position.remote_only && !REMOTE_CAPABLE.has(task.type)) return false;
  if (position.max_tasks_per_period != null && held >= position.max_tasks_per_period) {
    return false;
  }
  return true;
}

/** Why this person cannot take this task, in the circle's own words. */
export function ineligibleBecause(position, task, held = 0) {
  const day = LONG_DAY[task.weekday] || task.weekday;
  if (position.unavailable_weekdays.includes(task.weekday)) {
    return `${position.name} is not available on ${day}`;
  }
  if (position.unavailable_weekdays_onsite.includes(task.weekday) && needsTravel(task)) {
    return `${position.name} cannot be there in person on ${day}`;
  }
  if (position.refused_task_types.includes(task.type)) {
    return `${position.name} does not take ${task.type} work`;
  }
  if (position.remote_only && !REMOTE_CAPABLE.has(task.type)) {
    return `${position.name} can only take work that needs no travel`;
  }
  if (position.max_tasks_per_period != null && held >= position.max_tasks_per_period) {
    return `${position.name} is at their limit of ${position.max_tasks_per_period} tasks`;
  }
  return null;
}

// -- the verdict ------------------------------------------------------------

/**
 * Per person load under an assignment. Port of `compute_burdens`.
 * `assignments` maps task id to principal id; covered tasks are left out by
 * the caller, because paid help is not anyone's burden.
 */
export function computeBurdens(principals, tasks, assignments) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const positions = principals.map(toPosition);
  const weighted = {};

  const burdens = positions.map((pos) => {
    let raw = 0;
    let load = 0;
    let count = 0;
    for (const [taskId, who] of Object.entries(assignments)) {
      if (who !== pos.principal_id) continue;
      const task = byId.get(taskId);
      if (!task) continue;
      count += 1;
      raw += task.durationMin / 60.0;
      load += personalDisutility(task, pos);
    }
    weighted[pos.principal_id] = load;
    return {
      principal_id: pos.principal_id,
      name: pos.name,
      task_count: count,
      raw_hours: round(raw, 2),
      weighted_burden: round(load, 3),
      capacity: pos.capacity,
      adjusted_share: pos.capacity > 0 ? round(load / pos.capacity, 3) : 0,
      percent_of_total: 0,
    };
  });

  const total = Object.values(weighted).reduce((a, b) => a + b, 0);
  for (const b of burdens) {
    b.percent_of_total = total > 0 ? round((100 * weighted[b.principal_id]) / total, 1) : 0;
  }
  return burdens;
}

/** Port of `check_proportionality`. Returns the spread, not a grade. */
export function checkProportionality(burdens, tolerance = FAIRNESS_TOLERANCE) {
  if (!burdens.length) return { proportional: true, mean: 0, maxDeviation: 0 };
  const shares = burdens.map((b) => b.adjusted_share);
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  if (mean <= 0) return { proportional: true, mean: 0, maxDeviation: 0 };
  const maxDeviation = Math.max(...shares.map((s) => Math.abs(s - mean) / mean));
  return {
    proportional: maxDeviation <= tolerance,
    mean: round(mean, 3),
    maxDeviation: round(maxDeviation, 3),
  };
}

/** The one sentence a family reads first. Port of `FairnessReport.headline`. */
export function headline(burdens) {
  if (burdens.length < 2) return "Load is even across the circle.";
  const sorted = [...burdens].sort((a, b) => a.adjusted_share - b.adjusted_share);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (worst.principal_id === best.principal_id) return "Load is even across the circle.";
  if (best.adjusted_share <= 0) return `${worst.name} is carrying the entire load.`;
  const gap = (worst.adjusted_share / best.adjusted_share - 1) * 100;
  return `${worst.name} is carrying ${Math.round(gap)} percent more than ${best.name}.`;
}

/** Everything the surface needs about how the load sits right now. */
export function fairnessOf(principals, tasks, assignments) {
  const burdens = computeBurdens(principals, tasks, assignments);
  const { proportional, mean, maxDeviation } = checkProportionality(burdens);
  return {
    burdens,
    proportional,
    mean,
    maxDeviation,
    tolerance: FAIRNESS_TOLERANCE,
    headline: headline(burdens),
  };
}

/** The spread if these tasks left the family's plan (paid help, or dropped). */
export function deviationWithout(principals, tasks, assignments, taskIds) {
  const drop = new Set(taskIds);
  const remaining = Object.fromEntries(
    Object.entries(assignments).filter(([id]) => !drop.has(id))
  );
  const burdens = computeBurdens(
    principals,
    tasks.filter((t) => !drop.has(t.id)),
    remaining
  );
  return checkProportionality(burdens).maxDeviation;
}

/**
 * The opening split, built the way Python builds it (`seed_allocation`).
 *
 * Scarcest tasks first, so the ones almost nobody can take pick their person
 * before the easy ones soak up the room. Anything nobody can legally take is
 * left unassigned rather than forced on someone, so the shortfall is visible.
 */
export function seedAllocation(principals, tasks) {
  const positions = principals.map(toPosition);
  const load = {};
  const held = {};
  for (const pos of positions) {
    load[pos.principal_id] = 0;
    held[pos.principal_id] = 0;
  }

  const scarcity = (task) =>
    positions.filter((pos) => isEligible(pos, task, held[pos.principal_id])).length;
  const order = [...tasks].sort(
    (a, b) => scarcity(a) - scarcity(b) || taskLoad(b, 0) - taskLoad(a, 0)
  );

  const assignments = {};
  for (const task of order) {
    let best = null;
    let bestScore = null;
    for (const pos of positions) {
      if (!isEligible(pos, task, held[pos.principal_id])) continue;
      const projected =
        pos.capacity > 0
          ? (load[pos.principal_id] + personalDisutility(task, pos)) / pos.capacity
          : Infinity;
      if (bestScore === null || projected < bestScore) {
        best = pos;
        bestScore = projected;
      }
    }
    if (best) {
      assignments[task.id] = best.principal_id;
      load[best.principal_id] += personalDisutility(task, best);
      held[best.principal_id] += 1;
    }
  }
  return assignments;
}

/**
 * The smallest set of tasks whose cover would even the load most.
 *
 * Port of `best_paid_help`. Returns nothing unless it genuinely helps:
 * suggesting paid help that makes the split worse is worse than saying nothing.
 */
export function bestPaidHelp(principals, tasks, assignments, maxTasks = 2) {
  const ids = Object.keys(assignments).sort();
  const now = checkProportionality(computeBurdens(principals, tasks, assignments)).maxDeviation;
  let best = null;

  const consider = (combo) => {
    const after = deviationWithout(principals, tasks, assignments, combo);
    if (best === null || after < best.after || (after === best.after && combo.length < best.ids.length)) {
      best = { ids: combo, after };
    }
  };

  for (const id of ids) consider([id]);
  if (maxTasks >= 2) {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) consider([ids[i], ids[j]]);
    }
  }
  return best && best.after < now ? { ...best, before: now } : null;
}

/**
 * Who should take a new task, by the same rule the opening split uses: the
 * eligible person whose capacity-adjusted load would stay lowest.
 *
 * Returns the choice and the people who could not take it, each with the
 * reason, so the app can show its working instead of asserting a name.
 */
export function suggestAssignee(principals, tasks, assignments, task) {
  const positions = principals.map(toPosition);
  const held = {};
  const load = {};
  for (const pos of positions) {
    held[pos.principal_id] = 0;
    load[pos.principal_id] = 0;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const [taskId, who] of Object.entries(assignments)) {
    const existing = byId.get(taskId);
    const pos = positions.find((p) => p.principal_id === who);
    if (!existing || !pos) continue;
    held[who] += 1;
    load[who] += personalDisutility(existing, pos);
  }

  let best = null;
  let bestScore = null;
  const blocked = [];
  for (const pos of positions) {
    const why = ineligibleBecause(pos, task, held[pos.principal_id]);
    if (why) {
      blocked.push({ principal_id: pos.principal_id, why });
      continue;
    }
    const projected =
      pos.capacity > 0
        ? (load[pos.principal_id] + personalDisutility(task, pos)) / pos.capacity
        : Infinity;
    if (bestScore === null || projected < bestScore) {
      best = pos;
      bestScore = projected;
    }
  }

  return {
    principalId: best ? best.principal_id : null,
    name: best ? best.name : null,
    blocked,
  };
}
