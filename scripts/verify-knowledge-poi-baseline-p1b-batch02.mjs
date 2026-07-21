import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_POI_PROVENANCE_FIELDS,
  createKnowledgeEntityLayerRepository,
  validateCountryEntitySet,
  validateKnowledgeCityEntitySet,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  POI_BASELINE_P1B_BATCH02_CANDIDATES,
  POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
  validateKnowledgePoiBaselineP1bBatch02CandidateRaw,
} from "./inspect-knowledge-poi-baseline-p1b-batch02-evidence.mjs";
import {
  POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256,
  POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS,
  POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
  POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH,
  POI_BASELINE_P1B_BATCH02_SELECTION_SHA256,
  buildKnowledgePoiBaselineP1bBatch02Assets,
  buildKnowledgePoiBaselineP1bBatch02Raw,
  loadKnowledgePoiBaselineP1bBatch02Inputs,
  serializeKnowledgePoiBaselineP1bBatch02,
} from "./import-knowledge-poi-baseline-p1b-batch02.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_HASHES = Object.freeze({
  raw: "5fa81095503f28e7b322d859b1fc72a2e921fa68b3b54cdbdc526b4d5c7d8277",
  pois: "78fa0f83c66efabc56911dfddb971e36167607b7293bbcbb5d9b508d504ee509",
  provenance: "731c17e050367ee20a45c8e23bcdac17bd03eb937f75608c3474856395fad1af",
  conflicts: "ad9ec64858ad536d2e922d607f8a2f922e8abfbbc2f3e3ff80d4bacebab3adb6",
  reviewQueue: "4535f306b092e83ba3fd4531295deb04f4a42011f2970614f63baea149c360d4",
});
const COUNTRY_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/countries.p1a-batch03.json",
]);
const CITY_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
  "data/knowledge/batches/cities.p1b-batch02.json",
]);
const PRIOR_POI_PATHS = Object.freeze([
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
]);
const PROTECTED_PATHS = Object.freeze([
  ...COUNTRY_PATHS,
  ...CITY_PATHS,
  ...PRIOR_POI_PATHS,
  "data/knowledge/provenance.pois.p1b-pilot.json",
  "data/knowledge/batches/provenance.pois.p1b-batch01.json",
  "data/knowledge/raw/pois-p1b-pilot.wikidata.json",
  "data/knowledge/raw/pois-p1b-batch01.wikidata.json",
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

const protectedAbsolutePaths = PROTECTED_PATHS.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor(protectedAbsolutePaths);
const candidateRawText = readText(POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH);
const selectionText = readText(POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH);
const formalRawText = readText(POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH);
const poisText = readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.pois);
const provenanceText = readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.provenance);
const conflictsText = readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.conflicts);
const reviewsText = readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.reviewQueue);
const candidateRaw = JSON.parse(candidateRawText);
const selection = JSON.parse(selectionText);
const formalRaw = JSON.parse(formalRawText);
const poisAsset = JSON.parse(poisText);
const provenanceAsset = JSON.parse(provenanceText);
const conflictsAsset = JSON.parse(conflictsText);
const reviewsAsset = JSON.parse(reviewsText);

assert.equal(sha256(candidateRawText), POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256);
assert.equal(sha256(selectionText), POI_BASELINE_P1B_BATCH02_SELECTION_SHA256);
assert.equal(sha256(formalRawText), EXPECTED_HASHES.raw);
assert.equal(sha256(poisText), EXPECTED_HASHES.pois);
assert.equal(sha256(provenanceText), EXPECTED_HASHES.provenance);
assert.equal(sha256(conflictsText), EXPECTED_HASHES.conflicts);
assert.equal(sha256(reviewsText), EXPECTED_HASHES.reviewQueue);

const candidateGate = validateKnowledgePoiBaselineP1bBatch02CandidateRaw(candidateRaw);
assert.equal(candidateGate.status, "PASS");
assert.equal(candidateGate.candidateCount, 30);
assert.equal(candidateGate.passCount, 30);
assert.equal(candidateGate.blockingCount, 0);
assert.equal(candidateGate.results.every((result) => result.parentAccepted), true);
assert.equal(candidateGate.results.every((result) => result.coordinateCount === 1), true);
assert.equal(candidateGate.results.every((result) => result.blockingTypeQids.length === 0), true);
assert.equal(candidateRaw.source.httpRequestCount, 2);
assert.equal(candidateRaw.source.retryCount, 0);

assert.equal(selection.primaryCount, 30);
assert.equal(selection.backupCount, 0);
assert.equal(selection.cities.length, 10);
assert.equal(selection.cities.every((city) => city.primaryWikidataIds.length === 3), true);
assert.equal(new Set(selection.primaryWikidataIds).size, 30);
assert.deepEqual(selection.backupWikidataIds, []);

const countries = COUNTRY_PATHS.flatMap((relativePath) => readJson(relativePath).countries || []);
const cities = CITY_PATHS.flatMap((relativePath) => readJson(relativePath).cities || []);
const priorPois = PRIOR_POI_PATHS.flatMap((relativePath) => readJson(relativePath).pois || []);
const batchPois = poisAsset.pois || [];
const allPois = [...priorPois, ...batchPois];
const allEntities = [...countries, ...cities, ...allPois];
assert.equal(countries.length, 50);
assert.equal(cities.length, 25);
assert.equal(priorPois.length, 45);
assert.equal(batchPois.length, 30);
assert.equal(allPois.length, 75);
assert.equal(allEntities.length, 150);
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(cities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(batchPois).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(allPois).accepted, true);
assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, 150);
assert.equal(new Set(allPois.map((poi) => poi.wikidataId)).size, 75);
assert.equal(countries.some((country) => batchPois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(cities.some((city) => batchPois.some((poi) => poi.wikidataId === city.wikidataId)), false);

const cityById = new Map(cities.map((city) => [city.entityId, city]));
for (const poi of allPois) assert.ok(cityById.has(poi.parentCityEntityId), `${poi.entityId} orphan POI`);
const batchCityIds = new Set(POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.parentCityEntityId));
assert.equal(batchCityIds.size, 10);
for (const cityId of batchCityIds) assert.equal(batchPois.filter((poi) => poi.parentCityEntityId === cityId).length, 3);
assert.deepEqual(batchPois.map((poi) => poi.wikidataId).sort(), selection.primaryWikidataIds.slice().sort());
assert.equal(selection.backupWikidataIds.some((qid) => batchPois.some((poi) => poi.wikidataId === qid)), false);

assert.equal(provenanceAsset.poiCount, 30);
assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 30);
for (const poi of batchPois) {
  const sidecar = provenanceAsset.provenance[poi.entityId];
  assert.ok(sidecar, `${poi.entityId} provenance missing`);
  for (const field of KNOWLEDGE_POI_PROVENANCE_FIELDS) assert.deepEqual(sidecar[field], poi.provenance[field]);
  assert.equal(sidecar.selection.sourceRawSha256, POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256);
  assert.equal(sidecar.selection.selectionSha256, POI_BASELINE_P1B_BATCH02_SELECTION_SHA256);
  assert.equal(["informational", "manual-review"].includes(sidecar.selection.disposition), true);
}

assert.equal(conflictsAsset.conflictCount, 0);
assert.equal(conflictsAsset.blockingCount, 0);
assert.deepEqual(conflictsAsset.conflicts, []);
const poiEntityIds = new Set(batchPois.map((poi) => poi.entityId));
const poiReviews = (reviewsAsset.reviewQueue || []).filter((review) => (review.relatedEntityIds || []).some((entityId) => poiEntityIds.has(entityId)));
assert.equal(reviewsAsset.reviewCount, 56);
assert.equal(poiReviews.length, 19);
assert.equal(poiReviews.every((review) => review.type === "poi-p31-policy-manual-review"), true);
assert.equal(new Set(poiReviews.map((review) => review.reviewId)).size, 19);

const inputs = await loadKnowledgePoiBaselineP1bBatch02Inputs();
const inputsBefore = JSON.stringify(inputs);
const rebuiltRawA = buildKnowledgePoiBaselineP1bBatch02Raw(clone(inputs));
const rebuiltRawB = buildKnowledgePoiBaselineP1bBatch02Raw(clone(inputs));
assert.deepEqual(rebuiltRawA, rebuiltRawB);
assert.deepEqual(rebuiltRawA, formalRaw);
const rebuiltAssetsA = buildKnowledgePoiBaselineP1bBatch02Assets({ formalRaw: rebuiltRawA, ...clone(inputs) });
const rebuiltAssetsB = buildKnowledgePoiBaselineP1bBatch02Assets({ formalRaw: rebuiltRawB, ...clone(inputs) });
assert.deepEqual(rebuiltAssetsA, rebuiltAssetsB);
assert.equal(JSON.stringify(inputs), inputsBefore, "builder mutated frozen inputs");
assert.deepEqual(rebuiltAssetsA.poisAsset, poisAsset);
assert.deepEqual(rebuiltAssetsA.provenanceAsset, provenanceAsset);
assert.deepEqual(rebuiltAssetsA.conflictsAsset, conflictsAsset);
assert.deepEqual(rebuiltAssetsA.reviewQueueAsset, reviewsAsset);
assert.deepEqual(Object.fromEntries(["informational", "manual-review", "blocking"].map((disposition) => [
  disposition,
  rebuiltAssetsA.classifiers.filter((classifier) => classifier.disposition === disposition).length,
])), { informational: 11, "manual-review": 19, blocking: 0 });

const serialized = serializeKnowledgePoiBaselineP1bBatch02({ formalRaw: rebuiltRawA, assets: rebuiltAssetsA });
assert.equal(serialized.raw, formalRawText);
assert.equal(serialized.pois, poisText);
assert.equal(serialized.provenance, provenanceText);
assert.equal(serialized.conflicts, conflictsText);
assert.equal(serialized.reviewQueue, reviewsText);
const importerOutput = JSON.parse(execFileSync(process.execPath, ["scripts/import-knowledge-poi-baseline-p1b-batch02.mjs"], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}));
assert.equal(importerOutput.status, "PASS");
assert.equal(importerOutput.calledWikidata, false);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH), candidateRawText);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH), selectionText);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH), formalRawText);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.pois), poisText);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.provenance), provenanceText);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.conflicts), conflictsText);
assert.equal(readText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.reviewQueue), reviewsText);

const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois: allPois });
assert.equal(repository.validateParentReferences().accepted, true);
assert.equal(repository.listCountries().length, 50);
assert.equal(repository.listCities().length, 25);
assert.equal(repository.listPois().length, 75);
for (const cityId of batchCityIds) assert.equal(repository.listPoisByCity(cityId).length, 3);
const poiCopy = repository.listPois();
poiCopy[0].canonicalNameEn = "external mutation";
assert.notEqual(repository.listPois()[0].canonicalNameEn, "external mutation");

const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PROTECTED_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(protectedDiff, "", `Prior assets or cache changed:\n${protectedDiff}`);
assertStatesUnchanged(protectedBefore, statesFor(protectedAbsolutePaths), "Batch02 POI verifier changed prior assets or cache");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  evidence: {
    candidateRawSha256: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256,
    selectionSha256: POI_BASELINE_P1B_BATCH02_SELECTION_SHA256,
    candidates: candidateGate.candidateCount,
    primary: selection.primaryCount,
    backups: selection.backupCount,
  },
  batch02: {
    cities: batchCityIds.size,
    pois: batchPois.length,
    poisPerCity: 3,
    provenance: `${Object.keys(provenanceAsset.provenance).length}/${batchPois.length}`,
    classifier: { informational: 11, manualReview: 19, blocking: 0 },
    poiReviews: poiReviews.length,
    conflicts: conflictsAsset.conflictCount,
  },
  cumulative: {
    countries: countries.length,
    cities: cities.length,
    pois: allPois.length,
    totalEntities: allEntities.length,
    totalReviews: reviewsAsset.reviewCount,
    orphanCities: 0,
    orphanPois: 0,
  },
  repository: { stableOrdering: true, defensiveCopies: true, parentValidation: true, cacheWrites: 0 },
}, null, 2)}\n`);
