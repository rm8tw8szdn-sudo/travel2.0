import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createKnowledgeEntityLayerRepository,
  validateKnowledgeCityEntitySet,
} from "../src/lib/routes/index.mjs";
import {
  CITY_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS,
} from "./import-knowledge-city-baseline-p1b-pilot.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_PARENT_COUNTS = Object.freeze({
  "country-a0509b9eab0ea9ce": 2,
  "country-03919f1fd24fd3dc": 2,
  "country-e0a550ef5a59c6f9": 1,
});

function readJson(relativePath, fallback = null) {
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function summarizeByType(items = []) {
  return Object.fromEntries(items.reduce((counts, item) => {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
    return counts;
  }, new Map()));
}

export function auditKnowledgeCityBaselineP1bPilot() {
  const citiesAsset = readJson("data/knowledge/cities.p1b-pilot.json", { cities: [] });
  const provenanceAsset = readJson("data/knowledge/provenance.cities.p1b-pilot.json", { provenance: {} });
  const conflictsAsset = readJson("data/knowledge/conflicts.p1b-pilot.json", { conflicts: [] });
  const reviewAsset = readJson("data/knowledge/review-queue.p1b-pilot.json", { reviewQueue: [] });
  const countries = CITY_BASELINE_P1B_COUNTRY_ASSET_RELATIVE_PATHS
    .flatMap((relativePath) => readJson(relativePath, { countries: [] }).countries || []);
  const cities = citiesAsset.cities || [];
  const repository = createKnowledgeEntityLayerRepository({ countries, cities });
  const schemaValidation = validateKnowledgeCityEntitySet(cities);
  const parentValidation = repository.validateParentReferences();
  const blockingConflicts = (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking");
  const provenanceCoverage = cities.filter((city) => provenanceAsset.provenance?.[city.entityId]).length;
  const inlineSidecarMatches = cities.filter((city) => JSON.stringify(city.provenance) === JSON.stringify(provenanceAsset.provenance?.[city.entityId])).length;
  const parentCounts = Object.fromEntries(Object.keys(EXPECTED_PARENT_COUNTS).map((parentId) => [
    parentId,
    repository.listCitiesByCountry(parentId).length,
  ]));
  const parentCoverageMatches = JSON.stringify(parentCounts) === JSON.stringify(EXPECTED_PARENT_COUNTS);

  return {
    status: schemaValidation.accepted
      && parentValidation.accepted
      && cities.length === 5
      && blockingConflicts.length === 0
      && provenanceCoverage === 5
      && inlineSidecarMatches === 5
      && parentCoverageMatches
      ? "PASS"
      : "BLOCKED",
    cityCount: cities.length,
    wikidataIds: cities.map((city) => city.wikidataId).sort(),
    parentCounts,
    expectedParentCounts: EXPECTED_PARENT_COUNTS,
    orphanCityCount: parentValidation.reasons.filter((reason) => reason.type === "orphan-city-parent").length,
    schemaValidation,
    parentValidation,
    provenanceCoverage,
    inlineSidecarMatches,
    conflicts: {
      total: (conflictsAsset.conflicts || []).length,
      blocking: blockingConflicts.length,
      byType: summarizeByType(conflictsAsset.conflicts || []),
    },
    reviewQueue: {
      total: (reviewAsset.reviewQueue || []).length,
      byType: summarizeByType(reviewAsset.reviewQueue || []),
      ids: (reviewAsset.reviewQueue || []).map((item) => item.reviewId).sort(),
    },
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  process.stdout.write(`${JSON.stringify(auditKnowledgeCityBaselineP1bPilot(), null, 2)}\n`);
}
