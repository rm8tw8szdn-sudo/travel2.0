import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  POI_ADMISSION_CONSUMER_IDS,
  evaluatePoiTypeIdsForConsumer,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-type-policy.json"), "utf8"));

const cases = Object.freeze([
  Object.freeze({ name: "museum-plus-unknown", instanceOfIds: ["Q33506", "Q999999999999"], expected: false }),
  Object.freeze({ name: "museum-plus-country", instanceOfIds: ["Q33506", "Q6256"], expected: false }),
  Object.freeze({ name: "museum-plus-hospital", instanceOfIds: ["Q33506", "Q16917"], expected: false }),
  Object.freeze({ name: "museum-plus-building", instanceOfIds: ["Q33506", "Q41176"], expected: true }),
  Object.freeze({ name: "museum-plus-monument", instanceOfIds: ["Q33506", "Q4989906"], expected: true }),
  Object.freeze({ name: "unknown-only", instanceOfIds: ["Q999999999999"], expected: false }),
  Object.freeze({ name: "positive-plus-multiple-incompatible", instanceOfIds: ["Q33506", "Q16917", "Q6256"], expected: false }),
  Object.freeze({ name: "museum-plus-cyclic-type", instanceOfIds: ["Q33506", "Q999999999991"], expected: false, fixtureTypePath: ["Q999999999991", "Q999999999991"] }),
  Object.freeze({ name: "museum-plus-overdepth-type", instanceOfIds: ["Q33506", "Q999999999991"], expected: false, fixtureTypePath: [...Array.from({ length: 9 }, (_, index) => `Q${999999999991 - index}`), "Q33506"] }),
]);

const results = [];
for (const testCase of cases) {
  const casePolicy = testCase.fixtureTypePath
    ? { ...policy, typeClassifications: { ...policy.typeClassifications, Q999999999991: { allowedKinds: { poi: testCase.fixtureTypePath } } } }
    : policy;
  const decisions = Object.fromEntries(POI_ADMISSION_CONSUMER_IDS.map((consumerId) => {
    const decision = evaluatePoiTypeIdsForConsumer(consumerId, testCase.instanceOfIds, casePolicy);
    assert.equal(decision.accepted, testCase.expected, `${testCase.name}:${consumerId}`);
    assert.equal(decision.typeSignals.length, testCase.instanceOfIds.length, `${testCase.name}:${consumerId}:all P31 signals must be evaluated`);
    return [consumerId, decision.accepted];
  }));
  assert.equal(new Set(Object.values(decisions)).size, 1, `${testCase.name}:cross-consumer drift`);
  results.push({ name: testCase.name, expected: testCase.expected, decisions });
}

process.stdout.write(`${JSON.stringify({
  verifier: "knowledge-poi-mixed-type-admission",
  status: "PASS",
  cases: results.length,
  consumers: POI_ADMISSION_CONSUMER_IDS,
  results,
}, null, 2)}\n`);
