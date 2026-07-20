import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  KNOWLEDGE_CITY_PROVENANCE_FIELDS,
  KNOWLEDGE_POI_PROVENANCE_FIELDS,
  canonicalizeEntityLayerAliases,
  createKnowledgeEntityLayerRepository,
  createTypedEntityId,
  dedupeKnowledgeCityEntities,
  dedupeKnowledgePoiEntities,
  normalizeKnowledgeCityBaseline,
  normalizeKnowledgePoiBaseline,
  validateCountryEntitySet,
  validateKnowledgeCityEntitySet,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgeEntityLayerP1bPilot } from "./audit-knowledge-entity-layer-p1b-pilot.mjs";
import {
  CITY_BASELINE_P1B_PILOT_SEEDS,
  buildKnowledgeCityBaselineP1bAssets,
  serializeKnowledgeCityBaselineP1bAssets,
} from "./import-knowledge-city-baseline-p1b-pilot.mjs";
import {
  POI_BASELINE_P1B_PILOT_SEEDS,
  buildKnowledgePoiBaselineP1bAssets,
  serializeKnowledgePoiBaselineP1bAssets,
} from "./import-knowledge-poi-baseline-p1b-pilot.mjs";
import {
  assertStatesUnchanged,
  sha256IfExists,
  statesFor,
} from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRY_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
]);
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
]);
const ENTITY_LAYER_PROTECTED_PATHS = Object.freeze([
  "data/knowledge/raw/cities-p1b-pilot.wikidata.json",
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/provenance.cities.p1b-pilot.json",
  "data/knowledge/raw/pois-p1b-pilot.wikidata.json",
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/provenance.pois.p1b-pilot.json",
  "data/knowledge/conflicts.p1b-pilot.json",
  "data/knowledge/review-queue.p1b-pilot.json",
]);
const CACHE_PROTECTED_PATHS = Object.freeze([
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);
const PLANNER_PROTECTED_PATHS = Object.freeze([
  "src/lib/routes/route-composition-planner.mjs",
  "route-feed-bootstrap.js",
]);
const EXPECTED_ACCEPTED_HASH = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";
const EXPECTED_BOOTSTRAP_HASH = "9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef";
const EXPECTED_CITY_REVIEW_IDS = Object.freeze([
  "review-0c208bcb4a53b559",
  "review-c1b15455ffb7e1bf",
]);
const EXPECTED_POI_NAMING_REVIEW_ID = "review-958d06ddaa1adf82";
const EXPECTED_CITY_COUNTRIES = Object.freeze({
  "city-5a21732f861ff7f1": "JP",
  "city-8acaf08893e5abf1": "JP",
  "city-fc91a9c6c7b389cf": "TR",
  "city-d6f6bf7d2fca5cb4": "TR",
  "city-dde074f983b42cfd": "SG",
});
const FORBIDDEN_SOURCE_TYPES = Object.freeze([
  "coverage-placeholder",
  "search-fallback",
  "route-record-derived",
  "unknown",
]);
const protectedPaths = [...P1A_PROTECTED_PATHS, ...ENTITY_LAYER_PROTECTED_PATHS, ...CACHE_PROTECTED_PATHS]
  .map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
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
  poi.aliases = canonicalizeEntityLayerAliases(poi.aliases, [poi.canonicalNameZh, poi.canonicalNameEn]);
  for (const field of KNOWLEDGE_POI_PROVENANCE_FIELDS) poi.provenance[field].value = poi[field];
  return poi;
}

function stableCitySort(items) {
  return [...items].sort((left, right) => left.parentCountryEntityId.localeCompare(right.parentCountryEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

function stablePoiSort(items) {
  return [...items].sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

function crossLayerQidConflicts(countries, cities, pois) {
  const conflicts = [];
  for (const country of countries) {
    for (const city of cities.filter((candidate) => candidate.wikidataId === country.wikidataId)) {
      if (country.wikidataId !== "Q334") {
        conflicts.push({
          type: "country-city-qid-overlap-not-allowed",
          severity: "blocking",
          wikidataId: country.wikidataId,
          relatedEntityIds: [country.entityId, city.entityId].sort(),
        });
      }
    }
    for (const poi of pois.filter((candidate) => candidate.wikidataId === country.wikidataId)) {
      conflicts.push({
        type: "country-poi-qid-overlap",
        severity: "blocking",
        wikidataId: country.wikidataId,
        relatedEntityIds: [country.entityId, poi.entityId].sort(),
      });
    }
  }
  for (const city of cities) {
    for (const poi of pois.filter((candidate) => candidate.wikidataId === city.wikidataId)) {
      conflicts.push({
        type: "city-poi-qid-overlap",
        severity: "blocking",
        wikidataId: city.wikidataId,
        relatedEntityIds: [city.entityId, poi.entityId].sort(),
      });
    }
  }
  return conflicts;
}

function collectSourceTypes(value, sourceTypes = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceTypes(item, sourceTypes);
  } else if (value && typeof value === "object") {
    if (typeof value.sourceType === "string") sourceTypes.push(value.sourceType);
    for (const nested of Object.values(value)) collectSourceTypes(nested, sourceTypes);
  }
  return sourceTypes;
}

function repositorySnapshot(repository) {
  return {
    cities: repository.listCities(),
    pois: repository.listPois(),
    parentValidation: repository.validateParentReferences(),
  };
}

function assertReason(validation, type) {
  assert(validation.reasons.some((reason) => reason.type === type), `expected repository reason ${type}`);
}

const countries = COUNTRY_PATHS.flatMap((relativePath) => readJson(relativePath).countries || []);
const citiesAsset = readJson("data/knowledge/cities.p1b-pilot.json");
const poisAsset = readJson("data/knowledge/pois.p1b-pilot.json");
const cityProvenanceAsset = readJson("data/knowledge/provenance.cities.p1b-pilot.json");
const poiProvenanceAsset = readJson("data/knowledge/provenance.pois.p1b-pilot.json");
const cityRaw = readJson("data/knowledge/raw/cities-p1b-pilot.wikidata.json");
const poiRaw = readJson("data/knowledge/raw/pois-p1b-pilot.wikidata.json");
const conflictsAsset = readJson("data/knowledge/conflicts.p1b-pilot.json");
const reviewAsset = readJson("data/knowledge/review-queue.p1b-pilot.json");
const cities = citiesAsset.cities || [];
const pois = poisAsset.pois || [];
const reviews = reviewAsset.reviewQueue || [];
const conflicts = conflictsAsset.conflicts || [];
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));
const pilotCountries = new Map(["JP", "TR", "SG"].map((isoAlpha2) => [
  isoAlpha2,
  countries.find((country) => country.isoAlpha2 === isoAlpha2),
]));

assert.equal(countries.length, 35);
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.deepEqual([...pilotCountries.keys()], ["JP", "TR", "SG"]);
assert([...pilotCountries.values()].every(Boolean));
assert.equal(cities.length, 5);
assert.equal(pois.length, 15);
assert.equal(validateKnowledgeCityEntitySet(cities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(pois).accepted, true);

const allEntityIds = [...countries, ...cities, ...pois].map((entity) => entity.entityId);
assert.equal(new Set(allEntityIds).size, allEntityIds.length);
assert.equal(new Set(cities.map((city) => city.wikidataId)).size, 5);
assert.equal(new Set(pois.map((poi) => poi.wikidataId)).size, 15);
assert.equal(countries.some((country) => pois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(cities.some((city) => pois.some((poi) => poi.wikidataId === city.wikidataId)), false);
const countryCityQidOverlaps = countries.flatMap((country) => cities
  .filter((city) => city.wikidataId === country.wikidataId)
  .map((city) => ({ wikidataId: country.wikidataId, countryEntityId: country.entityId, cityEntityId: city.entityId })));
assert.deepEqual(countryCityQidOverlaps, [{
  wikidataId: "Q334",
  countryEntityId: "country-e0a550ef5a59c6f9",
  cityEntityId: "city-dde074f983b42cfd",
}]);
assert.notEqual(countryCityQidOverlaps[0].countryEntityId, countryCityQidOverlaps[0].cityEntityId);
assert.deepEqual(crossLayerQidConflicts(countries, cities, pois), []);

for (const city of cities) {
  const country = countryById.get(city.parentCountryEntityId);
  assert(country, `${city.entityId} has an orphan Country parent`);
  assert.equal(country.entityType, "country");
  assert.equal(country.isoAlpha2, EXPECTED_CITY_COUNTRIES[city.entityId]);
}
for (const poi of pois) {
  const city = cityById.get(poi.parentCityEntityId);
  const country = countryById.get(city?.parentCountryEntityId);
  assert(city, `${poi.entityId} has an orphan City parent`);
  assert.equal(city.entityType, "city");
  assert(country, `${poi.entityId} cannot derive a Country through its City`);
  assert.equal(country.entityType, "country");
  assert.equal(country.isoAlpha2, EXPECTED_CITY_COUNTRIES[city.entityId]);
  assert.equal("parentCountryEntityId" in poi, false);
  assert.equal("parentCountry" in poi, false);
  assert.equal("fallbackParent" in poi, false);
  const chain = [poi.entityId, city.entityId, country.entityId];
  assert.equal(new Set(chain).size, chain.length, `${poi.entityId} parent chain contains a cycle`);
}

const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois });
assert.equal(repository.listCities().length, 5);
assert.equal(repository.listPois().length, 15);
assert.deepEqual(repository.listCities(), stableCitySort(cities));
assert.deepEqual(repository.listPois(), stablePoiSort(pois));
for (const [isoAlpha2, expectedCount] of Object.entries({ JP: 2, TR: 2, SG: 1 })) {
  const country = pilotCountries.get(isoAlpha2);
  const listed = repository.listCitiesByCountry(country.entityId);
  assert.equal(listed.length, expectedCount);
  assert.deepEqual(listed, stableCitySort(listed));
}
for (const city of cities) {
  const listed = repository.listPoisByCity(city.entityId);
  assert.equal(listed.length, 3);
  assert.deepEqual(listed, stablePoiSort(listed));
}
assert.equal(repository.validateParentReferences().accepted, true);
assert.equal(repository.getEntity(pilotCountries.get("JP").entityId)?.entityType, "country");
assert.equal(repository.getEntity(cities[0].entityId)?.entityType, "city");
assert.equal(repository.getEntity(pois[0].entityId)?.entityType, "poi");
assert.equal(repository.getEntity(countryCityQidOverlaps[0].countryEntityId)?.entityType, "country");
assert.equal(repository.getEntity(countryCityQidOverlaps[0].cityEntityId)?.entityType, "city");

const originalRepositorySnapshot = repositorySnapshot(repository);
const cityCopies = repository.listCities();
const poiCopies = repository.listPois();
const entityCopy = repository.getEntity(pois[0].entityId);
cityCopies[0].canonicalNameEn = "mutated outside repository";
cityCopies.push(clone(cityCopies[0]));
poiCopies[0].coordinates.latitude = 0;
poiCopies.splice(1);
entityCopy.canonicalNameEn = "mutated getEntity copy";
assert.deepEqual(repositorySnapshot(repository), originalRepositorySnapshot);
const repositoryAgain = createKnowledgeEntityLayerRepository({ countries, cities, pois });
assert.deepEqual(repositorySnapshot(repositoryAgain), originalRepositorySnapshot);

for (const city of cities) {
  assert.deepEqual(Object.keys(city.provenance).sort(), [...KNOWLEDGE_CITY_PROVENANCE_FIELDS].sort());
  assert.deepEqual(city.provenance, cityProvenanceAsset.provenance[city.entityId]);
  assert.equal(city.retrievedAt, cityRaw.retrievedAt);
}
for (const poi of pois) {
  assert.deepEqual(Object.keys(poi.provenance).sort(), [...KNOWLEDGE_POI_PROVENANCE_FIELDS].sort());
  assert.deepEqual(poi.provenance, poiProvenanceAsset.provenance[poi.entityId]);
  assert.equal(poi.retrievedAt, poiRaw.retrievedAt);
}
assert.equal(Object.keys(cityProvenanceAsset.provenance).length, 5);
assert.equal(Object.keys(poiProvenanceAsset.provenance).length, 15);
const sourceTypes = collectSourceTypes([...countries, ...cities, ...pois]);
assert.deepEqual(sourceTypes.filter((sourceType) => FORBIDDEN_SOURCE_TYPES.includes(sourceType)), []);

assert.equal(conflictsAsset.blockingCount, 0);
assert.equal(conflictsAsset.conflictCount, 0);
assert.deepEqual(conflicts, []);
assert.equal(reviewAsset.reviewCount, 13);
assert.equal(reviews.length, 13);
assert.equal(new Set(reviews.map((review) => review.reviewId)).size, 13);
assert.equal(new Set(conflicts.map((conflict) => conflict.conflictId)).size, 0);
assert.equal(reviews.every((review) => review.severity === "manual-review"), true);
const poiEntityIds = new Set(pois.map((poi) => poi.entityId));
const cityReviews = reviews.filter((review) => EXPECTED_CITY_REVIEW_IDS.includes(review.reviewId));
const poiReviews = reviews.filter((review) => review.relatedEntityIds?.some((entityId) => poiEntityIds.has(entityId)));
assert.equal(cityReviews.length, 2);
assert.equal(poiReviews.length, 11);
assert(reviews.some((review) => review.reviewId === EXPECTED_POI_NAMING_REVIEW_ID));

const normalizedCitiesA = normalizeKnowledgeCityBaseline({ rawSnapshot: cityRaw, citySeeds: CITY_BASELINE_P1B_PILOT_SEEDS, countries });
const normalizedCitiesB = normalizeKnowledgeCityBaseline({ rawSnapshot: cityRaw, citySeeds: CITY_BASELINE_P1B_PILOT_SEEDS, countries });
assert.deepEqual(normalizedCitiesB, normalizedCitiesA);
const normalizedPoisA = normalizeKnowledgePoiBaseline({ rawSnapshot: poiRaw, poiSeeds: POI_BASELINE_P1B_PILOT_SEEDS, cities });
const normalizedPoisB = normalizeKnowledgePoiBaseline({ rawSnapshot: poiRaw, poiSeeds: POI_BASELINE_P1B_PILOT_SEEDS, cities });
assert.deepEqual(normalizedPoisB, normalizedPoisA);
const cityRebuiltA = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot: cityRaw, countries });
const cityRebuiltB = buildKnowledgeCityBaselineP1bAssets({ rawSnapshot: cityRaw, countries });
assert.deepEqual(cityRebuiltB, cityRebuiltA);
const poiBuildInputA = {
  rawSnapshot: poiRaw,
  countries,
  cities,
  cityConflictsAsset: cityRebuiltA.conflictsAsset,
  cityReviewQueueAsset: cityRebuiltA.reviewQueueAsset,
};
const poiBuildInputB = {
  ...poiBuildInputA,
  cityConflictsAsset: cityRebuiltB.conflictsAsset,
  cityReviewQueueAsset: cityRebuiltB.reviewQueueAsset,
};
const poiRebuiltA = buildKnowledgePoiBaselineP1bAssets(poiBuildInputA);
const poiRebuiltB = buildKnowledgePoiBaselineP1bAssets(poiBuildInputB);
assert.deepEqual(poiRebuiltB, poiRebuiltA);
assert.deepEqual(poiRebuiltB.conflictsAsset, poiRebuiltA.conflictsAsset);
assert.deepEqual(poiRebuiltB.reviewQueueAsset, poiRebuiltA.reviewQueueAsset);
const citySerialized = serializeKnowledgeCityBaselineP1bAssets(cityRebuiltA);
assert.equal(citySerialized.cities, readText("data/knowledge/cities.p1b-pilot.json"));
assert.equal(citySerialized.provenance, readText("data/knowledge/provenance.cities.p1b-pilot.json"));
const poiSerialized = serializeKnowledgePoiBaselineP1bAssets(poiRebuiltA);
for (const [key, relativePath] of Object.entries({
  pois: "data/knowledge/pois.p1b-pilot.json",
  provenance: "data/knowledge/provenance.pois.p1b-pilot.json",
  conflicts: "data/knowledge/conflicts.p1b-pilot.json",
  reviewQueue: "data/knowledge/review-queue.p1b-pilot.json",
})) {
  assert.equal(poiSerialized[key], readText(relativePath), `${key} cumulative rebuild should be byte-identical`);
}
for (const expectedReview of cityRebuiltA.reviewQueueAsset.reviewQueue) {
  assert.deepEqual(reviews.find((review) => review.reviewId === expectedReview.reviewId), expectedReview);
}

const multipleTypeReviews = reviews.filter((review) => review.type === "multiple-wikidata-poi-types");
assert.equal(multipleTypeReviews.length, 10);
for (const review of multipleTypeReviews) {
  const rawTypeIds = [...new Set((poiRaw.wikidata.entities[review.wikidataId]?.claims?.P31 || [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim.mainsnak?.datavalue?.value?.id)
    .filter(Boolean))].sort();
  assert(rawTypeIds.length > 1, `${review.wikidataId} review lacks real multiple P31 evidence`);
  assert.deepEqual(review.wikidataTypeIds, rawTypeIds);
}
const namingReview = reviews.find((review) => review.reviewId === EXPECTED_POI_NAMING_REVIEW_ID);
const q80541Raw = poiRaw.wikidata.entities.Q80541;
const q80541Aliases = Object.values(q80541Raw.aliases || {}).flatMap((aliases) => aliases.map((alias) => alias.value));
assert.equal(namingReview.rawCanonicalNameZh, q80541Raw.labels["zh-hans"].value);
assert(q80541Aliases.includes(namingReview.selectedCanonicalNameZh));

const duplicateCountryCity = createKnowledgeEntityLayerRepository({
  countries,
  cities: [{ ...clone(cities[0]), entityId: countries[0].entityId }, ...cities.slice(1)],
  pois,
}).validateParentReferences();
assertReason(duplicateCountryCity, "duplicate-entity-id");
const duplicateCityPoi = createKnowledgeEntityLayerRepository({
  countries,
  cities,
  pois: [{ ...clone(pois[0]), entityId: cities[0].entityId }, ...pois.slice(1)],
}).validateParentReferences();
assertReason(duplicateCityPoi, "duplicate-entity-id");
const duplicateCountryPoi = createKnowledgeEntityLayerRepository({
  countries,
  cities,
  pois: [{ ...clone(pois[0]), entityId: countries[0].entityId }, ...pois.slice(1)],
}).validateParentReferences();
assertReason(duplicateCountryPoi, "duplicate-entity-id");

const poiParentCountry = { ...clone(pois[0]), parentCityEntityId: countries[0].entityId };
assertReason(createKnowledgeEntityLayerRepository({ countries, cities, pois: [poiParentCountry] }).validateParentReferences(), "poi-parent-not-city");
const poiOrphan = { ...clone(pois[0]), parentCityEntityId: "city-0000000000000000" };
assertReason(createKnowledgeEntityLayerRepository({ countries, cities, pois: [poiOrphan] }).validateParentReferences(), "orphan-poi-parent");
const cityParentPoi = { ...clone(cities[0]), parentCountryEntityId: pois[0].entityId };
assertReason(createKnowledgeEntityLayerRepository({ countries, cities: [cityParentPoi], pois }).validateParentReferences(), "city-parent-not-country");
const countryWithChildren = cities[0].parentCountryEntityId;
assertReason(createKnowledgeEntityLayerRepository({
  countries: countries.filter((country) => country.entityId !== countryWithChildren),
  cities,
  pois,
}).validateParentReferences(), "orphan-city-parent");
const cityWithChildren = pois[0].parentCityEntityId;
assertReason(createKnowledgeEntityLayerRepository({
  countries,
  cities: cities.filter((city) => city.entityId !== cityWithChildren),
  pois,
}).validateParentReferences(), "orphan-poi-parent");

const singaporeCity = cityById.get("city-dde074f983b42cfd");
const singaporeDedupe = dedupeKnowledgeCityEntities([singaporeCity], { countries });
assert.equal(singaporeDedupe.conflicts.length, 0);
assert(singaporeDedupe.reviewQueue.some((review) => review.reviewId === "review-c1b15455ffb7e1bf"));
const forbiddenCountryCityOverlap = { ...clone(cities[0]), wikidataId: pilotCountries.get("JP").wikidataId };
const otherCountryCityQidConflicts = crossLayerQidConflicts(countries, [forbiddenCountryCityOverlap], []);
assert(otherCountryCityQidConflicts.some((conflict) => conflict.type === "country-city-qid-overlap-not-allowed" && conflict.severity === "blocking"));

const basePoi = pois[0];
const cityQidPoi = fixturePoi(basePoi, { wikidataId: cities[0].wikidataId });
assert(dedupeKnowledgePoiEntities([cityQidPoi], { countries, cities }).conflicts
  .some((conflict) => conflict.type === "city-poi-qid-overlap" && conflict.severity === "blocking"));
const countryQidPoi = fixturePoi(basePoi, { wikidataId: countries[0].wikidataId });
assert(dedupeKnowledgePoiEntities([countryQidPoi], { countries, cities }).conflicts
  .some((conflict) => conflict.type === "country-poi-qid-overlap" && conflict.severity === "blocking"));

const differentCountryCities = [clone(cities.find((city) => city.parentCountryEntityId === pilotCountries.get("JP").entityId)),
  clone(cities.find((city) => city.parentCountryEntityId === pilotCountries.get("TR").entityId))];
differentCountryCities[1].canonicalNameEn = differentCountryCities[0].canonicalNameEn;
differentCountryCities[1].canonicalNameZh = differentCountryCities[0].canonicalNameZh;
differentCountryCities[1].coordinates = clone(differentCountryCities[0].coordinates);
const sameNameCityRepository = createKnowledgeEntityLayerRepository({ countries, cities: differentCountryCities });
assert.equal(sameNameCityRepository.listCities().length, 2);
assert.notEqual(differentCountryCities[0].entityId, differentCountryCities[1].entityId);
assert.equal(sameNameCityRepository.getEntity(differentCountryCities[0].entityId).entityType, "city");
assert.equal(sameNameCityRepository.getEntity(differentCountryCities[1].entityId).entityType, "city");

const differentCityPois = [clone(pois.find((poi) => poi.parentCityEntityId === cities[0].entityId)),
  clone(pois.find((poi) => poi.parentCityEntityId !== cities[0].entityId))];
differentCityPois[1].canonicalNameEn = differentCityPois[0].canonicalNameEn;
differentCityPois[1].canonicalNameZh = differentCityPois[0].canonicalNameZh;
differentCityPois[1].coordinates = clone(differentCityPois[0].coordinates);
const sameNamePoiRepository = createKnowledgeEntityLayerRepository({ countries, cities, pois: differentCityPois });
assert.equal(sameNamePoiRepository.listPois().length, 2);
assert.notEqual(differentCityPois[0].entityId, differentCityPois[1].entityId);
assert.equal(sameNamePoiRepository.getEntity(differentCityPois[0].entityId).entityType, "poi");
assert.equal(sameNamePoiRepository.getEntity(differentCityPois[1].entityId).entityType, "poi");

const audit = auditKnowledgeEntityLayerP1bPilot();
assert.equal(audit.status, "PASS");
assert.deepEqual(audit.totals, {
  countriesAvailable: 35,
  pilotCountries: 3,
  cities: 5,
  pois: 15,
  blockingConflicts: 0,
  reviews: 13,
});
assert.equal(audit.tree.flatMap((country) => country.cities).length, 5);
assert.equal(audit.tree.flatMap((country) => country.cities.flatMap((city) => city.pois)).length, 15);

const repositorySource = readText("src/lib/routes/knowledge-entity-layer-repository.mjs");
for (const forbidden of ["node:fs", ["fe", "tch("].join(""), ".route-v2-cache", "knowledge-graph-pool", "RouteRecord", "accepted-routes", "coverage-placeholder", "search-fallback", "route-record-derived", "plannerReason"]) {
  assert.equal(repositorySource.includes(forbidden), false, `repository source references ${forbidden}`);
}
const verifierSource = readText("scripts/verify-knowledge-entity-layer-p1b-pilot.mjs");
for (const forbidden of [
  ["fe", "tch("].join(""),
  ["write", "File"].join(""),
  ["--", "refresh"].join(""),
]) {
  assert.equal(verifierSource.includes(forbidden), false, `cumulative verifier source references ${forbidden}`);
}

const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...P1A_PROTECTED_PATHS, ...ENTITY_LAYER_PROTECTED_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(protectedDiff, "");
const plannerDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PLANNER_PROTECTED_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(plannerDiff, "");
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, ".route-v2-cache/accepted-routes.json")), EXPECTED_ACCEPTED_HASH);
assert.equal(sha256IfExists(path.resolve(PROJECT_ROOT, "route-feed-bootstrap.js")), EXPECTED_BOOTSTRAP_HASH);
assertStatesUnchanged(protectedBefore, statesFor([...new Set(protectedPaths)]), "cumulative verifier changed protected assets or caches");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  totals: audit.totals,
  distribution: Object.fromEntries(audit.tree.map((country) => [country.isoAlpha2, Object.fromEntries(country.cities.map((city) => [city.canonicalNameEn, city.poiCount]))])),
  identity: {
    entityIdsGloballyUnique: true,
    cityQidsUnique: true,
    poiQidsUnique: true,
    onlyCountryCityQidOverlap: "Q334",
    countryPoiQidOverlap: 0,
    cityPoiQidOverlap: 0,
  },
  parents: {
    orphanCities: 0,
    orphanPois: 0,
    allPoiCityCountryChainsValid: 15,
    cycles: 0,
    fallbackParents: 0,
  },
  repository: {
    cities: repository.listCities().length,
    pois: repository.listPois().length,
    stableOrdering: true,
    defensiveCopies: true,
    parentReferencesValid: true,
    deterministicBuild: true,
  },
  schemaAndProvenance: {
    countrySchema: "35/35",
    citySchema: "5/5",
    poiSchema: "15/15",
    cityProvenance: "5/5",
    poiProvenance: "15/15",
    forbiddenSourceTypes: 0,
  },
  issues: {
    blockingConflicts: 0,
    cumulativeReviews: 13,
    cityReviews: 2,
    poiReviews: 11,
    multipleP31ReviewsBackedByRaw: 10,
    q80541NamingReviewBackedByRaw: true,
  },
  determinism: {
    cityNormalizeDeepEqual: true,
    poiNormalizeDeepEqual: true,
    cityBuilderDeepEqual: true,
    poiBuilderDeepEqual: true,
    cumulativeIssuesDeepEqual: true,
    publishedAssetsByteIdentical: true,
    systemTimeExcluded: true,
  },
  syntheticFixtures: {
    countryCityEntityIdDuplicateBlocking: true,
    cityPoiEntityIdDuplicateBlocking: true,
    countryPoiEntityIdDuplicateBlocking: true,
    poiParentCountryBlocking: true,
    orphanPoiParentBlocking: true,
    cityParentPoiBlocking: true,
    removedCountryOrphanDetected: true,
    removedCityOrphanDetected: true,
    singaporeQidOverlapReviewOnly: true,
    otherCountryCityQidOverlapBlocking: true,
    cityPoiQidOverlapBlocking: true,
    countryPoiQidOverlapBlocking: true,
    defensiveCopyIsolation: true,
    sameNameDifferentCountryCitiesRetained: true,
    sameNameDifferentCityPoisRetained: true,
  },
  acceptedHash: EXPECTED_ACCEPTED_HASH,
  bootstrapHash: EXPECTED_BOOTSTRAP_HASH,
  protectedAssetsUnchanged: true,
  realNetworkCalls: 0,
}, null, 2)}\n`);
