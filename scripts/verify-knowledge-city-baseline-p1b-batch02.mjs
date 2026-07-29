import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createKnowledgeEntityLayerRepository,
  validateCountryEntitySet,
  validateKnowledgeCityEntitySet,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
  CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES,
  CITY_BASELINE_P1B_BATCH02_SEEDS,
  buildKnowledgeCityBaselineP1bBatch02Assets,
  serializeKnowledgeCityBaselineP1bBatch02Assets,
  validateKnowledgeCityBaselineP1bBatch02Isolation,
  validateKnowledgeCityBaselineP1bBatch02RawSnapshot,
  validateKnowledgeCityBaselineP1bBatch02SeedScope,
} from "./import-knowledge-city-baseline-p1b-batch02.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORTER_RELATIVE_PATH = "scripts/import-knowledge-city-baseline-p1b-batch02.mjs";
const EXPECTED_RAW_SHA256 = "863cb98ee150c51b87a86ba43b3bd09b5ae4f234084aad0038e4408e18c57083";
const EXPECTED_RETRIEVED_AT = "2026-07-20T11:54:57.984Z";
const EXPECTED_CITY_REVIEW_COUNT = 37;
const PRIOR_CITY_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
]);
const PRIOR_POI_PATHS = Object.freeze([
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
]);
const OPTIONAL_BATCH02_POI_PATH = "data/knowledge/batches/pois.p1b-batch02.json";
const PROTECTED_PATHS = Object.freeze([
  ...CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS,
  ...PRIOR_CITY_PATHS,
  ...PRIOR_POI_PATHS,
  "data/knowledge/raw/cities-p1b-pilot.wikidata.json",
  "data/knowledge/raw/cities-p1b-batch01.wikidata.json",
  "data/knowledge/provenance.cities.p1b-pilot.json",
  "data/knowledge/batches/provenance.cities.p1b-batch01.json",
  "data/knowledge/provenance.pois.p1b-pilot.json",
  "data/knowledge/batches/provenance.pois.p1b-batch01.json",
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function functionSource(source, name, nextMarker) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `${name} boundary must exist`);
  return source.slice(start, end);
}

function stableCitySort(cities) {
  return [...cities].sort((left, right) => left.parentCountryEntityId.localeCompare(right.parentCountryEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

const protectedAbsolutePaths = PROTECTED_PATHS.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor(protectedAbsolutePaths);
const importerSource = readText(IMPORTER_RELATIVE_PATH);
const writeTextAtomicSource = functionSource(importerSource, "writeTextAtomic", "\nasync function writePublishedAssets");
const writePublishedAssetsSource = functionSource(importerSource, "writePublishedAssets", "\nfunction numericOption");
assert.match(writeTextAtomicSource, /writeFile\(temporaryPath, contents, "utf8"\)/u);
assert.match(writeTextAtomicSource, /rename\(temporaryPath, filePath\)/u);
assert.doesNotMatch(writeTextAtomicSource, /writeFile\(filePath/u);
assert.match(writePublishedAssetsSource, /await writeTextAtomic\(targetPath, serialized\[key\]\)/u);
assert.doesNotMatch(writePublishedAssetsSource, /writeFile\(targetPath/u);
const rawText = readText(CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH);
const raw = JSON.parse(rawText);
const citiesAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.cities);
const provenanceAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.provenance);
const conflictsAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.conflicts);
const reviewsAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.reviewQueue);
const countries = CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS
  .flatMap((relativePath) => readJson(relativePath).countries || []);
const priorCities = PRIOR_CITY_PATHS.flatMap((relativePath) => readJson(relativePath).cities || []);
const priorPois = PRIOR_POI_PATHS.flatMap((relativePath) => readJson(relativePath).pois || []);
const batchCities = citiesAsset.cities || [];
const allCities = [...priorCities, ...batchCities];
const allEntities = [...countries, ...allCities, ...priorPois];

assert.equal(sha256(rawText), EXPECTED_RAW_SHA256);
assert.equal(raw.retrievedAt, EXPECTED_RETRIEVED_AT);
assert.equal(raw.source.provider, "wikidata-api+sparql");
assert.equal(raw.source.httpRequestCount, 2);
assert.equal(raw.source.retryCount, 0);
assert.equal(raw.source.entityRecordCount, 10);
assert.equal(raw.source.semanticRecordCount, 10);
assert.equal(raw.source.wikidataIds.length, 10);

const rawGate = validateKnowledgeCityBaselineP1bBatch02RawSnapshot(raw);
assert.equal(rawGate.status, "PASS");
assert.equal(rawGate.cityCount, 10);
assert.equal(rawGate.approvedQidsMatched, 10);
assert.equal(rawGate.results.every((result) => result.accepted), true);
assert.equal(rawGate.results.every((result) => result.exactQidPass), true);
assert.equal(rawGate.results.every((result) => result.countryParentPass), true);
assert.equal(rawGate.results.every((result) => result.coordinates.length === 1), true);
assert.equal(rawGate.results.every((result) => result.typeClassification.hasExplicitCityIdentity), true);
assert.equal(rawGate.results.some((result) => result.usedDescriptionFallback), false);

const seedScope = validateKnowledgeCityBaselineP1bBatch02SeedScope({ countries, priorCities });
assert.equal(seedScope.accepted, true);
assert.equal(seedScope.seedCount, 10);
assert.equal(seedScope.seedCountryCount, 5);
assert.deepEqual(seedScope.countryQidOverlaps, []);
assert.deepEqual(seedScope.priorCityQidOverlaps, []);

assert.equal(countries.length, 50);
assert.equal(priorCities.length, 15);
assert.equal(batchCities.length, 10);
assert.equal(allCities.length, 25);
assert.equal(priorPois.length, 45);
assert.equal(allEntities.length, 120);
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(batchCities).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(allCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(priorPois).accepted, true);

assert.deepEqual(batchCities.map((city) => city.wikidataId).sort(), CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => seed.wikidataId).sort());
for (const isoAlpha2 of ["FR", "DE", "IT", "ES", "KR"]) {
  const country = countries.find((value) => value.isoAlpha2 === isoAlpha2);
  assert.ok(country, `${isoAlpha2} Country missing`);
  assert.equal(batchCities.filter((city) => city.parentCountryEntityId === country.entityId).length, 2, `${isoAlpha2} must have two Batch02 Cities`);
}

assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, allEntities.length);
assert.equal(new Set(allCities.map((city) => city.wikidataId)).size, allCities.length);
assert.equal(new Set(priorPois.map((poi) => poi.wikidataId)).size, priorPois.length);
const countryCityOverlaps = countries.flatMap((country) => allCities.filter((city) => city.wikidataId === country.wikidataId));
assert.equal(countryCityOverlaps.length, 1);
assert.equal(countryCityOverlaps[0].wikidataId, "Q334");
assert.equal(countries.some((country) => priorPois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(allCities.some((city) => priorPois.some((poi) => poi.wikidataId === city.wikidataId)), false);

const countryIds = new Set(countries.map((country) => country.entityId));
const cityIds = new Set(allCities.map((city) => city.entityId));
assert.equal(allCities.every((city) => countryIds.has(city.parentCountryEntityId)), true);
assert.equal(priorPois.every((poi) => cityIds.has(poi.parentCityEntityId)), true);

const isolation = validateKnowledgeCityBaselineP1bBatch02Isolation({ batchCities, priorCities, countries });
assert.equal(isolation.accepted, true);
assert.deepEqual(isolation.conflicts, []);
const overlapFixture = validateKnowledgeCityBaselineP1bBatch02Isolation({
  batchCities: [clone(priorCities[0])],
  priorCities,
  countries,
});
assert.equal(overlapFixture.accepted, false);
assert.equal(overlapFixture.conflicts.length >= 2, true);

const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: priorPois });
assert.equal(repository.validateParentReferences().accepted, true);
assert.deepEqual(repository.listCities(), stableCitySort(allCities));
assert.equal(repository.listCountries().length, 50);
assert.equal(repository.listCities().length, 25);
assert.equal(repository.listPois().length, 45);
const returnedCities = repository.listCities();
returnedCities[0].canonicalNameEn = "external mutation";
assert.notEqual(repository.listCities()[0].canonicalNameEn, "external mutation");

assert.equal(provenanceAsset.cityCount, 10);
assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 10);
for (const city of batchCities) {
  assert.deepEqual(provenanceAsset.provenance[city.entityId], city.provenance);
}

const rebuiltA = buildKnowledgeCityBaselineP1bBatch02Assets({ rawSnapshot: clone(raw), countries: clone(countries), priorCities: clone(priorCities) });
const rebuiltB = buildKnowledgeCityBaselineP1bBatch02Assets({ rawSnapshot: clone(raw), countries: clone(countries), priorCities: clone(priorCities) });
assert.deepEqual(rebuiltA, rebuiltB);
assert.deepEqual(rebuiltA.citiesAsset, citiesAsset);
assert.deepEqual(rebuiltA.provenanceAsset, provenanceAsset);
assert.equal(rebuiltA.conflictsAsset.conflictCount, 0);
assert.equal(rebuiltA.conflictsAsset.blockingCount, 0);
assert.equal(rebuiltA.reviewQueueAsset.reviewCount, EXPECTED_CITY_REVIEW_COUNT);

const batchCityIds = new Set(batchCities.map((city) => city.entityId));
const currentCityReviews = (reviewsAsset.reviewQueue || []).filter((review) => CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES.includes(review.type)
  && (review.relatedEntityIds || []).some((entityId) => batchCityIds.has(entityId)));
assert.equal(currentCityReviews.length, EXPECTED_CITY_REVIEW_COUNT);
assert.deepEqual(currentCityReviews, clone(rebuiltA.reviewQueueAsset.reviewQueue));
assert.equal(new Set(currentCityReviews.map((review) => review.reviewId)).size, currentCityReviews.length);
assert.equal(new Set(currentCityReviews.map((review) => `${review.wikidataId}:${review.type}`)).size, currentCityReviews.length);
assert.equal(currentCityReviews.every((review) => review.severity === "manual-review"), true);
assert.equal((conflictsAsset.conflicts || []).filter((conflict) => (conflict.relatedEntityIds || []).some((entityId) => batchCityIds.has(entityId))).length, 0);

const serialized = serializeKnowledgeCityBaselineP1bBatch02Assets(rebuiltA);
assert.equal(serialized.cities, readText(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.cities));
assert.equal(serialized.provenance, readText(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.provenance));
if (!fs.existsSync(path.resolve(PROJECT_ROOT, OPTIONAL_BATCH02_POI_PATH))) {
  const beforeOutputs = Object.fromEntries(Object.entries(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS)
    .map(([key, relativePath]) => [key, readText(relativePath)]));
  const importerOutput = execFileSync(process.execPath, ["scripts/import-knowledge-city-baseline-p1b-batch02.mjs"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  assert.equal(JSON.parse(importerOutput).calledWikidata, false);
  for (const [key, relativePath] of Object.entries(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS)) {
    assert.equal(readText(relativePath), beforeOutputs[key], `${relativePath} changed during deterministic rebuild`);
  }
  assert.equal(readText(CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH), rawText);
}

const malformedRaw = clone(raw);
delete malformedRaw.wikidata.entities[CITY_BASELINE_P1B_BATCH02_SEEDS[0].wikidataId];
assert.equal(validateKnowledgeCityBaselineP1bBatch02RawSnapshot(malformedRaw).status, "BLOCKED");

const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PROTECTED_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(protectedDiff, "", `Prior assets or cache changed:\n${protectedDiff}`);
assertStatesUnchanged(protectedBefore, statesFor(protectedAbsolutePaths), "Batch02 City verifier changed prior assets or cache");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  raw: {
    sha256: EXPECTED_RAW_SHA256,
    retrievedAt: EXPECTED_RETRIEVED_AT,
    httpRequestCount: raw.source.httpRequestCount,
    approvedQidsMatched: rawGate.approvedQidsMatched,
  },
  batch02: {
    countries: 5,
    cities: batchCities.length,
    citiesPerCountry: 2,
    conflicts: 0,
    blockingConflicts: 0,
    reviews: currentCityReviews.length,
    provenance: `${Object.keys(provenanceAsset.provenance).length}/${batchCities.length}`,
  },
  cumulative: {
    countries: countries.length,
    cities: allCities.length,
    pois: priorPois.length,
    totalEntities: allEntities.length,
    orphanCities: 0,
    orphanPois: 0,
    onlyCountryCityQidOverlap: "Q334",
  },
  repository: {
    stableOrdering: true,
    defensiveCopies: true,
    parentValidation: true,
    networkCallsDuringVerification: 0,
    cacheWrites: 0,
  },
}, null, 2)}\n`);
