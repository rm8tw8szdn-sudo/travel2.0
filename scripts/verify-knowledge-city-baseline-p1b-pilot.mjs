import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  KNOWLEDGE_CITY_PROVENANCE_FIELDS,
  canonicalizeEntityLayerAliases,
  createKnowledgeEntityLayerRepository,
  createTypedEntityId,
  dedupeKnowledgeCityEntities,
  normalizeKnowledgeCityBaseline,
  validateKnowledgeCityEntity,
  validateKnowledgeCityEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgeCityBaselineP1bPilot } from "./audit-knowledge-city-baseline-p1b-pilot.mjs";
import {
  CITY_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_PILOT_SEEDS,
  CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS,
  buildKnowledgeCityBaselineP1bAssets,
  serializeKnowledgeCityBaselineP1bAssets,
} from "./import-knowledge-city-baseline-p1b-pilot.mjs";
import {
  assertStatesUnchanged,
  sha256IfExists,
  statesFor,
} from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_RELATIVE_PATH = "data/knowledge/raw/cities-p1b-pilot.wikidata.json";
const EXPECTED_ACCEPTED_HASH = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";
const EXPECTED_BOOTSTRAP_HASH = "9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef";
const EXPECTED_CITIES = Object.freeze({
  Q1490: Object.freeze({ nameEn: "Tokyo", parentCountryEntityId: "country-a0509b9eab0ea9ce" }),
  Q34600: Object.freeze({ nameEn: "Kyoto", parentCountryEntityId: "country-a0509b9eab0ea9ce" }),
  Q406: Object.freeze({ nameEn: "Istanbul", parentCountryEntityId: "country-03919f1fd24fd3dc" }),
  Q3640: Object.freeze({ nameEn: "Ankara", parentCountryEntityId: "country-03919f1fd24fd3dc" }),
  Q334: Object.freeze({ nameEn: "Singapore", parentCountryEntityId: "country-e0a550ef5a59c6f9" }),
});
const P1A_PROTECTED_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/provenance.p1a-pilot.json",
  "data/knowledge/conflicts.p1a-pilot.json",
  "data/knowledge/review-queue.p1a-pilot.json",
  "data/knowledge/raw/countries-p1a-pilot.wikidata.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/provenance.p1a-batch01.json",
  "data/knowledge/batches/conflicts.p1a-batch01.json",
  "data/knowledge/batches/review-queue.p1a-batch01.json",
  "data/knowledge/raw/countries-p1a-batch01.wikidata.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/provenance.p1a-batch02.json",
  "data/knowledge/batches/conflicts.p1a-batch02.json",
  "data/knowledge/batches/review-queue.p1a-batch02.json",
  "data/knowledge/raw/countries-p1a-batch02.wikidata.json",
]);
const CACHE_PROTECTED_RELATIVE_PATHS = Object.freeze([
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);
const protectedPaths = [...P1A_PROTECTED_RELATIVE_PATHS, ...CACHE_PROTECTED_RELATIVE_PATHS]
  .map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor(protectedPaths);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceTypes(city) {
  return Object.values(city.provenance || {}).map((entry) => entry.sourceType);
}

function fixtureCity(base, overrides = {}) {
  const city = clone(base);
  Object.assign(city, overrides);
  if (overrides.wikidataId && !("entityId" in overrides)) {
    city.entityId = createTypedEntityId({ entityType: "city", wikidataId: overrides.wikidataId });
  }
  city.aliases = canonicalizeEntityLayerAliases(overrides.aliases || city.aliases, [
    city.canonicalNameZh,
    city.canonicalNameEn,
  ]);

  for (const field of KNOWLEDGE_CITY_PROVENANCE_FIELDS) {
    city.provenance[field].value = city[field];
  }
  return city;
}

function hasConflict(result, type) {
  return result.conflicts.some((conflict) => conflict.type === type && conflict.severity === "blocking");
}

const raw = readJson(RAW_RELATIVE_PATH);
const citiesAsset = readJson(CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.cities);
const provenanceAsset = readJson(CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.provenance);
const conflictsAsset = readJson(CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.conflicts);
const reviewQueueAsset = readJson(CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.reviewQueue);
const countries = CITY_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS
  .flatMap((relativePath) => readJson(relativePath).countries || []);
const cities = citiesAsset.cities || [];
const cityByQid = new Map(cities.map((city) => [city.wikidataId, city]));
const countryById = new Map(countries.map((country) => [country.entityId, country]));

assert.equal(raw.schemaVersion, "route-v2-city-baseline-p1b-raw");
assert.equal(raw.source?.provider, "wikidata-api");
assert.equal(raw.source?.cityCount, 5);
assert.deepEqual(raw.source?.wikidataIds, CITY_BASELINE_P1B_PILOT_SEEDS.map((seed) => seed.wikidataId));
assert.equal(Object.keys(raw.wikidata?.entities || {}).length, 5);
assert.equal(Number.isNaN(Date.parse(raw.retrievedAt)), false, "raw retrievedAt should be valid");

assert.equal(citiesAsset.schemaVersion, "route-v2-city-baseline-p1b-pilot");
assert.equal(citiesAsset.cityCount, 5);
assert.equal(cities.length, 5);
assert.deepEqual([...cityByQid.keys()].sort(), Object.keys(EXPECTED_CITIES).sort());
assert.equal(validateKnowledgeCityEntitySet(cities).accepted, true, "published City set should validate");
assert.equal(new Set(cities.map((city) => city.entityId)).size, 5, "City entityId should be unique");
assert.equal(new Set(cities.map((city) => city.wikidataId)).size, 5, "City QID should be unique");
assert.equal(new Set([...countries, ...cities].map((entity) => entity.entityId)).size, countries.length + cities.length, "Country + City entityId should be globally unique");

for (const [wikidataId, expected] of Object.entries(EXPECTED_CITIES)) {
  const city = cityByQid.get(wikidataId);
  assert(city, `${wikidataId} should be published`);
  assert.equal(validateKnowledgeCityEntity(city).accepted, true, `${wikidataId} should pass schema validation`);
  assert.equal(city.entityId, createTypedEntityId({ entityType: "city", wikidataId }), `${wikidataId} identity mismatch`);
  assert.equal(city.canonicalNameEn, expected.nameEn);
  assert.equal(city.parentCountryEntityId, expected.parentCountryEntityId);
  assert.equal(countryById.get(city.parentCountryEntityId)?.entityType, "country", `${wikidataId} parent should be Country`);
  assert(city.coordinates.latitude >= -90 && city.coordinates.latitude <= 90, `${wikidataId} latitude invalid`);
  assert(city.coordinates.longitude >= -180 && city.coordinates.longitude <= 180, `${wikidataId} longitude invalid`);
  assert.equal(city.retrievedAt, raw.retrievedAt, `${wikidataId} retrievedAt should come from raw snapshot`);
  assert.deepEqual(Object.keys(city.provenance).sort(), [...KNOWLEDGE_CITY_PROVENANCE_FIELDS].sort(), `${wikidataId} provenance coverage mismatch`);
  assert.deepEqual(city.provenance, provenanceAsset.provenance[city.entityId], `${wikidataId} inline/sidecar provenance mismatch`);
  for (const entry of Object.values(city.provenance)) assert.equal(entry.retrievedAt, raw.retrievedAt);
  for (const forbidden of ["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"]) {
    assert.equal(sourceTypes(city).includes(forbidden), false, `${wikidataId} uses forbidden source ${forbidden}`);
  }
}

assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 5, "sidecar should cover all Cities");
assert.equal(conflictsAsset.conflictCount, 0);
assert.equal(conflictsAsset.blockingCount, 0);
assert.deepEqual(conflictsAsset.conflicts, []);
assert.equal(new Set(reviewQueueAsset.reviewQueue.map((review) => review.reviewId)).size, reviewQueueAsset.reviewCount, "reviewId should be globally unique");
const singaporeOverlap = reviewQueueAsset.reviewQueue.filter((review) => review.type === "cross-type-qid-overlap");
assert.equal(singaporeOverlap.length, 1, "Singapore overlap review should exist exactly once");
assert.notEqual(singaporeOverlap[0].severity, "blocking");
assert.deepEqual(singaporeOverlap[0].relatedEntityIds, [
  cityByQid.get("Q334").entityId,
  "country-e0a550ef5a59c6f9",
].sort());
const istanbulReviews = reviewQueueAsset.reviewQueue.filter((review) => review.type === "cross-continent-city-metadata");
assert.equal(istanbulReviews.length, 1, "Istanbul cross-continent metadata review should exist exactly once");
assert.notEqual(istanbulReviews[0].severity, "blocking");
assert.equal("continent" in cityByQid.get("Q406"), false);
assert.equal("geographicRegion" in cityByQid.get("Q406"), false);

const repository = createKnowledgeEntityLayerRepository({ countries, cities });
assert.equal(repository.validateParentReferences().accepted, true);
assert.equal(repository.listCities().length, 5);
assert.equal(repository.listCitiesByCountry("country-a0509b9eab0ea9ce").length, 2);
assert.equal(repository.listCitiesByCountry("country-03919f1fd24fd3dc").length, 2);
assert.equal(repository.listCitiesByCountry("country-e0a550ef5a59c6f9").length, 1);
assert.equal(repository.getEntity("country-a0509b9eab0ea9ce")?.entityType, "country");
assert.equal(repository.getEntity(cityByQid.get("Q1490").entityId)?.entityType, "city");
const repositoryCopy = repository.listCities();
repositoryCopy[0].canonicalNameEn = "mutated outside repository";
assert.notEqual(repository.listCities()[0].canonicalNameEn, "mutated outside repository", "repository results should be defensive copies");

const normalizedA = normalizeKnowledgeCityBaseline({ rawSnapshot: raw, citySeeds: CITY_BASELINE_P1B_PILOT_SEEDS, countries });
const normalizedB = normalizeKnowledgeCityBaseline({ rawSnapshot: raw, citySeeds: CITY_BASELINE_P1B_PILOT_SEEDS, countries });
assert.deepEqual(normalizedB, normalizedA, "normalization should be deterministic");
const rebuiltA = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot: raw, countries });
const rebuiltB = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot: raw, countries });
assert.deepEqual(rebuiltB, rebuiltA, "pure asset rebuild should be deterministic");
const rebuiltSerialized = serializeKnowledgeCityBaselineP1bAssets(rebuiltA);
for (const [key, relativePath] of Object.entries(CITY_BASELINE_P1B_PUBLISH_RELATIVE_PATHS)) {
  assert.equal(rebuiltSerialized[key], readText(relativePath), `${key} serialized rebuild should be byte-identical`);
}

const base = cityByQid.get("Q1490");
const duplicateEntityIdResult = dedupeKnowledgeCityEntities([base, clone(base)], { countries });
assert(hasConflict(duplicateEntityIdResult, "duplicate-city-entity-id"));

const duplicateQid = fixtureCity(base, { entityId: "city-ffffffffffffffff" });
const duplicateQidResult = dedupeKnowledgeCityEntities([base, duplicateQid], { countries });
assert(hasConflict(duplicateQidResult, "duplicate-city-wikidata-id"));

const orphan = fixtureCity(base, { wikidataId: "Q1000001", parentCountryEntityId: "country-0000000000000000" });
const orphanResult = dedupeKnowledgeCityEntities([orphan], { countries });
assert(hasConflict(orphanResult, "orphan-city-parent"));

const nonCountryParent = { ...clone(countryById.get("country-a0509b9eab0ea9ce")), entityId: "country-1111111111111111", entityType: "city", wikidataId: "Q1000002" };
const invalidParentType = fixtureCity(base, { wikidataId: "Q1000003", parentCountryEntityId: nonCountryParent.entityId });
const invalidParentTypeResult = dedupeKnowledgeCityEntities([invalidParentType], { countries: [...countries, nonCountryParent] });
assert(hasConflict(invalidParentTypeResult, "city-parent-not-country"));

const invalidCoordinates = fixtureCity(base, { wikidataId: "Q1000004", coordinates: { latitude: 91, longitude: 139 } });
const invalidCoordinatesResult = dedupeKnowledgeCityEntities([invalidCoordinates], { countries });
assert(hasConflict(invalidCoordinatesResult, "city-schema-invalid"));

const invalidLongitude = fixtureCity(base, { wikidataId: "Q1000010", coordinates: { latitude: 35, longitude: 181 } });
const invalidLongitudeResult = dedupeKnowledgeCityEntities([invalidLongitude], { countries });
assert(hasConflict(invalidLongitudeResult, "city-schema-invalid"));

const invalidQid = fixtureCity(base, { wikidataId: "not-a-qid", entityId: "city-eeeeeeeeeeeeeeee" });
const invalidQidResult = dedupeKnowledgeCityEntities([invalidQid], { countries });
assert(hasConflict(invalidQidResult, "city-schema-invalid"));

const missingParent = fixtureCity(base, { wikidataId: "Q1000011", parentCountryEntityId: "" });
const missingParentResult = dedupeKnowledgeCityEntities([missingParent], { countries });
assert(hasConflict(missingParentResult, "orphan-city-parent"));

const sameNameDifferentCountryA = fixtureCity(base, {
  wikidataId: "Q1000005",
  canonicalNameZh: "测试城",
  canonicalNameEn: "Shared Name",
  aliases: [],
  parentCountryEntityId: "country-a0509b9eab0ea9ce",
  coordinates: { latitude: 35, longitude: 135 },
});
const sameNameDifferentCountryB = fixtureCity(base, {
  wikidataId: "Q1000006",
  canonicalNameZh: "测试城",
  canonicalNameEn: "Shared Name",
  aliases: [],
  parentCountryEntityId: "country-03919f1fd24fd3dc",
  coordinates: { latitude: 35, longitude: 135 },
});
const differentParentResult = dedupeKnowledgeCityEntities([sameNameDifferentCountryA, sameNameDifferentCountryB], { countries });
assert.equal(differentParentResult.conflicts.length, 0);
assert.equal(differentParentResult.reviewQueue.length, 0);

const sameParentNearbyA = fixtureCity(sameNameDifferentCountryA, { wikidataId: "Q1000007", coordinates: { latitude: 35, longitude: 135 } });
const sameParentNearbyB = fixtureCity(sameNameDifferentCountryA, { wikidataId: "Q1000008", coordinates: { latitude: 35.001, longitude: 135.001 } });
const nearbyResult = dedupeKnowledgeCityEntities([sameParentNearbyA, sameParentNearbyB], { countries });
assert.equal(nearbyResult.conflicts.length, 0);
assert.equal(nearbyResult.reviewQueue.filter((review) => review.type === "same-parent-nearby-city-name-match").length, 1);

const singaporeOnlyResult = dedupeKnowledgeCityEntities([cityByQid.get("Q334")], { countries });
assert.equal(singaporeOnlyResult.conflicts.length, 0);
assert.equal(singaporeOnlyResult.reviewQueue.filter((review) => review.type === "cross-type-qid-overlap").length, 1);

const sameNameCoordinateCountry = {
  ...clone(countryById.get("country-a0509b9eab0ea9ce")),
  entityId: "country-2222222222222222",
  wikidataId: "Q1000009",
  canonicalNameEn: base.canonicalNameEn,
  canonicalNameZh: base.canonicalNameZh,
  coordinates: clone(base.coordinates),
};
const crossTypeRepository = createKnowledgeEntityLayerRepository({ countries: [sameNameCoordinateCountry, ...countries], cities: [base] });
assert.equal(crossTypeRepository.getEntity(sameNameCoordinateCountry.entityId)?.entityType, "country");
assert.equal(crossTypeRepository.getEntity(base.entityId)?.entityType, "city");
assert.equal(crossTypeRepository.listCities().length, 1, "cross-type name/coordinate match should not merge");

const audit = auditKnowledgeCityBaselineP1bPilot();
assert.equal(audit.status, "PASS");
assert.equal(audit.cityCount, 5);
assert.equal(audit.orphanCityCount, 0);
assert.equal(audit.provenanceCoverage, 5);
assert.equal(audit.inlineSidecarMatches, 5);

const publishedText = JSON.stringify({ citiesAsset, provenanceAsset, conflictsAsset, reviewQueueAsset });
for (const forbidden of ["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"]) {
  assert.equal(publishedText.includes(`\"sourceType\":\"${forbidden}\"`), false, `published assets use forbidden source ${forbidden}`);
}

const productionSourcePaths = [
  "src/lib/routes/knowledge-entity-layer-primitives.mjs",
  "src/lib/routes/knowledge-city-baseline-schema.mjs",
  "src/lib/routes/knowledge-city-baseline-normalizer.mjs",
  "src/lib/routes/knowledge-city-baseline-deduper.mjs",
  "src/lib/routes/knowledge-entity-layer-repository.mjs",
  "scripts/import-knowledge-city-baseline-p1b-pilot.mjs",
];
const productionSource = productionSourcePaths.map(readText).join("\n");
for (const forbidden of [".route-v2-cache", "accepted-routes", "knowledge-graph-pool", "RouteRecord", "plannerReason", "coverage-placeholder", "search-fallback", "route-record-derived"]) {
  assert.equal(productionSource.includes(forbidden), false, `City production source should not reference ${forbidden}`);
}
assert.equal(/\blistPois?\b|\bpoi\b/iu.test(productionSource), false, "City production source should not implement POI APIs");

const p1aDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...P1A_PROTECTED_RELATIVE_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(p1aDiff, "", "P1A Country published assets changed");
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, ".route-v2-cache/accepted-routes.json")), EXPECTED_ACCEPTED_HASH, "accepted-routes hash changed");
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, "route-feed-bootstrap.js")), EXPECTED_BOOTSTRAP_HASH, "bootstrap hash changed");
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "P1A or protected cache/route files changed during City verification");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  cityCount: cities.length,
  cityEntityIds: Object.fromEntries(cities.map((city) => [city.wikidataId, city.entityId])),
  parentCounts: {
    JP: repository.listCitiesByCountry("country-a0509b9eab0ea9ce").length,
    TR: repository.listCitiesByCountry("country-03919f1fd24fd3dc").length,
    SG: repository.listCitiesByCountry("country-e0a550ef5a59c6f9").length,
  },
  conflictCount: conflictsAsset.conflictCount,
  reviewTypes: reviewQueueAsset.reviewQueue.map((review) => review.type).sort(),
  provenanceCoverage: Object.keys(provenanceAsset.provenance).length,
  deterministicNormalization: true,
  byteStableRebuild: true,
  syntheticFixtures: {
    duplicateCityEntityIdBlocking: true,
    duplicateCityQidBlocking: true,
    orphanParentBlocking: true,
    nonCountryParentBlocking: true,
    invalidLatitudeLongitudeBlocking: true,
    invalidQidBlocking: true,
    missingParentBlocking: true,
    sameNameDifferentCountryAllowed: true,
    sameParentNearbyNameReview: true,
    singaporeQidOverlapReviewNonBlocking: true,
    crossTypeNameCoordinateRetained: true,
    normalizeTwiceDeepEqual: true,
  },
  acceptedHash: EXPECTED_ACCEPTED_HASH,
  bootstrapHash: EXPECTED_BOOTSTRAP_HASH,
  p1aAssetsUnchanged: true,
  cacheFilesUnchanged: true,
}, null, 2)}\n`);
