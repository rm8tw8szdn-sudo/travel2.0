import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createKnowledgeEntityLayerRepository,
  validateKnowledgeCityEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
  CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
  CITY_BASELINE_P1B_BATCH01_SEEDS,
  buildKnowledgeCityBaselineP1bBatch01Assets,
  validateKnowledgeCityBaselineP1bBatch01RawSnapshot,
} from "./import-knowledge-city-baseline-p1b-batch01.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PILOT_CITY_PATH = "data/knowledge/cities.p1b-pilot.json";
const PILOT_POI_PATH = "data/knowledge/pois.p1b-pilot.json";
const BATCH01_POI_PATHS = Object.freeze([
  "data/knowledge/raw/pois-p1b-batch01.wikidata.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
  "data/knowledge/batches/provenance.pois.p1b-batch01.json",
  "scripts/import-knowledge-poi-baseline-p1b-batch01.mjs",
  "scripts/lib/knowledge-poi-review-policy-p1b.mjs",
]);
const EXPECTED_PARENT_COUNTS = Object.freeze(Object.fromEntries(CITY_BASELINE_P1B_BATCH01_SEEDS
  .reduce((counts, seed) => counts.set(seed.parentCountryEntityId, (counts.get(seed.parentCountryEntityId) || 0) + 1), new Map())));

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function summarizeByType(items = []) {
  return Object.fromEntries(items.reduce((counts, item) => {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
    return counts;
  }, new Map()));
}

function sourceAliases(rawEntity) {
  return Object.entries(rawEntity?.aliases || {}).flatMap(([language, aliases]) => aliases.map((alias) => ({ language, value: alias.value })));
}

function reviewEntityTypeKey(review) {
  return `${review.entityId || review.relatedEntityIds?.[0] || review.wikidataId}:${review.type}`;
}

function evaluateCumulativeCityReviews({ reviewQueue, expectedCityReviews, expectedCityReviewCount }) {
  const cityReviews = reviewQueue.filter((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  const nonCityReviews = reviewQueue.filter((review) => !CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  const cumulativeReviewIdsUnique = new Set(reviewQueue.map((review) => review.reviewId)).size === reviewQueue.length;
  const cityReviewIdsUnique = new Set(cityReviews.map((review) => review.reviewId)).size === cityReviews.length;
  const uniqueCityTypePairs = new Set(cityReviews.map(reviewEntityTypeKey)).size === cityReviews.length;
  const cityReviewsAllowedTypesOnly = cityReviews.every((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  const cityReviewCountMatches = cityReviews.length === expectedCityReviewCount
    && expectedCityReviews.length === expectedCityReviewCount;
  const cityReviewsMatchFrozenBaseline = JSON.stringify(cityReviews) === JSON.stringify(expectedCityReviews);
  const cityReviewIds = new Set(cityReviews.map((review) => review.reviewId));
  const crossLayerReviewIdsDisjoint = nonCityReviews.every((review) => !cityReviewIds.has(review.reviewId));
  return {
    accepted: cumulativeReviewIdsUnique
      && cityReviewIdsUnique
      && uniqueCityTypePairs
      && cityReviewsAllowedTypesOnly
      && cityReviewCountMatches
      && cityReviewsMatchFrozenBaseline
      && crossLayerReviewIdsDisjoint,
    cityReviews,
    nonCityReviews,
    cityReviewTotal: cityReviews.length,
    nonCityReviewTotal: nonCityReviews.length,
    reviewTotal: reviewQueue.length,
    cumulativeReviewIdsUnique,
    cityReviewIdsUnique,
    uniqueCityTypePairs,
    cityReviewsAllowedTypesOnly,
    cityReviewCountMatches,
    cityReviewsMatchFrozenBaseline,
    crossLayerReviewIdsDisjoint,
    nonCityReviewsIgnoredByCityPolicy: true,
  };
}

function evaluateCumulativeCityConflicts({ conflicts, expectedCityConflicts, cityEntityIds, countryEntityIds }) {
  const cumulativeConflictIdsUnique = new Set(conflicts.map((conflict) => conflict.conflictId)).size === conflicts.length;
  const isCityConflict = (conflict) => {
    const relatedEntityIds = conflict.relatedEntityIds || [];
    return relatedEntityIds.some((entityId) => cityEntityIds.has(entityId))
      && relatedEntityIds.every((entityId) => cityEntityIds.has(entityId) || countryEntityIds.has(entityId));
  };
  const cityConflicts = conflicts.filter(isCityConflict);
  const nonCityConflicts = conflicts.filter((conflict) => !isCityConflict(conflict));
  const cityConflictsMatchFrozenBaseline = JSON.stringify(cityConflicts) === JSON.stringify(expectedCityConflicts);
  return {
    accepted: cumulativeConflictIdsUnique && cityConflictsMatchFrozenBaseline,
    cityConflicts,
    nonCityConflicts,
    conflictTotal: conflicts.length,
    cityConflictTotal: cityConflicts.length,
    nonCityConflictTotal: nonCityConflicts.length,
    cumulativeConflictIdsUnique,
    cityConflictsMatchFrozenBaseline,
    nonCityConflictsIgnoredByCityPolicy: true,
  };
}

function observeOptionalPoiFiles({ relativePaths, existsSync }) {
  const presence = relativePaths.map((relativePath) => ({ relativePath, present: existsSync(relativePath) }));
  const presentCount = presence.filter((entry) => entry.present).length;
  return { presence, presentCount, allPresent: presentCount === relativePaths.length };
}

function buildPoiPresenceAuditSummary(observation) {
  return {
    poiFilesPresent: observation.allPresent,
    poiFilePresence: observation.presence,
    poiContentsUsedForCityAudit: false,
    poiPresenceBlocksCityAudit: false,
    temporaryFileHiding: false,
  };
}

function fixtureReview({ layer, index, reviewId, details = {} }) {
  return {
    reviewId: reviewId || `${layer}-review-${index}`,
    type: layer === "city"
      ? CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES[index % CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.length]
      : "poi-p31-policy-manual-review",
    severity: "manual-review",
    relatedEntityIds: [`${layer}-entity-${index}`],
    wikidataId: `Q${200000 + index}`,
    details: { layer, index, ...details },
  };
}

function runAuditCompatibilityFixtures() {
  const expectedCityReviews = Array.from({ length: 43 }, (_, index) => fixtureReview({ layer: "city", index }));
  const poiReviews = Array.from({ length: 12 }, (_, index) => fixtureReview({ layer: "poi", index }));
  const cityOnly = evaluateCumulativeCityReviews({
    reviewQueue: expectedCityReviews,
    expectedCityReviews,
    expectedCityReviewCount: 43,
  });
  const cumulativeQueue = [...expectedCityReviews, ...poiReviews];
  const cumulativeBefore = JSON.parse(JSON.stringify(cumulativeQueue));
  const cumulative = evaluateCumulativeCityReviews({
    reviewQueue: cumulativeQueue,
    expectedCityReviews,
    expectedCityReviewCount: 43,
  });
  assert.equal(cityOnly.accepted, true);
  assert.equal(cumulative.accepted, true);
  assert.equal(cumulative.cityReviews.length, 43);
  assert.equal(cumulative.nonCityReviews.length, 12);
  assert.equal(cumulative.nonCityReviewsIgnoredByCityPolicy, true);

  const missingCityReview = evaluateCumulativeCityReviews({
    reviewQueue: expectedCityReviews.slice(1),
    expectedCityReviews,
    expectedCityReviewCount: 43,
  });
  assert.equal(missingCityReview.accepted, false);

  const changedContent = JSON.parse(JSON.stringify(expectedCityReviews));
  changedContent[0].details.index = -1;
  assert.equal(evaluateCumulativeCityReviews({
    reviewQueue: changedContent,
    expectedCityReviews,
    expectedCityReviewCount: 43,
  }).accepted, false);

  const changedId = JSON.parse(JSON.stringify(expectedCityReviews));
  changedId[0].reviewId = "changed-city-review-id";
  assert.equal(evaluateCumulativeCityReviews({
    reviewQueue: changedId,
    expectedCityReviews,
    expectedCityReviewCount: 43,
  }).accepted, false);

  const crossLayerCollision = JSON.parse(JSON.stringify(cumulativeQueue));
  crossLayerCollision[43].reviewId = expectedCityReviews[0].reviewId;
  assert.equal(evaluateCumulativeCityReviews({
    reviewQueue: crossLayerCollision,
    expectedCityReviews,
    expectedCityReviewCount: 43,
  }).accepted, false);

  const cumulativeDuplicate = JSON.parse(JSON.stringify(cumulativeQueue));
  cumulativeDuplicate[44].reviewId = cumulativeDuplicate[43].reviewId;
  assert.equal(evaluateCumulativeCityReviews({
    reviewQueue: cumulativeDuplicate,
    expectedCityReviews,
    expectedCityReviewCount: 43,
  }).accepted, false);

  const poiFilesPresent = observeOptionalPoiFiles({ relativePaths: ["poi-a", "poi-b"], existsSync: () => true });
  const poiFilesAbsent = observeOptionalPoiFiles({ relativePaths: ["poi-a", "poi-b"], existsSync: () => false });
  assert.equal(poiFilesPresent.allPresent, true);
  assert.equal(poiFilesAbsent.presentCount, 0);
  assert.equal(cityOnly.accepted, cumulative.accepted);
  assert.deepEqual(cumulativeQueue, cumulativeBefore);

  const nonCityConflict = { conflictId: "poi-conflict-1", type: "poi-fixture", severity: "review", relatedEntityIds: ["poi-1"] };
  const conflictEvaluation = evaluateCumulativeCityConflicts({
    conflicts: [nonCityConflict],
    expectedCityConflicts: [],
    cityEntityIds: new Set(["city-1"]),
    countryEntityIds: new Set(["country-1"]),
  });
  assert.equal(conflictEvaluation.accepted, true);
  assert.equal(conflictEvaluation.cityConflicts.length, 0);
  assert.equal(conflictEvaluation.nonCityConflicts.length, 1);

  const outputSemantics = buildPoiPresenceAuditSummary(poiFilesPresent);
  assert.equal(outputSemantics.poiFilesPresent, true);
  assert.equal(outputSemantics.poiContentsUsedForCityAudit, false);
  assert.equal(outputSemantics.poiPresenceBlocksCityAudit, false);
  assert.equal(Object.hasOwn(outputSemantics, "batch01PoiAbsent"), false);

  return Object.freeze({
    cityOnlyReviewsPass: true,
    cumulativeReviewsPass: true,
    nonCityReviewsExcludedFromCityPolicy: true,
    missingCityReviewBlocked: true,
    changedCityReviewContentBlocked: true,
    changedCityReviewIdBlocked: true,
    crossLayerReviewIdCollisionBlocked: true,
    cumulativeReviewIdDuplicateBlocked: true,
    poiFilesPresentPass: true,
    poiFilesAbsentPass: true,
    poiPresenceDoesNotChangeCityResult: true,
    poiContentsNotRead: true,
    nonCityConflictAllowed: true,
    noBatch01PoiAbsentHardGate: true,
  });
}

const auditCompatibilityFixtures = runAuditCompatibilityFixtures();

export function auditKnowledgeCityBaselineP1bBatch01() {
  const rawText = readText(CITY_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH);
  const raw = JSON.parse(rawText);
  const citiesAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.cities);
  const provenanceAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.provenance);
  const conflictsAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.conflicts);
  const reviewsAsset = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.reviewQueue);
  const pilotCities = readJson(PILOT_CITY_PATH).cities || [];
  const pilotPois = readJson(PILOT_POI_PATH).pois || [];
  const countries = CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS
    .flatMap((relativePath) => readJson(relativePath).countries || []);
  const batchCities = citiesAsset.cities || [];
  const allCities = [...pilotCities, ...batchCities];
  const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: pilotPois });
  const rawGate = validateKnowledgeCityBaselineP1bBatch01RawSnapshot(raw);
  const schemaValidation = validateKnowledgeCityEntitySet(batchCities);
  const parentValidation = repository.validateParentReferences();
  const rebuiltCityAssets = buildKnowledgeCityBaselineP1bBatch01Assets({ rawSnapshot: raw, countries, pilotCities });
  const reviewQueue = reviewsAsset.reviewQueue || [];
  const reviewEvaluation = evaluateCumulativeCityReviews({
    reviewQueue,
    expectedCityReviews: JSON.parse(JSON.stringify(rebuiltCityAssets.reviewQueueAsset.reviewQueue)),
    expectedCityReviewCount: 43,
  });
  const conflicts = conflictsAsset.conflicts || [];
  const conflictEvaluation = evaluateCumulativeCityConflicts({
    conflicts,
    expectedCityConflicts: JSON.parse(JSON.stringify(rebuiltCityAssets.conflictsAsset.conflicts)),
    cityEntityIds: new Set(batchCities.map((city) => city.entityId)),
    countryEntityIds: new Set(countries.map((country) => country.entityId)),
  });
  const blockingCityConflicts = conflictEvaluation.cityConflicts.filter((conflict) => conflict.severity === "blocking");
  const cityAssetMatchesFrozenBuilder = JSON.stringify(citiesAsset) === JSON.stringify(rebuiltCityAssets.citiesAsset);
  const provenanceMatchesFrozenBuilder = JSON.stringify(provenanceAsset) === JSON.stringify(rebuiltCityAssets.provenanceAsset);
  const provenanceCoverage = batchCities.filter((city) => provenanceAsset.provenance?.[city.entityId]).length;
  const inlineSidecarMatches = batchCities.filter((city) => JSON.stringify(city.provenance) === JSON.stringify(provenanceAsset.provenance?.[city.entityId])).length;
  const reviewsByCityId = new Map(batchCities.map((city) => [city.entityId, []]));
  for (const review of reviewEvaluation.cityReviews) {
    for (const entityId of review.relatedEntityIds || []) {
      if (reviewsByCityId.has(entityId)) reviewsByCityId.get(entityId).push(review);
    }
  }
  const gateByQid = new Map(rawGate.results.map((result) => [result.wikidataId, result]));
  const cityDetails = batchCities.map((city) => {
    const gate = gateByQid.get(city.wikidataId);
    const rawEntity = raw.wikidata?.entities?.[city.wikidataId];
    return {
      entityId: city.entityId,
      wikidataId: city.wikidataId,
      parentCountryEntityId: city.parentCountryEntityId,
      canonicalNameZh: city.canonicalNameZh,
      canonicalNameEn: city.canonicalNameEn,
      aliases: city.aliases,
      rawAliasEvidence: sourceAliases(rawEntity),
      coordinates: city.coordinates,
      p31: Object.entries(gate?.typeLabelsEn || {}).map(([wikidataId, labelEn]) => ({ wikidataId, labelEn })),
      p131: Object.entries(gate?.parentLabelsEn || {}).map(([wikidataId, labelEn]) => ({ wikidataId, labelEn })),
      semanticGate: {
        accepted: gate?.accepted === true,
        gateClassification: gate?.gateClassification,
        reasons: gate?.reasons || [],
        reviewReasons: gate?.reviewReasons || [],
        isCityClass: gate?.isCityClass === true,
        isAdministrativeClass: gate?.isAdministrativeClass === true,
        isMetropolitanAreaClass: gate?.isMetropolitanAreaClass === true,
        typeClassification: gate?.typeClassification,
        claimProjections: gate?.claimProjections,
        countryEvidence: gate?.countryEvidence,
        administrativeParentEvidence: gate?.administrativeParentEvidence,
        sparqlTaxonomySignals: gate?.sparqlTaxonomySignals,
        usedDescriptionFallback: gate?.usedDescriptionFallback === true,
        rejectedTypeLabels: gate?.rejectedTypeLabels || [],
      },
      provenanceCovered: Boolean(provenanceAsset.provenance?.[city.entityId]),
      inlineSidecarMatch: JSON.stringify(city.provenance) === JSON.stringify(provenanceAsset.provenance?.[city.entityId]),
      reviews: (reviewsByCityId.get(city.entityId) || []).map((review) => ({
        reviewId: review.reviewId,
        type: review.type,
        severity: review.severity,
        field: review.field,
        rawGateEvidence: review.rawGateEvidence,
      })),
    };
  });
  const parentCounts = Object.fromEntries(Object.keys(EXPECTED_PARENT_COUNTS).map((parentId) => [
    parentId,
    repository.listCitiesByCountry(parentId).filter((city) => batchCities.some((batchCity) => batchCity.entityId === city.entityId)).length,
  ]));
  const cumulativeCountryCounts = Object.fromEntries(["JP", "TR", "SG", "CO", "CZ", "FI", "NL", "PL"].map((isoAlpha2) => {
    const country = countries.find((candidate) => candidate.isoAlpha2 === isoAlpha2);
    return [isoAlpha2, country ? repository.listCitiesByCountry(country.entityId).length : 0];
  }));
  const polandGate = cityDetails
    .filter((city) => ["Q270", "Q31487"].includes(city.wikidataId))
    .map((city) => ({
      city: city.canonicalNameEn,
      wikidataId: city.wikidataId,
      p31: city.p31,
      p131: city.p131,
      semanticGate: city.semanticGate,
    }));
  const czechGate = cityDetails
    .filter((city) => ["Q1085", "Q14960"].includes(city.wikidataId))
    .map((city) => ({
      city: city.canonicalNameEn,
      wikidataId: city.wikidataId,
      p31: city.p31,
      p131: city.p131,
      semanticGate: city.semanticGate,
    }));
  const unsupportedBoundaries = rawGate.results
    .filter((result) => !result.accepted)
    .map((result) => ({ wikidataId: result.wikidataId, reasons: result.reasons }));
  const sourceProjectionDifferences = rawGate.results.map((result) => ({
    wikidataId: result.wikidataId,
    P17: result.claimProjections?.P17,
    P31: result.claimProjections?.P31,
    P131: result.claimProjections?.P131,
  }));
  const reviewTraceability = reviewEvaluation.cityReviews.filter((review) => {
    const gate = gateByQid.get(review.wikidataId);
    return gate
      && gate.reviewReasons.includes(review.type)
      && review.rawGateEvidence?.reviewReason === review.type
      && review.rawGateEvidence?.gateClassification === gate.gateClassification;
  }).length;
  const netherlandsCities = cityDetails.filter((city) => ["Q727", "Q34370"].includes(city.wikidataId));
  const netherlandsIsolation = {
    cityCount: netherlandsCities.length,
    cityReviewTypes: Object.fromEntries(netherlandsCities.map((city) => [city.wikidataId, city.reviews.map((review) => review.type)])),
    reviewsDerivedOnlyFromCityRawGate: netherlandsCities.every((city) => city.reviews
      .every((review) => city.semanticGate.reviewReasons.includes(review.type))),
    provenanceReferencesCountryReview: netherlandsCities.some((city) => Object.values(provenanceAsset.provenance?.[city.entityId] || {})
      .some((entry) => /review-queue|country-review/iu.test(`${entry.source || ""} ${entry.sourceUrl || ""}`))),
  };
  const poiFileObservation = observeOptionalPoiFiles({
    relativePaths: BATCH01_POI_PATHS,
    existsSync: (relativePath) => fs.existsSync(path.resolve(PROJECT_ROOT, relativePath)),
  });
  const poiCompatibility = buildPoiPresenceAuditSummary(poiFileObservation);

  return {
    status: countries.length === 50
      && batchCities.length === 10
      && pilotCities.length === 5
      && pilotPois.length === 15
      && rawGate.status === "PASS"
      && schemaValidation.accepted
      && parentValidation.accepted
      && cityAssetMatchesFrozenBuilder
      && provenanceMatchesFrozenBuilder
      && blockingCityConflicts.length === 0
      && conflictEvaluation.accepted
      && reviewEvaluation.accepted
      && reviewTraceability === reviewEvaluation.cityReviews.length
      && provenanceCoverage === 10
      && inlineSidecarMatches === 10
      && netherlandsIsolation.reviewsDerivedOnlyFromCityRawGate
      && netherlandsIsolation.provenanceReferencesCountryReview === false
      && JSON.stringify(parentCounts) === JSON.stringify(EXPECTED_PARENT_COUNTS)
      ? "PASS"
      : "BLOCKED",
    scope: {
      batch01Countries: 5,
      batch01Cities: batchCities.length,
      batch01Pois: 0,
      batch01PoiContentsUsedForCityAudit: false,
    },
    source: {
      provider: raw.source?.provider,
      endpoints: raw.source?.endpoints,
      retrievedAt: raw.retrievedAt,
      httpRequestCount: raw.source?.httpRequestCount,
      retryCount: raw.source?.retryCount,
      entityRecordCount: raw.source?.entityRecordCount,
      semanticBindingCount: raw.source?.semanticBindingCount,
      rawSizeBytes: Buffer.byteLength(rawText),
      rawSha256: crypto.createHash("sha256").update(rawText).digest("hex"),
    },
    rawGate,
    cityDetails,
    czechGate,
    polandGate,
    administrativeBoundaryReviews: {
      allowedTypes: CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
      byType: summarizeByType(reviewEvaluation.cityReviews),
      cityReviewTotal: reviewEvaluation.cityReviewTotal,
      nonCityReviewTotal: reviewEvaluation.nonCityReviewTotal,
      reviewTotal: reviewEvaluation.reviewTotal,
      traceableToRawGate: reviewTraceability,
      uniqueCityTypePairs: reviewEvaluation.uniqueCityTypePairs,
      cityReviewsAllowedTypesOnly: reviewEvaluation.cityReviewsAllowedTypesOnly,
      nonCityReviewsIgnoredByCityPolicy: reviewEvaluation.nonCityReviewsIgnoredByCityPolicy,
      cumulativeReviewIdsUnique: reviewEvaluation.cumulativeReviewIdsUnique,
      cityReviewsMatchFrozenBaseline: reviewEvaluation.cityReviewsMatchFrozenBaseline,
    },
    netherlandsIsolation,
    poiCompatibility,
    unsupportedBoundaries,
    sourceProjectionDifferences,
    schemaValidation,
    parentValidation,
    provenance: {
      coverage: provenanceCoverage,
      inlineSidecarMatches,
    },
    conflicts: {
      conflictTotal: conflictEvaluation.conflictTotal,
      cityConflictTotal: conflictEvaluation.cityConflictTotal,
      nonCityConflictTotal: conflictEvaluation.nonCityConflictTotal,
      blockingCityConflicts: blockingCityConflicts.length,
      cumulativeConflictIdsUnique: conflictEvaluation.cumulativeConflictIdsUnique,
      cityConflictsMatchFrozenBaseline: conflictEvaluation.cityConflictsMatchFrozenBaseline,
      nonCityConflictsIgnoredByCityPolicy: conflictEvaluation.nonCityConflictsIgnoredByCityPolicy,
      cityByType: summarizeByType(conflictEvaluation.cityConflicts),
      nonCityByType: summarizeByType(conflictEvaluation.nonCityConflicts),
    },
    parentCounts,
    expectedParentCounts: EXPECTED_PARENT_COUNTS,
    cumulative: {
      countries: countries.length,
      cities: allCities.length,
      pois: pilotPois.length,
      totalEntities: countries.length + allCities.length + pilotPois.length,
      cityDistribution: cumulativeCountryCounts,
    },
    deterministicCityBaseline: {
      cityAssetMatchesFrozenBuilder,
      provenanceMatchesFrozenBuilder,
      cityReviewsMatchFrozenBuilder: reviewEvaluation.cityReviewsMatchFrozenBaseline,
      cityConflictsMatchFrozenBuilder: conflictEvaluation.cityConflictsMatchFrozenBaseline,
    },
    syntheticFixtures: auditCompatibilityFixtures,
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  process.stdout.write(`${JSON.stringify(auditKnowledgeCityBaselineP1bBatch01(), null, 2)}\n`);
}
