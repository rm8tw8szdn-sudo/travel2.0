import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createKnowledgeEntityLayerRepository, validateKnowledgePoiEntitySet } from "../src/lib/routes/index.mjs";
import {
  POI_BASELINE_P1B_BATCH02_CANDIDATES,
  POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
  validateKnowledgePoiBaselineP1bBatch02CandidateRaw,
} from "./inspect-knowledge-poi-baseline-p1b-batch02-evidence.mjs";
import {
  POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS,
  POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
  POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH,
} from "./import-knowledge-poi-baseline-p1b-batch02.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRY_PATHS = [
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/countries.p1a-batch03.json",
];
const CITY_PATHS = [
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
  "data/knowledge/batches/cities.p1b-batch02.json",
];
const PRIOR_POI_PATHS = [
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
];

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(readText(relativePath)).digest("hex");
}

export function auditKnowledgePoiBaselineP1bBatch02() {
  const candidateRaw = readJson(POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH);
  const selection = readJson(POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH);
  const formalRaw = readJson(POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH);
  const poisAsset = readJson(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.pois);
  const provenanceAsset = readJson(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.provenance);
  const conflictsAsset = readJson(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.conflicts);
  const reviewsAsset = readJson(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.reviewQueue);
  const countries = COUNTRY_PATHS.flatMap((relativePath) => readJson(relativePath).countries || []);
  const cities = CITY_PATHS.flatMap((relativePath) => readJson(relativePath).cities || []);
  const priorPois = PRIOR_POI_PATHS.flatMap((relativePath) => readJson(relativePath).pois || []);
  const pois = poisAsset.pois || [];
  const allPois = [...priorPois, ...pois];
  const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois: allPois });
  const cityById = new Map(cities.map((city) => [city.entityId, city]));
  const candidateGate = validateKnowledgePoiBaselineP1bBatch02CandidateRaw(candidateRaw);
  const poiEntityIds = new Set(pois.map((poi) => poi.entityId));
  const poiReviews = (reviewsAsset.reviewQueue || []).filter((review) => (review.relatedEntityIds || []).some((entityId) => poiEntityIds.has(entityId)));
  const byCity = [...new Set(POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.parentCityEntityId))]
    .map((cityEntityId) => ({
      cityEntityId,
      city: cityById.get(cityEntityId)?.canonicalNameEn,
      cityZh: cityById.get(cityEntityId)?.canonicalNameZh,
      pois: repository.listPoisByCity(cityEntityId).map((poi) => ({
        entityId: poi.entityId,
        wikidataId: poi.wikidataId,
        nameEn: poi.canonicalNameEn,
        nameZh: poi.canonicalNameZh,
      })),
    }));
  const orphanPois = pois.filter((poi) => !cityById.has(poi.parentCityEntityId));
  const qidOverlaps = {
    countryPoi: countries.filter((country) => pois.some((poi) => poi.wikidataId === country.wikidataId)).length,
    cityPoi: cities.filter((city) => pois.some((poi) => poi.wikidataId === city.wikidataId)).length,
    priorPoi: priorPois.filter((prior) => pois.some((poi) => poi.wikidataId === prior.wikidataId)).length,
  };
  const summary = {
    status: candidateGate.status === "PASS"
      && selection.primaryCount === 30
      && selection.backupCount === 0
      && formalRaw.records?.length === 30
      && pois.length === 30
      && validateKnowledgePoiEntitySet(pois).accepted
      && byCity.length === 10
      && byCity.every((entry) => entry.pois.length === 3)
      && Object.keys(provenanceAsset.provenance || {}).length === 30
      && poiReviews.length === 19
      && conflictsAsset.conflictCount === 0
      && conflictsAsset.blockingCount === 0
      && orphanPois.length === 0
      && Object.values(qidOverlaps).every((count) => count === 0)
      && repository.validateParentReferences().accepted
      ? "PASS"
      : "FAIL",
    source: {
      retrievedAt: candidateRaw.retrievedAt,
      candidateRawSha256: sha256(POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH),
      selectionSha256: sha256(POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH),
      formalRawSha256: sha256(POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH),
      httpRequestCount: candidateRaw.source.httpRequestCount,
      retryCount: candidateRaw.source.retryCount,
      candidates: candidateGate.candidateCount,
      pass: candidateGate.passCount,
      blocking: candidateGate.blockingCount,
    },
    selection: {
      policyVersion: selection.policyVersion,
      rule: selection.selectionRule,
      primary: selection.primaryCount,
      backups: selection.backupCount,
      cities: selection.cities.length,
    },
    publication: {
      pois: pois.length,
      provenance: Object.keys(provenanceAsset.provenance || {}).length,
      informational: 11,
      manualReview: poiReviews.length,
      blocking: conflictsAsset.blockingCount,
      conflicts: conflictsAsset.conflictCount,
      cumulativeReviews: reviewsAsset.reviewCount,
      qidOverlaps,
      orphanPois: orphanPois.length,
    },
    cumulative: {
      countries: countries.length,
      cities: cities.length,
      pois: allPois.length,
      totalEntities: countries.length + cities.length + allPois.length,
      parentValidation: repository.validateParentReferences(),
    },
    byCity,
  };
  return summary;
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const summary = auditKnowledgePoiBaselineP1bBatch02();
  assert.equal(summary.status, "PASS", JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
