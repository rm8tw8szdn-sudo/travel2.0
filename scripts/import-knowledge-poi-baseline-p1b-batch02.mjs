import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createEntityLayerIssueId,
  dedupeKnowledgePoiEntities,
  normalizeKnowledgePoiBaseline,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  POI_BASELINE_P1B_BATCH02_CANDIDATES,
  POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
  validateKnowledgePoiBaselineP1bBatch02CandidateRaw,
} from "./inspect-knowledge-poi-baseline-p1b-batch02-evidence.mjs";
import {
  classifyKnowledgePoiReviewEvidence,
} from "./lib/knowledge-poi-review-policy-p1b.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

export const POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch02-selection.json";
export const POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch02.wikidata.json";
export const POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256 = "91e4297e07fa836dfc2c070f1105ee652a4024f665758bc36e416997889d7908";
export const POI_BASELINE_P1B_BATCH02_SELECTION_SHA256 = "6e0918b3f84ece5770d74d9d4b7c3e9d26644e330fb6628f99c598b0ad956753";
export const POI_BASELINE_P1B_BATCH02_SELECTION_POLICY_VERSION = "p1b-batch02-poi-selection-v1";
export const POI_BASELINE_P1B_BATCH02_SELECTION_RULE = "three-primary-backup-optional";
export const POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS = Object.freeze({
  pois: "data/knowledge/batches/pois.p1b-batch02.json",
  provenance: "data/knowledge/batches/provenance.pois.p1b-batch02.json",
  conflicts: "data/knowledge/batches/conflicts.p1b-batch02.json",
  reviewQueue: "data/knowledge/batches/review-queue.p1b-batch02.json",
});

const COUNTRY_ASSET_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/countries.p1a-batch03.json",
]);
const CITY_ASSET_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
  "data/knowledge/batches/cities.p1b-batch02.json",
]);
const PRIOR_POI_ASSET_PATHS = Object.freeze([
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
]);
const BLOCKING_TYPE_QIDS = Object.freeze([
  "Q6256", "Q515", "Q486972", "Q56061", "Q1907114", "Q82794", "Q149621",
  "Q473972", "Q179049", "Q8502", "Q23442", "Q23397",
]);
const GENERIC_MULTIPLE_TYPE_REVIEW = "multiple-wikidata-poi-types";
const MANUAL_POLICY_REVIEW = "poi-p31-policy-manual-review";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function stableUnique(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

function claimQids(entity, property) {
  return stableUnique((entity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value) => /^Q\d+$/u.test(String(value))));
}

function combineUniqueIssues(issues, idField) {
  const byId = new Map();
  for (const issue of issues) {
    if (issue?.[idField]) byId.set(issue[idField], clone(issue));
  }
  return [...byId.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

function assertFrozenInputs({ candidateRawText, candidateRaw, selectionText, selection }) {
  if (sha256(candidateRawText) !== POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256) throw new Error("candidate-raw-hash-invalid");
  if (sha256(selectionText) !== POI_BASELINE_P1B_BATCH02_SELECTION_SHA256) throw new Error("selection-hash-invalid");
  const gate = validateKnowledgePoiBaselineP1bBatch02CandidateRaw(candidateRaw);
  if (gate.status !== "PASS" || gate.passCount !== 30) throw new Error(`candidate-raw-gate-invalid:${JSON.stringify(gate)}`);
  if (selection?.policyVersion !== POI_BASELINE_P1B_BATCH02_SELECTION_POLICY_VERSION) throw new Error("selection-policy-invalid");
  if (selection?.selectionRule !== POI_BASELINE_P1B_BATCH02_SELECTION_RULE) throw new Error("selection-rule-invalid");
  if (selection?.createdFromRawHashes?.base !== POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256) throw new Error("selection-source-hash-invalid");
  if (selection?.primaryCount !== 30 || selection?.primaryWikidataIds?.length !== 30) throw new Error("selection-primary-count-invalid");
  if (selection?.backupCount !== 0 || selection?.backupWikidataIds?.length !== 0) throw new Error("selection-backup-count-invalid");
  if (selection?.cities?.length !== 10 || selection.cities.some((city) => city.primaryWikidataIds?.length !== 3)) {
    throw new Error("selection-city-quota-invalid");
  }
  const expectedQids = POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => candidate.wikidataId);
  if (JSON.stringify(selection.primaryWikidataIds) !== JSON.stringify(expectedQids)) throw new Error("selection-qid-order-invalid");
  if (new Set(selection.primaryWikidataIds).size !== 30) throw new Error("selection-qid-duplicate");
  for (const city of selection.cities) {
    const expected = POI_BASELINE_P1B_BATCH02_CANDIDATES
      .filter((candidate) => candidate.cityQid === city.cityQid)
      .map((candidate) => candidate.wikidataId);
    if (JSON.stringify(city.primaryWikidataIds) !== JSON.stringify(expected)) throw new Error(`selection-city-qids-invalid:${city.cityQid}`);
  }
  return gate;
}

export function buildKnowledgePoiBaselineP1bBatch02Raw({ candidateRawText, candidateRaw, selectionText, selection }) {
  const gate = assertFrozenInputs({ candidateRawText, candidateRaw, selectionText, selection });
  return {
    schemaVersion: "route-v2-poi-baseline-p1b-batch02-raw",
    retrievedAt: candidateRaw.retrievedAt,
    source: {
      provider: "frozen-p1b-batch02-selection",
      candidateRawPath: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
      candidateRawSha256: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256,
      selectionPath: POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH,
      selectionSha256: POI_BASELINE_P1B_BATCH02_SELECTION_SHA256,
      selectionPolicyVersion: POI_BASELINE_P1B_BATCH02_SELECTION_POLICY_VERSION,
      selectionRule: POI_BASELINE_P1B_BATCH02_SELECTION_RULE,
      primaryCount: selection.primaryCount,
      backupCount: selection.backupCount,
      candidateGate: {
        status: gate.status,
        candidateCount: gate.candidateCount,
        passCount: gate.passCount,
        blockingCount: gate.blockingCount,
      },
    },
    records: POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate, index) => ({
      selectionIndex: index + 1,
      selectionStatus: "primary",
      ...candidate,
      p17: claimQids(candidateRaw.wikidata.entities[candidate.wikidataId], "P17"),
      p31: claimQids(candidateRaw.wikidata.entities[candidate.wikidataId], "P31"),
      parentEvidence: clone(candidateRaw.parentEvidence[candidate.wikidataId]),
    })),
    parentEvidence: clone(candidateRaw.parentEvidence),
    wikidata: clone(candidateRaw.wikidata),
  };
}

function reviewPolicyEvidence(formalRaw) {
  const keys = formalRaw.records.map((record) => record.p31.join("|"));
  return {
    knownPoiTypeQids: stableUnique(formalRaw.records.flatMap((record) => record.p31)),
    blockingTypeQids: BLOCKING_TYPE_QIDS,
    informationalExactKeys: stableUnique(keys.filter((key) => key && !key.includes("|"))),
    manualExactKeys: stableUnique(keys.filter((key) => key.includes("|"))),
  };
}

function createPolicyReview(poi, record, classifier) {
  const relatedEntityIds = [poi.entityId, poi.parentCityEntityId].sort();
  const details = {
    wikidataId: poi.wikidataId,
    sourceP31Qids: classifier.sourceP31Qids,
    matchedRuleId: classifier.matchedRuleId,
    policyVersion: classifier.policyVersion,
    selectionPolicyVersion: POI_BASELINE_P1B_BATCH02_SELECTION_POLICY_VERSION,
  };
  return {
    reviewId: createEntityLayerIssueId({ prefix: "review", type: MANUAL_POLICY_REVIEW, relatedEntityIds, details }),
    type: MANUAL_POLICY_REVIEW,
    severity: "manual-review",
    relatedEntityIds,
    field: "wikidataInstanceOf",
    message: "The complete numeric Wikidata P31 key is retained for manual POI review under the frozen P1B policy.",
    wikidataId: poi.wikidataId,
    sourceP31Qids: classifier.sourceP31Qids,
    classifier,
    selection: {
      selectionIndex: record.selectionIndex,
      policyVersion: POI_BASELINE_P1B_BATCH02_SELECTION_POLICY_VERSION,
      sourceRawPath: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
    },
  };
}

function createOverlapConflict(type, poi, prior) {
  const relatedEntityIds = [poi.entityId, prior.entityId].sort();
  const details = { wikidataId: poi.wikidataId, priorEntityId: prior.entityId };
  return {
    conflictId: createEntityLayerIssueId({ prefix: "conflict", type, relatedEntityIds, details }),
    type,
    severity: "blocking",
    relatedEntityIds,
    details,
  };
}

export function buildKnowledgePoiBaselineP1bBatch02Assets({
  formalRaw,
  countries,
  cities,
  priorPois,
  cumulativeConflictsAsset,
  cumulativeReviewQueueAsset,
}) {
  const normalized = normalizeKnowledgePoiBaseline({
    rawSnapshot: formalRaw,
    poiSeeds: POI_BASELINE_P1B_BATCH02_CANDIDATES.map((candidate) => ({
      ...candidate,
      expectedCityWikidataId: candidate.cityQid,
      expectedCountryWikidataId: candidate.countryQid,
    })),
    cities,
  });
  const deduped = dedupeKnowledgePoiEntities(normalized.pois, { countries, cities });
  const priorByEntityId = new Map(priorPois.map((poi) => [poi.entityId, poi]));
  const priorByQid = new Map(priorPois.map((poi) => [poi.wikidataId, poi]));
  const overlapConflicts = normalized.pois.flatMap((poi) => [
    priorByEntityId.has(poi.entityId) ? createOverlapConflict("prior-batch-poi-entity-id-overlap", poi, priorByEntityId.get(poi.entityId)) : null,
    priorByQid.has(poi.wikidataId) ? createOverlapConflict("prior-batch-poi-qid-overlap", poi, priorByQid.get(poi.wikidataId)) : null,
  ].filter(Boolean));
  const policyEvidence = reviewPolicyEvidence(formalRaw);
  const recordByQid = new Map(formalRaw.records.map((record) => [record.wikidataId, record]));
  const classifiers = normalized.pois.map((poi) => {
    const record = recordByQid.get(poi.wikidataId);
    return classifyKnowledgePoiReviewEvidence({
      wikidataId: poi.wikidataId,
      parentCityEntityId: poi.parentCityEntityId,
      sourceP31Qids: record.p31,
      policyEvidence,
      parentEvidenceLevel: record.parentEvidence.administrativePath
        ? "administrative-path"
        : (record.parentEvidence.directLocation ? "direct-location" : "description-city-match"),
    });
  });
  const blockingClassifiers = classifiers.filter((classifier) => classifier.disposition === "blocking");
  const classifierConflicts = blockingClassifiers.map((classifier) => {
    const poi = normalized.pois.find((value) => value.wikidataId === classifier.wikidataId);
    const relatedEntityIds = [poi?.entityId, classifier.parentCityEntityId].filter(Boolean).sort();
    const details = { classifier };
    return {
      conflictId: createEntityLayerIssueId({ prefix: "conflict", type: "poi-p31-policy-blocking", relatedEntityIds, details }),
      type: "poi-p31-policy-blocking",
      severity: "blocking",
      relatedEntityIds,
      details,
    };
  });
  const policyReviews = classifiers
    .filter((classifier) => classifier.disposition === "manual-review")
    .map((classifier) => {
      const poi = normalized.pois.find((value) => value.wikidataId === classifier.wikidataId);
      return createPolicyReview(poi, recordByQid.get(classifier.wikidataId), classifier);
    });
  const conflicts = combineUniqueIssues([
    ...(cumulativeConflictsAsset?.conflicts || []),
    ...normalized.conflicts,
    ...deduped.conflicts,
    ...overlapConflicts,
    ...classifierConflicts,
  ], "conflictId");
  const reviewQueue = combineUniqueIssues([
    ...(cumulativeReviewQueueAsset?.reviewQueue || []),
    ...normalized.reviewQueue.filter((review) => review.type !== GENERIC_MULTIPLE_TYPE_REVIEW),
    ...deduped.reviewQueue,
    ...policyReviews,
  ], "reviewId");
  const provenance = Object.fromEntries(normalized.pois.map((poi) => [poi.entityId, {
    ...poi.provenance,
    selection: {
      policyVersion: POI_BASELINE_P1B_BATCH02_SELECTION_POLICY_VERSION,
      sourceRawPath: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH,
      sourceRawSha256: POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_SHA256,
      selectionPath: POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH,
      selectionSha256: POI_BASELINE_P1B_BATCH02_SELECTION_SHA256,
      disposition: classifiers.find((classifier) => classifier.wikidataId === poi.wikidataId)?.disposition,
    },
  }]));

  return {
    classifiers,
    poisAsset: {
      schemaVersion: "route-v2-poi-baseline-p1b-batch02",
      generatedFrom: POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
      poiCount: normalized.pois.length,
      pois: normalized.pois,
    },
    provenanceAsset: {
      schemaVersion: "route-v2-poi-baseline-provenance-p1b-batch02",
      generatedFrom: POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
      poiCount: normalized.pois.length,
      provenance,
    },
    conflictsAsset: {
      schemaVersion: "route-v2-entity-layer-conflicts-p1b-batch02",
      blockingCount: conflicts.filter((conflict) => conflict.severity === "blocking").length,
      conflictCount: conflicts.length,
      conflicts,
    },
    reviewQueueAsset: {
      schemaVersion: "route-v2-entity-layer-review-p1b-batch02",
      reviewCount: reviewQueue.length,
      reviewQueue,
    },
  };
}

export function serializeKnowledgePoiBaselineP1bBatch02({ formalRaw, assets }) {
  return {
    raw: serializeJson(formalRaw),
    pois: serializeJson(assets.poisAsset),
    provenance: serializeJson(assets.provenanceAsset),
    conflicts: serializeJson(assets.conflictsAsset),
    reviewQueue: serializeJson(assets.reviewQueueAsset),
  };
}

async function readJsonText(relativePath) {
  const text = await readFile(path.resolve(REPOSITORY_ROOT, relativePath), "utf8");
  return { text, value: JSON.parse(text) };
}

export async function loadKnowledgePoiBaselineP1bBatch02Inputs() {
  const candidate = await readJsonText(POI_BASELINE_P1B_BATCH02_CANDIDATE_RAW_RELATIVE_PATH);
  const selection = await readJsonText(POI_BASELINE_P1B_BATCH02_SELECTION_RELATIVE_PATH);
  const countries = (await Promise.all(COUNTRY_ASSET_PATHS.map(async (relativePath) => (await readJsonText(relativePath)).value.countries || []))).flat();
  const cities = (await Promise.all(CITY_ASSET_PATHS.map(async (relativePath) => (await readJsonText(relativePath)).value.cities || []))).flat();
  const priorPois = (await Promise.all(PRIOR_POI_ASSET_PATHS.map(async (relativePath) => (await readJsonText(relativePath)).value.pois || []))).flat();
  const cumulativeConflictsAsset = (await readJsonText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.conflicts)).value;
  const cumulativeReviewQueueAsset = (await readJsonText(POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.reviewQueue)).value;
  return {
    candidateRawText: candidate.text,
    candidateRaw: candidate.value,
    selectionText: selection.text,
    selection: selection.value,
    countries,
    cities,
    priorPois,
    cumulativeConflictsAsset,
    cumulativeReviewQueueAsset,
  };
}

async function writeTextAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function publishSerialized(serialized) {
  const paths = { raw: POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH, ...POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS };
  for (const [key, relativePath] of Object.entries(paths)) {
    await writeTextAtomic(path.resolve(REPOSITORY_ROOT, relativePath), serialized[key]);
  }
}

async function main() {
  if (process.argv.length > 2) throw new Error(`unsupported-arguments:${process.argv.slice(2).join(",")}`);
  const inputs = await loadKnowledgePoiBaselineP1bBatch02Inputs();
  const formalRaw = buildKnowledgePoiBaselineP1bBatch02Raw(inputs);
  const assets = buildKnowledgePoiBaselineP1bBatch02Assets({ formalRaw, ...inputs });
  const validation = validateKnowledgePoiEntitySet(assets.poisAsset.pois);
  if (!validation.accepted) throw new Error(`poi-schema-validation-failed:${validation.reasons.join("|")}`);
  if (assets.poisAsset.poiCount !== 30) throw new Error(`poi-count-invalid:${assets.poisAsset.poiCount}`);
  if (assets.conflictsAsset.blockingCount !== 0 || assets.conflictsAsset.conflictCount !== 0) {
    throw new Error(`poi-conflicts-present:${JSON.stringify(assets.conflictsAsset.conflicts)}`);
  }
  if (assets.classifiers.some((classifier) => classifier.disposition === "blocking")) throw new Error("poi-classifier-blocking");
  await publishSerialized(serializeKnowledgePoiBaselineP1bBatch02({ formalRaw, assets }));
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: "offline-publish",
    calledWikidata: false,
    poiCount: assets.poisAsset.poiCount,
    classifierCounts: Object.fromEntries(["informational", "manual-review", "blocking"].map((disposition) => [
      disposition,
      assets.classifiers.filter((classifier) => classifier.disposition === disposition).length,
    ])),
    conflictCount: assets.conflictsAsset.conflictCount,
    cumulativeReviewCount: assets.reviewQueueAsset.reviewCount,
    outputs: { raw: POI_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH, ...POI_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS },
  }, null, 2)}\n`);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
