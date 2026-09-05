import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";
import { calculateBatch08ReportData } from "./lib/knowledge-expansion-batch08-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const jsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const duplicateCount = (values) => values.length - new Set(values).size;
const stats = calculateBatch08ReportData({ root: ROOT });
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const entities = [...countries, ...cities, ...pois];
const countryById = new Map(countries.map((record) => [record.entityId, record]));
const cityById = new Map(cities.map((record) => [record.entityId, record]));
const targetCodes = stats.targets.codes;
const targetCodeSet = new Set(targetCodes);
const countryQids = new Set(countries.map((record) => record.wikidataId));
const evidenceAudit = json("data/knowledge/batches/knowledge-expansion-batch08-evidence-audit.json");
const routeLegs = jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl").filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
const monthRisks = jsonl("data/route-v2/evidence-seed/season-evidence.jsonl").filter((record) => record.retrievedAt === evidenceAudit.retrievedAt);
const waveBatches = Object.values(stats.seed.waves).map((wave) => String(wave.batchNumber));
const selectedCities = waveBatches.flatMap((batch) => json(`data/knowledge/batches/selection.p1b-batch${batch}.json`).cities);
const selectedPois = waveBatches.flatMap((batch) => json(`data/knowledge/batches/selection.p1b-batch${batch}.json`).pois);
const reviews = [1, 2, 3, 4].flatMap((wave) => json(`data/knowledge/batches/review-queue.knowledge-expansion-batch08-wave${wave}.json`).entries);
const positiveAdmissionAudit = json("data/knowledge/reports/knowledge-poi-positive-admission-audit.json");

assert.equal(targetCodes.length, 20);
assert.equal(stats.additions.countries, 20);
assert(stats.published.countries >= stats.baseline.knowledge.catalogCountries + stats.additions.countries, "later batches may grow the cumulative Country registry but must not erase Batch 08");
assert(stats.published.cities >= stats.baseline.knowledge.cities + stats.additions.cities, "later batches may grow cumulative City coverage but must not erase Batch 08");
assert(positiveAdmissionAudit.before.publishedPois >= stats.baseline.knowledge.pois + stats.additions.pois, "sealed Batch 08 POI candidate coverage missing before semantic repair");
assert.equal(stats.published.pois, positiveAdmissionAudit.after.publishedPois, "current POI total must match the canonical semantic admission audit");
assert.equal(stats.published.total, stats.published.countries + stats.published.cities + stats.published.pois);
assert.equal(stats.imageManifest.countries.some((record) => record.countryCode === "CN"), false, "China must remain Catalog-only");
assert.equal(targetCodes.every((code) => stats.imageManifest.countries.some((record) => record.countryCode === code)), true, "all Batch 08 targets must be Plannable");

assert.equal(duplicateCount(entities.map((record) => record.entityId)), 0);
assert.equal(duplicateCount(countries.map((record) => record.wikidataId)), 0);
assert.equal(duplicateCount(cities.map((record) => record.wikidataId)), 0);
assert.equal(duplicateCount(pois.map((record) => record.wikidataId)), 0);
assert.equal(repository.validateParentReferences().accepted, true);
assert.equal(pois.some((record) => countryQids.has(record.wikidataId)), false, "Country QID must never be published as a POI");
assert.equal(stats.quality.conflicts, 0);

for (const code of targetCodes) {
  const country = countries.find((record) => record.isoAlpha2 === code);
  const countryCities = cities.filter((record) => record.parentCountryEntityId === country?.entityId);
  const countryCityIds = new Set(countryCities.map((city) => city.entityId));
  assert(country, `${code}: published Country`);
  assert(countryCities.length > 0, `${code}: published City depth`);
  assert(pois.some((poi) => countryCityIds.has(poi.parentCityEntityId)), `${code}: published route-eligible POI depth`);
  assert(stats.routeConsumption.countries[code]?.testedDurations.includes(7), `${code}: 7-day production route`);
  assert(stats.routeConsumption.countries[code]?.testedDurations.includes(14), `${code}: 14-day production route`);
}
assert.equal(selectedCities.every((record) => cities.some((city) => city.entityId === record.entityId)), true);
assert.equal(selectedPois.every((record) => pois.some((poi) => poi.entityId === record.entityId)), true);
for (const record of reviews.filter((entry) => entry.disposition === "quarantined-city-not-published")) {
  assert.equal(cities.some((city) => city.wikidataId === record.wikidataId), false, `${record.wikidataId}: quarantined City leaked`);
}
for (const record of reviews.filter((entry) => entry.entityType === "poi-candidate" && entry.disposition === "quarantined-not-published")) {
  assert.equal(pois.some((poi) => poi.wikidataId === record.wikidataId && poi.parentCityEntityId === record.parentCityEntityId), false, `${record.wikidataId}: quarantined POI leaked`);
}

assert.equal(Object.keys(evidenceAudit.countries).length, 20);
assert.equal(routeLegs.length, Object.values(evidenceAudit.countries).reduce((sum, record) => sum + record.directedRouteLegs, 0));
assert.equal(monthRisks.length, Object.values(evidenceAudit.countries).reduce((sum, record) => sum + record.monthRisk, 0));
assert.equal(routeLegs.length, stats.evidence.transport);
assert.equal(monthRisks.length, stats.evidence.monthRisk);
assert.equal(routeLegs.every((record) => validateRouteLegEvidence(record).accepted), true);
assert.equal(monthRisks.every((record) => validateSeasonEvidence(record).accepted), true);
for (const record of routeLegs) {
  const fromCode = countryById.get(cityById.get(record.fromEntityId)?.parentCountryEntityId)?.isoAlpha2;
  const toCode = countryById.get(cityById.get(record.toEntityId)?.parentCountryEntityId)?.isoAlpha2;
  assert(targetCodeSet.has(fromCode) || targetCodeSet.has(toCode), `${record.legEvidenceId}: Batch 08 endpoint missing`);
  const reverse = routeLegs.find((candidate) => candidate.fromEntityId === record.toEntityId && candidate.toEntityId === record.fromEntityId && candidate.transportMode === record.transportMode);
  assert(reverse, `${record.legEvidenceId}: reverse direction missing`);
  assert.notEqual(reverse.legEvidenceId, record.legEvidenceId);
  assert.equal(record.durationMinutes == null && record.frequencyPerDay == null && record.transferCount == null, true, `${record.legEvidenceId}: unknown transport facts must stay unknown`);
}
assert.equal(monthRisks.every((record) => record.season == null && record.unknowns.some((entry) => entry.field === "seasonSuitability")), true);

assert.equal(stats.routeConsumption.status, "PASS");
assert.equal(stats.routeConsumption.queryCount, 101);
assert.equal(stats.routeConsumption.countryOnlyResults.length, 20);
assert.equal(stats.routeConsumption.staleAcceptedFixturesRejected, 20);
assert.equal(stats.routeConsumption.externalFetchCalls, 0);
assert.deepEqual(stats.imageManifest.invalidMappings, []);
assert.equal(stats.imageManifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);
assert.equal(stats.images.batchCountryCovers, 20);
assert.equal(stats.images.batchVerifiedImages, 0, "unverified imagery must not be counted as dedicated");
assert(stats.images.historicalDebtAfter >= stats.images.historicalDebtBefore, "later batches may add unresolved image assignments but must not erase the sealed historical debt floor");
assert.equal(stats.images.largerThan5Mb, 0);
assert.equal(stats.imageBaseline.git.sizePolicyViolations.length, 0);

for (const wave of [1, 2, 3, 4]) {
  const rawPath = `data/knowledge/raw/knowledge-expansion-batch08-wave${wave}.wikidata.json`;
  const result = spawnSync("git", ["check-attr", "filter", "--", rawPath], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /filter: lfs/u, `${rawPath}: must use Git LFS`);
}

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch08",
  status: "PASS",
  targets: targetCodes.length,
  published: stats.published,
  additions: stats.additions,
  evidence: { transport: routeLegs.length, monthRisk: monthRisks.length },
  routeQueries: stats.routeConsumption.queryCount,
  images: {
    assets: stats.images.assetCount,
    countryCovers: `${stats.images.countryCovers}/${stats.images.countryTotal}`,
    dedicatedCities: `${stats.images.dedicatedCities}/${stats.images.cityTotal}`,
    dedicatedPois: `${stats.images.dedicatedPois}/${stats.images.poiTotal}`,
    needsBackfill: stats.images.needsBackfill,
    invalidMappings: stats.images.invalidMappings,
  },
  quality: {
    duplicateEntityIds: 0,
    duplicateCityQids: 0,
    duplicatePoiQids: 0,
    orphans: 0,
    conflicts: 0,
    quarantined: stats.quality.quarantined,
  },
  chinaPolicy: "catalog-only-unchanged",
}, null, 2));
