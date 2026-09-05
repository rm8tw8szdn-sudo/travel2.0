import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  POI_ADMISSION_CONSUMER_IDS,
  evaluatePoiTypeIdsForConsumer,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const consumers = Object.freeze([
  Object.freeze({ name: "importer", path: "scripts/import-knowledge-expansion-batch05-wave.mjs" }),
  Object.freeze({ name: "semantic-gate", path: "src/lib/routes/knowledge-semantic-gate.mjs" }),
  Object.freeze({ name: "publication-audit", path: "scripts/reconcile-knowledge-poi-positive-admission.mjs" }),
  Object.freeze({ name: "positive-admission-verifier", path: "scripts/verify-knowledge-poi-positive-admission.mjs" }),
  Object.freeze({ name: "core-poi-image-classification", path: "scripts/build-route-v2-image-coverage-batch05.mjs" }),
  Object.freeze({ name: "batch05-adversarial-verifier", path: "scripts/verify-knowledge-expansion-batch05-adversarial.mjs" }),
]);

for (const consumer of consumers) {
  const source = fs.readFileSync(path.join(ROOT, consumer.path), "utf8");
  const consumerCall = new RegExp(`evaluatePoiTypeIdsForConsumer\\(\\s*"${consumer.name}"`, "u");
  assert.match(source, consumerCall, `${consumer.name}: canonical consumer evaluator call missing`);
  assert.doesNotMatch(source, /evaluatePoiTypeIdsFromPolicy/u, `${consumer.name}: bypasses canonical consumer entry point`);
  if (consumer.name === "importer") {
    assert.doesNotMatch(source, /function\s+routePoiEligibility|OPERATIONAL_POI_ROOTS|VISITOR_POI_ROOTS/u, "importer: duplicate POI policy remains");
  }
}
assert.deepEqual(consumers.map((entry) => entry.name), POI_ADMISSION_CONSUMER_IDS);

const cases = Object.freeze([
  Object.freeze({ name: "generic-building-subclass", paths: [["Q910001", "Q41176"]], expected: false }),
  Object.freeze({ name: "generic-facility-subclass", paths: [["Q910002", "Q13226383"]], expected: false }),
  Object.freeze({ name: "prison-subclass", paths: [["Q40357", "Q13226383"]], expected: false }),
  Object.freeze({ name: "museum-building", paths: [["Q33506", "Q41176"]], expected: true }),
  Object.freeze({ name: "monument-structure-building", paths: [["Q4989906", "Q811979", "Q41176"]], expected: true }),
  Object.freeze({ name: "gallery-structure", paths: [["Q1007870", "Q15090615", "Q811979"]], expected: true }),
  Object.freeze({ name: "temple-complex-facility", paths: [["Q58621988", "Q1497364", "Q13226383"]], expected: true }),
  Object.freeze({ name: "broad-plus-travel-positive", paths: [["Q910003", "Q41176"], ["Q570116"]], expected: true }),
  Object.freeze({ name: "operational-plus-travel-positive", paths: [["Q40357", "Q13226383"], ["Q570116"]], expected: false }),
  Object.freeze({ name: "multiple-broad-paths", paths: [["Q910004", "Q41176"], ["Q910005", "Q13226383"]], expected: false }),
]);

const syntheticTypePolicy = {
  maximumSubclassDepth: 8,
  roots: {
    poi: [...new Set(cases.flatMap((testCase) => testCase.paths.map((typePath) => typePath.at(-1))))],
  },
  nodes: {},
  typeClassifications: {},
};
for (const testCase of cases) {
  for (const typePath of testCase.paths) {
    syntheticTypePolicy.typeClassifications[typePath[0]] = { allowedKinds: { poi: true } };
    for (let index = 0; index < typePath.length; index += 1) {
      const typeQid = typePath[index];
      const parentQid = typePath[index + 1];
      const node = syntheticTypePolicy.nodes[typeQid] || { parentQids: [] };
      if (parentQid && !node.parentQids.includes(parentQid)) node.parentQids.push(parentQid);
      syntheticTypePolicy.nodes[typeQid] = node;
    }
  }
}

const decisions = cases.map((testCase) => {
  const instanceOfIds = testCase.paths.map((typePath) => typePath[0]);
  const consumerDecisions = Object.fromEntries(consumers.map((consumer) => [
    consumer.name,
    evaluatePoiTypeIdsForConsumer(consumer.name, instanceOfIds, syntheticTypePolicy).accepted,
  ]));
  assert.deepEqual([...new Set(Object.values(consumerDecisions))], [testCase.expected], testCase.name);
  return {
    name: testCase.name,
    expected: testCase.expected,
    decisions: consumerDecisions,
  };
});
for (const decision of decisions) {
  assert.equal(new Set(Object.values(decision.decisions)).size, 1, `${decision.name}: consumer decision drift`);
}

process.stdout.write(`${JSON.stringify({
  verifier: "knowledge-poi-policy-consistency",
  status: "PASS",
  consumers: consumers.map((entry) => entry.name),
  cases: decisions,
}, null, 2)}\n`);
