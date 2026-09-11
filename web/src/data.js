// Everything the screens show comes from fixtures/, written by real runs of the
// Python negotiation (python -m shoulder.demos.next_month --live --write-fixtures).
// Nothing here is invented. The helpers below only reshape and phrase it.

import octCircle from "@fixtures/circle.json";
import octOutcome from "@fixtures/outcome.json";
import octLedger from "@fixtures/ledger.json";
import octEscalations from "@fixtures/escalations.json";
import novCircle from "@fixtures/2026-11/circle.json";
import novOutcome from "@fixtures/2026-11/outcome.json";
import novLedger from "@fixtures/2026-11/ledger.json";
import novEscalations from "@fixtures/2026-11/escalations.json";
import family from "@fixtures/family.json";
import privacyDemo from "@fixtures/privacy_demo.json";
import authorityDemo from "@fixtures/authority_demo.json";
import wireLog from "@fixtures/a2a_wire_log.json";

export { family, privacyDemo, authorityDemo, wireLog };

export const MONTHS = [
  { period: "2026-10", label: "October", circle: octCircle, outcome: octOutcome, ledger: octLedger, escalations: octEscalations },
  { period: "2026-11", label: "November", circle: novCircle, outcome: novOutcome, ledger: novLedger, escalations: novEscalations },
];

export const FAIRNESS_TOLERANCE = 0.15;

// One identity colour per person, used on every screen. Validated with the
// dataviz palette checks against both surfaces (all pairs, light and dark).
export const PERSON_ORDER = ["amina", "rian", "farah"];
export const personVar = (id) => `var(--p-${id})`;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
export const dayName = (d) => DAY_NAMES[d] || d;

export const TYPE_WORDS = {
  appointment: "appointments",
  medication: "medication",
  night: "overnight care",
  transport: "transport",
  admin: "paperwork",
  finance: "money and bills",
  visit: "visits",
  household: "household",
};

export const pct = (x) => `${Math.round(x * 100)} percent`;

export function recipientName(circle) {
  return circle.care_recipient.split(",")[0].trim();
}

export function monthLabel(period) {
  const m = MONTHS.find((x) => x.period === period);
  return m ? m.label : period;
}

export function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// Same sentence as FairnessReport.headline() in Python.
export function headline(report) {
  const burdens = report.burdens;
  if (!burdens.length) return "Load is even across the circle.";
  const worst = burdens.reduce((a, b) => (b.adjusted_share > a.adjusted_share ? b : a));
  const best = burdens.reduce((a, b) => (b.adjusted_share < a.adjusted_share ? b : a));
  if (worst.principal_id === best.principal_id) return "Load is even across the circle.";
  if (best.adjusted_share <= 0) return `${worst.name} is carrying the entire load.`;
  const gap = (worst.adjusted_share / best.adjusted_share - 1) * 100;
  return `${worst.name} is carrying ${Math.round(gap)} percent more than ${best.name}.`;
}

// Mirror of Principal.to_position() in Python: what the circle is allowed to
// see. Private constraints still shape it; their words and reasons never do.
export function toPosition(principal) {
  const unavailable = new Set();
  const onsite = new Set();
  const refused = new Set();
  const caps = [];
  const notes = [];
  let remoteOnly = false;
  for (const c of principal.constraints) {
    for (const d of c.blocks_weekdays || []) (c.applies_to_remote === false ? onsite : unavailable).add(d);
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

// What a chosen option becomes, in the family's words. Mirrors
// shoulder/precedent.py extract(): only the effect's kind decides it.
function inSentence(title) {
  const first = title.split(" ")[0];
  const body = Object.values(DAY_NAMES).includes(first) ? title : title[0].toLowerCase() + title.slice(1);
  return `the ${body}`;
}

function joinTitles(titles) {
  const parts = titles.map(inSentence);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function precedentText(effect, circle, deviation) {
  if (!effect || effect.kind === "none") return null;
  const titles = [...new Set((effect.task_ids || []).map((id) => circle.tasks.find((t) => t.id === id)?.title).filter(Boolean))];
  if (effect.kind === "paid_help" && titles.length) return `Paid help covers ${joinTitles(titles)} each month.`;
  if (effect.kind === "remove_tasks" && titles.length) {
    const joined = joinTitles(titles);
    return `${joined[0].toUpperCase()}${joined.slice(1)} come off the plan each month.`;
  }
  if (effect.kind === "accept_split" && deviation != null) {
    const ceiling = Math.ceil(deviation * 100 - 1e-9);
    return `The split can stand with a spread of up to ${ceiling} percent, as long as every stated limit holds and nobody objects.`;
  }
  if (effect.kind === "decline_action") {
    if (effect.action === "arrange_paid_help") return "Keep care within the family. Do not suggest paid help again.";
    if (effect.action === "drop_task") return "Keep every task in the plan. Do not suggest dropping one again.";
    if (effect.action === "change_capacity") {
      const who = circle.principals.find((p) => p.id === effect.principal_id);
      return `Leave ${who ? who.name : "their"}'s capacity as they set it. Do not raise it again.`;
    }
  }
  return null;
}

export function sameEffect(a, b) {
  if (!a || !b || a.kind !== b.kind || ["none", "accept_split"].includes(b.kind)) return false;
  const ids = (e) => [...(e.task_ids || [])].sort().join(",");
  return ids(a) === ids(b) && (a.action || "") === (b.action || "") && (a.principal_id || "") === (b.principal_id || "");
}

export function spreadChange(delta, before) {
  if (!delta) return null;
  const after = before + delta;
  return `Spread ${delta < 0 ? "falls" : "rises"} from ${Math.round(before * 100)} to ${Math.round(after * 100)} percent`;
}
