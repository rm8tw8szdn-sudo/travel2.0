import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  createPublishedKnowledgeEntityLayerRepository,
} from "../src/lib/routes/index.mjs";
import { validateCountryEntitySet } from "../src/lib/routes/knowledge-country-baseline-schema.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { validateLocalEvidenceSource } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const NOW = "2026-08-11T04:00:00.000Z";
const ACCEPTED_SHA256 = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";
const IMMUTABLE_EVIDENCE_SHA256 = "4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376";
const BATCH05_PUBLISHED_BASELINE = { countries: 55, cities: 306, pois: 2101, total: 2462 };
const WAVES = Object.freeze({
  1: { batch: "14", countries: ["GB","IE","CZ","HU","HR"], newCities: 44, reusedCities: 2, newPois: 296 },
  2: { batch: "15", countries: ["NO","SE","FI","DK","BE"], newCities: 34, reusedCities: 2, newPois: 248 },
  3: { batch: "16", countries: ["PL","SI","VN","MY","ID"], newCities: 37, reusedCities: 2, newPois: 277 },
  4: { batch: "17", countries: ["PH","CA","US","MX","PE"], newCities: 47, reusedCities: 0, newPois: 376 },
});
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const readJsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const hash = (relativePath) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const currentTotals = { countries: countries.length, cities: cities.length, pois: pois.length, total: countries.length + cities.length + pois.length };
assert.deepEqual(currentTotals, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS);
for (const [key, minimum] of Object.entries(BATCH05_PUBLISHED_BASELINE)) {
  assert.ok(currentTotals[key] >= minimum, `${key} fell below the sealed Batch 05 baseline`);
}
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(cities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(pois).accepted, true);
assert.deepEqual(repository.validateParentReferences(), { accepted: true, reasons: [] });
assert.equal(new Set([...countries, ...cities, ...pois].map((entry) => entry.entityId)).size, currentTotals.total);
assert.equal(new Set(cities.map((entry) => entry.wikidataId)).size, cities.length);
assert.equal(new Set(pois.map((entry) => entry.wikidataId)).size, pois.length);

const targetCodes = new Set(Object.values(WAVES).flatMap((entry) => entry.countries));
assert.equal(targetCodes.size, 20);
for (const [wave, config] of Object.entries(WAVES)) {
  const cityAsset = readJson(`data/knowledge/batches/cities.p1b-batch${config.batch}.json`);
  const poiAsset = readJson(`data/knowledge/batches/pois.p1b-batch${config.batch}.json`);
  const selection = readJson(`data/knowledge/batches/selection.p1b-batch${config.batch}.json`);
  const provenance = readJson(`data/knowledge/batches/provenance.knowledge-expansion-batch05-wave${wave}.json`);
  const conflicts = readJson(`data/knowledge/batches/conflicts.knowledge-expansion-batch05-wave${wave}.json`);
  const review = readJson(`data/knowledge/batches/review-queue.knowledge-expansion-batch05-wave${wave}.json`);
  assert.equal(cityAsset.cityCount, config.newCities);
  assert.equal(poiAsset.poiCount, config.newPois);
  assert.equal(selection.cities.length, config.newCities + config.reusedCities);
  assert.deepEqual(selection.countries.map((entry) => entry.isoAlpha2).sort(), [...config.countries].sort());
  assert.equal(selection.cities.every((entry) => entry.selectedPoiCount >= 1 && entry.selectedPoiCount <= entry.targetPoiCount), true);
  assert.equal(selection.cities.every((entry) => entry.positiveTypePath.length >= 1 && entry.positiveTypePath.length <= 9), true);
  assert.equal(selection.pois.every((entry) => entry.positiveTypePath.length >= 1 && entry.positiveTypePath.length <= 9), true);
  assert.equal(conflicts.conflictCount, 0);
  assert.deepEqual(conflicts.conflicts, []);
  assert.equal(review.reviewCount, review.entries.length);
  assert.equal(review.entries.every((entry) => ["quarantined-not-published", "accepted-below-target-without-padding", "quarantined-city-not-published"].includes(entry.disposition)), true);
  for (const city of selection.cities.filter((entry) => entry.selectedPoiCount < entry.targetPoiCount)) {
    assert.ok(review.entries.some((entry) => entry.parentCityEntityId === city.entityId && entry.disposition === "accepted-below-target-without-padding"));
  }
  const hardSemanticReasons = new Set(["coordinate-missing", "country-claim-mismatch", "positive-poi-type-unconfirmed", "settlement-not-published-as-poi", "parent-city-distance-exceeded", "operational-entity-not-route-poi"]);
  assert.equal(review.entries.filter((entry) => entry.reasonCodes.some((reason) => hardSemanticReasons.has(reason))).every((entry) => !selection.pois.some((selected) => selected.wikidataId === entry.wikidataId && selected.parentCityEntityId === entry.parentCityEntityId)), true);
  assert.equal(provenance.publishedEntityQids.length, config.newCities + config.newPois);
}

for (const countryCode of targetCodes) {
  const country = countries.find((entry) => entry.isoAlpha2 === countryCode);
  assert.ok(country, `country missing:${countryCode}`);
  const countryCities = cities.filter((entry) => entry.parentCountryEntityId === country.entityId);
  const cityIdSet = new Set(countryCities.map((entry) => entry.entityId));
  assert.ok(countryCities.length >= 6, `city depth missing:${countryCode}`);
  assert.ok(pois.filter((entry) => cityIdSet.has(entry.parentCityEntityId)).length >= countryCities.length * 3, `poi depth missing:${countryCode}`);
  const reservedCountryNames = new Set([country.canonicalNameEn, country.canonicalNameZh]
    .map((value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US")));
  assert.equal(countryCities.every((city) => (
    city.wikidataId === country.wikidataId
    || city.aliases.every((alias) => !reservedCountryNames.has(String(alias || "").normalize("NFKC").trim().toLocaleLowerCase("en-US")))
  )), true, `city alias must not shadow parent country:${countryCode}`);
}
const newYorkCity = cities.find((city) => city.wikidataId === "Q60");
assert.ok(newYorkCity, "New York City must remain published as Q60");
assert.equal(newYorkCity.aliases.includes("New York"), true, "New York City must recognize the common travel-query alias New York");
const unitedStates = countries.find((country) => country.isoAlpha2 === "US");
assert.ok(unitedStates, "United States must remain published as ISO US");
assert.equal(unitedStates.aliases.includes("USA"), true, "United States must recognize its ISO alpha-3 query alias USA");

const legs = readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const seasons = readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const newLegs = legs.filter((entry) => entry.retrievedAt === NOW);
const newSeasons = seasons.filter((entry) => entry.retrievedAt === NOW);
assert.ok(legs.length >= 414, "route-leg evidence fell below the sealed Batch 05 baseline");
assert.ok(seasons.length >= 156, "season evidence fell below the sealed Batch 05 baseline");
assert.equal(newLegs.length, 218);
assert.equal(newSeasons.length, 80);
for (const record of newLegs) {
  assert.equal(validateRouteLegEvidence(record).accepted, true);
  assert.equal(record.directed, true);
  assert.equal(record.durationMinMinutes, null);
  assert.equal(record.durationMaxMinutes, null);
  assert.equal(record.transferCount, null);
  assert.equal(record.frequencyLevel, "unknown");
  assert.ok(newLegs.some((reverse) => reverse.fromEntityId === record.toEntityId && reverse.toEntityId === record.fromEntityId && reverse.legEvidenceId !== record.legEvidenceId));
  assert.equal(record.sources.every((source) => validateLocalEvidenceSource(source).accepted), true);
}
for (const record of newSeasons) {
  assert.equal(validateSeasonEvidence(record).accepted, true);
  assert.equal(record.season, null);
  assert.equal(record.suitabilityStatus, "unknown");
  assert.equal(record.recommendedBufferMinutes, null);
  assert.ok(record.weatherRisks.length + record.transportRisks.length + record.closureRisks.length > 0);
  assert.equal(record.sources.every((source) => validateLocalEvidenceSource(source).accepted), true);
  assert.doesNotMatch(JSON.stringify(record), /best month|best time|recommended month|最佳月份/iu);
}
const manifest = readJson("data/route-v2/evidence-seed/evidence-seed-manifest.json");
assert.deepEqual(manifest.counts, { routeLeg: legs.length, season: seasons.length, total: legs.length + seasons.length });
assert.equal([...targetCodes].every((code) => manifest.countries.includes(code)), true);

const imageManifest = readJson("data/route-v2/images/image-coverage-manifest.json");
assert.equal(imageManifest.coverage.batch05Countries.plannableCountries, 20);
assert.equal(imageManifest.coverage.batch05Countries.countryCoverCoverage.percent, 100);
assert.equal(imageManifest.coverage.overall.invalidMappingCount, 0);
assert.equal(imageManifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);

assert.equal(hash(".route-v2-cache/accepted-routes.json"), ACCEPTED_SHA256, "Accepted repository changed");
assert.equal(hash(".route-v2-cache/route-evidence.json"), IMMUTABLE_EVIDENCE_SHA256, "Immutable route evidence changed");
assert.equal(fs.existsSync(path.join(ROOT, ".route-v2-cache", "route-v2-runtime-metrics.json")), false, "formal metrics created");

console.log(JSON.stringify({
  status: "PASS", verifier: "knowledge-expansion-batch05-20-country",
  additions: { countries: 4, cities: 162, pois: 1197, directedTransportEvidence: 218, monthRiskEvidence: 80 },
  totals: currentTotals,
  sealedBatch05Baseline: BATCH05_PUBLISHED_BASELINE,
  quality: { duplicateEntityIds: 0, duplicateCityQids: 0, duplicatePoiQids: 0, orphans: 0, conflicts: 0 },
  images: imageManifest.coverage,
  protectedAssets: { acceptedSha256: ACCEPTED_SHA256, immutableEvidenceSha256: IMMUTABLE_EVIDENCE_SHA256, metricsCreated: false },
}, null, 2));
