import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildBatch02PromotionModel } from "./prepare-plannable-expansion-batch02-promotion.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/reports/plannable-expansion-batch02-promotion.json"), "utf8"));
const EXPECTED = ["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "SZ", "TL", "TT", "UG"];
const clone = (value) => structuredClone(value);

export function assertBatch02PromotionContract(report) {
  const live = buildBatch02PromotionModel();
  const liveAtSeal = structuredClone(live);
  liveAtSeal.production = report.production;
  assert.deepEqual(report, liveAtSeal, "sealed Batch02 decision content must match live evaluation apart from additive current entity membership");
  assert.deepEqual(live.evaluatedCountryCodes, EXPECTED);
  assert.equal(live.evaluated, 14);
  assert.equal(live.unaccounted, 0);
  assert.deepEqual(live.promotedCountryCodes, []);
  assert.deepEqual(live.blockedCountryCodes, EXPECTED);
  assert.equal(live.decisions.every((entry) => !entry.liveEvidenceReady && entry.decision === "BLOCK" && entry.blockers.length > 0), true);
  assert.deepEqual(live.evidence.transport, { required: 54, admitted: 11, blocked: 43, unaccounted: 0 });
  assert.deepEqual(live.evidence.season, { required: 41, admitted: 12, blocked: 29, unaccounted: 0 });
  assert.deepEqual(live.evidence.evidenceReadyCountryCodes, []);
  assert.deepEqual(report.production, { countries: 195, destinations: 890, pois: 4159, total: 5244 });
  assert.deepEqual(live.production, { countries: 195, destinations: 911, pois: 4275, total: 5381 });
  assert.deepEqual(live.readiness, { plannable: 122, evidenceBacked: 119, catalogOnly: 73 });
  assert.equal(live.accidentalPromotions, 0);
  assert.equal(live.candidateLeakage, "NONE");
  assert.equal(live.artifactAuthority, "AUDIT_ONLY");
}

assertBatch02PromotionContract(REPORT);
const mutations = [
  ["report-says-ready", (value) => { value.decisions[0].liveEvidenceReady = true; value.decisions[0].decision = "PROMOTE"; }],
  ["caller-says-ready", (value) => { value.callerReadyCountryCodes = ["AO"]; }],
  ["research-says-eligible", (value) => { value.researchEligibleCountryCodes = ["CM"]; }],
  ["reviewed-claim-alone", (value) => { value.promotedCountryCodes = ["CM"]; value.promoted = 1; }],
  ["same-count-substitution", (value) => { value.blockedCountryCodes[0] = "ZZ"; }],
  ["remove-required-transport", (value) => { value.decisions[0].transport.required -= 1; }],
  ["remove-required-season", (value) => { value.decisions[0].season.required -= 1; }],
  ["wrong-country-evidence", (value) => { value.decisions[0].countryCode = "ZZ"; }],
  ["candidate-only-evidence", (value) => { value.decisions[0].candidateEvidence = true; }],
  ["quarantine-only-data", (value) => { value.decisions[0].quarantineEvidence = true; }],
  ["historical-decision-copy", (value) => { value.schemaVersion = "route-v2-plannable-expansion-batch01-promotion-v1"; }],
  ["skip-zero-evaluation", (value) => { value.decisions = []; value.evaluated = 0; }],
];
for (const [label, mutate] of mutations) {
  const value = clone(REPORT);
  mutate(value);
  assert.throws(() => assertBatch02PromotionContract(value), undefined, label);
}

console.log(JSON.stringify({ verifier: "plannable-expansion-batch02-promotion", status: "PASS", evaluated: 14, promoted: 0, blocked: 14, mutationCases: mutations.length, reportAuthority: "NONE" }, null, 2));
