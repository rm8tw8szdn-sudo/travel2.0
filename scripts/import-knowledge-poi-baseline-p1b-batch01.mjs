import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  canonicalizeEntityLayerAliases,
  createEntityLayerIssueId,
  createEntityLayerProvenanceEntry,
  dedupeKnowledgePoiEntities,
  normalizeKnowledgePoiBaseline,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
} from "./import-knowledge-city-baseline-p1b-batch01.mjs";
import {
  KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION,
  classifyKnowledgePoiReviewEvidence,
} from "./lib/knowledge-poi-review-policy-p1b.mjs";
import {
  normalizeKnowledgeBaselineText,
  sha256KnowledgeBaselineText,
} from "./lib/knowledge-baseline-text.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

export const POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01-selection.json";
export const POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH = "data/knowledge/raw/pois-p1b-batch01.wikidata.json";
export const POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS = Object.freeze({
  pois: "data/knowledge/batches/pois.p1b-batch01.json",
  provenance: "data/knowledge/batches/provenance.pois.p1b-batch01.json",
  conflicts: "data/knowledge/batches/conflicts.p1b-batch01.json",
  reviewQueue: "data/knowledge/batches/review-queue.p1b-batch01.json",
});
export const POI_BASELINE_P1B_BATCH01_SOURCE_RAWS = Object.freeze({
  base: Object.freeze({
    relativePath: "data/knowledge/raw/pois-p1b-batch01-candidates.wikidata.json",
    sha256: "fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d",
  }),
  supplement01: Object.freeze({
    relativePath: "data/knowledge/raw/pois-p1b-batch01-candidates-supplement01.wikidata.json",
    sha256: "6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd",
  }),
  supplement02: Object.freeze({
    relativePath: "data/knowledge/raw/pois-p1b-batch01-candidates-supplement02.wikidata.json",
    sha256: "57cb63ea4678380ef70ab522057207a9582bce28a80de8327d79419683c3480e",
  }),
  supplement03: Object.freeze({
    relativePath: "data/knowledge/raw/pois-p1b-batch01-candidates-supplement03.wikidata.json",
    sha256: "ad3915efdcc09bcd09f245ee9200b02eca6d65d532b7f85a493b1b6d7049e9af",
  }),
});
export const POI_BASELINE_P1B_BATCH01_SELECTION_SHA256 = "40d7e91bddf065664a092153183c6a0a7cc9060397da3b40d0aa06af0ed3f118";
export const POI_BASELINE_P1B_BATCH01_SELECTION_POLICY_VERSION = "p1b-batch01-poi-selection-v1";
export const POI_BASELINE_P1B_BATCH01_SELECTION_RULE = "three-primary-backup-optional";

const PILOT_CITY_RELATIVE_PATH = "data/knowledge/cities.p1b-pilot.json";
const BATCH_CITY_RELATIVE_PATH = "data/knowledge/batches/cities.p1b-batch01.json";
const PILOT_POI_RELATIVE_PATH = "data/knowledge/pois.p1b-pilot.json";
const CITY_CONFLICTS_RELATIVE_PATH = "data/knowledge/batches/conflicts.p1b-batch01.json";
const CITY_REVIEWS_RELATIVE_PATH = "data/knowledge/batches/review-queue.p1b-batch01.json";
const GENERIC_NORMALIZER_REVIEW_TYPE = "multiple-wikidata-poi-types";

const CURATED_CHINESE_NAMES = Object.freeze({
  Q3329100: "博特罗博物馆",
  Q2377645: "安蒂奥基亚博物馆",
  Q1050597: "麦德林都主教座堂",
  Q7975612: "瓦维尔皇家城堡",
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stableUnique(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

function normalizedCandidateName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function candidateKeyFromRaw(candidate) {
  if (candidate?.candidateKey) return candidate.candidateKey;
  const cityQid = candidate?.input?.cityQid;
  const slug = normalizedCandidateName(candidate?.input?.name).replace(/\s+/gu, "-");
  return `${cityQid}::${slug}`;
}

function combineUniqueIssues(issues, idField) {
  const byId = new Map();
  for (const issue of issues) {
    if (issue?.[idField]) byId.set(issue[idField], clone(issue));
  }
  return [...byId.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

function stablePoiSort(pois) {
  return [...pois].sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

function sourceRawHashObject() {
  return Object.fromEntries(Object.entries(POI_BASELINE_P1B_BATCH01_SOURCE_RAWS)
    .map(([round, value]) => [round, value.sha256]));
}

function assertFrozenSelection(selection) {
  if (selection?.policyVersion !== POI_BASELINE_P1B_BATCH01_SELECTION_POLICY_VERSION) {
    throw new Error(`selection-policy-version-invalid:${selection?.policyVersion}`);
  }
  if (selection?.selectionRule !== POI_BASELINE_P1B_BATCH01_SELECTION_RULE) {
    throw new Error(`selection-rule-invalid:${selection?.selectionRule}`);
  }
  if (selection?.primaryCount !== 30 || selection?.primaryCandidates?.length !== 30) {
    throw new Error("selection-primary-count-invalid");
  }
  if (selection?.backupCount !== 8 || selection?.backupCandidates?.length !== 8) {
    throw new Error("selection-backup-count-invalid");
  }
  if (selection?.cities?.length !== 10 || selection.cities.some((city) => city.primaryCandidateKeys?.length !== 3)) {
    throw new Error("selection-city-quota-invalid");
  }
  const expectedHashes = sourceRawHashObject();
  if (JSON.stringify(selection.createdFromRawHashes) !== JSON.stringify(expectedHashes)) {
    throw new Error("selection-source-hashes-invalid");
  }
}

export function buildKnowledgePoiBaselineP1bBatch01Raw({ selection, sourceRaws }) {
  assertFrozenSelection(selection);
  const primaryQids = new Set();
  const records = selection.primaryCandidates.map((selected, selectionIndex) => {
    const source = sourceRaws[selected.sourceRound];
    if (!source) throw new Error(`selection-source-round-missing:${selected.sourceRound}`);
    if (source.sha256 !== POI_BASELINE_P1B_BATCH01_SOURCE_RAWS[selected.sourceRound].sha256) {
      throw new Error(`source-raw-hash-invalid:${selected.sourceRound}:${source.sha256}`);
    }
    if (selected.rawReference?.rawPath !== POI_BASELINE_P1B_BATCH01_SOURCE_RAWS[selected.sourceRound].relativePath) {
      throw new Error(`selection-source-path-invalid:${selected.candidateKey}`);
    }
    const sourceIndex = Number(selected.rawReference?.candidateIndex) - 1;
    const sourceCandidate = source.raw?.candidates?.[sourceIndex];
    if (!sourceCandidate || candidateKeyFromRaw(sourceCandidate) !== selected.candidateKey) {
      throw new Error(`selection-raw-reference-invalid:${selected.candidateKey}`);
    }
    if (!["pass", "conditional-manual"].includes(selected.status) || selected.status !== sourceCandidate.status) {
      throw new Error(`selection-status-invalid:${selected.candidateKey}:${selected.status}:${sourceCandidate.status}`);
    }
    if (selected.selectedQid !== sourceCandidate.selectedQid) {
      throw new Error(`selection-selected-qid-invalid:${selected.candidateKey}`);
    }
    if (primaryQids.has(selected.selectedQid)) throw new Error(`selection-primary-qid-duplicate:${selected.selectedQid}`);
    primaryQids.add(selected.selectedQid);
    const entity = (sourceCandidate.candidateEntities || []).find((value) => value.qid === selected.selectedQid);
    if (!entity?.apiEntity) throw new Error(`selection-api-entity-missing:${selected.candidateKey}`);
    if (!entity.countryEvidence?.accepted || !entity.parentEvidence?.accepted || !entity.coordinateEvidence?.accepted) {
      throw new Error(`selection-gate-evidence-invalid:${selected.candidateKey}`);
    }
    const p31Key = stableUnique(entity.p31Evidence?.sortedTypeQids || []).join("|");
    if (!p31Key || p31Key !== selected.P31Key) throw new Error(`selection-p31-key-invalid:${selected.candidateKey}`);
    return {
      selectionIndex: selectionIndex + 1,
      candidateKey: selected.candidateKey,
      candidateName: selected.candidateName,
      selectedQid: selected.selectedQid,
      approvedCityQid: selected.cityQid,
      status: selected.status,
      sourceRound: selected.sourceRound,
      sourceRawPath: selected.rawReference.rawPath,
      sourceRawIndex: selected.rawReference.candidateIndex,
      sourceRawRetrievedAt: source.raw.retrievedAt,
      selectionPolicyVersion: selection.policyVersion,
      selectionRule: selection.selectionRule,
      parentEvidenceLevel: selected.parentEvidenceLevel,
      identityRisk: selected.identityRisk,
      selectionRationale: selected.selectionRationale,
      canonicalNameOverrides: {
        canonicalNameEn: selected.candidateName,
        canonicalNameZh: CURATED_CHINESE_NAMES[selected.selectedQid] || null,
        canonicalNameZhReason: CURATED_CHINESE_NAMES[selected.selectedQid]
          ? "missing-zh-label-curated-under-project-schema"
          : null,
      },
      apiEntity: clone(entity.apiEntity),
      sparqlTruthyEvidence: {
        P17: clone(entity.countryEvidence.sourceProjection?.sparqlTruthyClaims || []),
        P31: clone(entity.p31Evidence.sourceProjection?.sparqlTruthyClaims || []),
        P131: clone(entity.parentEvidence.p131?.sparqlTruthyClaims || []),
        P276: clone(entity.parentEvidence.p276?.sparqlTruthyClaims || []),
        P625: clone(entity.coordinateEvidence.sparqlTruthyClaims || []),
      },
      countryEvidence: clone(entity.countryEvidence),
      parentEvidence: clone(entity.parentEvidence),
      coordinateEvidence: clone(entity.coordinateEvidence),
      p31Evidence: clone(entity.p31Evidence),
      identityEvidence: clone(entity.identityEvidence),
    };
  });
  const backupQids = new Set(selection.backupCandidates.map((candidate) => candidate.selectedQid));
  if (records.some((record) => backupQids.has(record.selectedQid))) throw new Error("backup-entered-formal-raw");
  const cityCounts = Object.fromEntries(selection.cities.map((city) => [
    city.cityQid,
    records.filter((record) => record.approvedCityQid === city.cityQid).length,
  ]));
  if (Object.values(cityCounts).some((count) => count !== 3)) throw new Error("formal-raw-city-count-invalid");
  const sourceRetrievedAtValues = stableUnique(records.map((record) => record.sourceRawRetrievedAt));
  return {
    schemaVersion: "route-v2-poi-baseline-p1b-batch01-raw",
    builtFromEvidenceRetrievedAt: [...sourceRetrievedAtValues].sort().at(-1),
    source: {
      mode: "offline-frozen-evidence",
      calledWikidata: false,
      selectionPath: POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH,
      selectionSha256: POI_BASELINE_P1B_BATCH01_SELECTION_SHA256,
      selectionPolicyVersion: selection.policyVersion,
      selectionRule: selection.selectionRule,
      sourceRawHashes: sourceRawHashObject(),
    },
    recordCount: records.length,
    primaryCount: records.length,
    backupRecordCount: 0,
    cityCount: Object.keys(cityCounts).length,
    cityPrimaryCounts: cityCounts,
    records,
  };
}

function projectSchemaProvenance({ field, source, retrievedAt, value }) {
  return createEntityLayerProvenanceEntry({
    field,
    sourceType: "project-schema",
    source,
    retrievedAt,
    value,
  });
}

export function normalizeKnowledgePoiBaselineP1bBatch01Record(record, city) {
  const normalizationEntity = clone(record.apiEntity);
  const rawCanonicalNameEn = normalizationEntity?.labels?.en?.value;
  if (!rawCanonicalNameEn) throw new Error(`formal-raw-en-label-missing:${record.candidateKey}`);
  const rawCanonicalNameZh = normalizationEntity?.labels?.["zh-hans"]?.value
    || normalizationEntity?.labels?.zh?.value
    || "";
  if (!rawCanonicalNameZh) {
    const curatedName = record.canonicalNameOverrides?.canonicalNameZh;
    if (!curatedName) throw new Error(`formal-raw-zh-label-missing:${record.candidateKey}`);
    normalizationEntity.labels ||= {};
    normalizationEntity.labels["zh-hans"] = { language: "zh-hans", value: curatedName };
  }
  const rawSnapshot = {
    retrievedAt: record.sourceRawRetrievedAt,
    wikidata: { entities: { [record.selectedQid]: normalizationEntity } },
    parentEvidence: {
      [record.selectedQid]: {
        wikidataId: record.selectedQid,
        expectedCityWikidataId: record.approvedCityQid,
        expectedCountryWikidataId: record.countryEvidence.expectedCountryQid,
        administrativePath: record.parentEvidence.accepted === true,
        directLocation: record.parentEvidence.directP131ToCity === true || record.parentEvidence.directP276ToCity === true,
        descriptionCityMatch: false,
        countryMatch: record.countryEvidence.accepted === true,
      },
    },
  };
  const normalized = normalizeKnowledgePoiBaseline({
    rawSnapshot,
    poiSeeds: [{
      wikidataId: record.selectedQid,
      expectedNameEn: rawCanonicalNameEn,
      parentCityEntityId: city.entityId,
      expectedCityWikidataId: record.approvedCityQid,
      expectedCountryWikidataId: record.countryEvidence.expectedCountryQid,
    }],
    cities: [city],
  });
  if (normalized.conflicts.length > 0 || normalized.pois.length !== 1) {
    throw new Error(`batch01-poi-normalization-blocked:${record.candidateKey}:${JSON.stringify(normalized.conflicts)}`);
  }
  const poi = clone(normalized.pois[0]);
  const oldCanonicalNameEn = poi.canonicalNameEn;
  const oldCanonicalNameZh = poi.canonicalNameZh;
  poi.canonicalNameEn = record.canonicalNameOverrides.canonicalNameEn;
  if (record.canonicalNameOverrides.canonicalNameZh) poi.canonicalNameZh = record.canonicalNameOverrides.canonicalNameZh;
  poi.aliases = canonicalizeEntityLayerAliases(
    [...poi.aliases, oldCanonicalNameEn, oldCanonicalNameZh],
    [poi.canonicalNameZh, poi.canonicalNameEn],
  );
  if (poi.canonicalNameEn !== oldCanonicalNameEn) {
    poi.provenance.canonicalNameEn = projectSchemaProvenance({
      field: "canonicalNameEn",
      source: "Route V2 P1B Batch01 frozen POI selection",
      retrievedAt: record.sourceRawRetrievedAt,
      value: poi.canonicalNameEn,
    });
  }
  if (record.canonicalNameOverrides.canonicalNameZh) {
    poi.provenance.canonicalNameZh = projectSchemaProvenance({
      field: "canonicalNameZh",
      source: "Route V2 P1B Batch01 curated Chinese name map",
      retrievedAt: record.sourceRawRetrievedAt,
      value: poi.canonicalNameZh,
    });
  }
  if (poi.canonicalNameEn !== oldCanonicalNameEn || poi.canonicalNameZh !== oldCanonicalNameZh) {
    poi.provenance.aliases = projectSchemaProvenance({
      field: "aliases",
      source: "Route V2 P1B Batch01 frozen-name alias normalization",
      retrievedAt: record.sourceRawRetrievedAt,
      value: poi.aliases,
    });
  }
  return {
    poi,
    reviews: normalized.reviewQueue.filter((review) => review.type !== GENERIC_NORMALIZER_REVIEW_TYPE),
  };
}

export function createKnowledgePoiReviewPolicyP1bReview(poi, record, classifier) {
  const relatedEntityIds = [poi.entityId, poi.parentCityEntityId].sort();
  const details = {
    wikidataId: poi.wikidataId,
    candidateKey: record.candidateKey,
    p31Key: classifier.sourceP31Qids.join("|"),
    policyVersion: classifier.policyVersion,
    matchedRuleId: classifier.matchedRuleId,
  };
  return {
    reviewId: createEntityLayerIssueId({
      prefix: "review",
      type: "poi-p31-policy-manual-review",
      relatedEntityIds,
      details,
    }),
    type: "poi-p31-policy-manual-review",
    severity: "manual-review",
    relatedEntityIds,
    field: "wikidataInstanceOf",
    message: classifier.rationale,
    wikidataId: poi.wikidataId,
    parentCityEntityId: poi.parentCityEntityId,
    sourceP31Qids: classifier.sourceP31Qids,
    p31Key: classifier.sourceP31Qids.join("|"),
    classification: classifier.classification,
    disposition: classifier.disposition,
    policyVersion: classifier.policyVersion,
    matchedRuleId: classifier.matchedRuleId,
    rationale: classifier.rationale,
    unknownP31Qids: classifier.unknownP31Qids,
    evidenceTrace: {
      candidateKey: record.candidateKey,
      sourceRound: record.sourceRound,
      sourceRawPath: record.sourceRawPath,
      sourceRawIndex: record.sourceRawIndex,
      selectionPolicyVersion: record.selectionPolicyVersion,
    },
  };
}

function classifierConflict(poi, record, classifier) {
  const relatedEntityIds = [poi.entityId, poi.parentCityEntityId].sort();
  const details = {
    wikidataId: poi.wikidataId,
    candidateKey: record.candidateKey,
    sourceP31Qids: classifier.sourceP31Qids,
    matchedRuleId: classifier.matchedRuleId,
    rationale: classifier.rationale,
  };
  return {
    conflictId: createEntityLayerIssueId({
      prefix: "conflict",
      type: "poi-review-policy-blocking",
      relatedEntityIds,
      details,
    }),
    type: "poi-review-policy-blocking",
    severity: "blocking",
    relatedEntityIds,
    details,
  };
}

export function buildKnowledgePoiBaselineP1bBatch01Assets({
  formalRaw,
  selection,
  countries,
  pilotCities,
  batchCities,
  pilotPois,
  cityConflictsAsset,
  cityReviewQueueAsset,
}) {
  assertFrozenSelection(selection);
  if (formalRaw.recordCount !== 30 || formalRaw.backupRecordCount !== 0) throw new Error("formal-raw-scope-invalid");
  const allCities = [...pilotCities, ...batchCities];
  const cityByQid = new Map(batchCities.map((city) => [city.wikidataId, city]));
  const recordByQid = new Map(formalRaw.records.map((record) => [record.selectedQid, record]));
  const normalizationReviews = [];
  const normalizedPois = formalRaw.records.map((record) => {
    const city = cityByQid.get(record.approvedCityQid);
    if (!city) throw new Error(`approved-batch-city-missing:${record.candidateKey}`);
    const result = normalizeKnowledgePoiBaselineP1bBatch01Record(record, city);
    normalizationReviews.push(...result.reviews);
    return result.poi;
  });
  const deduped = dedupeKnowledgePoiEntities(normalizedPois, { countries, cities: allCities });
  const pois = stablePoiSort(deduped.pois);
  const batchQidCounts = new Map();
  for (const poi of pois) batchQidCounts.set(poi.wikidataId, (batchQidCounts.get(poi.wikidataId) || 0) + 1);
  const pilotPoiQids = new Set(pilotPois.map((poi) => poi.wikidataId));
  const countryQids = new Set(countries.map((country) => country.wikidataId));
  const cityQids = new Set(allCities.map((city) => city.wikidataId));
  const backupQids = new Set(selection.backupCandidates.map((candidate) => candidate.selectedQid));
  const classifiers = [];
  const classifierReviews = [];
  const classifierConflicts = [];
  for (const poi of pois) {
    const record = recordByQid.get(poi.wikidataId);
    const expectedCity = record ? cityByQid.get(record.approvedCityQid) : null;
    const overlapKinds = [
      ...(pilotPoiQids.has(poi.wikidataId) ? ["pilot-poi-qid-overlap"] : []),
      ...((batchQidCounts.get(poi.wikidataId) || 0) > 1 ? ["batch-poi-qid-overlap"] : []),
      ...(countryQids.has(poi.wikidataId) ? ["country-qid-overlap"] : []),
      ...(cityQids.has(poi.wikidataId) ? ["city-qid-overlap"] : []),
    ];
    const identityValidationReasons = [
      ...(!record ? ["selection-record-missing"] : []),
      ...(record && record.selectedQid !== poi.wikidataId ? ["selection-qid-mismatch"] : []),
      ...(record && !["pass", "conditional-manual"].includes(record.status) ? ["selection-status-ineligible"] : []),
    ];
    const parentValidationReasons = [
      ...(!expectedCity ? ["orphan-parent-city"] : []),
      ...(expectedCity && poi.parentCityEntityId !== expectedCity.entityId ? ["wrong-parent-city"] : []),
    ];
    const classifier = classifyKnowledgePoiReviewEvidence({
      wikidataId: poi.wikidataId,
      parentCityEntityId: poi.parentCityEntityId,
      sourceP31Qids: record?.p31Evidence?.sortedTypeQids || [],
      p31ProjectionDifference: record?.p31Evidence?.sourceProjection?.exactMatch !== true,
      identityRisk: record?.identityRisk || "",
      parentEvidenceLevel: record?.parentEvidenceLevel || "",
      policyEvidence: selection.P31PolicyEvidence,
      identityValidationReasons,
      parentValidationReasons,
      overlapKinds,
      isBackup: backupQids.has(poi.wikidataId),
    });
    classifiers.push({ entityId: poi.entityId, candidateKey: record?.candidateKey || null, ...classifier });
    if (classifier.disposition === "manual-review") classifierReviews.push(createKnowledgePoiReviewPolicyP1bReview(poi, record, classifier));
    if (classifier.disposition === "blocking") classifierConflicts.push(classifierConflict(poi, record, classifier));
  }
  classifiers.sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
  const conflicts = combineUniqueIssues([
    ...(cityConflictsAsset?.conflicts || []),
    ...normalizationReviews.filter((review) => review.severity === "blocking"),
    ...deduped.conflicts,
    ...classifierConflicts,
  ], "conflictId");
  const poiExtraReviews = combineUniqueIssues([
    ...normalizationReviews,
    ...deduped.reviewQueue,
  ], "reviewId");
  const cityReviews = (cityReviewQueueAsset?.reviewQueue || [])
    .filter((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  const reviewQueue = combineUniqueIssues([
    ...cityReviews,
    ...classifierReviews,
    ...poiExtraReviews,
  ], "reviewId");
  const provenance = Object.fromEntries(pois.map((poi) => [poi.entityId, clone(poi.provenance)]));
  const classifierByEntityId = new Map(classifiers.map((classifier) => [classifier.entityId, classifier]));
  const traceability = Object.fromEntries(pois.map((poi) => {
    const record = recordByQid.get(poi.wikidataId);
    const classifier = classifierByEntityId.get(poi.entityId);
    return [poi.entityId, {
      sourceRound: record.sourceRound,
      sourceRawPath: record.sourceRawPath,
      sourceRawIndex: record.sourceRawIndex,
      sourceRawRetrievedAt: record.sourceRawRetrievedAt,
      candidateKey: record.candidateKey,
      selectedQid: record.selectedQid,
      selectionPolicyVersion: record.selectionPolicyVersion,
      classifierPolicyVersion: classifier.policyVersion,
      p31Key: classifier.sourceP31Qids.join("|"),
      classifierDisposition: classifier.disposition,
    }];
  }));
  const cityReviewIds = new Set(cityReviews.map((review) => review.reviewId));
  return {
    poisAsset: {
      schemaVersion: "route-v2-poi-baseline-p1b-batch01",
      generatedFrom: POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
      poiCount: pois.length,
      pois,
    },
    provenanceAsset: {
      schemaVersion: "route-v2-poi-baseline-provenance-p1b-batch01",
      generatedFrom: POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
      poiCount: pois.length,
      provenance,
      traceability,
    },
    conflictsAsset: {
      schemaVersion: "route-v2-entity-layer-conflicts-p1b-batch01",
      blockingCount: conflicts.filter((conflict) => conflict.severity === "blocking").length,
      conflictCount: conflicts.length,
      conflicts,
    },
    reviewQueueAsset: {
      schemaVersion: "route-v2-entity-layer-review-p1b-batch01",
      reviewCount: reviewQueue.length,
      cityReviewCount: reviewQueue.filter((review) => cityReviewIds.has(review.reviewId)).length,
      poiClassifierReviewCount: classifierReviews.length,
      additionalPoiReviewCount: poiExtraReviews.length,
      reviewQueue,
    },
    classifiers,
    filteredGenericNormalizerReviewCount: normalizedPois
      .filter((poi) => (recordByQid.get(poi.wikidataId)?.p31Evidence?.sortedTypeQids || []).length > 1).length,
  };
}

export function serializeKnowledgePoiBaselineP1bBatch01({ formalRaw, assets }) {
  return {
    formalRaw: serializeJson(formalRaw),
    pois: serializeJson(assets.poisAsset),
    provenance: serializeJson(assets.provenanceAsset),
    conflicts: serializeJson(assets.conflictsAsset),
    reviewQueue: serializeJson(assets.reviewQueueAsset),
  };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(REPOSITORY_ROOT, relativePath), "utf8"));
}

export async function loadKnowledgePoiBaselineP1bBatch01Inputs() {
  const selectionContents = await readFile(path.resolve(REPOSITORY_ROOT, POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH), "utf8");
  if (sha256KnowledgeBaselineText(selectionContents) !== POI_BASELINE_P1B_BATCH01_SELECTION_SHA256) throw new Error("selection-sha256-mismatch");
  const sourceRaws = {};
  for (const [round, source] of Object.entries(POI_BASELINE_P1B_BATCH01_SOURCE_RAWS)) {
    const contents = await readFile(path.resolve(REPOSITORY_ROOT, source.relativePath), "utf8");
    const actualHash = sha256KnowledgeBaselineText(contents);
    if (actualHash !== source.sha256) throw new Error(`source-raw-sha256-mismatch:${round}:${actualHash}`);
    sourceRaws[round] = { raw: JSON.parse(contents), sha256: actualHash };
  }
  const countryAssets = await Promise.all(CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS.map(readJson));
  return {
    selection: JSON.parse(selectionContents),
    sourceRaws,
    countries: countryAssets.flatMap((asset) => asset.countries || []),
    pilotCities: (await readJson(PILOT_CITY_RELATIVE_PATH)).cities || [],
    batchCities: (await readJson(BATCH_CITY_RELATIVE_PATH)).cities || [],
    pilotPois: (await readJson(PILOT_POI_RELATIVE_PATH)).pois || [],
    cityConflictsAsset: await readJson(CITY_CONFLICTS_RELATIVE_PATH),
    cityReviewQueueAsset: await readJson(CITY_REVIEWS_RELATIVE_PATH),
  };
}

async function writeTextAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const existingContents = await readFile(filePath, "utf8");
    if (normalizeKnowledgeBaselineText(existingContents) === normalizeKnowledgeBaselineText(contents)) return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function publishSerialized(serialized) {
  const targets = {
    formalRaw: POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
    ...POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
  };
  for (const [key, relativePath] of Object.entries(targets)) {
    await writeTextAtomic(path.resolve(REPOSITORY_ROOT, relativePath), serialized[key]);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) throw new Error(`unsupported-arguments:${args.join(",")}`);
  const inputs = await loadKnowledgePoiBaselineP1bBatch01Inputs();
  const formalRaw = buildKnowledgePoiBaselineP1bBatch01Raw(inputs);
  const assets = buildKnowledgePoiBaselineP1bBatch01Assets({ formalRaw, ...inputs });
  const schemaValidation = validateKnowledgePoiEntitySet(assets.poisAsset.pois);
  if (!schemaValidation.accepted) throw new Error(`poi-schema-validation-failed:${schemaValidation.reasons.join("|")}`);
  if (assets.poisAsset.poiCount !== 30) throw new Error(`poi-count-invalid:${assets.poisAsset.poiCount}`);
  if (assets.classifiers.length !== 30) throw new Error(`classifier-coverage-invalid:${assets.classifiers.length}`);
  if (assets.conflictsAsset.blockingCount !== 0 || assets.conflictsAsset.conflictCount !== 0) {
    throw new Error(`poi-blocking-conflicts-present:${JSON.stringify(assets.conflictsAsset.conflicts)}`);
  }
  const serialized = serializeKnowledgePoiBaselineP1bBatch01({ formalRaw, assets });
  await publishSerialized(serialized);
  const dispositions = Object.fromEntries(["informational", "manual-review", "blocking"].map((disposition) => [
    disposition,
    assets.classifiers.filter((classifier) => classifier.disposition === disposition).length,
  ]));
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: "offline-publish",
    calledWikidata: false,
    policyVersion: KNOWLEDGE_POI_REVIEW_POLICY_P1B_VERSION,
    formalRawCount: formalRaw.recordCount,
    poiCount: assets.poisAsset.poiCount,
    classifierCoverage: assets.classifiers.length,
    dispositions,
    conflictCount: assets.conflictsAsset.conflictCount,
    cityReviewCount: assets.reviewQueueAsset.cityReviewCount,
    poiClassifierReviewCount: assets.reviewQueueAsset.poiClassifierReviewCount,
    additionalPoiReviewCount: assets.reviewQueueAsset.additionalPoiReviewCount,
    cumulativeReviewCount: assets.reviewQueueAsset.reviewCount,
    outputs: {
      raw: POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
      ...POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
    },
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
