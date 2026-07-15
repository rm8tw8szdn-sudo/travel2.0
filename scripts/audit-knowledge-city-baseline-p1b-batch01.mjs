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
  "scripts/knowledge-poi-review-classifier-p1b-batch01.mjs",
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
  const provenanceCoverage = batchCities.filter((city) => provenanceAsset.provenance?.[city.entityId]).length;
  const inlineSidecarMatches = batchCities.filter((city) => JSON.stringify(city.provenance) === JSON.stringify(provenanceAsset.provenance?.[city.entityId])).length;
  const blockingConflicts = (conflictsAsset.conflicts || []).filter((conflict) => conflict.severity === "blocking");
  const reviewsByCityId = new Map(batchCities.map((city) => [city.entityId, []]));
  for (const review of reviewsAsset.reviewQueue || []) {
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
  const reviewQueue = reviewsAsset.reviewQueue || [];
  const reviewTraceability = reviewQueue.filter((review) => {
    const gate = gateByQid.get(review.wikidataId);
    return gate
      && gate.reviewReasons.includes(review.type)
      && review.rawGateEvidence?.reviewReason === review.type
      && review.rawGateEvidence?.gateClassification === gate.gateClassification;
  }).length;
  const reviewCityTypeKeys = reviewQueue.map((review) => `${review.wikidataId}:${review.type}`);
  const allowedReviewTypes = reviewQueue.every((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  const uniqueReviewCityTypes = new Set(reviewCityTypeKeys).size === reviewCityTypeKeys.length;
  const netherlandsCities = cityDetails.filter((city) => ["Q727", "Q34370"].includes(city.wikidataId));
  const netherlandsIsolation = {
    cityCount: netherlandsCities.length,
    cityReviewTypes: Object.fromEntries(netherlandsCities.map((city) => [city.wikidataId, city.reviews.map((review) => review.type)])),
    reviewsDerivedOnlyFromCityRawGate: netherlandsCities.every((city) => city.reviews
      .every((review) => city.semanticGate.reviewReasons.includes(review.type))),
    provenanceReferencesCountryReview: netherlandsCities.some((city) => Object.values(provenanceAsset.provenance?.[city.entityId] || {})
      .some((entry) => /review-queue|country-review/iu.test(`${entry.source || ""} ${entry.sourceUrl || ""}`))),
  };
  const batch01PoiAbsent = BATCH01_POI_PATHS.every((relativePath) => !fs.existsSync(path.resolve(PROJECT_ROOT, relativePath)));

  return {
    status: countries.length === 50
      && batchCities.length === 10
      && pilotCities.length === 5
      && pilotPois.length === 15
      && rawGate.status === "PASS"
      && schemaValidation.accepted
      && parentValidation.accepted
      && blockingConflicts.length === 0
      && allowedReviewTypes
      && uniqueReviewCityTypes
      && reviewTraceability === reviewQueue.length
      && provenanceCoverage === 10
      && inlineSidecarMatches === 10
      && netherlandsIsolation.reviewsDerivedOnlyFromCityRawGate
      && netherlandsIsolation.provenanceReferencesCountryReview === false
      && batch01PoiAbsent
      && JSON.stringify(parentCounts) === JSON.stringify(EXPECTED_PARENT_COUNTS)
      ? "PASS"
      : "BLOCKED",
    scope: {
      batch01Countries: 5,
      batch01Cities: batchCities.length,
      batch01Pois: 0,
      batch01PoiStatus: "NOT_STARTED",
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
      byType: summarizeByType(reviewQueue),
      total: reviewQueue.length,
      traceableToRawGate: reviewTraceability,
      uniqueCityTypePairs: uniqueReviewCityTypes,
    },
    netherlandsIsolation,
    batch01PoiAbsent,
    unsupportedBoundaries,
    sourceProjectionDifferences,
    schemaValidation,
    parentValidation,
    provenance: {
      coverage: provenanceCoverage,
      inlineSidecarMatches,
    },
    conflicts: {
      total: (conflictsAsset.conflicts || []).length,
      blocking: blockingConflicts.length,
      byType: summarizeByType(conflictsAsset.conflicts || []),
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
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  process.stdout.write(`${JSON.stringify(auditKnowledgeCityBaselineP1bBatch01(), null, 2)}\n`);
}
