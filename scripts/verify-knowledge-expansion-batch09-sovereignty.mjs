import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const policy = json("data/knowledge/semantic/sovereign-country-policy.json");
const fixtureDocument = json("data/knowledge/fixtures/knowledge-expansion-batch09-sovereignty-negative-fixtures.json");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const sovereignCodes = new Set(policy.sovereignIsoAlpha2);

assert.equal(policy.referenceCount, 195);
assert.equal(sovereignCodes.size, 195);
assert.equal(policy.sovereignIsoAlpha2.length, 195);
assert.equal(countries.every((country) => sovereignCodes.has(country.isoAlpha2)), true, "published Country must be sovereign");
assert.equal(policy.catalogOnlyIsoAlpha2.join(","), "CN");

function validate(records) {
  const violations = [];
  const qidCounts = new Map();
  for (const record of records) {
    qidCounts.set(record.wikidataId, (qidCounts.get(record.wikidataId) || 0) + 1);
    if (!sovereignCodes.has(record.isoAlpha2)) violations.push({ code: "not-sovereign-iso", entityId: record.entityId });
    const exactQid = policy.batch09ExactBindings[record.isoAlpha2];
    if (exactQid && exactQid !== record.wikidataId) violations.push({ code: "batch09-binding-mismatch", entityId: record.entityId });
  }
  for (const [qid, count] of qidCounts) if (count > 1) violations.push({ code: "duplicate-sovereign-qid", qid });
  return { accepted: violations.length === 0, violations };
}

assert.equal(validate(countries).accepted, true);
for (const [code, qid] of Object.entries(policy.batch09ExactBindings)) {
  const country = countries.find((record) => record.isoAlpha2 === code);
  assert(country, `${code}: published sovereign Country`);
  assert.equal(country.wikidataId, qid, `${code}: exact sovereign QID`);
}

let mutationsKilled = 0;
for (const fixture of fixtureDocument.fixtures) {
  let mutated = countries.map((record) => ({ ...record }));
  if (fixture.operation === "append") {
    mutated.push({ ...countries[0], entityId: `country-fixture-${fixture.id}`, isoAlpha2: fixture.code, wikidataId: fixture.qid });
  } else if (fixture.operation === "replace-qid") {
    mutated = mutated.map((record) => record.isoAlpha2 === fixture.code ? { ...record, wikidataId: fixture.qid } : record);
  } else if (fixture.operation === "replace-code") {
    mutated = mutated.map((record) => record.isoAlpha2 === fixture.code ? { ...record, isoAlpha2: fixture.replacementCode } : record);
  }
  const result = validate(mutated);
  assert.equal(result.accepted, false, `${fixture.id}: must fail closed`);
  assert(result.violations.some((record) => record.code === fixture.expectedCode), `${fixture.id}: ${JSON.stringify(result.violations)}`);
  mutationsKilled += 1;
}

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch09-sovereignty",
  status: "PASS",
  sovereignReference: sovereignCodes.size,
  publishedSovereignCountries: countries.length,
  catalogOnlyCountryCodes: policy.catalogOnlyIsoAlpha2,
  exactBatch09Bindings: Object.keys(policy.batch09ExactBindings).length,
  mutationsKilled,
}, null, 2));
