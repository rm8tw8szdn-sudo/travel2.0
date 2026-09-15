import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const writeJson = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);

const COUNTRY_CODES = Object.freeze(["BB", "BZ", "CV", "DM", "MN", "RW", "SC", "SM", "TT", "UG", "ZM", "ZW"]);
const SOURCE_BATCHES = Object.freeze([34, 35, 36, 37, 39, 40, 46]);
const REJECTED_POIS = Object.freeze({
  Q84496209: "low-value-watercourse",
  Q15275774: "generic-watercourse",
  Q5594671: "accommodation-business",
  Q618252: "operational-library",
  Q22082371: "locality-not-travel-poi",
  Q122933018: "low-value-monument",
  Q625912: "operational-library",
  Q16918871: "operational-archive",
  Q24235953: "low-value-operational-religious-site",
  Q6974180: "operational-library",
  Q815650: "generic-watercourse",
  Q21870703: "generic-watercourse",
  Q609946: "operational-library",
  Q6970423: "operational-archive",
  Q5164145: "generic-watercourse",
  Q629924: "operational-library",
  Q7161401: "former-island-not-current-poi",
  Q17509679: "geological-unit-not-travel-poi",
  Q4151227: "generic-watercourse",
  Q18354333: "geological-unit-not-travel-poi",
  Q5045524: "generic-watercourse",
  Q2465198: "generic-watercourse",
  Q6974145: "operational-library",
  Q112031: "island-not-city-scoped-poi",
  Q7056504: "generic-watercourse",
  Q7190503: "generic-watercourse",
  Q7337452: "generic-watercourse",
  Q3018552: "generic-watercourse",
  Q28685: "island-not-city-scoped-poi",
  Q219642: "island-not-city-scoped-poi",
  Q40411: "island-not-city-scoped-poi",
  Q2066419: "island-not-city-scoped-poi",
});

const publishedCountries = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.flatMap((relativePath) => readJson(relativePath).countries);
const countryByEntityId = new Map(publishedCountries.map((country) => [country.entityId, country]));
const targetCodes = new Set(COUNTRY_CODES);
const reviewedCities = [];
const reviewedPois = [];

for (const batch of SOURCE_BATCHES) {
  const cities = readJson(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities;
  const cityByEntityId = new Map(cities.map((city) => [city.entityId, city]));
  for (const city of cities) {
    const country = countryByEntityId.get(city.parentCountryEntityId);
    if (country && targetCodes.has(country.isoAlpha2)) reviewedCities.push({ countryCode: country.isoAlpha2, sourceBatch: batch, entity: city });
  }
  for (const poi of readJson(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois) {
    const city = cityByEntityId.get(poi.parentCityEntityId);
    const country = city && countryByEntityId.get(city.parentCountryEntityId);
    if (country && targetCodes.has(country.isoAlpha2)) reviewedPois.push({ countryCode: country.isoAlpha2, sourceBatch: batch, entity: poi });
  }
}

if (reviewedCities.length !== 33 || reviewedPois.length !== 140) throw new Error("batch01-candidate-baseline-drift");
const admittedCities = reviewedCities.map(({ entity }) => entity).sort((a, b) => a.entityId.localeCompare(b.entityId));
const admittedCityIds = new Set(admittedCities.map((city) => city.entityId));
const admittedPois = reviewedPois.filter(({ entity }) => !Object.hasOwn(REJECTED_POIS, entity.wikidataId)).map(({ entity }) => entity).sort((a, b) => a.entityId.localeCompare(b.entityId));
const rejectedPois = reviewedPois.filter(({ entity }) => Object.hasOwn(REJECTED_POIS, entity.wikidataId));
if (admittedPois.some((poi) => !admittedCityIds.has(poi.parentCityEntityId))) throw new Error("admitted-poi-parent-not-admitted");
if (admittedPois.length !== 108 || rejectedPois.length !== 32) throw new Error("batch01-reviewed-count-drift");

writeJson("data/knowledge/batches/cities.p1b-batch50.json", {
  schemaVersion: "route-v2-city-baseline-p1b-batch50",
  generatedFrom: "data/knowledge/reports/plannable-expansion-batch01-entity-review.json",
  cityCount: admittedCities.length,
  cities: admittedCities,
});
writeJson("data/knowledge/batches/pois.p1b-batch50.json", {
  schemaVersion: "route-v2-poi-baseline-p1b-batch50",
  generatedFrom: "data/knowledge/reports/plannable-expansion-batch01-entity-review.json",
  poiCount: admittedPois.length,
  pois: admittedPois,
});
writeJson("data/knowledge/batches/review-queue.plannable-expansion-batch01.json", {
  schemaVersion: "route-v2-plannable-expansion-batch01-review-v1",
  reviewCount: rejectedPois.length,
  reviews: rejectedPois.map(({ countryCode, sourceBatch, entity }) => ({
    entityId: entity.entityId,
    wikidataId: entity.wikidataId,
    canonicalNameEn: entity.canonicalNameEn,
    countryCode,
    sourceBatch,
    sourceEntity: entity,
    disposition: "candidate-quarantine-retained",
    reason: REJECTED_POIS[entity.wikidataId],
  })).sort((a, b) => a.wikidataId.localeCompare(b.wikidataId)),
});

const byCountry = COUNTRY_CODES.map((countryCode) => {
  const cities = reviewedCities.filter((entry) => entry.countryCode === countryCode);
  const pois = reviewedPois.filter((entry) => entry.countryCode === countryCode);
  const admitted = pois.filter(({ entity }) => !Object.hasOwn(REJECTED_POIS, entity.wikidataId));
  const rejected = pois.filter(({ entity }) => Object.hasOwn(REJECTED_POIS, entity.wikidataId));
  return {
    countryCode,
    reviewedDestinationCandidates: cities.length,
    admittedProductionDestinations: cities.length,
    rejectedDestinations: 0,
    reviewedPoiCandidates: pois.length,
    admittedProductionPois: admitted.length,
    rejectedPois: rejected.length,
    productionDestinationQids: cities.map(({ entity }) => entity.wikidataId).sort(),
    rejectedPoiDecisions: rejected.map(({ entity, sourceBatch }) => ({
      entityId: entity.entityId,
      wikidataId: entity.wikidataId,
      canonicalNameEn: entity.canonicalNameEn,
      sourceBatch,
      disposition: "candidate-quarantine-retained",
      reason: REJECTED_POIS[entity.wikidataId],
    })).sort((a, b) => a.wikidataId.localeCompare(b.wikidataId)),
    validEvidence: false,
    plannable: false,
    evidenceBacked: false,
    catalogOnly: true,
    evidencePending: true,
    requiredDirectedTransportSegments: cities.length > 1 ? 2 * (cities.length - 1) : 0,
    requiredSeasonMonthProfiles: cities.length,
    routeModel: cities.length === 1 ? "single-destination" : "multi-destination",
  };
});

writeJson("data/knowledge/reports/plannable-expansion-batch01-entity-review.json", {
  schemaVersion: "route-v2-plannable-expansion-batch01-entity-review-v1",
  phase: "A-C-entity-foundation",
  countries: COUNTRY_CODES,
  sourceBatches: SOURCE_BATCHES,
  baseline: { countries: 195, cities: 833, pois: 3963, totalEntities: 4991, plannable: 118, evidenceBacked: 115, catalogOnly: 77 },
  review: { existingDestinationCandidates: 33, existingPoiCandidates: 140, newDestinationCandidates: 0, newPoiCandidates: 0, admittedDestinations: 33, admittedPois: 108, rejectedDestinations: 0, rejectedPois: 32 },
  after: { countries: 195, cities: 866, pois: 4071, totalEntities: 5132, plannable: 118, evidenceBacked: 115, catalogOnly: 77 },
  evidenceAdditions: { transport: 0, seasonMonth: 0, theme: 0 },
  readinessPromotions: 0,
  candidateLeakage: "NONE",
  countriesReviewed: byCountry,
  nextEvidencePhase: {
    requiredDirectedTransportSegments: byCountry.reduce((sum, entry) => sum + entry.requiredDirectedTransportSegments, 0),
    requiredSeasonMonthProfiles: byCountry.reduce((sum, entry) => sum + entry.requiredSeasonMonthProfiles, 0),
    singleDestinationCountries: byCountry.filter((entry) => entry.routeModel === "single-destination").map((entry) => entry.countryCode),
    multiDestinationCountries: byCountry.filter((entry) => entry.routeModel === "multi-destination").map((entry) => entry.countryCode),
    unresolvedBlockers: ["directed-transport-evidence-missing", "season-month-evidence-missing", "independent-theme-evidence-missing"],
  },
  historical: {
    batch09: { countries: 119, cities: 833, pois: 3963, total: 4915 },
    wave1: { countries: 139, cities: 833, pois: 3963, total: 4935 },
    wave2: { countries: 157, cities: 833, pois: 3963, total: 4953 },
    wave3: { countries: 175, cities: 833, pois: 3963, total: 4971 },
    wave4: { countries: 192, cities: 833, pois: 3963, total: 4988 },
    sovereignCatalogFinal: { countries: 195, cities: 833, pois: 3963, total: 4991 },
    historicalQuarantine: 1416,
  },
  performance: { dedicatedRunner: "NOT_AVAILABLE", realQualificationExecutions: 0, formalExperimentExecutions: 1, formalRun34622976529: "BLOCKED_INCONCLUSIVE", clearance: "NOT_CLEARED" },
});

console.log(JSON.stringify({ status: "GENERATED", countries: COUNTRY_CODES.length, cities: admittedCities.length, pois: admittedPois.length, rejectedPois: rejectedPois.length }, null, 2));
