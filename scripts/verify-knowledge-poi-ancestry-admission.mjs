import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BROAD_STRUCTURAL_POI_ROOT_QIDS,
  evaluatePoiTypePaths,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

const cases = Object.freeze([
  Object.freeze({ name: "direct-building", paths: [["Q41176"]], accepted: false }),
  Object.freeze({ name: "building-subclass", paths: [["Q900001", "Q41176"]], accepted: false }),
  Object.freeze({ name: "facility-subclass", paths: [["Q900002", "Q13226383"]], accepted: false }),
  Object.freeze({ name: "building-multi-hop", paths: [["Q900003", "Q900004", "Q41176"]], accepted: false }),
  Object.freeze({ name: "facility-multi-hop", paths: [["Q900005", "Q900006", "Q13226383"]], accepted: false }),
  Object.freeze({ name: "museum-building", paths: [["Q33506", "Q41176"]], accepted: true }),
  Object.freeze({ name: "monument-structure-building", paths: [["Q4989906", "Q811979", "Q41176"]], accepted: true }),
  Object.freeze({ name: "gallery-structure", paths: [["Q1007870", "Q15090615", "Q811979"]], accepted: true }),
  Object.freeze({ name: "temple-complex-facility", paths: [["Q58621988", "Q1497364", "Q13226383"]], accepted: true }),
  Object.freeze({ name: "roman-temple-structure", paths: [["Q867143", "Q14752696", "Q811979"]], accepted: true }),
  Object.freeze({ name: "roman-amphitheatre-structure", paths: [["Q7362268", "Q14752696", "Q811979"]], accepted: true }),
  Object.freeze({ name: "broad-plus-attraction", paths: [["Q900007", "Q41176"], ["Q570116"]], accepted: true }),
  Object.freeze({ name: "operational-plus-attraction", paths: [["Q40357", "Q13226383"], ["Q570116"]], accepted: false }),
  Object.freeze({ name: "cyclic-subclass-chain", paths: [["Q900008", "Q900009", "Q900008", "Q41176"]], accepted: false }),
]);

for (const testCase of cases) {
  assert.equal(evaluatePoiTypePaths(testCase.paths).accepted, testCase.accepted, testCase.name);
}

const policy = readJson("data/knowledge/semantic/knowledge-semantic-type-policy.json");
const audit = readJson("data/knowledge/reports/knowledge-poi-positive-admission-audit.json");
const broadRoots = new Set(BROAD_STRUCTURAL_POI_ROOT_QIDS);
const multiLevelBroadPaths = Object.entries(policy.typeClassifications).flatMap(([typeQid, classification]) => {
  const typePath = classification?.allowedKinds?.poi;
  return Array.isArray(typePath) && typePath.length > 1 && broadRoots.has(typePath.at(-1))
    ? [{ typeQid, path: typePath, decision: evaluatePoiTypePaths([typePath], { maximumDepth: policy.maximumSubclassDepth }) }]
    : [];
});
const summary = {
  total: multiLevelBroadPaths.length,
  travelPositive: multiLevelBroadPaths.filter((entry) => entry.decision.classification === "travel-positive").length,
  broadStructuralOnly: multiLevelBroadPaths.filter((entry) => entry.decision.classification === "broad-structural-only").length,
  operationalUnsuitable: multiLevelBroadPaths.filter((entry) => entry.decision.classification === "operational-unsuitable").length,
  unsafeUnresolved: multiLevelBroadPaths.filter((entry) => entry.decision.classification === "unsafe-unresolved").length,
};
for (const field of Object.keys(summary)) assert.equal(audit.multiLevelBroadRootAudit[field], summary[field], `broad-root-audit:${field}`);
assert.equal(audit.multiLevelBroadRootAudit.entries.length, summary.total);
assert.equal(audit.multiLevelBroadRootAudit.candidateEntities, audit.multiLevelBroadRootAudit.published + audit.multiLevelBroadRootAudit.quarantined);

process.stdout.write(`${JSON.stringify({
  verifier: "knowledge-poi-ancestry-admission",
  status: "PASS",
  mutations: cases.length,
  multiLevelBroadRootPaths: summary,
  candidateEntities: audit.before.candidatePois,
  publishedPois: audit.after.publishedPois,
  quarantinedPois: audit.after.quarantinedPois,
}, null, 2)}\n`);
