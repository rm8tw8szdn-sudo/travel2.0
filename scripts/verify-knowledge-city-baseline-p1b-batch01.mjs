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
  validateCountryEntitySet,
  validateKnowledgeCityEntity,
  validateKnowledgeCityEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgeCityBaselineP1bBatch01 } from "./audit-knowledge-city-baseline-p1b-batch01.mjs";
import {
  CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
  CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
  CITY_BASELINE_P1B_BATCH01_SEEDS,
  buildKnowledgeCityBaselineP1bBatch01Assets,
  buildKnowledgeCityBaselineP1bBatch01BoundaryReviews,
  serializeKnowledgeCityBaselineP1bBatch01Assets,
  validateKnowledgeCityBaselineP1bBatch01Isolation,
  validateKnowledgeCityBaselineP1bBatch01RawSnapshot,
} from "./import-knowledge-city-baseline-p1b-batch01.mjs";
import {
  assertStatesUnchanged,
  sha256IfExists,
  statesFor,
} from "./lib/route-v2-test-file-state.mjs";
import {
  normalizeKnowledgeBaselineText,
  sha256KnowledgeBaselineText,
} from "./lib/knowledge-baseline-text.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PILOT_CITY_PATH = "data/knowledge/cities.p1b-pilot.json";
const EXPECTED_ACCEPTED_HASH = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";
const EXPECTED_BOOTSTRAP_HASH = "9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef";
const EXPECTED_RAW_HASH = "ccd066a2934d7a974870e1d0efbf3702c70f398ea0a72c86d535c553a84b11d7";
const EXPECTED_RETRIEVED_AT = "2026-07-15T10:01:50.248Z";
const EXPECTED_CITY_REVIEW_COUNT = 43;
const EXPECTED_CITIES = Object.freeze(Object.fromEntries(CITY_BASELINE_P1B_BATCH01_SEEDS.map((seed) => [seed.wikidataId, {
  isoAlpha2: seed.isoAlpha2,
  nameEn: seed.expectedNameEn,
  parentCountryEntityId: seed.parentCountryEntityId,
  countryQid: seed.expectedCountryWikidataId,
}])));
const FORBIDDEN_SOURCE_TYPES = Object.freeze(["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"]);
const P1A_PROTECTED_PATHS = Object.freeze([
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
  "data/knowledge/batches/countries.p1a-batch03.json",
  "data/knowledge/batches/provenance.p1a-batch03.json",
  "data/knowledge/batches/conflicts.p1a-batch03.json",
  "data/knowledge/batches/review-queue.p1a-batch03.json",
  "data/knowledge/raw/countries-p1a-batch03.wikidata.json",
]);
const PILOT_PROTECTED_PATHS = Object.freeze([
  "data/knowledge/raw/cities-p1b-pilot.wikidata.json",
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/provenance.cities.p1b-pilot.json",
  "data/knowledge/raw/pois-p1b-pilot.wikidata.json",
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/provenance.pois.p1b-pilot.json",
  "data/knowledge/conflicts.p1b-pilot.json",
  "data/knowledge/review-queue.p1b-pilot.json",
  "ROUTE_V2_KNOWLEDGE_ENTITY_LAYER_P1B_PILOT_IMPLEMENTATION_REPORT.md",
]);
const EXISTING_SOURCE_PROTECTED_PATHS = Object.freeze([
  "src/lib/routes/knowledge-entity-layer-primitives.mjs",
  "src/lib/routes/knowledge-city-baseline-schema.mjs",
  "src/lib/routes/knowledge-city-baseline-normalizer.mjs",
  "src/lib/routes/knowledge-city-baseline-deduper.mjs",
  "src/lib/routes/knowledge-poi-baseline-schema.mjs",
  "src/lib/routes/knowledge-poi-baseline-normalizer.mjs",
  "src/lib/routes/knowledge-poi-baseline-deduper.mjs",
  "src/lib/routes/knowledge-entity-layer-repository.mjs",
  "src/lib/routes/index.mjs",
]);
const CACHE_AND_PLANNER_PROTECTED_PATHS = Object.freeze([
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
  "src/lib/routes/route-composition-planner.mjs",
]);
const OPTIONAL_BATCH01_POI_PATHS = Object.freeze([
  "data/knowledge/raw/pois-p1b-batch01.wikidata.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
  "data/knowledge/batches/provenance.pois.p1b-batch01.json",
  "scripts/import-knowledge-poi-baseline-p1b-batch01.mjs",
]);
const protectedRelativePaths = [...P1A_PROTECTED_PATHS, ...PILOT_PROTECTED_PATHS, ...EXISTING_SOURCE_PROTECTED_PATHS, ...CACHE_AND_PLANNER_PROTECTED_PATHS];
const protectedPaths = protectedRelativePaths.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
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

function reviewEntityTypeKey(review) {
  return `${review.entityId || review.relatedEntityIds?.[0] || review.wikidataId}:${review.type}`;
}

function validateCumulativeCityReviewQueue({
  cumulativeReviewQueue,
  expectedCityReviews,
  cityReviewTypes,
  expectedCityReviewCount,
}) {
  assert.equal(Array.isArray(cumulativeReviewQueue), true, "Cumulative review queue must be an array");
  assert.equal(Array.isArray(expectedCityReviews), true, "Frozen City review baseline must be an array");
  assert.equal(new Set(cumulativeReviewQueue.map((review) => review.reviewId)).size, cumulativeReviewQueue.length, "Cumulative reviewId must be globally unique");

  const cityReviews = cumulativeReviewQueue.filter((review) => cityReviewTypes.includes(review.type));
  const nonCityReviews = cumulativeReviewQueue.filter((review) => !cityReviewTypes.includes(review.type));
  assert.equal(cityReviews.length, expectedCityReviewCount, `City review count must remain ${expectedCityReviewCount}`);
  assert.equal(expectedCityReviews.length, expectedCityReviewCount, `Frozen City review baseline must contain ${expectedCityReviewCount} reviews`);
  assert.equal(cityReviews.every((review) => cityReviewTypes.includes(review.type)), true, "City review types must remain within the frozen City policy");
  assert.equal(new Set(cityReviews.map((review) => review.reviewId)).size, cityReviews.length, "City reviewId must remain unique");
  assert.equal(new Set(cityReviews.map(reviewEntityTypeKey)).size, cityReviews.length, "City entity/type pairs must remain unique");
  const cityReviewIds = new Set(cityReviews.map((review) => review.reviewId));
  assert.equal(nonCityReviews.every((review) => !cityReviewIds.has(review.reviewId)), true, "City and non-City reviewId sets must not conflict");
  assert.deepEqual(cityReviews, expectedCityReviews, "Cumulative City reviews must deepEqual the frozen City review baseline");

  return { cityReviews, nonCityReviews, totalReviews: cumulativeReviewQueue.length };
}

function observeOptionalPoiFiles({ relativePaths, existsSync }) {
  const presence = relativePaths.map((relativePath) => ({ relativePath, present: existsSync(relativePath) }));
  const presentCount = presence.filter((entry) => entry.present).length;
  return {
    presence,
    presentCount,
    allPresent: presentCount === relativePaths.length,
  };
}

function validateCumulativeCityConflicts({ cumulativeConflicts, expectedCityConflicts, cityEntityIds, countryEntityIds }) {
  assert.equal(new Set(cumulativeConflicts.map((conflict) => conflict.conflictId)).size, cumulativeConflicts.length, "Cumulative conflictId must be globally unique");
  const isCityConflict = (conflict) => {
    const relatedEntityIds = conflict.relatedEntityIds || [];
    return relatedEntityIds.some((entityId) => cityEntityIds.has(entityId))
      && relatedEntityIds.every((entityId) => cityEntityIds.has(entityId) || countryEntityIds.has(entityId));
  };
  const cityConflicts = cumulativeConflicts.filter(isCityConflict);
  const nonCityConflicts = cumulativeConflicts.filter((conflict) => !isCityConflict(conflict));
  assert.deepEqual(cityConflicts, expectedCityConflicts, "Cumulative City conflicts must deepEqual the frozen City conflict baseline");
  return { cityConflicts, nonCityConflicts };
}

function fixtureReview({ layer, index, reviewId, type, details = {} }) {
  return {
    reviewId: reviewId || `${layer}-review-${index}`,
    type: type || (layer === "city" ? CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES[index % CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.length] : "poi-p31-policy-manual-review"),
    entityId: `${layer}-entity-${index}`,
    wikidataId: `Q${100000 + index}`,
    severity: "review",
    details: { layer, index, ...details },
  };
}

function runCumulativeReviewQueueFixtures() {
  const expectedCityReviews = Array.from({ length: 43 }, (_, index) => fixtureReview({ layer: "city", index }));
  const poiReviews = Array.from({ length: 12 }, (_, index) => fixtureReview({ layer: "poi", index }));
  const cityOnly = validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: expectedCityReviews,
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  });
  assert.equal(cityOnly.cityReviews.length, 43);
  assert.equal(cityOnly.nonCityReviews.length, 0);

  const cumulativeReviews = [
    ...expectedCityReviews.slice(0, 21),
    ...poiReviews.slice(0, 6),
    ...expectedCityReviews.slice(21),
    ...poiReviews.slice(6),
  ];
  const cumulativeBefore = clone(cumulativeReviews);
  const cumulative = validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: cumulativeReviews,
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  });
  assert.equal(cumulative.cityReviews.length, 43);
  assert.equal(cumulative.nonCityReviews.length, 12);
  assert.equal(cumulative.nonCityReviews.every((review) => !CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type)), true);
  assert.deepEqual(cumulativeReviews, cumulativeBefore);

  assert.throws(() => validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: expectedCityReviews.slice(1),
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  }), /City review count/);

  const changedId = clone(expectedCityReviews);
  changedId[0].reviewId = "changed-city-review-id";
  assert.throws(() => validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: changedId,
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  }), /frozen City review baseline/);

  const changedContent = clone(expectedCityReviews);
  changedContent[0].details.index = -1;
  assert.throws(() => validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: changedContent,
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  }), /frozen City review baseline/);

  const crossLayerCollision = clone(cumulativeReviews);
  crossLayerCollision[21].reviewId = expectedCityReviews[0].reviewId;
  assert.throws(() => validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: crossLayerCollision,
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  }), /globally unique/);

  const globalDuplicate = clone(cumulativeReviews);
  globalDuplicate[22].reviewId = globalDuplicate[21].reviewId;
  assert.throws(() => validateCumulativeCityReviewQueue({
    cumulativeReviewQueue: globalDuplicate,
    expectedCityReviews,
    cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
    expectedCityReviewCount: 43,
  }), /globally unique/);

  const poiFilesPresent = observeOptionalPoiFiles({ relativePaths: ["poi-a", "poi-b"], existsSync: () => true });
  const poiFilesAbsent = observeOptionalPoiFiles({ relativePaths: ["poi-a", "poi-b"], existsSync: () => false });
  assert.equal(poiFilesPresent.allPresent, true);
  assert.equal(poiFilesAbsent.presentCount, 0);

  return Object.freeze({
    cityOnlyQueueAccepted: true,
    cumulativeQueueAccepted: true,
    nonCityReviewsExcludedFromCityChecks: true,
    missingCityReviewRejected: true,
    changedCityReviewIdRejected: true,
    changedCityReviewContentRejected: true,
    crossLayerReviewIdCollisionRejected: true,
    cumulativeReviewIdDuplicateRejected: true,
    poiFilesPresentAccepted: true,
    poiFilesAbsentAccepted: true,
    temporaryFileHidingRequired: false,
    cumulativeQueueNotMutated: true,
  });
}

const cumulativeReviewFixtures = runCumulativeReviewQueueFixtures();

function sourceTypes(city) {
  return Object.values(city.provenance || {}).map((entry) => entry.sourceType);
}

function rawNames(entity) {
  return [
    ...Object.values(entity?.labels || {}).map((label) => label?.value),
    ...Object.values(entity?.aliases || {}).flatMap((aliases) => aliases.map((alias) => alias?.value)),
  ].filter(Boolean);
}

function fixtureCity(base, overrides = {}) {
  const city = clone(base);
  Object.assign(city, overrides);
  if (overrides.wikidataId && !("entityId" in overrides)) {
    city.entityId = createTypedEntityId({ entityType: "city", wikidataId: overrides.wikidataId });
  }
  city.aliases = canonicalizeEntityLayerAliases(overrides.aliases || city.aliases, [city.canonicalNameZh, city.canonicalNameEn]);
  for (const field of KNOWLEDGE_CITY_PROVENANCE_FIELDS) city.provenance[field].value = city[field];
  return city;
}

function hasConflict(result, type) {
  return result.conflicts.some((conflict) => conflict.type === type && conflict.severity === "blocking");
}

function gateFixture(raw, wikidataId, mutate) {
  const fixture = clone(raw);
  mutate(fixture.semanticEvidence[wikidataId], fixture.wikidata.entities[wikidataId]);
  delete fixture.gate;
  return validateKnowledgeCityBaselineP1bBatch01RawSnapshot(fixture);
}

function statementFixture(property, wikidataId) {
  return {
    mainsnak: {
      snaktype: "value",
      property,
      datavalue: {
        value: {
          "entity-type": "item",
          "numeric-id": Number(wikidataId.slice(1)),
          id: wikidataId,
        },
        type: "wikibase-entityid",
      },
    },
    type: "statement",
    rank: "normal",
  };
}

function setApiClaimQids(entity, property, wikidataIds) {
  entity.claims[property] = wikidataIds.map((wikidataId) => statementFixture(property, wikidataId));
}

const rawText = readText(CITY_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH);
const raw = JSON.parse(rawText);
const citiesAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.cities);
const provenanceAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.provenance);
const conflictsAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.conflicts);
const reviewsAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.reviewQueue);
const pilotCities = readJson(PILOT_CITY_PATH).cities || [];
const countries = CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS.flatMap((relativePath) => readJson(relativePath).countries || []);
const batchCities = citiesAsset.cities || [];
const cityByQid = new Map(batchCities.map((city) => [city.wikidataId, city]));
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const rawGate = validateKnowledgeCityBaselineP1bBatch01RawSnapshot(raw);

assert.equal(countries.length, 50);
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.equal(new Set(countries.map((country) => country.entityId)).size, 50);
assert.equal(new Set(countries.map((country) => country.wikidataId)).size, 50);
assert.equal(raw.schemaVersion, "route-v2-city-baseline-p1b-batch01-raw");
assert.equal(raw.retrievedAt, EXPECTED_RETRIEVED_AT);
assert.equal(sha256KnowledgeBaselineText(rawText), EXPECTED_RAW_HASH);
assert.equal(raw.source?.provider, "wikidata-api+sparql");
assert.equal(raw.source?.cityCount, 10);
assert.equal(raw.source?.httpRequestCount, 2);
assert.equal(raw.source?.retryCount, 0);
assert.equal(raw.source?.entityRecordCount, 10);
assert.equal(raw.source?.semanticBindingCount, 69);
assert.equal(raw.source?.semanticRecordCount, 10);
assert.equal(raw.source?.approvedEntities?.length, 10);
assert.deepEqual(raw.source?.wikidataIds, CITY_BASELINE_P1B_BATCH01_SEEDS.map((seed) => seed.wikidataId));
assert.deepEqual(Object.keys(raw.wikidata?.entities || {}).sort(), Object.keys(EXPECTED_CITIES).sort());
assert.deepEqual(Object.keys(raw.semanticEvidence || {}).sort(), Object.keys(EXPECTED_CITIES).sort());
assert.deepEqual(Object.fromEntries([...new Set(CITY_BASELINE_P1B_BATCH01_SEEDS.map((seed) => seed.isoAlpha2))]
  .map((isoAlpha2) => [isoAlpha2, raw.source.approvedEntities.filter((entity) => entity.isoAlpha2 === isoAlpha2).length])), {
  CO: 2, CZ: 2, FI: 2, NL: 2, PL: 2,
});
for (const seed of CITY_BASELINE_P1B_BATCH01_SEEDS) {
  const rawEntity = raw.wikidata.entities[seed.wikidataId];
  const semanticEvidence = raw.semanticEvidence[seed.wikidataId];
  assert.equal(rawEntity.responseMapKey, seed.wikidataId);
  assert.equal(rawEntity.id, seed.wikidataId);
  assert.equal(semanticEvidence.wikidataId, seed.wikidataId);
  assert.equal(semanticEvidence.entityUris.length, 1);
  assert.equal(semanticEvidence.countryIds.includes(seed.expectedCountryWikidataId), true);
  assert.equal(semanticEvidence.typeIds.length > 0, true);
  assert.equal(semanticEvidence.parentIds.length > 0, true);
}
const rawDirectoryEntries = fs.readdirSync(path.dirname(path.resolve(PROJECT_ROOT, CITY_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH)));
assert.equal(rawDirectoryEntries.some((entry) => entry.startsWith("cities-p1b-batch01.wikidata.json.") && entry.endsWith(".tmp")), false);
assert.equal(rawGate.status, "PASS", JSON.stringify(rawGate));
assert.equal(rawGate.approvedQidsMatched, 10);
assert.equal(rawGate.results.every((result) => result.accepted && result.gateClassification === "compatible-review"), true);
assert.equal(rawGate.results.every((result) => result.usedDescriptionFallback === false), true);

assert.equal(citiesAsset.schemaVersion, "route-v2-city-baseline-p1b-batch01");
assert.equal(citiesAsset.cityCount, 10);
assert.equal(batchCities.length, 10);
assert.deepEqual([...cityByQid.keys()].sort(), Object.keys(EXPECTED_CITIES).sort());
assert.equal(validateKnowledgeCityEntitySet(batchCities).accepted, true);
assert.equal(new Set(batchCities.map((city) => city.entityId)).size, 10);
assert.equal(new Set(batchCities.map((city) => city.wikidataId)).size, 10);
assert.equal(new Set([...countries, ...pilotCities, ...batchCities].map((entity) => entity.entityId)).size, 65);

for (const [wikidataId, expected] of Object.entries(EXPECTED_CITIES)) {
  const city = cityByQid.get(wikidataId);
  const country = countryById.get(expected.parentCountryEntityId);
  const gate = rawGate.results.find((result) => result.wikidataId === wikidataId);
  assert(city, `${wikidataId} should be published`);
  assert.equal(validateKnowledgeCityEntity(city).accepted, true);
  assert.equal(city.entityId, createTypedEntityId({ entityType: "city", wikidataId }));
  assert.equal(city.canonicalNameEn, expected.nameEn);
  assert.equal(city.parentCountryEntityId, expected.parentCountryEntityId);
  assert.equal(country?.isoAlpha2, expected.isoAlpha2);
  assert.equal(country?.wikidataId, expected.countryQid);
  assert.equal(gate.accepted, true);
  assert.equal(gate.isCityClass, true);
  assert.equal(gate.isMetropolitanAreaClass, false);
  assert.equal(gate.rejectedTypeLabels.length, 0);
  assert.equal(gate.typeClassification.policy, "exact-p31-qid-v1");
  assert.deepEqual(gate.typeIds, gate.claimProjections.P31.unionClaims);
  assert.deepEqual(gate.parentIds, gate.claimProjections.P131.unionClaims);
  assert.deepEqual(gate.countryQids, gate.claimProjections.P17.unionClaims);
  assert.equal(gate.countryQids.includes(expected.countryQid), true);
  assert.equal(city.retrievedAt, raw.retrievedAt);
  assert.deepEqual(city.provenance, provenanceAsset.provenance[city.entityId]);
  assert.deepEqual(Object.keys(city.provenance).sort(), [...KNOWLEDGE_CITY_PROVENANCE_FIELDS].sort());
  assert.deepEqual(city.aliases, canonicalizeEntityLayerAliases(city.aliases, [city.canonicalNameZh, city.canonicalNameEn]));
  assert.equal(city.coordinates.latitude >= -90 && city.coordinates.latitude <= 90, true);
  assert.equal(city.coordinates.longitude >= -180 && city.coordinates.longitude <= 180, true);
  for (const entry of Object.values(city.provenance)) assert.equal(entry.retrievedAt, raw.retrievedAt);
  for (const forbidden of FORBIDDEN_SOURCE_TYPES) assert.equal(sourceTypes(city).includes(forbidden), false);
  const names = rawNames(raw.wikidata.entities[wikidataId]);
  for (const alias of city.aliases) assert.equal(names.includes(alias), true, `${wikidataId} alias ${alias} lacks raw source evidence`);
}

for (const [wikidataId, expectedAlias] of [["Q1757", "Helsingfors"], ["Q38511", "Åbo"]]) {
  const sourceContainsAlias = rawNames(raw.wikidata.entities[wikidataId]).includes(expectedAlias);
  if (sourceContainsAlias) assert.equal(cityByQid.get(wikidataId).aliases.includes(expectedAlias), true, `${expectedAlias} should be preserved from raw`);
}

const warsawGate = rawGate.results.find((result) => result.wikidataId === "Q270");
const krakowGate = rawGate.results.find((result) => result.wikidataId === "Q31487");
for (const gate of [warsawGate, krakowGate]) {
  assert.equal(gate.accepted, true);
  assert.equal(gate.isCityClass, true);
  assert.equal(gate.isMetropolitanAreaClass, false);
  assert.equal(gate.parentIds.length > 0, true);
  assert.equal(gate.usedDescriptionFallback, false);
}

assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 10);
const rebuiltA = buildKnowledgeCityBaselineP1bBatch01Assets({ rawSnapshot: raw, countries, pilotCities });
const cumulativeReviewsBeforeValidation = clone(reviewsAsset.reviewQueue);
const reviewValidation = validateCumulativeCityReviewQueue({
  cumulativeReviewQueue: reviewsAsset.reviewQueue,
  expectedCityReviews: clone(rebuiltA.reviewQueueAsset.reviewQueue),
  cityReviewTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
  expectedCityReviewCount: EXPECTED_CITY_REVIEW_COUNT,
});
const { cityReviews, nonCityReviews } = reviewValidation;
assert.equal(reviewsAsset.reviewCount, reviewsAsset.reviewQueue.length);
assert.deepEqual(reviewsAsset.reviewQueue, cumulativeReviewsBeforeValidation, "City validation must not mutate or reorder the cumulative review queue");
const conflictValidation = validateCumulativeCityConflicts({
  cumulativeConflicts: conflictsAsset.conflicts,
  expectedCityConflicts: rebuiltA.conflictsAsset.conflicts,
  cityEntityIds: new Set(batchCities.map((city) => city.entityId)),
  countryEntityIds: new Set(countries.map((country) => country.entityId)),
});
assert.equal(conflictsAsset.conflictCount, conflictsAsset.conflicts.length);
assert.equal(conflictsAsset.blockingCount, conflictsAsset.conflicts.filter((conflict) => conflict.severity === "blocking").length);
assert.equal(conflictValidation.cityConflicts.length, 0);
const gateByQid = new Map(rawGate.results.map((result) => [result.wikidataId, result]));
for (const review of cityReviews) {
  assert.notEqual(review.severity, "blocking");
  const gate = gateByQid.get(review.wikidataId);
  assert(gate, `${review.reviewId} lacks raw gate evidence`);
  assert.equal(gate.reviewReasons.includes(review.type), true);
  assert.deepEqual(review.wikidataTypeIds, gate.typeIds);
  assert.deepEqual(review.wikidataParentIds, gate.parentIds);
  assert.equal(review.rawGateEvidence.reviewReason, review.type);
  assert.equal(review.rawGateEvidence.gateClassification, gate.gateClassification);
  assert.deepEqual(review.rawGateEvidence.typeClassification, gate.typeClassification);
  assert.deepEqual(review.rawGateEvidence.unclassifiedCityTypeQids, gate.typeClassification.unclassifiedTypeQids);
  if (review.type.startsWith("p17-")) assert.deepEqual(review.rawGateEvidence.sourceProjection, gate.claimProjections.P17);
  if (review.type.startsWith("p31-")) assert.deepEqual(review.rawGateEvidence.sourceProjection, gate.claimProjections.P31);
  if (review.type.startsWith("p131-")) assert.deepEqual(review.rawGateEvidence.sourceProjection, gate.claimProjections.P131);
}
const expectedFormalReviewCount = rawGate.results.reduce((total, result) => total
  + result.reviewReasons.filter((type) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(type)).length, 0);
assert.equal(expectedFormalReviewCount, EXPECTED_CITY_REVIEW_COUNT);
assert.equal(cityReviews.length, expectedFormalReviewCount);
assert.equal(cityReviews.some((review) => ["multiple-country-labels", "wikidata-iso-identifiers-missing"].includes(review.type)), false);
for (const city of batchCities.filter((candidate) => candidate.parentCountryEntityId === "country-febe99ab26ea41f0")) {
  assert.equal(Object.values(city.provenance).some((entry) => /approved-country-seed|iso identifier/iu.test(`${entry.source} ${entry.sourceUrl}`)), false);
}

const isolation = validateKnowledgeCityBaselineP1bBatch01Isolation({ batchCities, pilotCities, countries });
assert.equal(isolation.accepted, true);
assert.deepEqual(isolation.conflicts, []);
const countryCityOverlaps = countries.flatMap((country) => [...pilotCities, ...batchCities]
  .filter((city) => city.wikidataId === country.wikidataId)
  .map((city) => ({ country, city })));
assert.deepEqual(countryCityOverlaps.map(({ country, city }) => [country.wikidataId, city.wikidataId]), [["Q334", "Q334"]]);

const repository = createKnowledgeEntityLayerRepository({ countries, cities: batchCities });
assert.equal(repository.validateParentReferences().accepted, true);
for (const seed of CITY_BASELINE_P1B_BATCH01_SEEDS) assert.equal(repository.listCitiesByCountry(seed.parentCountryEntityId).length, 2);
const repositoryCopy = repository.listCities();
repositoryCopy[0].canonicalNameEn = "mutated outside repository";
assert.notEqual(repository.listCities()[0].canonicalNameEn, "mutated outside repository");

const normalizedA = normalizeKnowledgeCityBaseline({ rawSnapshot: raw, citySeeds: CITY_BASELINE_P1B_BATCH01_SEEDS, countries });
const normalizedB = normalizeKnowledgeCityBaseline({ rawSnapshot: raw, citySeeds: CITY_BASELINE_P1B_BATCH01_SEEDS, countries });
assert.deepEqual(normalizedB, normalizedA);
const rebuiltB = buildKnowledgeCityBaselineP1bBatch01Assets({ rawSnapshot: raw, countries, pilotCities });
assert.deepEqual(rebuiltB, rebuiltA);
const serialized = serializeKnowledgeCityBaselineP1bBatch01Assets(rebuiltA);
for (const [key, relativePath] of Object.entries(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS)
  .filter(([key]) => ["cities", "provenance"].includes(key))) {
  assert.equal(
    normalizeKnowledgeBaselineText(serialized[key]),
    normalizeKnowledgeBaselineText(readText(relativePath)),
    `${key} serialized rebuild should be canonical-text-identical`,
  );
}
assert.deepEqual(clone(rebuiltA.reviewQueueAsset.reviewQueue), cityReviews, "City review rebuild should be byte-stable at serialized object level");
assert.deepEqual(rebuiltA.conflictsAsset.conflicts, conflictValidation.cityConflicts, "City conflict rebuild should be byte-stable at object level");

const base = cityByQid.get("Q2841");
assert(hasConflict(dedupeKnowledgeCityEntities([base, clone(base)], { countries }), "duplicate-city-entity-id"));
assert(hasConflict(dedupeKnowledgeCityEntities([base, fixtureCity(base, { entityId: "city-ffffffffffffffff" })], { countries }), "duplicate-city-wikidata-id"));
const pilotDuplicate = fixtureCity(base, { wikidataId: pilotCities[0].wikidataId, entityId: pilotCities[0].entityId });
assert.equal(validateKnowledgeCityBaselineP1bBatch01Isolation({ batchCities: [pilotDuplicate], pilotCities, countries }).accepted, false);
const orphan = fixtureCity(base, { wikidataId: "Q1000001", parentCountryEntityId: "country-0000000000000000" });
assert(hasConflict(dedupeKnowledgeCityEntities([orphan], { countries }), "orphan-city-parent"));
const cityParent = { ...clone(base), entityId: "city-1111111111111111", wikidataId: "Q1000002" };
const wrongParent = fixtureCity(base, { wikidataId: "Q1000003", parentCountryEntityId: cityParent.entityId });
assert(hasConflict(dedupeKnowledgeCityEntities([wrongParent], { countries: [...countries, cityParent] }), "city-parent-not-country"));

const extraP17ProjectionGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P17", ["Q36", "Q408"]);
  evidence.countryIds = ["Q36"];
});
const extraP17ProjectionResult = extraP17ProjectionGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(extraP17ProjectionResult.accepted, true);
assert.deepEqual(extraP17ProjectionResult.claimProjections.P17.onlyInApi, ["Q408"]);
assert.equal(extraP17ProjectionResult.reviewReasons.includes("p17-source-projection-difference"), true);

const countryConflictGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P17", ["Q36"]);
  evidence.countryIds = ["Q408"];
});
const countryConflictResult = countryConflictGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(countryConflictResult.accepted, false);
assert.equal(countryConflictResult.reasons.includes("country-parent-evidence-mismatch"), true);

const apiP31SupersetGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P31", [...evidence.typeIds, "Q999999999"]);
});
const apiP31SupersetResult = apiP31SupersetGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(apiP31SupersetResult.accepted, true);
assert.equal(apiP31SupersetResult.claimProjections.P31.onlyInApi.includes("Q999999999"), true);
assert.equal(apiP31SupersetResult.reviewReasons.includes("unclassified-city-type-qids"), true);

const capitalOfRegionLabelGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P31", ["Q515", "Q12031379"]);
  evidence.typeIds = ["Q515", "Q12031379"];
  evidence.typeLabelsEn = { Q515: "metropolitan area", Q12031379: "region" };
});
const capitalOfRegionLabelResult = capitalOfRegionLabelGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(capitalOfRegionLabelResult.accepted, true);
assert.deepEqual(capitalOfRegionLabelResult.typeClassification.blockingRegionTypeQids, []);

const metroGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P31", ["Q1907114"]);
  evidence.typeIds = ["Q1907114"];
  evidence.typeLabelsEn = { Q1907114: "label text is not used for blocking" };
});
const metroResult = metroGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(metroResult.accepted, false);
assert.equal(metroResult.reasons.includes("approved-qid-is-metropolitan-area"), true);

const regionOnlyGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P31", ["Q38911"]);
  evidence.typeIds = ["Q38911"];
  evidence.typeLabelsEn = { Q38911: "label is not an acceptance signal" };
});
const regionOnlyResult = regionOnlyGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(regionOnlyResult.accepted, false);
assert.equal(regionOnlyResult.reasons.includes("approved-qid-is-region-without-city-identity"), true);

const cityRegionCompositeGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P31", ["Q515", "Q38911"]);
  evidence.typeIds = ["Q515", "Q38911"];
  evidence.typeLabelsEn = { Q515: "city", Q38911: "region of the Czech Republic" };
});
const cityRegionCompositeResult = cityRegionCompositeGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(cityRegionCompositeResult.accepted, true);
assert.equal(cityRegionCompositeResult.reviewReasons.includes("city-administrative-region-overlap"), true);

const unknownOnlyGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P31", ["Q999999999"]);
  evidence.typeIds = ["Q999999999"];
  evidence.typeLabelsEn = { Q999999999: "city" };
});
const unknownOnlyResult = unknownOnlyGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(unknownOnlyResult.accepted, false);
assert.equal(unknownOnlyResult.reasons.includes("approved-qid-not-city-class"), true);
assert.deepEqual(unknownOnlyResult.typeClassification.unclassifiedTypeQids, ["Q999999999"]);

const wrongCountryGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P17", ["Q408"]);
  evidence.countryIds = ["Q408"];
});
const wrongCountryResult = wrongCountryGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(wrongCountryResult.accepted, false);
assert.equal(wrongCountryResult.reasons.includes("country-parent-evidence-mismatch"), true);

const wrongP131CountryGate = gateFixture(raw, "Q270", (evidence, entity) => {
  setApiClaimQids(entity, "P131", ["Q408"]);
  evidence.parentIds = ["Q408"];
});
const wrongP131CountryResult = wrongP131CountryGate.results.find((result) => result.wikidataId === "Q270");
assert.equal(wrongP131CountryResult.accepted, false);
assert.equal(wrongP131CountryResult.reasons.includes("p131-country-conflict"), true);

const formalReviewsA = buildKnowledgeCityBaselineP1bBatch01BoundaryReviews({ cities: [base], rawGate });
const formalReviewsB = buildKnowledgeCityBaselineP1bBatch01BoundaryReviews({ cities: [base], rawGate: clone(rawGate) });
assert.equal(formalReviewsA.length > 0, true);
assert.deepEqual(formalReviewsB, formalReviewsA);
assert.equal(new Set(formalReviewsA.map((review) => review.reviewId)).size, formalReviewsA.length);

const overlapCity = fixtureCity(base, { wikidataId: "Q55" });
assert.equal(validateKnowledgeCityBaselineP1bBatch01Isolation({ batchCities: [overlapCity], pilotCities, countries }).conflicts
  .some((conflict) => conflict.type === "unexpected-country-city-qid-overlap"), true);
const wrongWarsawAnchorGate = gateFixture(raw, "Q270", (_evidence, entity) => { entity.id = "Q319230"; });
assert.equal(wrongWarsawAnchorGate.status, "BLOCKED");

const audit = auditKnowledgeCityBaselineP1bBatch01();
assert.equal(audit.scope.batch01Countries, 5);
assert.equal(audit.scope.batch01Cities, 10);
assert.equal(audit.rawGate.status, "PASS");
assert.equal(audit.schemaValidation.accepted, true);
assert.equal(audit.parentValidation.accepted, true);
assert.deepEqual(audit.parentCounts, audit.expectedParentCounts);
const netherlandsCityEntityIds = new Set(batchCities
  .filter((city) => city.parentCountryEntityId === "country-febe99ab26ea41f0")
  .map((city) => city.entityId));
const netherlandsCityReviews = cityReviews.filter((review) => review.relatedEntityIds
  .some((entityId) => netherlandsCityEntityIds.has(entityId)));
assert.equal(netherlandsCityReviews.every((review) => gateByQid.get(review.wikidataId)?.reviewReasons.includes(review.type)), true);
assert.equal(audit.netherlandsIsolation.provenanceReferencesCountryReview, false);
assert.equal(audit.provenance.coverage, 10);
assert.equal(audit.provenance.inlineSidecarMatches, 10);
assert.equal(audit.unsupportedBoundaries.length, 0);
const poiFileObservation = observeOptionalPoiFiles({
  relativePaths: OPTIONAL_BATCH01_POI_PATHS,
  existsSync: (relativePath) => fs.existsSync(path.resolve(PROJECT_ROOT, relativePath)),
});
assert.equal(poiFileObservation.allPresent, true, "The cumulative POI checkpoint should expose all formal POI files without affecting City validation");

const verifierSource = readText("scripts/verify-knowledge-city-baseline-p1b-batch01.mjs");
for (const forbidden of [
  ["fe", "tch("].join(""),
  ["write", "File"].join(""),
  ["--", "refresh"].join(""),
  ["fs", ".rename"].join(""),
  ["Move", "-Item"].join(""),
  [".codex-city", "-compat"].join(""),
]) {
  assert.equal(verifierSource.includes(forbidden), false, `City verifier source references ${forbidden}`);
}
const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...protectedRelativePaths.filter((relativePath) => relativePath !== "src/lib/routes/knowledge-entity-layer-repository.mjs"
  && relativePath !== "src/lib/routes/index.mjs")], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
assert.equal(protectedDiff, "", `protected files changed:\n${protectedDiff}`);
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, ".route-v2-cache/accepted-routes.json")), EXPECTED_ACCEPTED_HASH);
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, "route-feed-bootstrap.js")), EXPECTED_BOOTSTRAP_HASH);
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "City verifier changed protected assets or caches");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  scope: { countries: 50, batch01Cities: 10, pilotCities: 5, batch01Pois: 0 },
  cityEntityIds: Object.fromEntries(batchCities.map((city) => [city.wikidataId, city.entityId])),
  parentCounts: audit.parentCounts,
  polandGate: audit.polandGate,
  cityConflictCount: conflictValidation.cityConflicts.length,
  nonCityConflictCount: conflictValidation.nonCityConflicts.length,
  cityReviewsChecked: cityReviews.length,
  nonCityReviewsObserved: nonCityReviews.length,
  totalCumulativeReviews: reviewValidation.totalReviews,
  reviewTypes: [...new Set(cityReviews.map((review) => review.type))].sort(),
  poiFilesPresent: poiFileObservation.allPresent,
  poiContentsRead: false,
  temporaryFileHiding: false,
  provenanceCoverage: 10,
  deterministicNormalization: true,
  deterministicPureBuilder: true,
  byteStableRebuild: true,
  syntheticFixtures: {
    duplicateBatchCityQidBlocking: true,
    pilotCityQidDuplicateBlocking: true,
    orphanCountryParentBlocking: true,
    parentCityBlocking: true,
    apiP17SupersetReview: true,
    countryProjectionConflictBlocking: true,
    apiP31SupersetReview: true,
    capitalOfRegionLabelNotBlocking: true,
    exactMetroQidBlocking: true,
    exactRegionOnlyQidBlocking: true,
    cityRegionCompositeReview: true,
    unknownTypeOnlyBlocking: true,
    unknownTypeWithCityReview: true,
    wrongCountryBlocking: true,
    wrongP131CountryBlocking: true,
    unexpectedCountryCityQidOverlapBlocking: true,
    nlCountryReviewNotPropagated: true,
    warsawWrongAnchorBlocking: true,
    defensiveCopyValidation: true,
    deterministicReviewId: true,
    cumulativeReviewCompatibility: cumulativeReviewFixtures,
  },
  acceptedHash: EXPECTED_ACCEPTED_HASH,
  bootstrapHash: EXPECTED_BOOTSTRAP_HASH,
  protectedFilesUnchanged: true,
  pureCityRebuildByteStable: true,
  realNetworkCalls: 0,
}, null, 2)}\n`);
