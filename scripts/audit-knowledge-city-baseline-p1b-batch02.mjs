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
  CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
  CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES,
  CITY_BASELINE_P1B_BATCH02_SEEDS,
  buildKnowledgeCityBaselineP1bBatch02Assets,
  validateKnowledgeCityBaselineP1bBatch02RawSnapshot,
} from "./import-knowledge-city-baseline-p1b-batch02.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIOR_CITY_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
]);
const PRIOR_POI_PATHS = Object.freeze([
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
]);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function countsBy(items, key) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right, "en")));
}

export function auditKnowledgeCityBaselineP1bBatch02() {
  const rawText = readText(CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH);
  const raw = JSON.parse(rawText);
  const citiesAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.cities);
  const provenanceAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.provenance);
  const conflictsAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.conflicts);
  const reviewsAsset = readJson(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS.reviewQueue);
  const countries = CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS
    .flatMap((relativePath) => readJson(relativePath).countries || []);
  const priorCities = PRIOR_CITY_PATHS.flatMap((relativePath) => readJson(relativePath).cities || []);
  const priorPois = PRIOR_POI_PATHS.flatMap((relativePath) => readJson(relativePath).pois || []);
  const cities = citiesAsset.cities || [];
  const allCities = [...priorCities, ...cities];
  const gate = validateKnowledgeCityBaselineP1bBatch02RawSnapshot(raw);
  const rebuilt = buildKnowledgeCityBaselineP1bBatch02Assets({ rawSnapshot: raw, countries, priorCities });
  const batchCityIds = new Set(cities.map((city) => city.entityId));
  const cityReviews = (reviewsAsset.reviewQueue || []).filter((review) => CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES.includes(review.type)
    && (review.relatedEntityIds || []).some((entityId) => batchCityIds.has(entityId)));
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const cityById = new Map(allCities.map((city) => [city.entityId, city]));
  const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: priorPois });
  const details = cities.map((city) => ({
    isoAlpha2: countryById.get(city.parentCountryEntityId)?.isoAlpha2,
    country: countryById.get(city.parentCountryEntityId)?.canonicalNameEn,
    city: city.canonicalNameEn,
    cityZh: city.canonicalNameZh,
    wikidataId: city.wikidataId,
    entityId: city.entityId,
    parentCountryEntityId: city.parentCountryEntityId,
    coordinates: city.coordinates,
    aliasCount: city.aliases.length,
    reviewTypes: cityReviews.filter((review) => review.wikidataId === city.wikidataId).map((review) => review.type).sort(),
  }));
  const orphanCities = cities.filter((city) => !countryById.has(city.parentCountryEntityId));
  const orphanPois = priorPois.filter((poi) => !cityById.has(poi.parentCityEntityId));
  const entityIds = [...countries, ...allCities, ...priorPois].map((entity) => entity.entityId);
  const countryCityQidOverlaps = countries.flatMap((country) => allCities
    .filter((city) => city.wikidataId === country.wikidataId)
    .map((city) => ({ country: country.canonicalNameEn, city: city.canonicalNameEn, wikidataId: city.wikidataId })));
  const summary = {
    status: gate.status === "PASS"
      && cities.length === 10
      && validateKnowledgeCityEntitySet(cities).accepted
      && rebuilt.conflictsAsset.blockingCount === 0
      && rebuilt.conflictsAsset.conflictCount === 0
      && cityReviews.length === rebuilt.reviewQueueAsset.reviewCount
      && JSON.stringify(cityReviews) === JSON.stringify(rebuilt.reviewQueueAsset.reviewQueue)
      && Object.keys(provenanceAsset.provenance || {}).length === 10
      && cities.every((city) => JSON.stringify(city.provenance) === JSON.stringify(provenanceAsset.provenance[city.entityId]))
      && orphanCities.length === 0
      && orphanPois.length === 0
      && new Set(entityIds).size === entityIds.length
      && repository.validateParentReferences().accepted
      ? "PASS"
      : "FAIL",
    source: {
      provider: raw.source.provider,
      retrievedAt: raw.retrievedAt,
      sha256: crypto.createHash("sha256").update(rawText).digest("hex"),
      httpRequestCount: raw.source.httpRequestCount,
      retryCount: raw.source.retryCount,
      semanticBindingCount: raw.source.semanticBindingCount,
      approvedQidsMatched: gate.approvedQidsMatched,
    },
    batch02: {
      countryCount: new Set(CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => seed.isoAlpha2)).size,
      cityCount: cities.length,
      distribution: countsBy(details, "isoAlpha2"),
      provenanceCount: Object.keys(provenanceAsset.provenance || {}).length,
      reviewCount: cityReviews.length,
      reviewTypes: countsBy(cityReviews, "type"),
      conflictCount: conflictsAsset.conflictCount,
      blockingCount: conflictsAsset.blockingCount,
    },
    cumulative: {
      countries: countries.length,
      cities: allCities.length,
      pois: priorPois.length,
      totalEntities: countries.length + allCities.length + priorPois.length,
      orphanCities: orphanCities.length,
      orphanPois: orphanPois.length,
      entityIdsUnique: new Set(entityIds).size === entityIds.length,
      countryCityQidOverlaps,
      parentValidation: repository.validateParentReferences(),
    },
    cities: details,
  };
  return summary;
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  const summary = auditKnowledgeCityBaselineP1bBatch02();
  assert.equal(summary.status, "PASS", JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
