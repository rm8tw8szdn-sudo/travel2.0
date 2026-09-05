import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const jsonl = (relativePath) => {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim();
  return source ? source.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
};
const duplicates = (values) => values.length - new Set(values).size;
const seed = json("data/knowledge/seeds/knowledge-expansion-batch06-20-country.json");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const allEntities = [...countries, ...cities, ...pois];
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));
const targetCodes = Object.keys(seed.countries);
const targetCodeSet = new Set(targetCodes);
const imageManifest = json("data/route-v2/images/image-coverage-manifest.json");
const evidenceAudit = json("data/knowledge/batches/knowledge-expansion-batch06-evidence-audit.json");
const routeConsumption = json("data/knowledge/reports/knowledge-expansion-batch06-route-consumption.json");
const batchRouteLegs = jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl").filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
const batchSeasons = jsonl("data/route-v2/evidence-seed/season-evidence.jsonl").filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
const reviewEntries = [1, 2, 3, 4].flatMap((wave) => json(`data/knowledge/batches/review-queue.knowledge-expansion-batch06-wave${wave}.json`).entries);
const selectedCities = [18, 19, 20, 21].flatMap((batch) => json(`data/knowledge/batches/selection.p1b-batch${batch}.json`).cities);
const selectedPois = [18, 19, 20, 21].flatMap((batch) => json(`data/knowledge/batches/selection.p1b-batch${batch}.json`).pois);
const publishedCityIds = new Set(cities.map((city) => city.entityId));
const publishedPoiIds = new Set(pois.map((poi) => poi.entityId));

assert.equal(targetCodes.length, 20);
assert.deepEqual(
  targetCodes.filter((code) => !["KH", "RO", "CR", "UY"].includes(code)).sort(),
  ["AD", "AE", "AR", "BR", "CD", "CL", "EG", "FJ", "IL", "IN", "KE", "MA", "NG", "RU", "SA", "ZA"].sort(),
);
assert.equal(countries.find((country) => country.isoAlpha2 === "CN") != null, true, "China identity must remain Catalog");
assert.equal(imageManifest.countries.some((record) => record.countryCode === "CN"), false, "China must remain non-Plannable under Search V1 policy");
assert.equal(imageManifest.countries.some((record) => record.countryCode === "UY"), true, "Uruguay must replace China as the twentieth Plannable target");
assert.equal(targetCodes.every((code) => imageManifest.countries.some((record) => record.countryCode === code)), true, "all Batch06 targets must be Plannable");
assert.equal(routeConsumption.status, "PASS");
assert.equal(Object.keys(routeConsumption.countries).length, 20);
assert.equal(targetCodes.every((code) => routeConsumption.countries[code]?.testedDurations?.includes(7) && routeConsumption.countries[code]?.testedDurations?.includes(14)), true);
assert.equal(routeConsumption.externalFetchCalls, 0);

assert.equal(duplicates(allEntities.map((entity) => entity.entityId)), 0);
assert.equal(duplicates(countries.map((entity) => entity.wikidataId)), 0);
assert.equal(duplicates(cities.map((entity) => entity.wikidataId)), 0);
assert.equal(duplicates(pois.map((entity) => entity.wikidataId)), 0);
assert.equal(repository.validateParentReferences().accepted, true);
for (const code of targetCodes) {
  const country = countries.find((entry) => entry.isoAlpha2 === code);
  assert(country, `${code}:published-country`);
  const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId);
  const countryCityIds = new Set(countryCities.map((city) => city.entityId));
  assert(countryCities.length >= 3, `${code}:minimum-route-city-depth`);
  assert(pois.some((poi) => countryCityIds.has(poi.parentCityEntityId)), `${code}:published-route-poi-depth`);
}
assert.equal(selectedCities.every((entry) => publishedCityIds.has(entry.entityId)), true);
assert.equal(selectedPois.every((entry) => publishedPoiIds.has(entry.entityId)), true);
for (const entry of reviewEntries.filter((record) => record.disposition === "quarantined-city-not-published")) assert.equal(publishedCityIds.has(entry.parentCityEntityId), false, `${entry.requestedTitle}:quarantined-city-leaked`);

assert.equal(Object.keys(evidenceAudit.countries).length, 20);
assert.equal(batchRouteLegs.length, 172);
assert.equal(batchSeasons.length, 80);
assert.equal(batchRouteLegs.every((record) => validateRouteLegEvidence(record).accepted), true);
assert.equal(batchSeasons.every((record) => validateSeasonEvidence(record).accepted), true);
assert.equal(batchRouteLegs.every((record) => targetCodeSet.has(countryById.get(cityById.get(record.fromEntityId)?.parentCountryEntityId)?.isoAlpha2)), true);
for (const record of batchRouteLegs) {
  const reverse = batchRouteLegs.find((candidate) => candidate.fromEntityId === record.toEntityId && candidate.toEntityId === record.fromEntityId && candidate.transportMode === record.transportMode);
  assert(reverse, `${record.legEvidenceId}:missing-reverse-direction`);
  assert.notEqual(reverse.legEvidenceId, record.legEvidenceId, `${record.legEvidenceId}:directions-require-independent-ids`);
  assert.equal(record.durationMinutes == null, true);
  assert.equal(record.transferCount == null, true);
  assert.equal(record.frequencyPerDay == null, true);
}
assert.equal(batchSeasons.every((record) => record.season == null && record.unknowns.some((entry) => entry.field === "seasonSuitability")), true, "Month Risk must not claim a best season");
assert.deepEqual(imageManifest.invalidMappings, []);
assert.equal(imageManifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);

for (const wave of [1, 2, 3, 4]) {
  const rawPath = `data/knowledge/raw/knowledge-expansion-batch06-wave${wave}.wikidata.json`;
  const attr = spawnSync("git", ["check-attr", "filter", "--", rawPath], { cwd: ROOT, encoding: "utf8" });
  assert.equal(attr.status, 0);
  assert.match(attr.stdout, /filter: lfs/u, `${rawPath}:must-use-git-lfs`);
}

console.log(JSON.stringify({ verifier: "knowledge-expansion-batch06", status: "PASS", targets: targetCodes.length, published: { countries: countries.length, cities: cities.length, pois: pois.length, entities: allEntities.length }, batchAdditions: { countries: json("data/knowledge/batches/countries.p1a-batch06.json").countries.length, cities: selectedCities.length, pois: selectedPois.length }, evidence: { transport: batchRouteLegs.length, monthRisk: batchSeasons.length }, routeQueries: routeConsumption.queryCount, quality: { duplicateEntityIds: 0, duplicateCountryQids: 0, duplicateCityQids: 0, duplicatePoiQids: 0, orphans: 0, invalidMappings: 0, quarantinedItems: reviewEntries.length }, chinaPolicy: "catalog-only-unchanged", replacementTarget: "UY" }, null, 2));
