/**
 * Check the browser's fairness engine against the one Python ran.
 *
 * fixtures/fairness_report.json was written by shoulder/tools/fairness.py from
 * the same circle and the same allocation. If this app is going to show a
 * family numbers, they have to be those numbers.
 *
 *     node scripts/verify-engine.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeBurdens, checkProportionality, deviationWithout, normalizeTask } from "../src/data/engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../../fixtures");
const read = (name) => JSON.parse(readFileSync(path.join(fixtures, name), "utf8"));

const circle = read("circle.json");
const outcome = read("outcome.json");
const expected = read("fairness_report.json");

const tasks = circle.tasks.map(normalizeTask);
const assignments = outcome.final_allocation.assignments;
const burdens = computeBurdens(circle.principals, tasks, assignments);
const { proportional, mean, maxDeviation } = checkProportionality(burdens);

let failures = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : `  (python said ${want})`}`);
};

for (const want of expected.burdens) {
  const got = burdens.find((b) => b.principal_id === want.principal_id);
  check(`${want.name} weighted burden`, got.weighted_burden, want.weighted_burden);
  check(`${want.name} adjusted share`, got.adjusted_share, want.adjusted_share);
  check(`${want.name} percent of total`, got.percent_of_total, want.percent_of_total);
  check(`${want.name} task count`, got.task_count, want.task_count);
}
check("mean adjusted share", mean, expected.mean_adjusted_share);
check("max deviation", maxDeviation, expected.max_deviation);
check("proportional", proportional, expected.proportional);

// The paid help option on the October card: the engine found 23 percent to 13.
const paidHelp = read("escalations.json")
  .flatMap((card) => card.options)
  .find((option) => option.effect && option.effect.kind === "paid_help");
if (paidHelp) {
  const after = deviationWithout(circle.principals, tasks, assignments, paidHelp.effect.task_ids);
  const delta = Math.round((after - expected.max_deviation) * 1000) / 1000;
  check(`paid help for ${paidHelp.effect.task_ids.join(", ")} priced`, delta, paidHelp.fairness_delta);
}

console.log(failures ? `\n${failures} mismatch(es)` : "\nthe browser agrees with Python");
process.exit(failures ? 1 : 0);
