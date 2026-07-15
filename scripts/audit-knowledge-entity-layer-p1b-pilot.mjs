import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createKnowledgeEntityLayerRepository,
  validateCountryEntitySet,
  validateKnowledgeCityEntitySet,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRY_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
]);
const PILOT_COUNTRY_ORDER = Object.freeze(["JP", "TR", "SG"]);
const CITY_REVIEW_IDS = Object.freeze([
  "review-0c208bcb4a53b559",
  "review-c1b15455ffb7e1bf",
]);

function readJson(repositoryRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repositoryRoot, relativePath), "utf8"));
}

function summarizeByType(items = []) {
  const counts = new Map();
  for (const item of items) counts.set(item.type, (counts.get(item.type) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "en")));
}

export function auditKnowledgeEntityLayerP1bPilot({ repositoryRoot = PROJECT_ROOT } = {}) {
  const countries = COUNTRY_PATHS.flatMap((relativePath) => readJson(repositoryRoot, relativePath).countries || []);
  const cities = readJson(repositoryRoot, "data/knowledge/cities.p1b-pilot.json").cities || [];
  const pois = readJson(repositoryRoot, "data/knowledge/pois.p1b-pilot.json").pois || [];
  const cityProvenance = readJson(repositoryRoot, "data/knowledge/provenance.cities.p1b-pilot.json").provenance || {};
  const poiProvenance = readJson(repositoryRoot, "data/knowledge/provenance.pois.p1b-pilot.json").provenance || {};
  const conflictsAsset = readJson(repositoryRoot, "data/knowledge/conflicts.p1b-pilot.json");
  const reviewAsset = readJson(repositoryRoot, "data/knowledge/review-queue.p1b-pilot.json");
  const conflicts = conflictsAsset.conflicts || [];
  const reviews = reviewAsset.reviewQueue || [];
  const repository = createKnowledgeEntityLayerRepository({ countries, cities, pois });
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const cityById = new Map(cities.map((city) => [city.entityId, city]));
  const cityEntityIds = new Set(cities.map((city) => city.entityId));
  const poiEntityIds = new Set(pois.map((poi) => poi.entityId));
  const blockingConflicts = conflicts.filter((conflict) => conflict.severity === "blocking");

  const tree = PILOT_COUNTRY_ORDER.map((isoAlpha2) => {
    const country = countries.find((candidate) => candidate.isoAlpha2 === isoAlpha2);
    const countryCities = country ? repository.listCitiesByCountry(country.entityId) : [];
    return {
      isoAlpha2,
      entityId: country?.entityId || null,
      wikidataId: country?.wikidataId || null,
      cities: countryCities.map((city) => ({
        entityId: city.entityId,
        wikidataId: city.wikidataId,
        canonicalNameEn: city.canonicalNameEn,
        poiCount: repository.listPoisByCity(city.entityId).length,
        pois: repository.listPoisByCity(city.entityId).map((poi) => ({
          entityId: poi.entityId,
          wikidataId: poi.wikidataId,
          canonicalNameEn: poi.canonicalNameEn,
          parentCityEntityId: poi.parentCityEntityId,
          derivedCountryEntityId: country.entityId,
          derivedCountryIsoAlpha2: country.isoAlpha2,
          coordinates: poi.coordinates,
          provenanceCovered: Boolean(poiProvenance[poi.entityId]),
        })),
      })),
    };
  });

  const countryValidation = validateCountryEntitySet(countries);
  const cityValidation = validateKnowledgeCityEntitySet(cities);
  const poiValidation = validateKnowledgePoiEntitySet(pois);
  const parentValidation = repository.validateParentReferences();
  const cityProvenanceCoverage = cities.filter((city) => cityProvenance[city.entityId]).length;
  const poiProvenanceCoverage = pois.filter((poi) => poiProvenance[poi.entityId]).length;
  const cityInlineSidecarMatches = cities.filter((city) => JSON.stringify(city.provenance) === JSON.stringify(cityProvenance[city.entityId])).length;
  const poiInlineSidecarMatches = pois.filter((poi) => JSON.stringify(poi.provenance) === JSON.stringify(poiProvenance[poi.entityId])).length;
  const orphanCityCount = cities.filter((city) => !countryById.has(city.parentCountryEntityId)).length;
  const orphanPoiCount = pois.filter((poi) => !cityById.has(poi.parentCityEntityId)).length;
  const cityReviews = reviews.filter((review) => CITY_REVIEW_IDS.includes(review.reviewId));
  const poiReviews = reviews.filter((review) => review.relatedEntityIds?.some((entityId) => poiEntityIds.has(entityId)));

  const checks = {
    countriesAvailable: countries.length === 35,
    pilotCountries: tree.every((country) => country.entityId),
    cityCount: cities.length === 5,
    poiCount: pois.length === 15,
    countrySchema: countryValidation.accepted,
    citySchema: cityValidation.accepted,
    poiSchema: poiValidation.accepted,
    parents: parentValidation.accepted,
    orphans: orphanCityCount === 0 && orphanPoiCount === 0,
    distribution: tree.every((country) => country.cities.length === ({ JP: 2, TR: 2, SG: 1 })[country.isoAlpha2]
      && country.cities.every((city) => city.poiCount === 3)),
    provenance: cityProvenanceCoverage === 5
      && poiProvenanceCoverage === 15
      && cityInlineSidecarMatches === 5
      && poiInlineSidecarMatches === 15,
    conflicts: conflicts.length === 0 && blockingConflicts.length === 0,
    reviews: reviews.length === 13 && cityReviews.length === 2 && poiReviews.length === 11,
  };

  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED",
    checks,
    totals: {
      countriesAvailable: countries.length,
      pilotCountries: tree.filter((country) => country.entityId).length,
      cities: cities.length,
      pois: pois.length,
      blockingConflicts: blockingConflicts.length,
      reviews: reviews.length,
    },
    tree,
    identityAndParents: {
      orphanCityCount,
      orphanPoiCount,
      cityParentTypesValid: cities.every((city) => countryById.get(city.parentCountryEntityId)?.entityType === "country"),
      poiParentTypesValid: pois.every((poi) => cityById.get(poi.parentCityEntityId)?.entityType === "city"),
      publishedCityEntityIds: cityEntityIds.size,
      publishedPoiEntityIds: poiEntityIds.size,
    },
    provenance: {
      cityCoverage: cityProvenanceCoverage,
      cityInlineSidecarMatches,
      poiCoverage: poiProvenanceCoverage,
      poiInlineSidecarMatches,
    },
    conflicts: {
      total: conflicts.length,
      blocking: blockingConflicts.length,
      byType: summarizeByType(conflicts),
    },
    reviews: {
      total: reviews.length,
      nonBlocking: reviews.filter((review) => review.severity === "manual-review").length,
      city: cityReviews.length,
      poi: poiReviews.length,
      byType: summarizeByType(reviews),
      ids: reviews.map((review) => review.reviewId).sort(),
    },
    unsupportedBoundaries: [
      { object: "Cappadocia", reason: "Region / Destination rather than an ordinary City" },
      { object: "Mount Fuji", reason: "Natural object outside a City and requires a different parent model" },
      { object: "cross-city POI", reason: "Multiple City parents are unsupported in the Pilot" },
      { object: "outside-city POI", reason: "Every Pilot POI must have one canonical City parent" },
      { object: "multi-parent POI", reason: "The Pilot supports exactly one parentCityEntityId" },
      { object: "Region / Destination / Natural Area", reason: "Entity types are outside P1B Pilot scope" },
      { object: "runtime online entities", reason: "Canonical assets are published from fixed raw snapshots offline" },
      { object: "Planner consumption", reason: "No Entity Layer consumer contract has been implemented" },
    ],
  };
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  process.stdout.write(`${JSON.stringify(auditKnowledgeEntityLayerP1bPilot(), null, 2)}\n`);
}
