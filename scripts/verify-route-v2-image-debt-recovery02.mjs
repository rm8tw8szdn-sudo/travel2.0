import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeKnowledgeBaselineText } from "./lib/knowledge-baseline-text.mjs";

import {
  RECOVERY02_REPORT_PATH,
  RECOVERY02_SUMMARY_PATH,
  collectImageDebtRecovery02Audit,
  recovery02BindingErrors,
  renderImageDebtRecovery02Report,
} from "./lib/image-debt-recovery02-audit.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const loadJson = name => JSON.parse(fs.readFileSync(path.join(ROOT, `data/route-v2/images/${name}.json`), "utf8"));
const asset = loadJson("image-debt-recovery02-provenance").assets.find(record => record.entityType === "POI" && /^CC BY/u.test(record.license));
const inventory = loadJson("image-debt-recovery02-inventory").records.find(record => record.entityId === asset.entityId);
const destination = loadJson("image-coverage-manifest").pois.find(record => record.entityId === asset.entityId);
const decision = loadJson("image-debt-recovery02-visual-audit").decisions.find(record => record.entityId === asset.entityId);
const fixture = { inventory, asset, destination, decision, countryCode: inventory.countryCode,
  published: { entityId: inventory.entityId, wikidataId: inventory.qid, parentCityEntityId: inventory.parentCityEntityId } };
assert.deepEqual(recovery02BindingErrors(fixture), []);
const mutations = [
  ["non-published-target", f => { f.published = null; }],
  ["wrong-entity", f => { f.asset.entityId += '-wrong'; }],
  ["wrong-QID", f => { f.asset.wikidataId = 'Q1'; }],
  ["wrong-parent", f => { f.asset.parentCityEntityId = 'wrong-city'; }],
  ["wrong-country", f => { f.destination.countryCode = 'XX'; }],
  ["missing-license-url", f => { f.asset.licenseUrl = ''; }],
  ["placeholder-creator", f => { f.asset.creator = 'unknown'; f.asset.author = 'unknown'; }],
  ["wrong-hash", f => { f.asset.processedHash = '0'.repeat(64); }],
  ["oversized", f => { f.asset.bytes = 600000; }],
  ["unreviewed", f => { f.decision.status = 'pending'; }],
];
for (const [name, mutate] of mutations) {
  const mutated = structuredClone(fixture); mutate(mutated);
  assert(recovery02BindingErrors(mutated).length > 0, `${name}:must-fail`);
}
const actual = collectImageDebtRecovery02Audit({ root: ROOT });
assert.deepEqual(actual.errors, []);
const sealed = JSON.parse(fs.readFileSync(path.join(ROOT, RECOVERY02_SUMMARY_PATH), "utf8"));
assert.deepEqual(sealed, actual, "Recovery 02 final summary must equal dynamic inventory/manifest/provenance truth");
const expectedReport = renderImageDebtRecovery02Report(actual);
const verifyReport = report => assert.equal(normalizeKnowledgeBaselineText(report), normalizeKnowledgeBaselineText(expectedReport), "Recovery 02 report is stale");
verifyReport(fs.readFileSync(path.join(ROOT, RECOVERY02_REPORT_PATH), "utf8"));
verifyReport(expectedReport.replaceAll("\n", "\r\n"));
for (const [search, replacement] of [
  [`Recovered: ${actual.recovered.total}`, `Recovered: ${actual.recovered.total + 1}`],
  [`Remaining: ${actual.remaining.total}`, "Remaining: 13"],
  ["Historical sealed image debt: 13", `Historical sealed image debt: ${actual.remaining.total}`],
]) {
  const changed = expectedReport.replace(search, replacement);
  assert.notEqual(changed, expectedReport);
  assert.throws(() => verifyReport(changed));
}
assert.equal(actual.auditedDebt, actual.before.needsBackfill);
assert.equal(actual.recovered.total + actual.remaining.total, actual.auditedDebt);
assert.equal(actual.recovered.city + actual.remaining.city, actual.before.cityDebt);
assert.equal(actual.recovered.corePoi + actual.remaining.corePoi, actual.before.corePoiDebt);
assert.equal(actual.current.needsBackfill, actual.remaining.total);
assert.equal(actual.provenance.complete, actual.provenance.total);
assert.equal(actual.provenance.licenseComplete, actual.provenance.total);
assert.equal(actual.provenance.licenseUrlComplete, actual.provenance.total);
assert.equal(actual.provenance.creatorCompleteWhereRequired, actual.provenance.attributionRequired);
assert.equal(actual.provenance.attributionCompleteWhereRequired, actual.provenance.attributionRequired);
assert.equal(actual.newAssets.largerThan300Kb, 0);
assert.equal(actual.newAssets.largerThan500Kb, 0);
assert.equal(actual.quality.exactDuplicateGroups, 0);
assert.equal(actual.quality.unsafeVisualDuplicatePairs, 0);
assert.equal(actual.quality.invalidMappings, 0);
assert.equal(actual.quality.quarantinedTargets, 0);
console.log(JSON.stringify({ verifier: "route-v2-image-debt-recovery02", status: "PASS", bindingMutationsKilled: mutations.length, audited: actual.auditedDebt, recovered: actual.recovered, remaining: actual.remaining, current: actual.current, provenance: actual.provenance, quality: actual.quality }, null, 2));
