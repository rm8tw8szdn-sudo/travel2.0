import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createKnowledgeCoverageSemantics } from "../src/lib/routes/knowledge-coverage-semantics.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const readJsonl = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const report = createKnowledgeCoverageSemantics({
  countries,
  cities,
  pois,
  routeLegEvidence: readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl"),
  seasonEvidence: readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl"),
});

const publishedCountryCodes = new Set(countries.map((country) => country.isoAlpha2));
const expectedPercentage = (value) => Number(((value / publishedCountryCodes.size) * 100).toFixed(1));
const batch09CountryCodes = [
  "DZ", "GH", "SN", "ET", "NA", "BW", "MG", "MU", "KZ", "UZ",
  "KG", "BD", "BT", "PK", "LA", "BN", "HN", "SV", "WS", "VU",
];

assert.equal(report.catalogCountries, publishedCountryCodes.size, "catalog coverage must follow the published Country registry");
assert.equal(report.plannableCountries + report.countryOnlyCountries, report.catalogCountries);
assert.equal(report.evidenceBackedCountries, report.evidenceBackedCountryCodes.length);
assert.equal(report.plannableCountries, report.plannableCountryCodes.length);
assert.equal(report.countryOnlyCountries, report.countryOnlyCountryCodes.length);
assert.equal(report.plannablePercentage, expectedPercentage(report.plannableCountries));
assert.equal(report.evidenceBackedPercentage, expectedPercentage(report.evidenceBackedCountries));
assert.equal(report.evidenceBackedCountryCodes.every((code) => report.plannableCountryCodes.includes(code)), true);
assert.equal(batch09CountryCodes.every((code) => report.plannableCountryCodes.includes(code)), true, "all Batch 09 countries must be plannable");
assert.equal(batch09CountryCodes.every((code) => report.evidenceBackedCountryCodes.includes(code)), true, "all Batch 09 countries must be Evidence-backed");
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
