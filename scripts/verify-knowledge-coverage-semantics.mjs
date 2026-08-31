import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createKnowledgeCoverageSemantics } from "../src/lib/routes/knowledge-coverage-semantics.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
const readJsonl = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const report = createKnowledgeCoverageSemantics({
  countries: repository.listCountries(),
  cities: repository.listCities(),
  pois: repository.listPois(),
  routeLegEvidence: readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl"),
  seasonEvidence: readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl"),
});

assert.equal(report.catalogCountries, 99);
assert.equal(report.plannableCountries, 98);
assert.equal(report.evidenceBackedCountries, 95);
assert.equal(report.countryOnlyCountries, 1);
assert.equal(report.plannablePercentage, 99);
assert.equal(report.evidenceBackedPercentage, 96);
assert.equal(report.plannableCountryCodes.includes("NO"), true, "Batch 05 Norway City/POI depth must be reflected as plannable");
assert.equal(report.countryOnlyCountryCodes.includes("NO"), false);
assert.equal(report.plannableCountryCodes.includes("AD"), true, "Batch 06 Andorra City/POI depth must be reflected as plannable");
assert.equal(report.plannableCountryCodes.includes("AL"), true, "Batch 07 Albania City/POI depth must be reflected as plannable");
assert.equal(report.plannableCountryCodes.includes("GT"), true, "Batch 07 Guatemala City/POI depth must be reflected as plannable");
assert.equal(report.plannableCountryCodes.includes("AM"), true, "Batch 08 Armenia City/POI depth must be reflected as plannable");
assert.equal(report.plannableCountryCodes.includes("NI"), true, "Batch 08 Nicaragua City/POI depth must be reflected as plannable");
assert.deepEqual(report.countryOnlyCountryCodes, ["CN"], "China must remain the only Catalog-only country under the unchanged Search V1 policy");
assert(report.catalogCountries > report.plannableCountries, "catalog presence must not be reported as planning coverage");

process.stdout.write(`${JSON.stringify({
  verifier: "knowledge-coverage-semantics",
  status: "PASS",
  ...report,
}, null, 2)}\n`);
