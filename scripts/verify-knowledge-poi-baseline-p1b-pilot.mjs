import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  KNOWLEDGE_POI_PROVENANCE_FIELDS,
  canonicalizeEntityLayerAliases,
  createKnowledgeEntityLayerRepository,
  createTypedEntityId,
  dedupeKnowledgePoiEntities,
  normalizeKnowledgePoiBaseline,
  validateKnowledgePoiEntity,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgePoiBaselineP1bPilot } from "./audit-knowledge-poi-baseline-p1b-pilot.mjs";
import {
  CITY_BASELINE_P1B_PILOT_SEEDS,
  buildKnowledgeCityBaselineP1bAssets,
} from "./import-knowledge-city-baseline-p1b-pilot.mjs";
import {
  POI_BASELINE_P1B_CITY_ASSET_RELATIVE_PATH,
  POI_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS,
  POI_BASELINE_P1B_CUMULATIVE_CONFLICTS_RELATIVE_PATH,
  POI_BASELINE_P1B_CUMULATIVE_REVIEW_RELATIVE_PATH,
  POI_BASELINE_P1B_PILOT_SEEDS,
  POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS,
  buildKnowledgePoiBaselineP1bAssets,
  serializeKnowledgePoiBaselineP1bAssets,
} from "./import-knowledge-poi-baseline-p1b-pilot.mjs";
import {
  assertStatesUnchanged,
  sha256IfExists,
  statesFor,
} from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-pilot.wikidata.json";
const CITY_RAW_RELATIVE_PATH = "data/knowledge/raw/cities-p1b-pilot.wikidata.json";
const EXPECTED_ACCEPTED_HASH = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";
const EXPECTED_BOOTSTRAP_HASH = "9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef";
const EXPECTED_PARENT_COUNTS = Object.freeze({
  "city-5a21732f861ff7f1": 3,
  "city-8acaf08893e5abf1": 3,
  "city-fc91a9c6c7b389cf": 3,
  "city-d6f6bf7d2fca5cb4": 3,
  "city-dde074f983b42cfd": 3,
});
const EXPECTED_POIS = Object.freeze(Object.fromEntries(POI_BASELINE_P1B_PILOT_SEEDS.map((seed) => [
  seed.wikidataId,
  Object.freeze({ nameEn: seed.expectedNameEn, parentCityEntityId: seed.parentCityEntityId }),
])));
const EXPECTED_CITY_REVIEW_IDS = Object.freeze([
  "review-0c208bcb4a53b559",
  "review-c1b15455ffb7e1bf",
]);
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
const CITY_ASSET_PROTECTED_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/provenance.cities.p1b-pilot.json",
  CITY_RAW_RELATIVE_PATH,
]);
const CACHE_PROTECTED_RELATIVE_PATHS = Object.freeze([
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);
const protectedPaths = [
  ...P1A_PROTECTED_RELATIVE_PATHS,
  ...CITY_ASSET_PROTECTED_RELATIVE_PATHS,
  ...CACHE_PROTECTED_RELATIVE_PATHS,
  RAW_RELATIVE_PATH,
  ...Object.values(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS),
].map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor([...new Set(protectedPaths)]);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixturePoi(base, overrides = {}) {
  const poi = clone(base);
  Object.assign(poi, overrides);
  if (overrides.wikidataId && !("entityId" in overrides)) {
    poi.entityId = createTypedEntityId({ entityType: "poi", wikidataId: overrides.wikidataId });
  }
  poi.aliases = canonicalizeEntityLayerAliases(overrides.aliases || poi.aliases, [poi.canonicalNameZh, poi.canonicalNameEn]);
  for (const field of KNOWLEDGE_POI_PROVENANCE_FIELDS) poi.provenance[field].value = poi[field];
  return poi;
}

function hasBlockingConflict(result, type) {
  return result.conflicts.some((conflict) => conflict.type === type && conflict.severity === "blocking");
}

const raw = readJson(RAW_RELATIVE_PATH);
const cityRaw = readJson(CITY_RAW_RELATIVE_PATH);
const poisAsset = readJson(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.pois);
const provenanceAsset = readJson(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.provenance);
const conflictsAsset = readJson(POI_BASELINE_P1B_CUMULATIVE_CONFLICTS_RELATIVE_PATH);
const reviewQueueAsset = readJson(POI_BASELINE_P1B_CUMULATIVE_REVIEW_RELATIVE_PATH);
const citiesAsset = readJson(POI_BASELINE_P1B_CITY_ASSET_RELATIVE_PATH);
const countries = POI_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS
  .flatMap((relativePath) => readJson(relativePath).countries || []);
const cities = citiesAsset.cities || [];
const pois = poisAsset.pois || [];
const poiByQid = new Map(pois.map((poi) => [poi.wikidataId, poi]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));

assert.equal(raw.schemaVersion, "route-v2-poi-baseline-p1b-raw");
assert.equal(raw.source?.provider, "wikidata-api-and-query-service");
assert.equal(raw.source?.poiCount, 15);
assert.deepEqual(raw.source?.wikidataIds, POI_BASELINE_P1B_PILOT_SEEDS.map((seed) => seed.wikidataId));
assert.equal(Object.keys(raw.wikidata?.entities || {}).length, 15);
assert.equal(Object.keys(raw.parentEvidence || {}).length, 15);
assert.equal(Number.isNaN(Date.parse(raw.retrievedAt)), false);
for (const seed of POI_BASELINE_P1B_PILOT_SEEDS) {
  const evidence = raw.parentEvidence[seed.wikidataId];
  assert.equal(evidence.countryMatch, true, `${seed.wikidataId} country evidence missing`);
  assert(
    evidence.administrativePath || evidence.directLocation || evidence.descriptionCityMatch || seed.cityStateParent,
    `${seed.wikidataId} City parent evidence missing`,
  );
  assert((raw.wikidata.entities[seed.wikidataId]?.claims?.P31 || []).length > 0, `${seed.wikidataId} P31 evidence missing`);
}

assert.equal(poisAsset.schemaVersion, "route-v2-poi-baseline-p1b-pilot");
assert.equal(poisAsset.poiCount, 15);
assert.equal(pois.length, 15);
assert.deepEqual([...poiByQid.keys()].sort(), Object.keys(EXPECTED_POIS).sort());
assert.equal(validateKnowledgePoiEntitySet(pois).accepted, true);
assert.equal(new Set(pois.map((poi) => poi.entityId)).size, 15);
assert.equal(new Set(pois.map((poi) => poi.wikidataId)).size, 15);
assert.equal(new Set([...countries, ...cities, ...pois].map((entity) => entity.entityId)).size, countries.length + cities.length + pois.length);
assert.equal(pois.some((poi) => cities.some((city) => city.wikidataId === poi.wikidataId)), false, "City/POI QID overlap");
assert.equal(pois.some((poi) => countries.some((country) => country.wikidataId === poi.wikidataId)), false, "Country/POI QID overlap");

for (const [wikidataId, expected] of Object.entries(EXPECTED_POIS)) {
  const poi = poiByQid.get(wikidataId);
  assert.equal(validateKnowledgePoiEntity(poi).accepted, true, `${wikidataId} should validate`);
  assert.equal(poi.entityId, createTypedEntityId({ entityType: "poi", wikidataId }));
  assert.equal(poi.canonicalNameEn, expected.nameEn);
  assert.equal(poi.parentCityEntityId, expected.parentCityEntityId);
  assert.equal(cityById.get(poi.parentCityEntityId)?.entityType, "city");
  assert(poi.coordinates.latitude >= -90 && poi.coordinates.latitude <= 90);
  assert(poi.coordinates.longitude >= -180 && poi.coordinates.longitude <= 180);
  assert.equal(poi.retrievedAt, raw.retrievedAt);
  assert.deepEqual(Object.keys(poi.provenance).sort(), [...KNOWLEDGE_POI_PROVENANCE_FIELDS].sort());
  assert.deepEqual(poi.provenance, provenanceAsset.provenance[poi.entityId]);
  for (const entry of Object.values(poi.provenance)) {
    assert.equal(entry.retrievedAt, raw.retrievedAt);
    assert(!["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"].includes(entry.sourceType));
  }
  assert.equal("parentCountryEntityId" in poi, false);
  for (const forbiddenField of ["category", "openingHours", "ticketPrice", "rating", "description", "image", "tourismTags", "recommendationScore", "region", "destination"]) {
    assert.equal(forbiddenField in poi, false, `${wikidataId} contains forbidden field ${forbiddenField}`);
  }
}

const parentCounts = Object.fromEntries(Object.keys(EXPECTED_PARENT_COUNTS).map((parentId) => [
  parentId,
  pois.filter((poi) => poi.parentCityEntityId === parentId).length,
]));
assert.deepEqual(parentCounts, EXPECTED_PARENT_COUNTS);
assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 15);
assert.equal(conflictsAsset.blockingCount, 0);
assert.equal(conflictsAsset.conflictCount, 0);
assert.deepEqual(conflictsAsset.conflicts, []);
assert.equal(new Set(reviewQueueAsset.reviewQueue.map((review) => review.reviewId)).size, reviewQueueAsset.reviewCount);
assert.equal(new Set(conflictsAsset.conflicts.map((conflict) => conflict.conflictId)).size, conflictsAsset.conflictCount);
assert.deepEqual(
  reviewQueueAsset.reviewQueue.filter((review) => EXPECTED_CITY_REVIEW_IDS.includes(review.reviewId)).map((review) => review.reviewId).sort(),
  [...EXPECTED_CITY_REVIEW_IDS].sort(),
);
const poiNamingReviews = reviewQueueAsset.reviewQueue.filter((review) => review.type === "wikidata-zh-label-curated-selection");
assert.equal(poiNamingReviews.length, 1);
assert.equal(poiNamingReviews[0].reviewId, "review-958d06ddaa1adf82");
assert.notEqual(poiNamingReviews[0].severity, "blocking");
const expectedMultipleTypeQids = Object.entries(raw.wikidata.entities)
  .filter(([, entity]) => new Set((entity.claims?.P31 || [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)).size > 1)
  .map(([wikidataId]) => wikidataId)
  .sort();
const poiTypeReviews = reviewQueueAsset.reviewQueue.filter((review) => review.type === "multiple-wikidata-poi-types");
assert.deepEqual(poiTypeReviews.map((review) => review.wikidataId).sort(), expectedMultipleTypeQids);
for (const review of poiTypeReviews) {
  assert(review.wikidataTypeIds.length > 1, `${review.wikidataId} multiple-type review should retain P31 evidence`);
  assert.notEqual(review.severity, "blocking");
}
const poiEntityIdSet = new Set(pois.map((poi) => poi.entityId));
const poiReviews = reviewQueueAsset.reviewQueue.filter((review) =>
  review.relatedEntityIds?.some((entityId) => poiEntityIdSet.has(entityId)));
assert.equal(poiByQid.get("Q80541").canonicalNameZh, "苏丹艾哈迈德清真寺");
assert.equal(poiByQid.get("Q80541").aliases.includes("苏丹艾哈迈德墓一号"), false);

const cityRebuilt = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot: cityRaw, countries });
for (const expectedReview of cityRebuilt.reviewQueueAsset.reviewQueue) {
  assert.deepEqual(reviewQueueAsset.reviewQueue.find((review) => review.reviewId === expectedReview.reviewId), expectedReview);
}

const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois });
assert.equal(repository.validateParentReferences().accepted, true);
assert.equal(repository.listCities().length, 5);
assert.equal(repository.listPois().length, 15);
for (const cityEntityId of Object.keys(EXPECTED_PARENT_COUNTS)) assert.equal(repository.listPoisByCity(cityEntityId).length, 3);
assert.equal(repository.getEntity(countries[0].entityId)?.entityType, "country");
assert.equal(repository.getEntity(cities[0].entityId)?.entityType, "city");
assert.equal(repository.getEntity(pois[0].entityId)?.entityType, "poi");
const poiCopies = repository.listPois();
poiCopies[0].canonicalNameEn = "outside mutation";
assert.notEqual(repository.listPois()[0].canonicalNameEn, "outside mutation");

const normalizedA = normalizeKnowledgePoiBaseline({ rawSnapshot: raw, poiSeeds: POI_BASELINE_P1B_PILOT_SEEDS, cities });
const normalizedB = normalizeKnowledgePoiBaseline({ rawSnapshot: raw, poiSeeds: POI_BASELINE_P1B_PILOT_SEEDS, cities });
assert.deepEqual(normalizedB, normalizedA);
const buildInput = {
  rawSnapshot: raw,
  countries,
  cities,
  cityConflictsAsset: cityRebuilt.conflictsAsset,
  cityReviewQueueAsset: cityRebuilt.reviewQueueAsset,
};
const rebuiltA = buildKnowledgePoiBaselineP1bAssets(buildInput);
const rebuiltB = buildKnowledgePoiBaselineP1bAssets(buildInput);
assert.deepEqual(rebuiltB, rebuiltA);
const rebuiltSerialized = serializeKnowledgePoiBaselineP1bAssets(rebuiltA);
for (const [key, relativePath] of Object.entries(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS)) {
  assert.equal(rebuiltSerialized[key], readText(relativePath), `${key} rebuild should be byte-identical`);
}

const base = poiByQid.get("Q615183");
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([base, clone(base)], { countries, cities }), "duplicate-poi-entity-id"));
const duplicateQid = fixturePoi(base, { entityId: "poi-ffffffffffffffff" });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([base, duplicateQid], { countries, cities }), "duplicate-poi-wikidata-id"));
const missingParent = fixturePoi(base, { wikidataId: "Q900001", parentCityEntityId: "" });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([missingParent], { countries, cities }), "orphan-poi-parent"));
const orphanParent = fixturePoi(base, { wikidataId: "Q900002", parentCityEntityId: "city-0000000000000000" });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([orphanParent], { countries, cities }), "orphan-poi-parent"));
const countryParent = fixturePoi(base, { wikidataId: "Q900003", parentCityEntityId: countries[0].entityId });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([countryParent], { countries, cities }), "poi-parent-not-city"));
const invalidQid = fixturePoi(base, { wikidataId: "invalid-qid", entityId: "poi-eeeeeeeeeeeeeeee" });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([invalidQid], { countries, cities }), "poi-schema-invalid"));
const invalidLatitude = fixturePoi(base, { wikidataId: "Q900004", coordinates: { latitude: 91, longitude: 1 } });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([invalidLatitude], { countries, cities }), "poi-schema-invalid"));
const invalidLongitude = fixturePoi(base, { wikidataId: "Q900005", coordinates: { latitude: 1, longitude: 181 } });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([invalidLongitude], { countries, cities }), "poi-schema-invalid"));
const cityQidOverlap = fixturePoi(base, { wikidataId: cities[0].wikidataId });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([cityQidOverlap], { countries, cities }), "city-poi-qid-overlap"));
const countryQidOverlap = fixturePoi(base, { wikidataId: countries[0].wikidataId });
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([countryQidOverlap], { countries, cities }), "country-poi-qid-overlap"));

const sameParentA = fixturePoi(base, {
  wikidataId: "Q900006",
  canonicalNameZh: "测试景点",
  canonicalNameEn: "Shared POI",
  aliases: [],
  coordinates: { latitude: 35, longitude: 135 },
});
const sameParentB = fixturePoi(base, {
  wikidataId: "Q900007",
  canonicalNameZh: "测试景点",
  canonicalNameEn: "Shared POI",
  aliases: [],
  coordinates: { latitude: 35.0001, longitude: 135.0001 },
});
const sameParentResult = dedupeKnowledgePoiEntities([sameParentA, sameParentB], { countries, cities });
assert.equal(sameParentResult.conflicts.length, 0);
assert.equal(sameParentResult.reviewQueue.some((review) => review.type === "same-parent-poi-name-match"), true);
assert.equal(sameParentResult.reviewQueue.some((review) => review.type === "same-parent-poi-coordinate-proximity"), true);

const differentParentA = fixturePoi(sameParentA, { wikidataId: "Q900008", parentCityEntityId: cities[0].entityId });
const differentParentB = fixturePoi(sameParentA, { wikidataId: "Q900009", parentCityEntityId: cities[1].entityId });
const differentParentResult = dedupeKnowledgePoiEntities([differentParentA, differentParentB], { countries, cities });
assert.equal(differentParentResult.conflicts.length, 0);
assert.equal(differentParentResult.reviewQueue.length, 0);

const crossTypeCountry = {
  ...clone(countries[0]),
  entityId: "country-3333333333333333",
  wikidataId: "Q900010",
  canonicalNameEn: base.canonicalNameEn,
  canonicalNameZh: base.canonicalNameZh,
  coordinates: clone(base.coordinates),
};
const crossTypeRepository = createKnowledgeEntityLayerRepository({ countries: [crossTypeCountry, ...countries], cities, pois: [base] });
assert.equal(crossTypeRepository.getEntity(crossTypeCountry.entityId)?.entityType, "country");
assert.equal(crossTypeRepository.getEntity(base.entityId)?.entityType, "poi");
assert.equal(crossTypeRepository.listPois().length, 1);

const tripleDuplicatePoi = fixturePoi(base, { entityId: countries[0].entityId });
const duplicateRepositoryValidation = createKnowledgeEntityLayerRepository({ countries, cities, pois: [tripleDuplicatePoi] }).validateParentReferences();
assert.equal(duplicateRepositoryValidation.reasons.some((reason) => reason.type === "duplicate-entity-id"), true);
assert(hasBlockingConflict(dedupeKnowledgePoiEntities([tripleDuplicatePoi], { countries, cities }), "cross-type-entity-id-overlap"));
const orphanRepositoryValidation = createKnowledgeEntityLayerRepository({ countries, cities, pois: [orphanParent] }).validateParentReferences();
assert.equal(orphanRepositoryValidation.reasons.some((reason) => reason.type === "orphan-poi-parent"), true);

const audit = auditKnowledgePoiBaselineP1bPilot();
assert.equal(audit.status, "PASS");
assert.equal(audit.poiCount, 15);
assert.equal(audit.orphanPoiCount, 0);
assert.equal(audit.provenanceCoverage, 15);
assert.equal(audit.inlineSidecarMatches, 15);
assert.equal(audit.unsupportedBoundaryObjects.publishedMatches.length, 0);

const productionSourcePaths = [
  "src/lib/routes/knowledge-poi-baseline-schema.mjs",
  "src/lib/routes/knowledge-poi-baseline-normalizer.mjs",
  "src/lib/routes/knowledge-poi-baseline-deduper.mjs",
  "src/lib/routes/knowledge-entity-layer-repository.mjs",
  "scripts/import-knowledge-poi-baseline-p1b-pilot.mjs",
];
const productionSource = productionSourcePaths.map(readText).join("\n");
for (const forbidden of [".route-v2-cache", "accepted-routes", "knowledge-graph-pool", "RouteRecord", "plannerReason", "coverage-placeholder", "search-fallback", "route-record-derived"]) {
  assert.equal(productionSource.includes(forbidden), false, `POI production source references ${forbidden}`);
}
assert.equal(/entityType\s*:\s*["'](?:region|destination)["']/iu.test(productionSource), false);
const repositorySource = readText("src/lib/routes/knowledge-entity-layer-repository.mjs");
assert.equal(repositorySource.includes("node:fs"), false);
assert.equal(repositorySource.includes("fetch("), false);

const p1aDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...P1A_PROTECTED_RELATIVE_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(p1aDiff, "");
const cityAssetDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...CITY_ASSET_PROTECTED_RELATIVE_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(cityAssetDiff, "");
const plannerDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "src/lib/routes/route-composition-planner.mjs", "route-feed-bootstrap.js"], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(plannerDiff, "");
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, ".route-v2-cache/accepted-routes.json")), EXPECTED_ACCEPTED_HASH);
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, "route-feed-bootstrap.js")), EXPECTED_BOOTSTRAP_HASH);
assertStatesUnchanged(protectedBefore, statesFor([...new Set(protectedPaths)]), "POI verifier changed protected assets or caches");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  poiCount: pois.length,
  parentCounts,
  conflictCount: conflictsAsset.conflictCount,
  cumulativeReviewCount: reviewQueueAsset.reviewCount,
  cityReviewIds: EXPECTED_CITY_REVIEW_IDS,
  poiReviewIds: poiReviews.map((review) => review.reviewId),
  provenanceCoverage: Object.keys(provenanceAsset.provenance).length,
  deterministicNormalization: true,
  deterministicPureBuilder: true,
  byteStableRebuild: true,
  repository: {
    cityCount: repository.listCities().length,
    poiCount: repository.listPois().length,
    parentReferencesValid: true,
  },
  syntheticFixtures: {
    duplicatePoiEntityIdBlocking: true,
    duplicatePoiQidBlocking: true,
    missingParentBlocking: true,
    orphanParentBlocking: true,
    countryParentBlocking: true,
    invalidQidBlocking: true,
    invalidLatitudeLongitudeBlocking: true,
    cityPoiQidOverlapBlocking: true,
    countryPoiQidOverlapBlocking: true,
    sameCityNameAndCoordinatesReview: true,
    differentCitySameNameAllowed: true,
    crossTypeNameCoordinatesRetained: true,
    normalizeTwiceDeepEqual: true,
    repositoryThreeLayerDuplicateBlocking: true,
    repositoryOrphanPoiDetected: true,
  },
  acceptedHash: EXPECTED_ACCEPTED_HASH,
  bootstrapHash: EXPECTED_BOOTSTRAP_HASH,
  p1aAssetsUnchanged: true,
  cityAssetsUnchanged: true,
  cacheFilesUnchanged: true,
}, null, 2)}\n`);
