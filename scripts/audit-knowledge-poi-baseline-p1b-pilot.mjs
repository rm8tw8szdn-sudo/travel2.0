import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createKnowledgeEntityLayerRepository,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  POI_BASELINE_P1B_CITY_ASSET_RELATIVE_PATH,
  POI_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS,
  POI_BASELINE_P1B_CUMULATIVE_CONFLICTS_RELATIVE_PATH,
  POI_BASELINE_P1B_CUMULATIVE_REVIEW_RELATIVE_PATH,
  POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS,
} from "./import-knowledge-poi-baseline-p1b-pilot.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_PARENT_COUNTS = Object.freeze({
  "city-5a21732f861ff7f1": 3,
  "city-8acaf08893e5abf1": 3,
  "city-fc91a9c6c7b389cf": 3,
  "city-d6f6bf7d2fca5cb4": 3,
  "city-dde074f983b42cfd": 3,
});
const UNSUPPORTED_BOUNDARY_NAMES = Object.freeze(["Cappadocia", "Mount Fuji"]);

function readJson(relativePath, fallback = null) {
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

export function auditKnowledgePoiBaselineP1bPilot() {
  const poisAsset = readJson(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.pois, { pois: [] });
  const provenanceAsset = readJson(POI_BASELINE_P1B_PUBLISH_RELATIVE_PATHS.provenance, { provenance: {} });
  const conflictsAsset = readJson(POI_BASELINE_P1B_CUMULATIVE_CONFLICTS_RELATIVE_PATH, { conflicts: [] });
  const reviewAsset = readJson(POI_BASELINE_P1B_CUMULATIVE_REVIEW_RELATIVE_PATH, { reviewQueue: [] });
  const cities = readJson(POI_BASELINE_P1B_CITY_ASSET_RELATIVE_PATH, { cities: [] }).cities || [];
  const countries = POI_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS
    .flatMap((relativePath) => readJson(relativePath, { countries: [] }).countries || []);
  const pois = poisAsset.pois || [];
  const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois });
  const schemaValidation = validateKnowledgePoiEntitySet(pois);
  const parentValidation = repository.validateParentReferences();
  const blockingConflicts = (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking");
  const provenanceCoverage = pois.filter((poi) => provenanceAsset.provenance?.[poi.entityId]).length;
  const inlineSidecarMatches = pois.filter((poi) => JSON.stringify(poi.provenance) === JSON.stringify(provenanceAsset.provenance?.[poi.entityId])).length;
  const parentCounts = Object.fromEntries(Object.keys(EXPECTED_PARENT_COUNTS).map((parentId) => [
    parentId,
    repository.listPoisByCity(parentId).length,
  ]));
  const poiEntityIds = new Set(pois.map((poi) => poi.entityId));
  const poiReviews = (reviewAsset.reviewQueue || []).filter((review) => review.relatedEntityIds?.some((entityId) => poiEntityIds.has(entityId)));
  const unsupportedPublished = pois.filter((poi) => UNSUPPORTED_BOUNDARY_NAMES.some((name) => [
    poi.canonicalNameEn,
    ...poi.aliases,
  ].includes(name)));

  return {
    status: schemaValidation.accepted
      && parentValidation.accepted
      && pois.length === 15
      && JSON.stringify(parentCounts) === JSON.stringify(EXPECTED_PARENT_COUNTS)
      && blockingConflicts.length === 0
      && provenanceCoverage === 15
      && inlineSidecarMatches === 15
      && unsupportedPublished.length === 0
      ? "PASS"
      : "BLOCKED",
    poiCount: pois.length,
    parentCounts,
    expectedParentCounts: EXPECTED_PARENT_COUNTS,
    orphanPoiCount: parentValidation.reasons.filter((reason) => reason.type === "orphan-poi-parent").length,
    provenanceCoverage,
    inlineSidecarMatches,
    conflicts: {
      total: (conflictsAsset.conflicts || []).length,
      blocking: blockingConflicts.length,
    },
    cumulativeReviewCount: (reviewAsset.reviewQueue || []).length,
    poiReviews,
    unsupportedBoundaryObjects: {
      excludedNames: UNSUPPORTED_BOUNDARY_NAMES,
      publishedMatches: unsupportedPublished.map((poi) => poi.entityId),
    },
    schemaValidation,
    parentValidation,
    pois: pois.map((poi) => ({
      entityId: poi.entityId,
      wikidataId: poi.wikidataId,
      canonicalNameEn: poi.canonicalNameEn,
      parentCityEntityId: poi.parentCityEntityId,
      coordinates: poi.coordinates,
      provenanceCovered: Boolean(provenanceAsset.provenance?.[poi.entityId]),
    })),
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) process.stdout.write(`${JSON.stringify(auditKnowledgePoiBaselineP1bPilot(), null, 2)}\n`);
