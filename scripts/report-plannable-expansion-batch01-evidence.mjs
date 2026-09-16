import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(await readFile(path.join(ROOT, "data/knowledge/reports/plannable-expansion-batch01-evidence.json"), "utf8"));
const audit = JSON.parse(await readFile(path.join(ROOT, "data/knowledge/batches/plannable-expansion-batch01-evidence-audit.json"), "utf8"));

assert.deepEqual(report.totals, audit.totals);
assert.deepEqual(report.authority, audit.authority);
assert.deepEqual(report.countriesReviewed, audit.countries);
assert.equal(report.authority.readinessPromotions, 0);
assert.equal(report.authority.candidateLeakage, "NONE");
console.log(JSON.stringify({ status: "PASS", outcome: report.outcome, totals: report.totals, nextPromotionReviewInput: report.nextPromotionReviewInput }, null, 2));
