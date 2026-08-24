import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { calculateBatch07ReportData } from "./lib/knowledge-expansion-batch07-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const jsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const duplicates = (values) => values.length - new Set(values).size;
const stats = calculateBatch07ReportData({ root: ROOT });
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const allEntities = [...countries, ...cities, ...pois];
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));
const targetCodes = stats.targets.codes;
const targetCodeSet = new Set(targetCodes);
const evidenceAudit = json("data/knowledge/batches/knowledge-expansion-batch07-evidence-audit.json");
const batchRouteLegs = jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl").filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
const batchSeasons = jsonl("data/route-v2/evidence-seed/season-evidence.jsonl").filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
const selectedCities = [22, 23, 24, 25].flatMap((batch) => json(`data/knowledge/batches/selection.p1b-batch${batch}.json`).cities);
const selectedPois = [22, 23, 24, 25].flatMap((batch) => json(`data/knowledge/batches/selection.p1b-batch${batch}.json`).pois);
const reviewEntries = [1, 2, 3, 4].flatMap((wave) => json(`data/knowledge/batches/review-queue.knowledge-expansion-batch07-wave${wave}.json`).entries);

assert.equal(targetCodes.length, 20);
assert.equal(countries.find((country) => country.isoAlpha2 === "CN") != null, true);
assert.equal(stats.imageManifest.countries.some((record) => record.countryCode === "CN"), false, "China remains Catalog-only");
assert.equal(targetCodes.every((code) => stats.imageManifest.countries.some((record) => record.countryCode === code)), true, "all Batch07 targets must be Plannable");
assert.equal(stats.routeConsumption.status, "PASS");
assert.equal(stats.routeConsumption.queryCount, 97);
assert.equal(Object.keys(stats.routeConsumption.countries).length, 20);
assert.equal(stats.routeConsumption.countryOnlyResults.length, 20);
assert.equal(stats.routeConsumption.seasonalResults.length, 20);
assert.equal(stats.routeConsumption.externalFetchCalls, 0);

assert.equal(duplicates(allEntities.map((entity) => entity.entityId)), 0);
assert.equal(duplicates(countries.map((entity) => entity.wikidataId)), 0);
assert.equal(duplicates(cities.map((entity) => entity.wikidataId)), 0);
assert.equal(duplicates(pois.map((entity) => entity.wikidataId)), 0);
assert.equal(repository.validateParentReferences().accepted, true);
for (const code of targetCodes) {
  const seed = stats.seed.countries[code];
  const country = countries.find((entry) => entry.isoAlpha2 === code);
  const countryCities = cities.filter((city) => city.parentCountryEntityId === country?.entityId);
  const minimum = seed.tier === 1 ? 8 : seed.tier === 2 ? 4 : 1;
  assert(country, `${code}:published-country`);
  assert(countryCities.length >= minimum, `${code}:tier-city-depth`);
  assert.equal(countryCities.every((city) => pois.some((poi) => poi.parentCityEntityId === city.entityId)), true, `${code}:every-published-city-has-route-poi`);
  assert(stats.routeConsumption.countries[code].testedDurations.includes(7));
  assert(stats.routeConsumption.countries[code].testedDurations.includes(14));
}
assert.equal(selectedCities.every((entry) => cities.some((city) => city.entityId === entry.entityId)), true);
assert.equal(selectedPois.every((entry) => pois.some((poi) => poi.entityId === entry.entityId)), true);
for (const entry of reviewEntries.filter((record) => record.disposition === "quarantined-city-not-published")) {
  assert.equal(cities.some((city) => city.entityId === entry.parentCityEntityId), false, `${entry.requestedTitle}:quarantined-city-leaked`);
}

assert.equal(Object.keys(evidenceAudit.countries).length, 20);
assert.equal(batchRouteLegs.length, Object.values(evidenceAudit.countries).reduce((sum, entry) => sum + entry.directedRouteLegs, 0));
assert.equal(batchSeasons.length, Object.values(evidenceAudit.countries).reduce((sum, entry) => sum + entry.monthRisk, 0));
assert.equal(batchRouteLegs.every((record) => validateRouteLegEvidence(record).accepted), true);
assert.equal(batchSeasons.every((record) => validateSeasonEvidence(record).accepted), true);
assert.equal(batchRouteLegs.every((record) => targetCodeSet.has(countryById.get(cityById.get(record.fromEntityId)?.parentCountryEntityId)?.isoAlpha2)), true);
for (const record of batchRouteLegs) {
  const reverse = batchRouteLegs.find((candidate) => candidate.fromEntityId === record.toEntityId && candidate.toEntityId === record.fromEntityId && candidate.transportMode === record.transportMode);
  assert(reverse, `${record.legEvidenceId}:missing-reverse-direction`);
  assert.notEqual(reverse.legEvidenceId, record.legEvidenceId);
  assert.equal(record.durationMinutes == null && record.transferCount == null && record.frequencyPerDay == null, true);
}
assert.equal(batchSeasons.every((record) => record.season == null && record.unknowns.some((entry) => entry.field === "seasonSuitability")), true);
assert.deepEqual(stats.imageManifest.invalidMappings, []);
assert.equal(stats.imageManifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);
assert.equal(stats.images.batchCountryCovers, 20);
assert.equal(stats.images.largerThan5Mb, 0);
assert.equal(stats.imageBaseline.git.sizePolicyViolations.length, 0);
for (const wave of [1, 2, 3, 4]) {
  const rawPath = `data/knowledge/raw/knowledge-expansion-batch07-wave${wave}.wikidata.json`;
  const attr = spawnSync("git", ["check-attr", "filter", "--", rawPath], { cwd: ROOT, encoding: "utf8" });
  assert.equal(attr.status, 0);
  assert.match(attr.stdout, /filter: lfs/u, `${rawPath}:must-use-git-lfs`);
}

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch07",
  status: "PASS",
  targets: targetCodes.length,
  published: stats.published,
  additions: stats.additions,
  evidence: { transport: batchRouteLegs.length, monthRisk: batchSeasons.length },
  routeQueries: stats.routeConsumption.queryCount,
  images: { assets: stats.images.assetCount, countryCovers: stats.images.countryCovers, dedicatedCities: stats.images.dedicatedCities, dedicatedPois: stats.images.dedicatedPois, needsBackfill: stats.images.needsBackfill, invalidMappings: stats.images.invalidMappings },
  quality: { duplicateEntityIds: 0, duplicateCityQids: 0, duplicatePoiQids: 0, orphans: 0, conflicts: stats.quality.conflicts, quarantined: stats.quality.quarantined },
  chinaPolicy: "catalog-only-unchanged",
}, null, 2));
