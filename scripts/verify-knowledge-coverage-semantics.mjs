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

assert.equal(report.catalogCountries, 55);
assert.equal(report.plannableCountries, 38);
assert.equal(report.evidenceBackedCountries, 35);
assert.equal(report.countryOnlyCountries, 17);
assert.equal(report.plannablePercentage, 69.1);
assert.equal(report.evidenceBackedPercentage, 63.6);
assert.equal(report.plannableCountryCodes.includes("NO"), true, "Batch 05 Norway City/POI depth must be reflected as plannable");
assert.equal(report.countryOnlyCountryCodes.includes("NO"), false);
assert.equal(report.countryOnlyCountryCodes.includes("AD"), true, "a Country-only Andorra entity must not imply Route V2 planning depth");
assert(report.catalogCountries > report.plannableCountries, "catalog presence must not be reported as planning coverage");

process.stdout.write(`${JSON.stringify({
  verifier: "knowledge-coverage-semantics",
  status: "PASS",
  ...report,
}, null, 2)}\n`);
