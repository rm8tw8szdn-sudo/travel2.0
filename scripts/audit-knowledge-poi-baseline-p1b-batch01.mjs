import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createKnowledgeEntityLayerRepository,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES,
} from "./import-knowledge-city-baseline-p1b-batch01.mjs";
import {
  POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
  POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH,
  POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH,
} from "./import-knowledge-poi-baseline-p1b-batch01.mjs";
import { classifyKnowledgePoiReviewEvidence } from "./lib/knowledge-poi-review-policy-p1b.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8"));
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "en")));
}

export function auditKnowledgePoiBaselineP1bBatch01({ repositoryRoot = PROJECT_ROOT } = {}) {
  const rootBefore = PROJECT_ROOT;
  if (repositoryRoot !== PROJECT_ROOT) throw new Error(`unsupported-audit-root:${repositoryRoot}:${rootBefore}`);
  const countries = CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS
    .flatMap((relativePath) => readJson(relativePath).countries || []);
  const pilotCities = readJson("data/knowledge/cities.p1b-pilot.json").cities || [];
  const batchCities = readJson("data/knowledge/batches/cities.p1b-batch01.json").cities || [];
  const pilotPois = readJson("data/knowledge/pois.p1b-pilot.json").pois || [];
  const formalRaw = readJson(POI_BASELINE_P1B_BATCH01_RAW_RELATIVE_PATH);
  const selection = readJson(POI_BASELINE_P1B_BATCH01_SELECTION_RELATIVE_PATH);
  const poisAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.pois);
  const provenanceAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.provenance);
  const conflictsAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.conflicts);
  const reviewAsset = readJson(POI_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.reviewQueue);
  const pois = poisAsset.pois || [];
  const allCities = [...pilotCities, ...batchCities];
  const cityById = new Map(allCities.map((city) => [city.entityId, city]));
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const recordByQid = new Map((formalRaw.records || []).map((record) => [record.selectedQid, record]));
  const selectionPrimaryQids = new Set(selection.primaryCandidates.map((candidate) => candidate.selectedQid));
  const backupQids = new Set(selection.backupCandidates.map((candidate) => candidate.selectedQid));
  const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: [...pilotPois, ...pois] });
  const classifications = pois.map((poi) => {
    const record = recordByQid.get(poi.wikidataId);
    return {
      entityId: poi.entityId,
      ...classifyKnowledgePoiReviewEvidence({
        wikidataId: poi.wikidataId,
        parentCityEntityId: poi.parentCityEntityId,
        sourceP31Qids: record?.p31Evidence?.sortedTypeQids || [],
        p31ProjectionDifference: record?.p31Evidence?.sourceProjection?.exactMatch !== true,
        identityRisk: record?.identityRisk || "",
        parentEvidenceLevel: record?.parentEvidenceLevel || "",
        policyEvidence: selection.P31PolicyEvidence,
      }),
    };
  });
  const classifierByEntityId = new Map(classifications.map((value) => [value.entityId, value]));
  const cityReviews = (reviewAsset.reviewQueue || []).filter((review) => CITY_BASELINE_P1B_BATCH01_REVIEW_TYPES.includes(review.type));
  const poiManualReviews = (reviewAsset.reviewQueue || []).filter((review) => review.type === "poi-p31-policy-manual-review");
  const blockingConflicts = (conflictsAsset.conflicts || []).filter((conflict) => conflict.severity === "blocking");
  const citySummaries = batchCities.map((city) => {
    const cityPois = repository.listPoisByCity(city.entityId).filter((poi) => selectionPrimaryQids.has(poi.wikidataId));
    const country = countryById.get(city.parentCountryEntityId);
    return {
      cityEntityId: city.entityId,
      cityWikidataId: city.wikidataId,
      cityNameEn: city.canonicalNameEn,
      countryEntityId: country?.entityId || null,
      countryIsoAlpha2: country?.isoAlpha2 || null,
      poiCount: cityPois.length,
      pois: cityPois.map((poi) => {
        const record = recordByQid.get(poi.wikidataId);
        const classifier = classifierByEntityId.get(poi.entityId);
        const review = poiManualReviews.find((value) => value.relatedEntityIds.includes(poi.entityId));
        return {
          entityId: poi.entityId,
          wikidataId: poi.wikidataId,
          canonicalNameEn: poi.canonicalNameEn,
          canonicalNameZh: poi.canonicalNameZh,
          parentCityEntityId: poi.parentCityEntityId,
          derivedCountryEntityId: country?.entityId || null,
          derivedCountryIsoAlpha2: country?.isoAlpha2 || null,
          coordinates: poi.coordinates,
          p31Key: classifier.sourceP31Qids.join("|"),
          classifierDisposition: classifier.disposition,
          manualReviewReason: review?.rationale || null,
          sourceRound: record.sourceRound,
          candidateKey: record.candidateKey,
          selectionPolicyVersion: record.selectionPolicyVersion,
          sourceRawPath: record.sourceRawPath,
          provenanceCovered: Boolean(provenanceAsset.provenance?.[poi.entityId]),
          traceabilityCovered: Boolean(provenanceAsset.traceability?.[poi.entityId]),
        };
      }),
    };
  });
  const schema = validateKnowledgePoiEntitySet(pois);
  const parentValidation = repository.validateParentReferences();
  const provenanceCoverage = pois.filter((poi) => provenanceAsset.provenance?.[poi.entityId]).length;
  const inlineSidecarMatches = pois.filter((poi) => JSON.stringify(poi.provenance)
    === JSON.stringify(provenanceAsset.provenance?.[poi.entityId])).length;
  const traceabilityCoverage = pois.filter((poi) => provenanceAsset.traceability?.[poi.entityId]).length;
  const dispositions = countBy(classifications, (value) => value.disposition);
  const checks = {
    canonicalCount: pois.length === 30,
    eachCityThree: citySummaries.every((city) => city.poiCount === 3),
    schema: schema.accepted,
    parents: parentValidation.accepted,
    selectionExact: pois.every((poi) => selectionPrimaryQids.has(poi.wikidataId)),
    backupsExcluded: pois.every((poi) => !backupQids.has(poi.wikidataId)),
    classifier: classifications.length === 30
      && dispositions.informational === 18
      && dispositions["manual-review"] === 12
      && !dispositions.blocking,
    provenance: provenanceCoverage === 30 && inlineSidecarMatches === 30 && traceabilityCoverage === 30,
    conflicts: (conflictsAsset.conflicts || []).length === 0 && blockingConflicts.length === 0,
    reviews: cityReviews.length === 43 && poiManualReviews.length === 12,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED",
    checks,
    totals: {
      countries: countries.length,
      cities: allCities.length,
      pilotPois: pilotPois.length,
      batchPois: pois.length,
      cumulativePois: pilotPois.length + pois.length,
      totalEntities: countries.length + allCities.length + pilotPois.length + pois.length,
    },
    cityDistribution: Object.fromEntries(citySummaries.map((city) => [city.cityNameEn, city.poiCount])),
    dispositions,
    conflicts: { total: (conflictsAsset.conflicts || []).length, blocking: blockingConflicts.length },
    reviews: {
      city: cityReviews.length,
      poiClassifierManual: poiManualReviews.length,
      additionalPoi: reviewAsset.additionalPoiReviewCount,
      total: reviewAsset.reviewCount,
    },
    provenance: { coverage: provenanceCoverage, inlineSidecarMatches, traceabilityCoverage },
    backupExclusion: { selectedBackups: selection.backupCount, publishedBackups: pois.filter((poi) => backupQids.has(poi.wikidataId)).length },
    pilotImmutable: {
      pilotPoiCount: pilotPois.length,
      pilotPoiParentEntityIds: pilotPois.map((poi) => poi.parentCityEntityId),
    },
    citySummaries,
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(auditKnowledgePoiBaselineP1bBatch01(), null, 2)}\n`);
