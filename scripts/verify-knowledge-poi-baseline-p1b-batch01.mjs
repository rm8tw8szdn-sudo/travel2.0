import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  KNOWLEDGE_POI_PROVENANCE_SOURCE_TYPES,
  canonicalizeEntityLayerAliases,
  createKnowledgeEntityLayerRepository,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgePoiBaselineP1bBatch01 } from "./audit-knowledge-poi-baseline-p1b-batch01.mjs";
import {
  CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
} from "./import-knowledge-city-baseline-p1b-batch01.mjs";
import {
  POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
  POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
  POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH,
  POI_BASELINE_P1B_BATCH01_SELECTION_SHA256,
  POI_BASELINE_P1B_BATCH01_SOURCE_RAWS,
  buildKnowledgePoiBaselineP1bBatch01Assets,
  buildKnowledgePoiBaselineP1bBatch01Raw,
  createKnowledgePoiReviewPolicyP1bReview,
  loadKnowledgePoiBaselineP1bBatch01Inputs,
  normalizeKnowledgePoiBaselineP1bBatch01Record,
  serializeKnowledgePoiBaselineP1bBatch01,
} from "./import-knowledge-poi-baseline-p1b-batch01.mjs";
import {
  KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION,
  classifyKnowledgePoiReviewEvidence,
} from "./lib/knowledge-poi-review-policy-p1b.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CITY_REVIEW_BASELINE_COMMIT = "8046a2f";
const CITY_REVIEW_BASELINE_RELATIVE_PATH = "data/knowledge/batches/review-queue.p1b-batch01.json";
const CITY_REVIEW_BASELINE_COUNT = 43;
const OUTPUT_PATHS = Object.freeze([
  POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
  ...Object.values(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS),
]);
const PILOT_PATHS = Object.freeze([
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
const PROTECTED_IMPLEMENTATION_PATHS = Object.freeze([
  ...PILOT_PATHS,
  ...Object.values(POI_BASELINE_P1B_BATCH01_SOURCE_RAWS).map((value) => value.relativePath),
  POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH,
  "data/knowledge/raw/cities-p1b-batch01.wikidata.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
  "data/knowledge/batches/provenance.cities.p1b-batch01.json",
  "src/lib/routes/knowledge-poi-baseline-schema.mjs",
  "src/lib/routes/knowledge-poi-baseline-normalizer.mjs",
  "src/lib/routes/knowledge-poi-baseline-deduper.mjs",
  "src/lib/routes/knowledge-entity-layer-repository.mjs",
  "src/lib/routes/index.mjs",
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);
const protectedAbsolutePaths = PROTECTED_IMPLEMENTATION_PATHS.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor(protectedAbsolutePaths);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256Text(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function outputContents() {
  return Object.fromEntries(OUTPUT_PATHS.map((relativePath) => [relativePath, readText(relativePath)]));
}

function outputHashes(contentsByPath) {
  return Object.fromEntries(Object.entries(contentsByPath).map(([relativePath, contents]) => [relativePath, sha256Text(contents)]));
}

function dispositionCounts(classifiers) {
  return Object.fromEntries(["informational", "manual-review", "blocking"].map((disposition) => [
    disposition,
    classifiers.filter((classifier) => classifier.disposition === disposition).length,
  ]));
}

function readReviewQueueAssetAtGitRef(gitRef) {
  try {
    return JSON.parse(execFileSync("git", ["show", `${gitRef}:${CITY_REVIEW_BASELINE_RELATIVE_PATH}`], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch (error) {
    throw new Error(
      `Unable to read City review baseline from ${gitRef}:${CITY_REVIEW_BASELINE_RELATIVE_PATH}`,
      { cause: error },
    );
  }
}

function validateCityReviewBaselineAsset(asset, source) {
  assert.equal(
    asset.reviewCount,
    CITY_REVIEW_BASELINE_COUNT,
    `${source} City review baseline reviewCount must be ${CITY_REVIEW_BASELINE_COUNT}`,
  );
  assert.equal(
    asset.reviewQueue?.length,
    CITY_REVIEW_BASELINE_COUNT,
    `${source} City review baseline queue length must be ${CITY_REVIEW_BASELINE_COUNT}`,
  );
  assert.equal(
    asset.reviewQueue.every((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type)),
    true,
    `${source} City review baseline must contain only City review types`,
  );
  return asset;
}

function loadCityReviewBaseline() {
  return validateCityReviewBaselineAsset(
    readReviewQueueAssetAtGitRef(CITY_REVIEW_BASELINE_COMMIT),
    CITY_REVIEW_BASELINE_COMMIT,
  );
}

function assertCityReviewsMatchBaseline(currentReviewQueue, baselineAsset) {
  validateCityReviewBaselineAsset(baselineAsset, CITY_REVIEW_BASELINE_COMMIT);
  assert.equal(
    new Set(currentReviewQueue.map((review) => review.reviewId)).size,
    currentReviewQueue.length,
    "current cumulative review queue contains a City/POI reviewId collision",
  );
  const currentCityReviews = currentReviewQueue
    .filter((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  assert.equal(
    currentCityReviews.length,
    CITY_REVIEW_BASELINE_COUNT,
    `current City review count must be ${CITY_REVIEW_BASELINE_COUNT}`,
  );
  assert.deepEqual(
    currentCityReviews,
    baselineAsset.reviewQueue,
    `current City reviews must exactly match checkpoint ${CITY_REVIEW_BASELINE_COMMIT}`,
  );
  return currentCityReviews;
}

const inputs = await loadKnowledgePoiBaselineP1bBatch01Inputs();
const frozenInputsBefore = JSON.stringify(inputs);
const rebuiltRawA = buildKnowledgePoiBaselineP1bBatch01Raw(inputs);
const rebuiltRawB = buildKnowledgePoiBaselineP1bBatch01Raw(inputs);
assert.deepEqual(rebuiltRawA, rebuiltRawB);
const rebuiltAssetsA = buildKnowledgePoiBaselineP1bBatch01Assets({ formalRaw: rebuiltRawA, ...inputs });
const rebuiltAssetsB = buildKnowledgePoiBaselineP1bBatch01Assets({ formalRaw: rebuiltRawB, ...inputs });
assert.deepEqual(rebuiltAssetsA, rebuiltAssetsB);
assert.equal(JSON.stringify(inputs), frozenInputsBefore, "builder mutated frozen inputs");
const rebuiltSerialized = serializeKnowledgePoiBaselineP1bBatch01({ formalRaw: rebuiltRawA, assets: rebuiltAssetsA });

const formalRaw = readJson(POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH);
const selection = readJson(POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH);
const poisAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.pois);
const provenanceAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.provenance);
const conflictsAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.conflicts);
const reviewAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.reviewQueue);
const countries = CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS
  .flatMap((relativePath) => readJson(relativePath).countries || []);
const pilotCities = readJson("data/knowledge/cities.p1b-pilot.json").cities || [];
const batchCities = readJson("data/knowledge/batches/cities.p1b-batch01.json").cities || [];
const pilotPois = readJson("data/knowledge/pois.p1b-pilot.json").pois || [];
const pois = poisAsset.pois || [];
const allCities = [...pilotCities, ...batchCities];
const cityById = new Map(allCities.map((city) => [city.entityId, city]));
const batchCityByQid = new Map(batchCities.map((city) => [city.wikidataId, city]));
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const countryByQid = new Map(countries.map((country) => [country.wikidataId, country]));
const recordByQid = new Map(formalRaw.records.map((record) => [record.selectedQid, record]));
const selectionByQid = new Map(selection.primaryCandidates.map((candidate) => [candidate.selectedQid, candidate]));
const selectedQids = selection.primaryCandidates.map((candidate) => candidate.selectedQid);
const backupQids = new Set(selection.backupCandidates.map((candidate) => candidate.selectedQid));

assert.equal(formalRaw.recordCount, 30);
assert.equal(formalRaw.primaryCount, 30);
assert.equal(formalRaw.backupRecordCount, 0);
assert.equal(formalRaw.cityCount, 10);
assert.ok(Object.values(formalRaw.cityPrimaryCounts).every((count) => count === 3));
assert.deepEqual(formalRaw.records.map((record) => record.selectedQid), selectedQids);
assert.equal(new Set(formalRaw.records.map((record) => record.selectedQid)).size, 30);
assert.equal(formalRaw.records.some((record) => backupQids.has(record.selectedQid)), false);
assert.ok(formalRaw.records.every((record) => record.apiEntity
  && record.sparqlTruthyEvidence
  && record.countryEvidence?.accepted
  && record.parentEvidence?.accepted
  && record.coordinateEvidence?.accepted
  && record.p31Evidence?.p31Key
  && record.parentEvidenceLevel
  && record.identityRisk
  && record.selectionRationale
  && record.sourceRawPath
  && record.sourceRawIndex
  && record.selectionPolicyVersion === selection.policyVersion));

assert.equal(pois.length, 30);
assert.equal(validateKnowledgePoiEntitySet(pois).accepted, true);
assert.equal(new Set(pois.map((poi) => poi.entityId)).size, 30);
assert.equal(new Set(pois.map((poi) => poi.wikidataId)).size, 30);
assert.deepEqual([...pois.map((poi) => poi.wikidataId)].sort(), [...selectedQids].sort());
assert.equal(pois.some((poi) => backupQids.has(poi.wikidataId)), false);
assert.equal(new Set(pois.map((poi) => countryById.get(cityById.get(poi.parentCityEntityId)?.parentCountryEntityId)?.entityId)).size, 5);
for (const city of batchCities) assert.equal(pois.filter((poi) => poi.parentCityEntityId === city.entityId).length, 3);
for (const poi of pois) {
  const record = recordByQid.get(poi.wikidataId);
  const selected = selectionByQid.get(poi.wikidataId);
  const parentCity = cityById.get(poi.parentCityEntityId);
  assert(record && selected && parentCity);
  assert.equal(parentCity.entityType, "city");
  assert.equal(parentCity.wikidataId, record.approvedCityQid);
  assert.equal(parentCity.entityId, batchCityByQid.get(record.approvedCityQid)?.entityId);
  assert.equal(record.candidateKey, selected.candidateKey);
  assert.equal(record.sourceRound, selected.sourceRound);
  assert.equal(record.sourceRawPath, selected.rawReference.rawPath);
  assert.equal(record.sourceRawIndex, selected.rawReference.candidateIndex);
  assert.equal(record.countryEvidence.expectedCountryQid, countryById.get(parentCity.parentCountryEntityId)?.wikidataId);
  assert.equal(countryByQid.get(record.countryEvidence.expectedCountryQid)?.entityId, parentCity.parentCountryEntityId);
  assert(Number.isFinite(poi.coordinates.latitude) && poi.coordinates.latitude >= -90 && poi.coordinates.latitude <= 90);
  assert(Number.isFinite(poi.coordinates.longitude) && poi.coordinates.longitude >= -180 && poi.coordinates.longitude <= 180);
  assert(poi.canonicalNameEn && poi.canonicalNameZh);
  assert.deepEqual(poi.aliases, canonicalizeEntityLayerAliases(poi.aliases, [poi.canonicalNameZh, poi.canonicalNameEn]));
}
assert.equal(pilotPois.some((pilotPoi) => pois.some((poi) => poi.wikidataId === pilotPoi.wikidataId)), false);
assert.equal(countries.some((country) => pois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(allCities.some((city) => pois.some((poi) => poi.wikidataId === city.wikidataId)), false);

const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: [...pilotPois, ...pois] });
assert.equal(repository.validateParentReferences().accepted, true);
assert.equal(repository.listPois().length, 45);
const externalCopy = repository.listPois();
externalCopy[0].canonicalNameEn = "external mutation";
assert.notEqual(repository.listPois()[0].canonicalNameEn, "external mutation");

assert.equal(provenanceAsset.poiCount, 30);
assert.equal(Object.keys(provenanceAsset.provenance).length, 30);
assert.equal(Object.keys(provenanceAsset.traceability).length, 30);
for (const poi of pois) {
  assert.deepEqual(provenanceAsset.provenance[poi.entityId], poi.provenance);
  const trace = provenanceAsset.traceability[poi.entityId];
  const record = recordByQid.get(poi.wikidataId);
  assert(trace);
  assert.equal(trace.sourceRound, record.sourceRound);
  assert.equal(trace.candidateKey, record.candidateKey);
  assert.equal(trace.selectedQid, poi.wikidataId);
  assert.equal(trace.selectionPolicyVersion, selection.policyVersion);
  assert.equal(trace.classifierPolicyVersion, KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION);
  assert.equal(trace.p31Key, record.p31Evidence.p31Key);
  for (const entry of Object.values(poi.provenance)) assert(KNOWLEDGE_POI_PROVENANCE_SOURCE_TYPES.includes(entry.sourceType));
}

assert.equal(rebuiltAssetsA.classifiers.length, 30);
const dispositions = dispositionCounts(rebuiltAssetsA.classifiers);
assert.deepEqual(dispositions, { informational: 18, "manual-review": 12, blocking: 0 });
for (const classifier of rebuiltAssetsA.classifiers) {
  const record = recordByQid.get(classifier.wikidataId);
  assert.equal(classifier.sourceP31Qids.join("|"), record.p31Evidence.p31Key);
  assert.equal(classifier.unknownP31Qids.length, 0);
}
assert.equal(rebuiltAssetsA.classifiers.some((classifier) => backupQids.has(classifier.wikidataId)), false);

assert.equal(conflictsAsset.conflictCount, 0);
assert.equal(conflictsAsset.blockingCount, 0);
assert.deepEqual(conflictsAsset.conflicts, []);
const cityReviewBaseline = loadCityReviewBaseline();
const cityReviews = assertCityReviewsMatchBaseline(reviewAsset.reviewQueue, cityReviewBaseline);
const poiClassifierReviews = reviewAsset.reviewQueue.filter((review) => review.type === "poi-p31-policy-manual-review");
const otherPoiReviews = reviewAsset.reviewQueue.filter((review) => !CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type)
  && review.type !== "poi-p31-policy-manual-review");
assert.equal(cityReviews.length, cityReviewBaseline.reviewCount);
assert.equal(poiClassifierReviews.length, dispositions["manual-review"]);
assert.equal(otherPoiReviews.length, rebuiltAssetsA.reviewQueueAsset.additionalPoiReviewCount);
assert.equal(reviewAsset.reviewCount, cityReviews.length + poiClassifierReviews.length + otherPoiReviews.length);
assert.equal(new Set(reviewAsset.reviewQueue.map((review) => review.reviewId)).size, reviewAsset.reviewQueue.length);
assert.equal(new Set(poiClassifierReviews.map((review) => `${review.relatedEntityIds.find((id) => id.startsWith("poi-"))}:${review.type}`)).size, poiClassifierReviews.length);
for (const review of poiClassifierReviews) {
  assert.equal(review.disposition, "manual-review");
  assert(recordByQid.get(review.wikidataId));
  assert.equal(review.p31Key, recordByQid.get(review.wikidataId).p31Evidence.p31Key);
  assert(review.evidenceTrace?.candidateKey && review.evidenceTrace?.sourceRawPath && review.evidenceTrace?.sourceRawIndex);
}
for (const classifier of rebuiltAssetsA.classifiers.filter((value) => value.disposition === "informational")) {
  assert.equal(poiClassifierReviews.some((review) => review.wikidataId === classifier.wikidataId), false);
}

const cityBaselineFixtureProtectedBefore = statesFor(protectedAbsolutePaths);
const cityBaselineFixtureResults = [];
assert.equal(reviewAsset.reviewCount, 55);
assert.equal(cityReviews.length, CITY_REVIEW_BASELINE_COUNT);
assert.equal(poiClassifierReviews.length, 12);
cityBaselineFixtureResults.push("cumulative-55-filters-city-43");

assert.notEqual(CITY_REVIEW_BASELINE_COMMIT, "HEAD");
const currentHeadReviewAsset = readReviewQueueAssetAtGitRef("HEAD");
assert.throws(
  () => validateCityReviewBaselineAsset(currentHeadReviewAsset, "HEAD"),
  /HEAD City review baseline reviewCount must be 43/,
);
cityBaselineFixtureResults.push("current-head-rejected-as-city-baseline");

const missingCityReviewQueue = clone(reviewAsset.reviewQueue)
  .filter((review) => review.reviewId !== cityReviews[0].reviewId);
assert.throws(
  () => assertCityReviewsMatchBaseline(missingCityReviewQueue, cityReviewBaseline),
  /current City review count must be 43/,
);
cityBaselineFixtureResults.push("missing-city-review-rejected");

const changedCityReviewQueue = clone(reviewAsset.reviewQueue);
changedCityReviewQueue.find((review) => review.reviewId === cityReviews[0].reviewId).message += " fixture mutation";
assert.throws(
  () => assertCityReviewsMatchBaseline(changedCityReviewQueue, cityReviewBaseline),
  /must exactly match checkpoint 8046a2f/,
);
cityBaselineFixtureResults.push("changed-city-review-content-rejected");

const changedCityReviewIdQueue = clone(reviewAsset.reviewQueue);
changedCityReviewIdQueue.find((review) => review.reviewId === cityReviews[0].reviewId).reviewId += "-fixture";
assert.throws(
  () => assertCityReviewsMatchBaseline(changedCityReviewIdQueue, cityReviewBaseline),
  /must exactly match checkpoint 8046a2f/,
);
cityBaselineFixtureResults.push("changed-city-review-id-rejected");

const poiReviewFixture = clone(poiClassifierReviews[0]);
poiReviewFixture.reviewId = `${poiReviewFixture.reviewId}-fixture-extra`;
assert.equal(
  assertCityReviewsMatchBaseline([...cityReviewBaseline.reviewQueue, poiReviewFixture], cityReviewBaseline).length,
  CITY_REVIEW_BASELINE_COUNT,
);
assert.equal(
  assertCityReviewsMatchBaseline(clone(cityReviewBaseline.reviewQueue), cityReviewBaseline).length,
  CITY_REVIEW_BASELINE_COUNT,
);
cityBaselineFixtureResults.push("poi-review-count-independent");

const collidingPoiReview = clone(poiClassifierReviews[0]);
collidingPoiReview.reviewId = cityReviewBaseline.reviewQueue[0].reviewId;
assert.throws(
  () => assertCityReviewsMatchBaseline([...cityReviewBaseline.reviewQueue, collidingPoiReview], cityReviewBaseline),
  /City\/POI reviewId collision/,
);
cityBaselineFixtureResults.push("city-poi-review-id-collision-rejected");

assert.throws(
  () => readReviewQueueAssetAtGitRef("0000000000000000000000000000000000000000"),
  /Unable to read City review baseline from 0000000000000000000000000000000000000000/,
);
cityBaselineFixtureResults.push("unreadable-baseline-commit-rejected");

const wrongCountBaseline = clone(cityReviewBaseline);
wrongCountBaseline.reviewCount = CITY_REVIEW_BASELINE_COUNT - 1;
assert.throws(
  () => validateCityReviewBaselineAsset(wrongCountBaseline, "fixture"),
  /fixture City review baseline reviewCount must be 43/,
);
cityBaselineFixtureResults.push("wrong-baseline-count-rejected");

assertStatesUnchanged(
  cityBaselineFixtureProtectedBefore,
  statesFor(protectedAbsolutePaths),
  "City review baseline fixtures changed protected inputs",
);
cityBaselineFixtureResults.push("fixtures-do-not-modify-assets");
assert.equal(cityBaselineFixtureResults.length, 10);

const syntheticResults = [];
const informationalKey = selection.P31PolicyEvidence.informationalExactKeys[0];
const manualKey = selection.P31PolicyEvidence.manualExactKeys[0];
function fixtureClassify(overrides = {}) {
  return classifyKnowledgePoiReviewEvidence({
    wikidataId: "Q100",
    parentCityEntityId: batchCities[0].entityId,
    sourceP31Qids: informationalKey.split("|"),
    p31ProjectionDifference: false,
    identityRisk: "low",
    parentEvidenceLevel: "direct",
    policyEvidence: selection.P31PolicyEvidence,
    ...overrides,
  });
}
assert.equal(fixtureClassify().disposition, "informational");
syntheticResults.push("exact-informational");
assert.equal(fixtureClassify({ sourceP31Qids: [...informationalKey.split("|"), "Q999999999"] }).disposition, "manual-review");
syntheticResults.push("informational-plus-extra-is-manual");
assert.equal(fixtureClassify({ sourceP31Qids: manualKey.split("|") }).disposition, "manual-review");
syntheticResults.push("exact-manual");
assert.deepEqual(fixtureClassify({ sourceP31Qids: ["Q999999999"] }).unknownP31Qids, ["Q999999999"]);
syntheticResults.push("unknown-is-manual");
assert.equal(fixtureClassify({ sourceP31Qids: [...informationalKey.split("|"), "Q515"] }).disposition, "blocking");
syntheticResults.push("blocking-priority");
for (const qid of ["Q515", "Q82794", "Q1907114", "Q473972"]) assert.equal(fixtureClassify({ sourceP31Qids: [qid] }).disposition, "blocking");
syntheticResults.push("city-region-metro-natural-area-blocking");
assert.equal(fixtureClassify({ overlapKinds: ["pilot-poi-qid-overlap"] }).disposition, "blocking");
syntheticResults.push("pilot-overlap-blocking");
assert.equal(fixtureClassify({ overlapKinds: ["batch-poi-qid-overlap"] }).disposition, "blocking");
syntheticResults.push("batch-overlap-blocking");
assert.equal(fixtureClassify({ overlapKinds: ["country-qid-overlap", "city-qid-overlap"] }).disposition, "blocking");
syntheticResults.push("country-city-overlap-blocking");
assert.equal(fixtureClassify({ parentValidationReasons: ["wrong-parent-city"] }).disposition, "blocking");
syntheticResults.push("wrong-parent-blocking");
assert.equal(fixtureClassify({ parentValidationReasons: ["orphan-parent-city"] }).disposition, "blocking");
syntheticResults.push("orphan-parent-blocking");
assert.equal(fixtureClassify({ isBackup: true }).disposition, "blocking");
syntheticResults.push("backup-blocking");
assert.deepEqual(fixtureClassify(), fixtureClassify());
syntheticResults.push("classifier-deterministic");
const manualClassifier = fixtureClassify({ sourceP31Qids: manualKey.split("|") });
const reviewFixturePoi = pois[0];
const reviewFixtureRecord = recordByQid.get(reviewFixturePoi.wikidataId);
assert.equal(
  createKnowledgePoiReviewPolicyP1bReview(reviewFixturePoi, reviewFixtureRecord, manualClassifier).reviewId,
  createKnowledgePoiReviewPolicyP1bReview(reviewFixturePoi, reviewFixtureRecord, manualClassifier).reviewId,
);
syntheticResults.push("review-id-deterministic");
const pilotReviewBefore = readText("data/knowledge/review-queue.p1b-pilot.json");
assert.equal(readText("data/knowledge/review-queue.p1b-pilot.json"), pilotReviewBefore);
syntheticResults.push("pilot-reviews-immutable");
const defensiveClassifier = fixtureClassify();
defensiveClassifier.sourceP31Qids.push("Q999999999");
assert.deepEqual(fixtureClassify().sourceP31Qids, informationalKey.split("|").sort((left, right) => left.localeCompare(right, "en")));
syntheticResults.push("defensive-copy");
assert.equal(syntheticResults.length, 16);

const firstRecord = formalRaw.records[0];
const firstCity = batchCityByQid.get(firstRecord.approvedCityQid);
assert.deepEqual(
  normalizeKnowledgePoiBaselineP1bBatch01Record(firstRecord, firstCity),
  normalizeKnowledgePoiBaselineP1bBatch01Record(firstRecord, firstCity),
);

assert.equal(rebuiltSerialized.formalRaw, readText(POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH));
assert.equal(rebuiltSerialized.pois, readText(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.pois));
assert.equal(rebuiltSerialized.provenance, readText(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.provenance));
assert.equal(rebuiltSerialized.conflicts, readText(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.conflicts));
assert.equal(rebuiltSerialized.reviewQueue, readText(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.reviewQueue));

const beforeRerun = outputContents();
const importerOutput = JSON.parse(execFileSync(process.execPath, ["scripts/import-knowledge-poi-baseline-p1b-batch01.mjs"], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}));
assert.equal(importerOutput.status, "PASS");
assert.equal(importerOutput.mode, "offline-publish");
assert.equal(importerOutput.calledWikidata, false);
const afterRerun = outputContents();
assert.deepEqual(afterRerun, beforeRerun);

assert.equal(sha256Text(readText(POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH)), POI_BASELINE_P1B_BATCH01_SELECTION_SHA256);
for (const source of Object.values(POI_BASELINE_P1B_BATCH01_SOURCE_RAWS)) {
  assert.equal(sha256Text(readText(source.relativePath)), source.sha256);
}
const policySource = readText("scripts/lib/knowledge-poi-review-policy-p1b.mjs");
const importerSource = readText("scripts/import-knowledge-poi-baseline-p1b-batch01.mjs");
assert.equal(policySource.includes("node:"), false);
assert.equal(policySource.includes("labelEn"), false);
assert.equal(policySource.includes(".label"), false);
for (const forbidden of ["fetch(", ".route-v2-cache", "--refresh"] ) assert.equal(importerSource.includes(forbidden), false);

const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PROTECTED_IMPLEMENTATION_PATHS.filter((value) => !value.startsWith(".route-v2-cache/"))], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(protectedDiff, "", `protected implementation inputs changed:\n${protectedDiff}`);
assertStatesUnchanged(protectedBefore, statesFor(protectedAbsolutePaths), "verifier/importer rerun changed protected inputs");

const audit = auditKnowledgePoiBaselineP1bBatch01();
assert.equal(audit.status, "PASS");
assert.equal(audit.totals.countries, 50);
assert.equal(audit.totals.cities, 15);
assert.equal(audit.totals.cumulativePois, 45);
assert.equal(audit.totals.totalEntities, 110);

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  scope: {
    pois: pois.length,
    cities: batchCities.length,
    countriesRepresented: 5,
    eachCity: 3,
    backupsPublished: 0,
  },
  identity: {
    entityIdsUnique: true,
    qidsUnique: true,
    pilotPoiOverlap: 0,
    countryOverlap: 0,
    cityOverlap: 0,
  },
  parents: { orphanPois: 0, approvedBatchCitiesOnly: true, nameFallbackUsed: false },
  provenance: { coverage: 30, inlineSidecarMatches: 30, traceabilityCoverage: 30, forbiddenSourceTypes: 0 },
  classifier: { policyVersion: KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION, coverage: 30, ...dispositions },
  reviews: {
    cityBaselineSource: CITY_REVIEW_BASELINE_COMMIT,
    cityPreserved: cityReviews.length,
    poiClassifierManual: poiClassifierReviews.length,
    additionalPoi: otherPoiReviews.length,
    totalDerived: reviewAsset.reviewCount,
  },
  conflicts: { total: 0, blocking: 0 },
  determinism: {
    classifier: true,
    normalizer: true,
    builder: true,
    serializedByteMatch: true,
    importerRerunByteIdentical: true,
    outputHashes: outputHashes(afterRerun),
  },
  syntheticFixtures: {
    count: syntheticResults.length + cityBaselineFixtureResults.length,
    classifier: { count: syntheticResults.length, results: syntheticResults },
    cityReviewBaseline: { count: cityBaselineFixtureResults.length, results: cityBaselineFixtureResults },
  },
  immutable: { pilot: true, selection: true, sourceRaws: true, cache: true },
  assetsModified: false,
  calledWikidata: false,
  realNetworkCalls: 0,
}, null, 2)}\n`);
